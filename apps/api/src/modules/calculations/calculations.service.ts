import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCalculationDto } from './dto/create-calculation.dto';

@Injectable()
export class CalculationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(payload: CreateCalculationDto, authenticatedPortalId: string) {
    const authorizedPortalDomain = await this.resolveAuthorizedPortal(authenticatedPortalId);
    const tenantPayload = { ...payload, portalDomain: authorizedPortalDomain };
    const requestFingerprint = buildRequestFingerprint(tenantPayload);
    const existingCurrent = requestFingerprint
      ? await this.prisma.calculation.findFirst({ where: { portalDomain: authorizedPortalDomain, requestFingerprint, isCurrent: true }, select: { id: true } })
      : null;
    const created = await this.prisma.calculation.create({
      data: {
        portalDomain: authorizedPortalDomain,
        dealId: payload.dealId ?? null,
        counterpartyId: payload.counterpartyId ?? null,
        counterpartyType: payload.counterpartyType ?? null,
        counterpartyName: payload.counterpartyName ?? null,
        routeType: payload.routeType ?? null,
        requestFingerprint,
        isCurrent: Boolean(requestFingerprint && !existingCurrent),
        category: payload.category ?? null,
        originLocationId: payload.originLocationId ?? null,
        destinationLocationId: payload.destinationLocationId ?? null,
        containerId: payload.containerId ?? null,
        cargoId: payload.cargoId ?? null,
        owner: payload.owner ?? null,
        origin: payload.origin,
        destination: payload.destination,
        weightKg: payload.weightKg,
        volumeM3: payload.volumeM3,
        transportType: payload.transportType,
        containerType: payload.containerType ?? null,
        containerStatus: payload.containerStatus ?? null,
        currency: payload.currency,
        totalCost: payload.totalCost,
        margin: payload.margin,
        clientPrice: payload.clientPrice,
        marginType: payload.marginType ?? null,
        marginValue: payload.marginValue ?? null,
        paymentDelayDays: payload.paymentDelayDays ?? null,
        services: payload.services ?? undefined,
        warnings: payload.warnings ?? undefined,
        tariffSnapshot: payload.tariffSnapshot as Prisma.InputJsonValue | undefined,
        status: 'DRAFT',
        lines: {
          create: payload.lines.map((line, index) => ({
            stage: line.stage,
            name: line.name,
            cost: line.cost,
            currency: line.currency,
            tariffId: line.tariffId ?? null,
            tariffRowId: line.tariffRowId ?? null,
            tariffName: line.tariffName ?? null,
            tariffPrice: line.tariffPrice ?? null,
            tariffUnit: line.tariffUnit ?? null,
            tariffCalculatedAt: line.tariffCalculatedAt ? new Date(line.tariffCalculatedAt) : null,
            sortOrder: line.sortOrder ?? index
          }))
        }
      },
      include: { lines: { orderBy: { sortOrder: 'asc' } } }
    });

    return created;
  }

  async getById(id: string) {
    const item = await this.prisma.calculation.findUnique({
      where: { id },
      include: { lines: { orderBy: { sortOrder: 'asc' } } }
    });

    if (!item) {
      throw new NotFoundException(`Calculation ${id} not found`);
    }

    return item;
  }

  async getByDeal(dealId: string) {
    return this.prisma.calculation.findMany({
      where: { dealId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { lines: { orderBy: { sortOrder: 'asc' } } }
    });
  }

  async getRecent() {
    return this.prisma.calculation.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { lines: { orderBy: { sortOrder: 'asc' } } }
    });
  }

  async getHistory(query: HistoryQuery, authenticatedPortalId: string) {
    const authorizedPortalDomain = await this.resolveAuthorizedPortal(authenticatedPortalId);
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const counterpartyIds = toStringArray(query.counterpartyId);
    const counterpartyNames = toStringArray(query.counterpartyName);
    const containerTypes = toStringArray(query.containerType);
    const originLocationIds = toStringArray(query.originLocationId);
    const destinationLocationIds = toStringArray(query.destinationLocationId);
    const originLegacy = toStringArray(query.originLegacy);
    const destinationLegacy = toStringArray(query.destinationLegacy);
    const statuses = toStringArray(query.status);
    const andFilters: Prisma.CalculationWhereInput[] = [];
    if (counterpartyIds.length || counterpartyNames.length) andFilters.push({ OR: [
        ...(counterpartyIds.length ? [{ counterpartyId: { in: counterpartyIds } }] : []),
        ...(counterpartyNames.length ? [{ counterpartyId: null, counterpartyName: { in: counterpartyNames } }] : [])
      ] });
    if (containerTypes.length) andFilters.push({ containerType: { in: containerTypes } });
    if (originLocationIds.length || originLegacy.length) andFilters.push({ OR: [
        ...(originLocationIds.length ? [{ originLocationId: { in: originLocationIds } }] : []),
        ...(originLegacy.length ? [{ originLocationId: null, origin: { in: originLegacy } }] : [])
      ] });
    if (destinationLocationIds.length || destinationLegacy.length) andFilters.push({ OR: [
        ...(destinationLocationIds.length ? [{ destinationLocationId: { in: destinationLocationIds } }] : []),
        ...(destinationLegacy.length ? [{ destinationLocationId: null, destination: { in: destinationLegacy } }] : [])
      ] });
    const commonWhere: Prisma.CalculationWhereInput = { portalDomain: authorizedPortalDomain, ...(andFilters.length ? { AND: andFilters } : {}) };
    const statusWhere: Prisma.CalculationWhereInput = statuses.length === 1 && statuses[0] === 'CURRENT' ? { isCurrent: true } : statuses.length === 1 && statuses[0] === 'ARCHIVED' ? { isCurrent: false } : {};
    const where: Prisma.CalculationWhereInput = { ...commonWhere, ...statusWhere };
    const [total, currentCount, lastIssued, deltaRows] = await Promise.all([
      this.prisma.calculation.count({ where }),
      this.prisma.calculation.count({ where: { ...commonWhere, isCurrent: true } }),
      this.prisma.calculation.findFirst({ where, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      this.prisma.calculation.findMany({ where: { ...where, requestFingerprint: { not: null } }, select: { id: true, requestFingerprint: true, portalDomain: true, clientPrice: true, createdAt: true } })
    ]);
    const summaryDeltas = calculateDeltas(deltaRows);
    const deltaValues = deltaRows.map((row) => summaryDeltas.get(row.id) ?? null).filter((value): value is number => value !== null);
    const averageDeltaPercent = deltaValues.length ? deltaValues.reduce((sum, value) => sum + value, 0) / deltaValues.length : null;
    const rows = await this.prisma.calculation.findMany({ where, orderBy: [{ isCurrent: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize });
    const items = await this.toHistoryItems(rows, authorizedPortalDomain);
    return { items, pagination: { page, pageSize, total }, summary: { filteredCount: total, currentCount, lastIssuedAt: lastIssued?.createdAt ?? null, averageDeltaPercent } };
  }

  async getHistoryFilterOptions(authenticatedPortalId: string) {
    const authorizedPortalDomain = await this.resolveAuthorizedPortal(authenticatedPortalId);
    const [counterpartyRows, containerRows, locationRows] = await Promise.all([
      this.prisma.calculation.findMany({
        where: { portalDomain: authorizedPortalDomain },
        select: { counterpartyId: true, counterpartyType: true, counterpartyName: true },
        distinct: ['counterpartyId', 'counterpartyName']
      }),
      this.prisma.calculation.findMany({
        where: { portalDomain: authorizedPortalDomain, containerType: { not: null } },
        select: { containerType: true },
        distinct: ['containerType']
      }),
      this.prisma.calculation.findMany({
        where: { portalDomain: authorizedPortalDomain },
        select: { originLocationId: true, destinationLocationId: true, origin: true, destination: true }
      })
    ]);
    const locationIds = Array.from(new Set(locationRows.flatMap((row) => [row.originLocationId, row.destinationLocationId]).filter((value): value is string => Boolean(value))));
    const locations = locationIds.length ? await this.prisma.location.findMany({ where: { id: { in: locationIds } }, select: { id: true, city: true, region: true, country: true } }) : [];
    const locationById = new Map(locations.map((location) => [location.id, location]));
    const locationOptions = new Map<string, { id: string; city: string; region: string; country: string; legacyText?: string }>();
    for (const row of locationRows) {
      if (row.originLocationId) { const location = locationById.get(row.originLocationId); if (location) locationOptions.set(`id:${location.id}`, location); }
      if (row.destinationLocationId) { const location = locationById.get(row.destinationLocationId); if (location) locationOptions.set(`id:${location.id}`, location); }
      if (!row.originLocationId && row.origin) locationOptions.set(`legacy:${row.origin}`, { id: `legacy:${row.origin}`, city: row.origin, region: '', country: '', legacyText: row.origin });
      if (!row.destinationLocationId && row.destination) locationOptions.set(`legacy:${row.destination}`, { id: `legacy:${row.destination}`, city: row.destination, region: '', country: '', legacyText: row.destination });
    }
    return {
      counterparties: counterpartyRows.filter((row) => row.counterpartyId || row.counterpartyName).map((row) => ({ id: row.counterpartyId ?? undefined, name: row.counterpartyName ?? '—', type: row.counterpartyType ?? undefined, value: row.counterpartyId ? `id:${row.counterpartyId}` : `legacy:${row.counterpartyName}` })),
      containerTypes: containerRows.map((row) => row.containerType).filter((value): value is string => Boolean(value)).sort(),
      locations: Array.from(locationOptions.values()).sort((left, right) => left.city.localeCompare(right.city, 'ru'))
    };
  }

  async getRequestHistory(id: string, authenticatedPortalId: string) {
    const authorizedPortalDomain = await this.resolveAuthorizedPortal(authenticatedPortalId);
    const item = await this.prisma.calculation.findFirst({ where: { id, portalDomain: authorizedPortalDomain } });
    if (!item) throw new NotFoundException(`Calculation ${id} not found`);
    if (!item.requestFingerprint) return { items: [], supported: false };
    const rows = await this.prisma.calculation.findMany({ where: { portalDomain: authorizedPortalDomain, requestFingerprint: item.requestFingerprint }, orderBy: { createdAt: 'desc' } });
    return { items: await this.toHistoryItems(rows, authorizedPortalDomain) };
  }

  async setCurrent(id: string, authenticatedPortalId: string) {
    const authorizedPortalDomain = await this.resolveAuthorizedPortal(authenticatedPortalId);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const selected = await transaction.calculation.findFirst({ where: { id, portalDomain: authorizedPortalDomain } });
        if (!selected) throw new NotFoundException(`Calculation ${id} not found`);
        if (!selected.requestFingerprint || !selected.portalDomain) throw new ForbiddenException('Legacy calculations cannot be marked as current');
        await transaction.calculation.updateMany({ where: { portalDomain: authorizedPortalDomain, requestFingerprint: selected.requestFingerprint, isCurrent: true }, data: { isCurrent: false } });
        return transaction.calculation.update({ where: { id: selected.id }, data: { isCurrent: true } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Another current tariff was selected concurrently');
      throw error;
    }
  }

  private async resolveAuthorizedPortal(portalId: string) {
    const portal = await this.prisma.bitrixPortal.findUnique({ where: { id: portalId }, select: { domain: true } });
    if (!portal?.domain) throw new ForbiddenException('Authenticated Bitrix portal was not found');
    return portal.domain;
  }

  private async toHistoryItems(rows: any[], authorizedPortalDomain: string) {
    const fingerprints = Array.from(new Set(rows.map((row) => row.requestFingerprint).filter(Boolean))) as string[];
    const candidates = fingerprints.length ? await this.prisma.calculation.findMany({ where: { portalDomain: authorizedPortalDomain, requestFingerprint: { in: fingerprints } }, select: { id: true, requestFingerprint: true, portalDomain: true, clientPrice: true, createdAt: true } }) : [];
    const deltas = calculateDeltas(candidates);
    return rows.map((row) => ({ id: row.id, counterparty: row.counterpartyName, origin: row.origin, destination: row.destination, category: row.category, container: row.containerType, weightKg: Number(row.weightKg), createdAt: row.createdAt, clientPrice: Number(row.clientPrice), currency: row.currency, isCurrent: row.isCurrent, requestFingerprint: row.requestFingerprint, deltaPercent: deltas.get(row.id) ?? null }));
  }
}

export type HistoryQuery = { page?: string; pageSize?: string; counterpartyId?: string | string[]; counterpartyName?: string | string[]; containerType?: string | string[]; containerId?: string | string[]; originLocationId?: string | string[]; destinationLocationId?: string | string[]; originLegacy?: string | string[]; destinationLegacy?: string | string[]; status?: string | string[] };

export function toStringArray(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return values.map((item) => String(item).trim()).filter(Boolean);
}

export function buildRequestFingerprint(payload: Pick<CreateCalculationDto, 'portalDomain' | 'counterpartyId' | 'counterpartyName' | 'category' | 'originLocationId' | 'destinationLocationId' | 'containerId' | 'cargoId' | 'weightKg' | 'owner' | 'services' | 'paymentDelayDays'>) {
  const portalDomain = normalizeString(payload.portalDomain);
  const counterpartyIdentity = payload.counterpartyId ? ['ID', normalizeString(payload.counterpartyId)] : ['NAME', normalizeString(payload.counterpartyName)];
  const category = normalizeString(payload.category);
  const originLocationId = normalizeString(payload.originLocationId);
  const destinationLocationId = normalizeString(payload.destinationLocationId);
  const containerId = normalizeId(payload.containerId);
  const cargoId = normalizeId(payload.cargoId);
  const weightKg = normalizeWeight(payload.weightKg);
  const owner = normalizeString(payload.owner);
  const paymentDelayDays = normalizeInteger(payload.paymentDelayDays);
  if (!portalDomain || !counterpartyIdentity[1] || !category || !originLocationId || !destinationLocationId || containerId === null || !owner || paymentDelayDays === null || weightKg === null || !payload.services) return null;
  const canonical = [portalDomain, counterpartyIdentity, category, originLocationId, destinationLocationId, containerId, cargoId, weightKg, owner, Boolean(payload.services.identification), Boolean(payload.services.genset), Boolean(payload.services.dangerous), paymentDelayDays];
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function normalizeString(value: unknown) { return typeof value === 'string' ? (value.trim() || null) : value === null || value === undefined ? null : String(value).trim() || null; }
function normalizeId(value: unknown) { const numeric = Number(value); return Number.isFinite(numeric) && Number.isInteger(numeric) ? numeric : null; }
function normalizeWeight(value: unknown) { const numeric = Number(value); return Number.isFinite(numeric) ? numeric : null; }
function normalizeInteger(value: unknown) { const numeric = Number(value); return Number.isFinite(numeric) && Number.isInteger(numeric) ? numeric : null; }

function calculateDeltas(rows: Array<{ id: string; requestFingerprint: string | null; portalDomain: string | null; clientPrice: unknown; createdAt: Date }>) {
  const result = new Map<string, number | null>();
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.requestFingerprint) { result.set(row.id, null); continue; }
    const key = `${row.portalDomain ?? ''}:${row.requestFingerprint}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  for (const group of groups.values()) {
    group.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
    group.forEach((row, index) => {
      const previous = group[index - 1];
      const previousPrice = previous ? Number(previous.clientPrice) : 0;
      result.set(row.id, previous && previousPrice > 0 ? (Number(row.clientPrice) - previousPrice) / previousPrice * 100 : null);
    });
  }
  return result;
}
