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
const REEFER_DESTINATION_CONNECTION = {
  KLD_OUT: { amount: 6936, freeDays: 3 },
  KLD_IN: { amount: 7044, freeDays: 2 },
} as const;
type BreakdownUnit = 'RUB' | 'DAYS' | 'PERCENT';

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
    const identification = input.services.identification ? await this.resolveIdentification(direction, date, warnings) : 0;
    const selectedServices = await this.resolveServices(input, origin.territoryGroupId, date, warnings, identification);
    const additionalServices = selectedServices.map(({ name, active, amountValue, priced }) => ({ name, active, amountValue, priced }));
    const additionalServicesCost = await this.resolveAdditionalServices(input, direction === 'KLD_OUT' ? kmtp.id : pkt.id, container.type, date, warnings);
    const eaeuConfirmation = 0;
    const terminalConnections = input.category === 'REF' ? sea.connectionOrigin + sea.connectionDestination : 0;
    const moneyBase = first.amount + (sea.portHandlingOrigin ?? 0) + (sea.fios ?? 0) + (sea.portHandlingDestination ?? 0) + (input.category === 'REF' ? (sea.connectionOrigin ?? 0) + (sea.connectionDestination ?? 0) : 0) + (sea.containerUsage ?? 0) + (sea.containerStorage ?? 0) + additionalServicesCost + last.amount;
    const paymentDelayCost = moneyBase * 0.02 / 30 * input.paymentDelayDays;
    const otherExpenses = (first.missing || last.missing) ? null : first.amount + last.amount + identification + paymentDelayCost;
    const liLo = sea.missing ? null : sea.liLo;
    const baseDoorToDoor = liLo === null || otherExpenses === null ? null : liLo + otherExpenses;
    const costs = { firstMile: first.missing ? null : first.amount, liLo, portHandlingOrigin: sea.missing ? null : sea.portHandlingOrigin, fios: sea.missing ? null : sea.fios, portHandlingDestination: sea.missing ? null : sea.portHandlingDestination, connectionOrigin: input.category === 'REF' ? sea.connectionOrigin : 0, connectionDestination: input.category === 'REF' ? sea.connectionDestination : 0, terminalConnections, containerUsage: sea.missing ? null : sea.containerUsage, containerStorage: sea.missing ? null : sea.containerStorage, additionalServices: additionalServicesCost, lastMile: last.missing ? null : last.amount, identification, eaeuConfirmation, moneyCost: paymentDelayCost, otherExpenses, paymentDelay: paymentDelayCost, total: baseDoorToDoor };
    const saleRate = input.saleRate ?? null;
    const commercial = commercialQuote(saleRate !== null && saleRate > 0 ? saleRate : costs.total, costs, input.category);
    const margin = liLoMargin(costs, input.category);
    const breakdownRows: Array<[string, number | null, BreakdownUnit]> = [
      ['Базовый тариф LI-LO', costs.liLo, 'RUB'],
      ['ПРР в порту отправки', costs.portHandlingOrigin, 'RUB'],
      ...(input.category === 'REF' ? [['Подключение в порту отправки', costs.connectionOrigin, 'RUB'], ['Кол-во дней бесплатного подключения', sea.connectionOriginFreeDays, 'DAYS']] as Array<[string, number | null, BreakdownUnit]> : []),
      ['FIOS', costs.fios, 'RUB'],
      ['ПРР в порту прибытия', costs.portHandlingDestination, 'RUB'],
      ...(input.category === 'REF' ? [['Подключение в порту прибытия', costs.connectionDestination, 'RUB'], ['Кол-во дней бесплатного подключения', sea.connectionDestinationFreeDays, 'DAYS']] as Array<[string, number | null, BreakdownUnit]> : []),
      ['Пользование контейнером', costs.containerUsage, 'RUB'],
      ['Хранение контейнера', costs.containerStorage, 'RUB'],
      ['Дополнительные услуги', costs.additionalServices, 'RUB'],
      ['Маржа базового тарифа LI-LO', margin, 'RUB'],
      ['Маржа базового тарифа LI-LO, %', costs.liLo ? margin / costs.liLo * 100 : 0, 'PERCENT'],
      ['Прочие расходы', costs.otherExpenses, 'RUB'],
      ['Первая миля', costs.firstMile, 'RUB'],
      ['Последняя миля', costs.lastMile, 'RUB'],
      ['Идентификация', costs.identification, 'RUB'],
      ['Отсрочка платежа', input.paymentDelayDays, 'DAYS'],
      ['Стоимость денег', costs.moneyCost, 'RUB'],
    ];
    const breakdown = breakdownRows.filter(([, value]) => value !== null).map(([label, value, unit]) => ({ label, numericValue: Number(value), value: unit === 'DAYS' ? formatDays(Number(value)) : unit === 'PERCENT' ? `${ceilPercent1(Number(value)).toFixed(1).replace('.', ',')} %` : formatRubles(Number(value)), emphasis: label.startsWith('Маржа') }));
    return { category: input.category, direction, baseDoorToDoor, routeStages, costs, breakdown, warnings, additionalServices, debug: { direction, firstMile: first.stage.source, seaLilo: { direction, containerId: container.id, owner: input.owner, state: input.weightKg > 0 ? ContainerState.LOADED : ContainerState.EMPTY, ...(sea.stage.source as object) }, fios: { ...(sea.stage.source as any).fios }, portHandling: { origin: costs.portHandlingOrigin, destination: costs.portHandlingDestination }, lastMile: last.stage.source }, explanation: { distance: [first.stage.details, last.stage.details], weight: [`Вес ${formatNumber(input.weightKg)} кг`, `Контейнер ${container.type}`, `Груз ${cargo ? `${cargo.etsng} — ${cargo.name}` : 'не выбран'}`], base: [`Собственник ${input.owner}`, `Отсрочка ${input.paymentDelayDays} дней`, `База дверь/дверь: ${baseDoorToDoor === null ? '—' : formatRubles(baseDoorToDoor)}`] }, commercial };
  }

  private async readEligibleLocation(id: string) { return this.prisma.location.findFirst({ where: { id, isActive: true, tariffLocationId: { not: null }, distances: { some: {} } }, include: { territoryGroup: true, distances: true } }); }
  private async resolveTerminal(name: string) { const terminal = await this.prisma.terminal.findFirst({ where: { name: { equals: name, mode: 'insensitive' } }, include: { location: true } }); if (!terminal) throw new BadRequestException(`Required terminal was not found: ${name}. Add a terminal code resolver.`); return terminal; }

  private async resolveAutoRefRate(territoryGroupId: number | null, date: Date, warnings: string[]) {
    if (!territoryGroupId) { warnings.push('REF_AUTO_RATE_NOT_FOUND'); return null; }
    const rate = await this.prisma.autoRefRate.findFirst({ where: { territoryGroupId, ...(activeDate(date) as any) }, orderBy: { rateStartDate: 'desc' } });
    if (!rate) warnings.push('REF_AUTO_RATE_NOT_FOUND');
    return rate;
  }

  private applyRefAutoModifier(baseAmount: number, refRate: any, warnings: string[]) {
    const coefficient = refRate?.coefficient === null || refRate?.coefficient === undefined ? null : rub(refRate.coefficient);
    const surchargeRub = refRate?.surchargeRub === null || refRate?.surchargeRub === undefined ? null : rub(refRate.surchargeRub);
    if (coefficient !== null && surchargeRub !== null) { warnings.push('REF_AUTO_RATE_MODIFIER_AMBIGUOUS'); return null; }
    if (coefficient !== null) return baseAmount * coefficient;
    if (surchargeRub !== null) return baseAmount + surchargeRub;
    return baseAmount;
  }

  private async resolveLocalAutoRate(input: CreateQuoteDto, territoryGroupId: number | null, terminalId: number, tariffDistance: number, date: Date, warnings: string[]) {
    const rate = await this.prisma.autoDryRate.findFirst({ where: { terminalId, kmFrom: { lte: tariffDistance }, kmTo: { gte: tariffDistance }, weightFromKg: { lte: input.weightKg }, OR: [{ weightToKg: null }, { weightToKg: { gte: input.weightKg } }], ...(activeDate(date) as any) }, orderBy: [{ kmFrom: 'asc' }, { weightFromKg: 'asc' }] });
    if (!rate) { warnings.push('AUTO_DRY_RATE_NOT_FOUND'); return { amount: 0, missing: true, source: { table: 'auto_dry_rates', terminalId, tariffDistance } }; }
    const rule = await this.prisma.autoRule.findFirst({ where: { terminalId, ...(activeDate(date) as any) }, orderBy: { rateStartDate: 'desc' } });
    const additions = rule ? ruleAmount(rule, input.weightKg, input.services.dangerous) : 0;
    if (!rule) warnings.push('AUTO_RULE_NOT_FOUND');
    const baseAmount = rub(rate.rate) + additions;
    const refRate = input.category === 'REF' ? await this.resolveAutoRefRate(territoryGroupId, date, warnings) : null;
    if (input.category === 'REF' && !refRate) return { amount: 0, missing: true, source: { table: 'auto_dry_rates', terminalId, rateId: rate.id, baseRate: rub(rate.rate), ruleId: rule?.id ?? null, additions, refRateId: null, refCoefficient: null, refSurchargeRub: null, finalTotal: null, tariffDistance } };
    const refCoefficient = refRate?.coefficient === null || refRate?.coefficient === undefined ? null : rub(refRate.coefficient);
    const refSurchargeRub = refRate?.surchargeRub === null || refRate?.surchargeRub === undefined ? null : rub(refRate.surchargeRub);
    const amount = input.category === 'REF' ? this.applyRefAutoModifier(baseAmount, refRate, warnings) : baseAmount;
    if (amount === null) return { amount: 0, missing: true, source: { table: 'auto_dry_rates', terminalId, rateId: rate.id, baseRate: rub(rate.rate), ruleId: rule?.id ?? null, additions, refRateId: refRate?.id ?? null, refCoefficient, refSurchargeRub, finalTotal: null, tariffDistance } };
    return { amount, missing: false, source: { table: 'auto_dry_rates', terminalId, rateId: rate.id, weightKg: input.weightKg, weightFromKg: rate.weightFromKg, weightToKg: rate.weightToKg, baseRate: rub(rate.rate), ruleId: rule?.id ?? null, additions, refRateId: refRate?.id ?? null, refCoefficient, refSurchargeRub, finalTotal: amount, tariffDistance } };
  }

  private async buildFirstMile(input: CreateQuoteDto, origin: any, container: any, terminalId: number, date: Date, warnings: string[]) {
    if (!origin.tariffLocationId) throw new BadRequestException('Origin tariff location is missing');
    const row = origin.distances.find((item: any) => item.terminalId === terminalId); if (!row) throw new BadRequestException('Origin distance to KMTP is missing');
    const distance = rub(row.roundTripKm); const tariffDistance = origin.city.trim().toLocaleLowerCase('ru-RU') === 'калининград' ? 40 : distance;
    const resolved = await this.resolveLocalAutoRate(input, origin.territoryGroupId, terminalId, tariffDistance, date, warnings);
    return { amount: resolved.amount, missing: resolved.missing, stage: this.stage(1, 'Авто • первая миля', `${origin.city} → КМТП`, `${formatNumber(distance)} км • ${formatNumber(input.weightKg)} кг • ${container.type}`, resolved.missing ? 'Тариф не определён' : 'Тариф найден', resolved.amount, { ...resolved.source, distance }) };
  }

  private async buildInboundOriginStage(input: CreateQuoteDto, origin: any, container: any, pktId: number, date: Date, warnings: string[]) {
    const local = origin.city.trim().toLocaleLowerCase('ru-RU') === 'санкт-петербург' || origin.region.trim().toLocaleLowerCase('ru-RU') === 'ленинградская область';
    if (local) {
      const row = origin.distances.find((item: any) => item.terminalId === pktId);
      if (!row) throw new BadRequestException('Origin distance to PKT is missing');
      const distance = rub(row.roundTripKm);
      const resolved = await this.resolveLocalAutoRate(input, origin.territoryGroupId, pktId, distance, date, warnings);
      return { amount: resolved.amount, missing: resolved.missing, stage: this.stage(1, 'Авто • первая миля', `${origin.city} → ПКТ`, `${formatNumber(distance)} км • ${formatNumber(input.weightKg)} кг • ${container.type}`, resolved.missing ? 'Тариф не определён' : 'Тариф найден', resolved.amount, { ...resolved.source, distance, operationType: 'LOCAL' }) };
    }
    const candidates = await this.resolveMainlineRates(origin.tariffLocationId, input.weightKg, date);
    if (candidates.length !== 1) { warnings.push(candidates.length > 1 ? `MAINLINE_ROUTE_NOT_SUPPORTED_YET:${candidates.map((item) => item.id).join(',')}` : 'MAINLINE_RATE_NOT_FOUND'); return { amount: 0, missing: true, stage: this.stage(1, 'Авто • первая миля', `${origin.city} → ПКТ`, `${formatNumber(input.weightKg)} кг • ${container.type}`, 'Тариф не определён', 0, { table: 'mainline_auto_rates', operationType: MainlineOperationType.LOAD, rateIds: candidates.map((item) => item.id) }) }; }
    const rate = candidates[0]; const rule = await this.prisma.mainlineAutoRule.findFirst({ where: { ...(activeDate(date) as any) }, orderBy: { rateStartDate: 'desc' } }); const surcharge = rule ? mainlineRuleAmount(rule, input.weightKg, input.category, input.services.dangerous) : 0; if (!rule) warnings.push('MAINLINE_AUTO_RULE_NOT_FOUND');
    return { amount: rub(rate.rate) + surcharge, missing: false, stage: this.stage(1, 'Авто • первая миля', `${origin.city} → ПКТ`, `${formatNumber(input.weightKg)} кг • ${container.type}`, 'Тариф найден', rub(rate.rate) + surcharge, { table: 'mainline_auto_rates', operationType: MainlineOperationType.LOAD, rateId: rate.id, weightKg: input.weightKg, weightFromKg: rate.weightFromKg, weightToKg: rate.weightToKg, baseRate: rub(rate.rate), ruleId: rule?.id ?? null, additions: surcharge, total: rub(rate.rate) + surcharge }) };
  }

  private async buildInboundDestinationStage(input: CreateQuoteDto, destination: any, container: any, kmtpId: number, date: Date, warnings: string[]) {
    if (!destination.tariffLocationId) throw new BadRequestException('Destination tariff location is missing');
    const row = destination.distances.find((item: any) => item.terminalId === kmtpId);
    if (!row) throw new BadRequestException('Destination distance to KMTP is missing');
    const distance = rub(row.roundTripKm); const tariffDistance = destination.city.trim().toLocaleLowerCase('ru-RU') === 'калининград' ? 40 : distance;
    const resolved = await this.resolveLocalAutoRate(input, destination.territoryGroupId, kmtpId, tariffDistance, date, warnings);
    return { amount: resolved.amount, missing: resolved.missing, stage: this.stage(3, 'Авто • последняя миля', `КМТП → ${destination.city}`, `${formatNumber(distance)} км • ${formatNumber(input.weightKg)} кг • ${container.type}`, resolved.missing ? 'Тариф не определён' : 'Тариф найден', resolved.amount, { ...resolved.source, distance, tariffDistance }) };
  }

  private async buildSeaStage(input: CreateQuoteDto, container: any, fromTerminalId: number, toTerminalId: number, fromName: string, toName: string, direction: QuoteDirection, date: Date, warnings: string[]) {
    const status = await this.prisma.containerStatus.findUnique({ where: { code: input.owner } }); if (!status) throw new BadRequestException(`Container status ${input.owner} was not found`);
    const containerState = input.weightKg > 0 ? ContainerState.LOADED : ContainerState.EMPTY; const where = { fromTerminalId, toTerminalId, containerId: container.id, statusId: status.id, containerState, ...(activeDate(date) as any) };
    const [lilo, fios, usage, storage] = await Promise.all([this.prisma.seaLiloRate.findFirst({ where, orderBy: { rateStartDate: 'desc' } }), this.prisma.seaFiosRate.findFirst({ where: { fromTerminalId, toTerminalId, containerId: container.id, containerState, ...(activeDate(date) as any) }, orderBy: { rateStartDate: 'desc' } }), this.prisma.containerUsageRate.findFirst({ where: { containerId: container.id, statusId: status.id, rateType: 'USAGE', OR: [{ originTerminalId: fromTerminalId }, { originTerminalId: null }], ...(activeDate(date) as any) }, orderBy: { rateStartDate: 'desc' } }), this.prisma.containerUsageRate.findFirst({ where: { containerId: container.id, statusId: status.id, rateType: 'STORAGE', originTerminalId: fromTerminalId, ...(activeDate(date) as any) }, orderBy: { rateStartDate: 'desc' } })]);
    const seaTitle = `${fromName} → ${toName}`;
    if (!lilo) { warnings.push('SEA_LILO_RATE_NOT_FOUND'); return { liLo: 0, fios: 0, portHandlingOrigin: 0, portHandlingDestination: 0, containerUsage: 0, containerStorage: 0, connectionOrigin: 0, connectionDestination: 0, connectionOriginFreeDays: 0, connectionDestinationFreeDays: 0, missing: true, stage: this.stage(2, 'Море • LI-LO', seaTitle, `${container.type} • ${input.owner} • ${containerState === ContainerState.LOADED ? 'ГРУЖЁНЫЙ' : 'ПОРОЖНИЙ'}`, 'Тариф не определён', 0, { table: 'sea_lilo_rates', rateId: null, fromTerminalId, toTerminalId, rawRate: null }) }; }
    if (!fios) warnings.push('SEA_FIOS_RATE_NOT_FOUND'); if (!usage) warnings.push('CONTAINER_USAGE_RATE_NOT_FOUND'); if (!storage) warnings.push('CONTAINER_STORAGE_RATE_NOT_FOUND');
    const portHandlingOrigin = await this.portHandling(direction, 'origin', date, warnings); const portHandlingDestination = await this.portHandling(direction, 'destination', date, warnings);
    const destinationConnection = input.category === 'REF' ? REEFER_DESTINATION_CONNECTION[direction] : { amount: 0, freeDays: 0 };
    const connectionOrigin = input.category === 'REF' ? await this.ruleValue('CONNECTION_ORIGIN', date, warnings) : 0; const connectionDestination = destinationConnection.amount;
    const componentsTotal = rub(lilo.rate) + portHandlingOrigin.amount + rub(fios?.rate) + portHandlingDestination.amount + rub(usage?.rate) + rub(storage?.rate) + connectionOrigin + connectionDestination;
    const liLoAmount = rub(lilo.rate);
    return { liLo: liLoAmount, fios: rub(fios?.rate), portHandlingOrigin: portHandlingOrigin.amount, portHandlingDestination: portHandlingDestination.amount, containerUsage: rub(usage?.rate), containerStorage: rub(storage?.rate), connectionOrigin, connectionDestination, connectionOriginFreeDays: 0, connectionDestinationFreeDays: destinationConnection.freeDays, missing: false, stage: this.stage(2, 'Море • LI-LO', seaTitle, `${container.type} • ${input.owner} • ${containerState === ContainerState.LOADED ? 'ГРУЖЁНЫЙ' : 'ПОРОЖНИЙ'}`, 'Тариф найден', liLoAmount, { table: 'sea_lilo_rates', rateId: lilo.id, rawRate: liLoAmount, fromTerminalId, toTerminalId, fios: { table: 'sea_fios_rates', rateId: fios?.id ?? null, rawRate: fios ? rub(fios.rate) : null }, portHandling: { origin: portHandlingOrigin, destination: portHandlingDestination }, usageRateId: usage?.id ?? null, storageRateId: storage?.id ?? null, containerState, componentsTotal, components: { liLo: liLoAmount, fios: rub(fios?.rate), portHandlingOrigin: portHandlingOrigin.amount, portHandlingDestination: portHandlingDestination.amount, containerUsage: rub(usage?.rate), containerStorage: rub(storage?.rate), connectionOrigin, connectionDestination } }) };
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
    if (local) { const row = destination.distances.find((item: any) => item.terminalId === pktId); if (!row) throw new BadRequestException('Destination distance to PKT is missing'); const distance = rub(row.roundTripKm); const resolved = await this.resolveLocalAutoRate(input, destination.territoryGroupId, pktId, distance, date, warnings); return { amount: resolved.amount, missing: resolved.missing, stage: this.stage(3, 'Авто • последняя миля', `ПКТ → ${destination.city}`, `${formatNumber(distance)} км • ${formatNumber(input.weightKg)} кг • ${container.type}`, resolved.missing ? 'Тариф не определён' : 'Тариф найден', resolved.amount, { ...resolved.source, distance, operationType: 'LOCAL' }) }; }
    const candidates = await this.resolveMainlineRates(destination.tariffLocationId, input.weightKg, date);
    if (candidates.length !== 1) { warnings.push(candidates.length ? `MAINLINE_ROUTE_NOT_SUPPORTED_YET:${candidates.map((item) => item.id).join(',')}` : 'MAINLINE_RATE_NOT_FOUND'); return { amount: 0, missing: true, stage: this.stage(3, 'Авто • последняя миля', `ПКТ → ${destination.city}`, `${formatNumber(input.weightKg)} кг • ${container.type}`, 'Тариф не определён', 0, { table: 'mainline_auto_rates', rateIds: candidates.map((item) => item.id) }) }; }
    const rate = candidates[0]; const rule = await this.prisma.mainlineAutoRule.findFirst({ where: { ...(activeDate(date) as any) }, orderBy: { rateStartDate: 'desc' } }); const surcharge = rule ? mainlineRuleAmount(rule, input.weightKg, input.category, input.services.dangerous) : 0; if (!rule) warnings.push('MAINLINE_AUTO_RULE_NOT_FOUND'); return { amount: rub(rate.rate) + surcharge, missing: false, stage: this.stage(3, 'Авто • последняя миля', `ПКТ → ${destination.city}`, `${formatNumber(input.weightKg)} кг • ${container.type}`, 'Тариф найден', rub(rate.rate) + surcharge, { table: 'mainline_auto_rates', rateId: rate.id, weightKg: input.weightKg, weightFromKg: rate.weightFromKg, weightToKg: rate.weightToKg, baseRate: rub(rate.rate), ruleId: rule?.id ?? null, additions: surcharge, total: rub(rate.rate) + surcharge }) };
  }

  private async resolveServices(input: CreateQuoteDto, territoryGroupId: number | null, date: Date, warnings: string[], identification: number) { let genset: number | null = 0; if (input.category === 'REF' && input.services.genset) { const rate = await this.resolveAutoRefRate(territoryGroupId, date, warnings); genset = rate ? rub(rate.gensetPerDayRub) : null; if (!rate) warnings.push('GENSET_RATE_NOT_FOUND'); } return [{ name: 'Идентификация', active: input.services.identification, amountValue: identification, priced: true }, ...(input.category === 'REF' ? [{ name: 'Дженсет', active: input.services.genset, amountValue: genset, priced: genset !== null }] : []), { name: 'Опасный груз', active: input.services.dangerous, amountValue: 0, priced: true }]; }
  private async resolveAdditionalServices(input: CreateQuoteDto, originTerminalId: number, containerType: string, date: Date, warnings: string[]) {
    const special = originTerminalId === 1 && input.owner === 'SOC' && ['40 HCPW', '40 HC'].includes(containerType);
    const code = special ? 'ADDITIONAL_SERVICES_KLD_SOC_ZERO' : 'ADDITIONAL_SERVICES_DEFAULT';
    return this.ruleValue(code, date, warnings);
  }
  private async resolveIdentification(_direction: QuoteDirection, date: Date, warnings: string[]) {
    // Identification is a fixed 6271 RUB service for both directions under the current tariff rules.
    return this.ruleValue('IDENTIFICATION_KLD_IN', date, warnings);
  }
  private async resolveMainlineRates(serviceLocationId: number, weightKg: number, date: Date) {
    const where = { serviceLocationId, weightFromKg: { lte: weightKg }, OR: [{ weightToKg: null }, { weightToKg: { gte: weightKg } }], ...(activeDate(date) as any) };
    return this.prisma.mainlineAutoRate.findMany({ where: { ...where, operationType: MainlineOperationType.LOAD }, orderBy: { id: 'asc' } });
  }
  private stage(number: number, mode: string, title: string, details: string, status: string, amountValue: number, source: Record<string, unknown>) { return { number, mode, title, from: title.split(' → ')[0], to: title.split(' → ')[1] ?? '', details, status, amountValue, amount: amountValue > 0 ? formatRubles(amountValue) : '—', source }; }
}
function ruleAmount(rule: any, weightKg: number, dangerous: boolean) { const overweight = weightKg > rule.overweightThresholdKg ? Math.ceil((weightKg - rule.overweightThresholdKg) / 1000) * rub(rule.overweightPerTonRub) : 0; return overweight + (dangerous ? rub(rule.dangerousCargoRub) : 0); }
function mainlineRuleAmount(rule: any, weightKg: number, category: string, dangerous: boolean) { const overweight = weightKg > rule.overweightThresholdKg ? Math.ceil((weightKg - rule.overweightThresholdKg) / 1000) * rub(rule.overweightPerTonRub) : 0; return overweight + (category === 'REF' ? rub(rule.refSurchargeRub) : 0) + (dangerous ? rub(rule.dangerousCargoRub) : 0); }
function commercialQuote(effectiveRate: number | null, costs: any, category: string) { const serviceBase = (costs.fios ?? 0) + (costs.firstMile ?? 0) + (costs.lastMile ?? 0) + (costs.containerUsage ?? 0); const services = 0.15 * serviceBase; if (effectiveRate === null || costs.total === null || costs.liLo === null) return { forwardingMargin: '—', forwardingMarginPercent: '—', servicesMargin: formatRubles(services), totalMargin: '—', totalMarginPercent: '—' }; const base = costs.total; const margin = liLoMargin(costs, category); const forwarding = margin + (effectiveRate - base); const total = forwarding + services; return { forwardingMargin: formatRubles(forwarding), forwardingMarginPercent: formatPercent(forwarding / costs.liLo), servicesMargin: formatRubles(services), totalMargin: formatRubles(total), totalMarginPercent: formatPercent(total / effectiveRate) }; }
function liLoMargin(costs: any, _category: string) { return (costs.liLo ?? 0) - (costs.portHandlingOrigin ?? 0) - (costs.fios ?? 0) - (costs.portHandlingDestination ?? 0) - (costs.containerUsage ?? 0) - (costs.containerStorage ?? 0) - (costs.additionalServices ?? 0); }
function emptyCommercial() { return { forwardingMargin: '—', forwardingMarginPercent: '—', servicesMargin: '—', totalMargin: '—', totalMarginPercent: '—' }; }
function formatNumber(value: number) { return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value); }
function formatRubles(value: number) { return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.ceil(value))} ₽`; }
function ceilPercent1(value: number) { return Math.ceil(value * 10) / 10; }
function formatPercent(value: number) { return `${ceilPercent1(value * 100).toFixed(1).replace('.', ',')} %`; }
function formatDays(value: number) { const mod10 = value % 10; const mod100 = value % 100; const word = mod10 === 1 && mod100 !== 11 ? 'день' : mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20) ? 'дня' : 'дней'; return `${value} ${word}`; }
