import { BadRequestException, Injectable } from '@nestjs/common';
import { ContainerCategory, ContainerState, MainlineOperationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { CalculateDto, MarginType } from './dto/calculate.dto';

const KMTP_TERMINAL_NAME = 'КМТП';
const PKT_TERMINAL_NAME = 'ПКТ';
const activeDate = (date: Date) => ({ rateStartDate: { lte: date }, OR: [{ rateFinishDate: null }, { rateFinishDate: { gte: date } }] });
const rub = (value: unknown) => Number(value ?? 0);
type QuoteDirection = 'KLD_OUT' | 'KLD_IN';

@Injectable()
export class CalculatorService {
  constructor(private readonly prisma: PrismaService) {}

  calculate(payload: CalculateDto) {
    const baseTransportCost = payload.weightKg * 2 + payload.volumeM3 * 50;
    const totalCost = baseTransportCost + (payload.services.portHandling ? 150 : 0) + (payload.services.storage ? 50 : 0) + (payload.services.reeferConnection ? 75 : 0) + (payload.services.containerRent ? 100 : 0);
    const margin = payload.marginType === MarginType.PERCENT ? (totalCost * payload.marginValue) / 100 : payload.marginValue;
    return { totalCost, margin, clientPrice: totalCost + margin, currency: payload.currency, lines: [{ stage: 'TEMP', name: 'Базовая перевозка', cost: baseTransportCost, currency: payload.currency }], warnings: ['Используется временная формула расчета. Реальные тарифы будут подключены позже.'] };
  }

  async quote(input: CreateQuoteDto) {
    const [origin, destination, container, cargo] = await Promise.all([this.readEligibleLocation(input.originLocationId), this.readEligibleLocation(input.destinationLocationId), this.prisma.container.findUnique({ where: { id: input.containerId } }), input.cargoId ? this.prisma.cargo.findUnique({ where: { id: input.cargoId } }) : Promise.resolve(null)]);
    if (!origin || !destination) throw new BadRequestException('Origin and destination must be active tariff locations with distances');
    if (!container || container.category !== (input.category as ContainerCategory)) throw new BadRequestException('Container is not valid for the selected category');
    if (input.cargoId && !cargo) throw new BadRequestException('Selected cargo was not found');
    const originIsKld = origin.territoryGroup?.code.toUpperCase() === 'KLD';
    const destinationIsKld = destination.territoryGroup?.code.toUpperCase() === 'KLD';
    if (originIsKld === destinationIsKld) throw new BadRequestException('UNSUPPORTED_ROUTE_DIRECTION: route must cross the KLD tariff zone boundary');
    const direction: QuoteDirection = originIsKld ? 'KLD_OUT' : 'KLD_IN';
    const [kmtp, pkt] = await Promise.all([this.resolveTerminal(KMTP_TERMINAL_NAME), this.resolveTerminal(PKT_TERMINAL_NAME)]);
    const date = new Date(); const warnings: string[] = [];
    const first = direction === 'KLD_OUT'
      ? await this.buildFirstMile(input, origin, container, kmtp.id, date, warnings)
      : await this.buildInboundOriginStage(input, origin, container, pkt.id, date, warnings);
    const sea = direction === 'KLD_OUT'
      ? await this.buildSeaStage(input, container, kmtp.id, pkt.id, KMTP_TERMINAL_NAME, PKT_TERMINAL_NAME, 'KLD_OUT', date, warnings)
      : await this.buildSeaStage(input, container, pkt.id, kmtp.id, PKT_TERMINAL_NAME, KMTP_TERMINAL_NAME, 'KLD_IN', date, warnings);
    const last = direction === 'KLD_OUT'
      ? await this.buildLastMile(input, destination, container, pkt.id, date, warnings)
      : await this.buildInboundDestinationStage(input, destination, container, kmtp.id, date, warnings);
    const routeStages = [first.stage, sea.stage, last.stage];
    const selectedServices = await this.resolveServices(input, origin.territoryGroupId, date, warnings);
    const additionalServices = selectedServices.map(({ name, active, amountValue, priced }) => ({ name, active, amountValue, priced }));
    const additionalServicesCost = selectedServices.reduce((sum, item) => sum + (item.amountValue ?? 0), 0);
    const seaTotal = sea.stage.amountValue;
    const paymentBase = first.amount + seaTotal + last.amount + additionalServicesCost;
    const paymentDelayCost = paymentBase * 0.02 / 30 * input.paymentDelayDays;
    const baseDoorToDoor = paymentBase + paymentDelayCost;
    const costs = { firstMile: first.missing ? null : first.amount, liLo: sea.missing ? null : sea.liLo, portHandlingOrigin: sea.missing ? null : sea.portHandlingOrigin, fios: sea.missing ? null : sea.fios, portHandlingDestination: sea.missing ? null : sea.portHandlingDestination, connectionOrigin: input.category === 'REF' ? sea.connectionOrigin : 0, connectionDestination: input.category === 'REF' ? sea.connectionDestination : 0, containerUsage: sea.missing ? null : sea.containerUsage, containerStorage: 0, additionalServices: additionalServicesCost, lastMile: last.missing ? null : last.amount, eaeuConfirmation: 0, moneyCost: paymentDelayCost, otherExpenses: (first.missing || last.missing) ? null : first.amount + last.amount + paymentDelayCost, paymentDelay: paymentDelayCost, total: (first.missing || sea.missing || last.missing) ? null : baseDoorToDoor };
    const saleRate = input.saleRate ?? null;
    const commercial = saleRate === null || saleRate === 0 || costs.total === null ? emptyCommercial() : commercialQuote(saleRate, costs);
    const breakdown = [['Первая миля', costs.firstMile], ['LI-LO', costs.liLo], ['ПРР в порту отправки', costs.portHandlingOrigin], ['FIOS', costs.fios], ['ПРР в порту прибытия', costs.portHandlingDestination], ['Подключение на терминалах', (costs.connectionOrigin ?? 0) + (costs.connectionDestination ?? 0)], ['Аренда контейнера', costs.containerUsage], ['Дополнительные услуги', costs.additionalServices], ['Последняя миля', costs.lastMile], ['Подтверждение ЕАЭС', costs.eaeuConfirmation], ['Стоимость денег', costs.moneyCost], ['Итого', costs.total]].filter(([, value]) => value !== null).map(([label, value]) => ({ label, value: formatRubles(Number(value)), emphasis: label === 'Итого' }));
    breakdown.push({ label: 'Отсрочка платежа, дней', value: String(input.paymentDelayDays), emphasis: false });
    const quoteBase = costs.total === null ? null : baseDoorToDoor;
    return { category: input.category, direction, baseDoorToDoor: quoteBase, routeStages, costs, breakdown, warnings, additionalServices, debug: { direction, firstMile: first.stage.source, seaLilo: { direction, containerId: container.id, owner: input.owner, state: input.weightKg > 0 ? ContainerState.LOADED : ContainerState.EMPTY, ...(sea.stage.source as object) }, fios: { ...(sea.stage.source as any).fios }, portHandling: { origin: costs.portHandlingOrigin, destination: costs.portHandlingDestination }, lastMile: last.stage.source }, explanation: { distance: [first.stage.details, last.stage.details], weight: [`Вес ${formatNumber(input.weightKg)} кг`, `Контейнер ${container.type}`, `Груз ${cargo ? `${cargo.etsng} — ${cargo.name}` : 'не выбран'}`], base: [`Собственник ${input.owner}`, `Отсрочка ${input.paymentDelayDays} дней`, `База дверь/дверь: ${quoteBase === null ? '—' : formatRubles(quoteBase)}`] }, commercial };
  }

  private async readEligibleLocation(id: string) { return this.prisma.location.findFirst({ where: { id, isActive: true, tariffLocationId: { not: null }, distances: { some: {} } }, include: { territoryGroup: true, distances: true } }); }
  private async resolveTerminal(name: string) { const terminal = await this.prisma.terminal.findFirst({ where: { name: { equals: name, mode: 'insensitive' } }, include: { location: true } }); if (!terminal) throw new BadRequestException(`Required terminal was not found: ${name}. Add a terminal code resolver.`); return terminal; }

  private async buildFirstMile(input: CreateQuoteDto, origin: any, container: any, terminalId: number, date: Date, warnings: string[]) {
    if (!origin.tariffLocationId) throw new BadRequestException('Origin tariff location is missing');
    const row = origin.distances.find((item: any) => item.terminalId === terminalId); if (!row) throw new BadRequestException('Origin distance to KMTP is missing');
    const distance = rub(row.roundTripKm); const tariffDistance = origin.city.trim().toLocaleLowerCase('ru-RU') === 'калининград' ? 40 : distance;
    if (input.category === 'REF') { warnings.push('REF_AUTO_RATE_UNRESOLVED'); return { amount: 0, missing: true, stage: this.stage(1, 'Авто • первая миля', `${origin.city} → КМТП`, `${formatNumber(distance)} км • ${formatNumber(input.weightKg)} кг • ${container.type}`, 'Тариф не определён', 0, { table: 'auto_ref_rates', distance, tariffDistance }) }; }
    const rate = await this.prisma.autoDryRate.findFirst({ where: { terminalId, kmFrom: { lte: tariffDistance }, kmTo: { gte: tariffDistance }, weightFromKg: { lte: input.weightKg }, OR: [{ weightToKg: null }, { weightToKg: { gte: input.weightKg } }], ...(activeDate(date) as any) }, orderBy: [{ kmFrom: 'asc' }, { weightFromKg: 'asc' }] });
    if (!rate) { warnings.push('AUTO_DRY_RATE_NOT_FOUND'); return { amount: 0, missing: true, stage: this.stage(1, 'Авто • первая миля', `${origin.city} → КМТП`, `${formatNumber(distance)} км • ${formatNumber(input.weightKg)} кг • ${container.type}`, 'Тариф не определён', 0, { table: 'auto_dry_rates', distance, tariffDistance }) }; }
    const rule = await this.prisma.autoRule.findFirst({ where: { terminalId, ...(activeDate(date) as any) }, orderBy: { rateStartDate: 'desc' } }); const surcharge = rule ? ruleAmount(rule, input.weightKg, input.services.dangerous) : 0; if (!rule) warnings.push('AUTO_RULE_NOT_FOUND');
    return { amount: rub(rate.rate) + surcharge, missing: false, stage: this.stage(1, 'Авто • первая миля', `${origin.city} → КМТП`, `${formatNumber(distance)} км • ${formatNumber(input.weightKg)} кг • ${container.type}`, 'Тариф найден', rub(rate.rate) + surcharge, { table: 'auto_dry_rates', rateId: rate.id, weightKg: input.weightKg, weightFromKg: rate.weightFromKg, weightToKg: rate.weightToKg, baseRate: rub(rate.rate), ruleId: rule?.id ?? null, distance, tariffDistance, additions: surcharge, total: rub(rate.rate) + surcharge }) };
  }

  private async buildInboundOriginStage(input: CreateQuoteDto, origin: any, container: any, pktId: number, date: Date, warnings: string[]) {
    const local = origin.city.trim().toLocaleLowerCase('ru-RU') === 'санкт-петербург' || origin.region.trim().toLocaleLowerCase('ru-RU') === 'ленинградская область';
    if (local) {
      const row = origin.distances.find((item: any) => item.terminalId === pktId);
      if (!row) throw new BadRequestException('Origin distance to PKT is missing');
      const distance = rub(row.roundTripKm);
      const rate = input.category === 'DRY' ? await this.prisma.autoDryRate.findFirst({ where: { terminalId: pktId, kmFrom: { lte: distance }, kmTo: { gte: distance }, weightFromKg: { lte: input.weightKg }, OR: [{ weightToKg: null }, { weightToKg: { gte: input.weightKg } }], ...(activeDate(date) as any) }, orderBy: [{ kmFrom: 'asc' }, { weightFromKg: 'asc' }] }) : null;
      if (!rate) { warnings.push(input.category === 'DRY' ? 'AUTO_DRY_RATE_NOT_FOUND' : 'REF_AUTO_RATE_UNRESOLVED'); return { amount: 0, missing: true, stage: this.stage(1, 'Авто • первая миля', `${origin.city} → ПКТ`, `${formatNumber(distance)} км • ${formatNumber(input.weightKg)} кг • ${container.type}`, 'Тариф не определён', 0, { table: 'auto_dry_rates', distance, terminalId: pktId }) }; }
      const rule = await this.prisma.autoRule.findFirst({ where: { terminalId: pktId, ...(activeDate(date) as any) }, orderBy: { rateStartDate: 'desc' } }); const surcharge = rule ? ruleAmount(rule, input.weightKg, input.services.dangerous) : 0; if (!rule) warnings.push('AUTO_RULE_NOT_FOUND');
      return { amount: rub(rate.rate) + surcharge, missing: false, stage: this.stage(1, 'Авто • первая миля', `${origin.city} → ПКТ`, `${formatNumber(distance)} км • ${formatNumber(input.weightKg)} кг • ${container.type}`, 'Тариф найден', rub(rate.rate) + surcharge, { table: 'auto_dry_rates', rateId: rate.id, weightKg: input.weightKg, weightFromKg: rate.weightFromKg, weightToKg: rate.weightToKg, baseRate: rub(rate.rate), ruleId: rule?.id ?? null, distance, additions: surcharge, total: rub(rate.rate) + surcharge, operationType: 'LOCAL' }) };
    }
    const candidates = await this.prisma.mainlineAutoRate.findMany({ where: { operationType: MainlineOperationType.LOAD, serviceLocationId: origin.tariffLocationId, weightFromKg: { lte: input.weightKg }, OR: [{ weightToKg: null }, { weightToKg: { gte: input.weightKg } }], ...(activeDate(date) as any) }, orderBy: { id: 'asc' } });
    if (candidates.length !== 1) { warnings.push(candidates.length > 1 ? `MAINLINE_ROUTE_NOT_SUPPORTED_YET:${candidates.map((item) => item.id).join(',')}` : 'MAINLINE_RATE_NOT_FOUND'); return { amount: 0, missing: true, stage: this.stage(1, 'Авто • первая миля', `${origin.city} → ПКТ`, `${formatNumber(input.weightKg)} кг • ${container.type}`, 'Тариф не определён', 0, { table: 'mainline_auto_rates', operationType: MainlineOperationType.LOAD, rateIds: candidates.map((item) => item.id) }) }; }
    const rate = candidates[0]; const rule = await this.prisma.mainlineAutoRule.findFirst({ where: { ...(activeDate(date) as any) }, orderBy: { rateStartDate: 'desc' } }); const surcharge = rule ? mainlineRuleAmount(rule, input.weightKg, input.category, input.services.dangerous) : 0; if (!rule) warnings.push('MAINLINE_AUTO_RULE_NOT_FOUND');
    return { amount: rub(rate.rate) + surcharge, missing: false, stage: this.stage(1, 'Авто • первая миля', `${origin.city} → ПКТ`, `${formatNumber(input.weightKg)} кг • ${container.type}`, 'Тариф найден', rub(rate.rate) + surcharge, { table: 'mainline_auto_rates', operationType: MainlineOperationType.LOAD, rateId: rate.id, weightKg: input.weightKg, weightFromKg: rate.weightFromKg, weightToKg: rate.weightToKg, baseRate: rub(rate.rate), ruleId: rule?.id ?? null, additions: surcharge, total: rub(rate.rate) + surcharge }) };
  }

  private async buildInboundDestinationStage(input: CreateQuoteDto, destination: any, container: any, kmtpId: number, date: Date, warnings: string[]) {
    if (!destination.tariffLocationId) throw new BadRequestException('Destination tariff location is missing');
    const row = destination.distances.find((item: any) => item.terminalId === kmtpId);
    if (!row) throw new BadRequestException('Destination distance to KMTP is missing');
    const distance = rub(row.roundTripKm); const tariffDistance = destination.city.trim().toLocaleLowerCase('ru-RU') === 'калининград' ? 40 : distance;
    const rate = input.category === 'DRY' ? await this.prisma.autoDryRate.findFirst({ where: { terminalId: kmtpId, kmFrom: { lte: tariffDistance }, kmTo: { gte: tariffDistance }, weightFromKg: { lte: input.weightKg }, OR: [{ weightToKg: null }, { weightToKg: { gte: input.weightKg } }], ...(activeDate(date) as any) }, orderBy: [{ kmFrom: 'asc' }, { weightFromKg: 'asc' }] }) : null;
    if (!rate) { warnings.push(input.category === 'DRY' ? 'AUTO_DRY_RATE_NOT_FOUND' : 'REF_AUTO_RATE_UNRESOLVED'); return { amount: 0, missing: true, stage: this.stage(3, 'Авто • последняя миля', `КМТП → ${destination.city}`, `${formatNumber(distance)} км • ${formatNumber(input.weightKg)} кг • ${container.type}`, 'Тариф не определён', 0, { table: 'auto_dry_rates', distance, tariffDistance, terminalId: kmtpId }) }; }
    const rule = await this.prisma.autoRule.findFirst({ where: { terminalId: kmtpId, ...(activeDate(date) as any) }, orderBy: { rateStartDate: 'desc' } }); const surcharge = rule ? ruleAmount(rule, input.weightKg, input.services.dangerous) : 0; if (!rule) warnings.push('AUTO_RULE_NOT_FOUND');
    return { amount: rub(rate.rate) + surcharge, missing: false, stage: this.stage(3, 'Авто • последняя миля', `КМТП → ${destination.city}`, `${formatNumber(distance)} км • ${formatNumber(input.weightKg)} кг • ${container.type}`, 'Тариф найден', rub(rate.rate) + surcharge, { table: 'auto_dry_rates', rateId: rate.id, weightKg: input.weightKg, weightFromKg: rate.weightFromKg, weightToKg: rate.weightToKg, baseRate: rub(rate.rate), ruleId: rule?.id ?? null, distance, tariffDistance, additions: surcharge, total: rub(rate.rate) + surcharge }) };
  }

  private async buildSeaStage(input: CreateQuoteDto, container: any, fromTerminalId: number, toTerminalId: number, fromName: string, toName: string, direction: QuoteDirection, date: Date, warnings: string[]) {
    const status = await this.prisma.containerStatus.findUnique({ where: { code: input.owner } }); if (!status) throw new BadRequestException(`Container status ${input.owner} was not found`);
    const containerState = input.weightKg > 0 ? ContainerState.LOADED : ContainerState.EMPTY; const where = { fromTerminalId, toTerminalId, containerId: container.id, statusId: status.id, containerState, ...(activeDate(date) as any) };
    const [lilo, fios, usage] = await Promise.all([this.prisma.seaLiloRate.findFirst({ where, orderBy: { rateStartDate: 'desc' } }), this.prisma.seaFiosRate.findFirst({ where: { fromTerminalId, toTerminalId, containerId: container.id, containerState, ...(activeDate(date) as any) }, orderBy: { rateStartDate: 'desc' } }), this.prisma.containerUsageRate.findFirst({ where: { containerId: container.id, statusId: status.id, ...(activeDate(date) as any) }, orderBy: { rateStartDate: 'desc' } })]);
    const seaTitle = `${fromName} → ${toName}`;
    if (!lilo) { warnings.push('SEA_LILO_RATE_NOT_FOUND'); return { liLo: 0, fios: 0, portHandlingOrigin: 0, portHandlingDestination: 0, containerUsage: 0, connectionOrigin: 0, connectionDestination: 0, missing: true, stage: this.stage(2, 'Море • LI-LO', seaTitle, `${container.type} • ${input.owner} • ${containerState === ContainerState.LOADED ? 'ГРУЖЁНЫЙ' : 'ПОРОЖНИЙ'}`, 'Тариф не определён', 0, { table: 'sea_lilo_rates', rateId: null, fromTerminalId, toTerminalId, rawRate: null }) }; }
    if (!fios) warnings.push('SEA_FIOS_RATE_NOT_FOUND'); if (!usage) warnings.push('CONTAINER_USAGE_RATE_NOT_FOUND');
    const portHandlingOrigin = await this.portHandling(direction, 'origin', date, warnings); const portHandlingDestination = await this.portHandling(direction, 'destination', date, warnings);
    const connectionOrigin = input.category === 'REF' ? await this.ruleValue('CONNECTION_ORIGIN', date, warnings) : 0; const connectionDestination = input.category === 'REF' ? await this.ruleValue('CONNECTION_DESTINATION', date, warnings) : 0;
    const total = rub(lilo.rate) + portHandlingOrigin.amount + rub(fios?.rate) + portHandlingDestination.amount + rub(usage?.rate) + connectionOrigin + connectionDestination;
    return { liLo: rub(lilo.rate), fios: rub(fios?.rate), portHandlingOrigin: portHandlingOrigin.amount, portHandlingDestination: portHandlingDestination.amount, containerUsage: rub(usage?.rate), connectionOrigin, connectionDestination, missing: false, stage: this.stage(2, 'Море • LI-LO', seaTitle, `${container.type} • ${input.owner} • ${containerState === ContainerState.LOADED ? 'ГРУЖЁНЫЙ' : 'ПОРОЖНИЙ'}`, 'Тариф найден', total, { table: 'sea_lilo_rates', rateId: lilo.id, rawRate: rub(lilo.rate), fromTerminalId, toTerminalId, fios: { table: 'sea_fios_rates', rateId: fios?.id ?? null, rawRate: fios ? rub(fios.rate) : null }, portHandling: { origin: portHandlingOrigin, destination: portHandlingDestination }, usageRateId: usage?.id ?? null, containerState, components: { liLo: rub(lilo.rate), fios: rub(fios?.rate), portHandlingOrigin: portHandlingOrigin.amount, portHandlingDestination: portHandlingDestination.amount, containerUsage: rub(usage?.rate), connectionOrigin, connectionDestination } }) };
  }

  private async portHandling(direction: QuoteDirection, side: 'origin' | 'destination', date: Date, warnings: string[]) {
    const terminal = direction === 'KLD_OUT' ? (side === 'origin' ? 'KLD' : 'SPB') : (side === 'origin' ? 'SPB' : 'KLD');
    const code = `PORT_HANDLING_${terminal}`;
    const row = await this.prisma.seaFiosRule.findFirst({ where: { code, ...(activeDate(date) as any) }, orderBy: { rateStartDate: 'desc' } });
    if (!row) { warnings.push(`PORT_HANDLING_RATE_NOT_FOUND:${terminal}`); return { amount: 0, source: { table: 'sea_fios_rules', rateId: null, rawRate: null, terminal, code } }; }
    return { amount: rub(row.value), source: { table: 'sea_fios_rules', rateId: row.id, rawRate: rub(row.value), terminal, code: row.code } };
  }

  private async ruleValue(code: string, date: Date, warnings: string[]) { const row = await this.prisma.seaFiosRule.findFirst({ where: { code, ...(activeDate(date) as any) }, orderBy: { rateStartDate: 'desc' } }); if (!row) { warnings.push(`SEA_FIOS_RULE_NOT_FOUND:${code}`); return 0; } return rub(row.value); }

  private async buildLastMile(input: CreateQuoteDto, destination: any, container: any, pktId: number, date: Date, warnings: string[]) {
    if (!destination.tariffLocationId) throw new BadRequestException('Destination tariff location is missing'); const local = destination.city.trim().toLocaleLowerCase('ru-RU') === 'санкт-петербург' || destination.region.trim().toLocaleLowerCase('ru-RU') === 'ленинградская область';
    if (local) { const row = destination.distances.find((item: any) => item.terminalId === pktId); if (!row) throw new BadRequestException('Destination distance to PKT is missing'); const distance = rub(row.roundTripKm); const rate = input.category === 'DRY' ? await this.prisma.autoDryRate.findFirst({ where: { terminalId: pktId, kmFrom: { lte: distance }, kmTo: { gte: distance }, weightFromKg: { lte: input.weightKg }, OR: [{ weightToKg: null }, { weightToKg: { gte: input.weightKg } }], ...(activeDate(date) as any) }, orderBy: [{ kmFrom: 'asc' }, { weightFromKg: 'asc' }] }) : null; if (!rate) { warnings.push(input.category === 'DRY' ? 'AUTO_DRY_RATE_NOT_FOUND' : 'REF_AUTO_RATE_UNRESOLVED'); return { amount: 0, missing: true, stage: this.stage(3, 'Авто • последняя миля', `ПКТ → ${destination.city}`, `${formatNumber(distance)} км • ${formatNumber(input.weightKg)} кг • ${container.type}`, 'Тариф не определён', 0, { table: 'auto_dry_rates', distance }) }; } const rule = await this.prisma.autoRule.findFirst({ where: { terminalId: pktId, ...(activeDate(date) as any) }, orderBy: { rateStartDate: 'desc' } }); const surcharge = rule ? ruleAmount(rule, input.weightKg, input.services.dangerous) : 0; if (!rule) warnings.push('AUTO_RULE_NOT_FOUND'); return { amount: rub(rate.rate) + surcharge, missing: false, stage: this.stage(3, 'Авто • последняя миля', `ПКТ → ${destination.city}`, `${formatNumber(distance)} км • ${formatNumber(input.weightKg)} кг • ${container.type}`, 'Тариф найден', rub(rate.rate) + surcharge, { table: 'auto_dry_rates', rateId: rate.id, weightKg: input.weightKg, weightFromKg: rate.weightFromKg, weightToKg: rate.weightToKg, baseRate: rub(rate.rate), ruleId: rule?.id ?? null, distance, additions: surcharge, total: rub(rate.rate) + surcharge }) }; }
    const candidates = await this.prisma.mainlineAutoRate.findMany({ where: { operationType: MainlineOperationType.UNLOAD, serviceLocationId: destination.tariffLocationId, weightFromKg: { lte: input.weightKg }, OR: [{ weightToKg: null }, { weightToKg: { gte: input.weightKg } }], ...(activeDate(date) as any) }, orderBy: { id: 'asc' } });
    if (candidates.length !== 1) { warnings.push(candidates.length ? `MAINLINE_ROUTE_NOT_SUPPORTED_YET:${candidates.map((item) => item.id).join(',')}` : 'MAINLINE_RATE_NOT_FOUND'); return { amount: 0, missing: true, stage: this.stage(3, 'Авто • последняя миля', `ПКТ → ${destination.city}`, `${formatNumber(input.weightKg)} кг • ${container.type}`, 'Тариф не определён', 0, { table: 'mainline_auto_rates', rateIds: candidates.map((item) => item.id) }) }; }
    const rate = candidates[0]; const rule = await this.prisma.mainlineAutoRule.findFirst({ where: { ...(activeDate(date) as any) }, orderBy: { rateStartDate: 'desc' } }); const surcharge = rule ? mainlineRuleAmount(rule, input.weightKg, input.category, input.services.dangerous) : 0; if (!rule) warnings.push('MAINLINE_AUTO_RULE_NOT_FOUND'); return { amount: rub(rate.rate) + surcharge, missing: false, stage: this.stage(3, 'Авто • последняя миля', `ПКТ → ${destination.city}`, `${formatNumber(input.weightKg)} кг • ${container.type}`, 'Тариф найден', rub(rate.rate) + surcharge, { table: 'mainline_auto_rates', rateId: rate.id, weightKg: input.weightKg, weightFromKg: rate.weightFromKg, weightToKg: rate.weightToKg, baseRate: rub(rate.rate), ruleId: rule?.id ?? null, additions: surcharge, total: rub(rate.rate) + surcharge }) };
  }

  private async resolveServices(input: CreateQuoteDto, territoryGroupId: number | null, date: Date, warnings: string[]) { let genset: number | null = 0; if (input.category === 'REF' && input.services.genset) { const rate = territoryGroupId ? await this.prisma.autoRefRate.findFirst({ where: { territoryGroupId, ...(activeDate(date) as any) }, orderBy: { rateStartDate: 'desc' } }) : null; genset = rate ? rub(rate.gensetPerDayRub) : null; if (!rate) warnings.push('GENSET_RATE_NOT_FOUND'); } return [{ name: 'Идентификация', active: input.services.identification, amountValue: 0, priced: false }, ...(input.category === 'REF' ? [{ name: 'Дженсет', active: input.services.genset, amountValue: genset, priced: genset !== null }] : []), { name: 'Опасный груз', active: input.services.dangerous, amountValue: 0, priced: true }]; }
  private stage(number: number, mode: string, title: string, details: string, status: string, amountValue: number, source: Record<string, unknown>) { return { number, mode, title, from: title.split(' → ')[0], to: title.split(' → ')[1] ?? '', details, status, amountValue, amount: amountValue > 0 ? formatRubles(amountValue) : '—', source }; }
}
function ruleAmount(rule: any, weightKg: number, dangerous: boolean) { const overweight = weightKg > rule.overweightThresholdKg ? Math.ceil((weightKg - rule.overweightThresholdKg) / 1000) * rub(rule.overweightPerTonRub) : 0; return overweight + (dangerous ? rub(rule.dangerousCargoRub) : 0); }
function mainlineRuleAmount(rule: any, weightKg: number, category: string, dangerous: boolean) { const overweight = weightKg > rule.overweightThresholdKg ? Math.ceil((weightKg - rule.overweightThresholdKg) / 1000) * rub(rule.overweightPerTonRub) : 0; return overweight + (category === 'REF' ? rub(rule.refSurchargeRub) : 0) + (dangerous ? rub(rule.dangerousCargoRub) : 0); }
function commercialQuote(saleRate: number, costs: any) { const other = costs.otherExpenses ?? 0; const liLo = costs.liLo ?? 0; const serviceBase = (costs.fios ?? 0) + (costs.firstMile ?? 0) + (costs.lastMile ?? 0) + (costs.containerUsage ?? 0); const forwarding = saleRate - other - liLo; const services = 0.15 * serviceBase; const total = forwarding + services; return { forwardingMargin: formatRubles(forwarding), forwardingMarginPercent: formatPercent(forwarding / saleRate), servicesMargin: formatRubles(services), totalMargin: formatRubles(total), totalMarginPercent: formatPercent(total / saleRate) }; }
function emptyCommercial() { return { forwardingMargin: '—', forwardingMarginPercent: '—', servicesMargin: '—', totalMargin: '—', totalMarginPercent: '—' }; }
function formatNumber(value: number) { return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value); }
function formatRubles(value: number) { return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)} ₽`; }
function formatPercent(value: number) { return `${(value * 100).toFixed(1).replace('.', ',')} %`; }
