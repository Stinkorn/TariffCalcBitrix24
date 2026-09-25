import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import type {
  ContainerCategory,
  ContainerState,
  ContainerStatusCode,
  MainlineOperationType,
  Prisma,
  PrismaClient,
  RailServiceUnit,
} from '@prisma/client';
import * as XLSX from 'xlsx';

type Mode = 'validate' | 'dry-run' | 'apply';
type Cell = unknown;
type Row = Record<string, Cell>;
type DatabaseClient = PrismaClient | Prisma.TransactionClient;

type CliArgs = {
  mode: Mode;
  file: string;
  report?: string;
  expectedSha?: string;
};

const EXPECTED_SHEETS = [
  'containers', 'locations', 'territory_groups', 'container_statuses', 'terminals',
  'location_distances', 'auto_dry_rates', 'auto_ref_rates', 'auto_rules', 'rail_rates',
  'rail_service_rates', 'sea_lilo_rates', 'sea_fios_rates', 'cargo', 'sea_fios_rules',
  'container_usage_rates', 'mainline_auto_rates', 'mainline_auto_rules',
] as const;

const HEADERS: Record<string, string[]> = {
  containers: ['container_id', 'container_size', 'container_type', 'container_category'],
  locations: ['location_id', 'location_city', 'location_region', 'location_country', 'territory_group_id'],
  territory_groups: ['territory_group_id', 'territory_group_code', 'territory_group_name'],
  container_statuses: ['status_id', 'status_code', 'status_name'],
  terminals: ['terminal_id', 'terminal_name', 'location_id'],
  location_distances: ['location_id', 'terminal_id', 'round_trip_km'],
  auto_dry_rates: ['rate_id', 'terminal_id', 'km_from', 'km_to', 'weight_from_kg', 'weight_to_kg', 'rate', 'rate_start_date', 'rate_finish_date'],
  auto_ref_rates: ['rate_id', 'territory_group_id', 'coefficient', 'surcharge_rub', 'genset_per_day_rub', 'rate_start_date', 'rate_finish_date'],
  auto_rules: ['rule_id', 'terminal_id', 'extra_address_rub', 'deadhead_full_rate', 'overweight_threshold_kg', 'overweight_per_ton_rub', 'dangerous_cargo_rub', 'free_loading_hours', 'overtime_per_hour_rub', 'genset_overtime_per_hour_rub', 'customs_free_hours', 'customs_per_hour_rub', 'customs_max_per_day_rub', 'round_partial_ton_up', 'round_partial_hour_up', 'rate_start_date', 'rate_finish_date', 'round_distance_km_up'],
  rail_rates: ['rate_id', 'from_location_id', 'to_location_id', 'container_id', 'container_state', 'cargo_tariff_class', 'free_storage_days', 'rate', 'rate_start_date', 'rate_finish_date'],
  rail_service_rates: ['rate_id', 'from_location_id', 'to_location_id', 'container_id', 'container_state', 'service_code', 'service_unit', 'rate', 'rate_start_date', 'rate_finish_date'],
  sea_lilo_rates: ['rate_id', 'from_terminal_id', 'to_terminal_id', 'container_id', 'status_id', 'container_state', 'rate', 'rate_start_date', 'rate_finish_date'],
  sea_fios_rates: ['rate_id', 'from_terminal_id', 'to_terminal_id', 'container_id', 'container_state', 'rate', 'rate_start_date', 'rate_finish_date'],
  cargo: ['cargo_id', 'cargo_name', 'cargo_etsng', 'cargo_tariff_class'],
  sea_fios_rules: ['rule_id', 'rule_code', 'rule_value', 'rule_unit', 'rate_start_date', 'rate_finish_date'],
  container_usage_rates: ['rate_id', 'container_id', 'status_id', 'rate', 'rate_start_date', 'rate_finish_date'],
  mainline_auto_rates: ['rate_id', 'operation_type', 'setup_location_id', 'service_location_id', 'return_location_id', 'weight_from_kg', 'weight_to_kg', 'rate', 'rate_start_date', 'rate_finish_date'],
  mainline_auto_rules: ['rule_id', 'extra_address_rub', 'deadhead_full_rate', 'ref_surcharge_rub', 'overweight_threshold_kg', 'overweight_per_ton_rub', 'genset_per_day_rub', 'dangerous_cargo_rub', 'free_loading_hours', 'overtime_per_hour_rub', 'genset_overtime_per_hour_rub', 'customs_free_hours', 'customs_per_hour_rub', 'customs_max_per_day_rub', 'round_partial_ton_up', 'round_partial_hour_up', 'rate_start_date', 'rate_finish_date'],
};

const PRIMARY_KEYS: Record<string, string> = {
  containers: 'container_id', locations: 'location_id', territory_groups: 'territory_group_id',
  container_statuses: 'status_id', terminals: 'terminal_id',
  auto_dry_rates: 'rate_id', auto_ref_rates: 'rate_id', auto_rules: 'rule_id', rail_rates: 'rate_id',
  rail_service_rates: 'rate_id', sea_lilo_rates: 'rate_id', sea_fios_rates: 'rate_id', cargo: 'cargo_id',
  sea_fios_rules: 'rule_id', container_usage_rates: 'rate_id', mainline_auto_rates: 'rate_id',
  mainline_auto_rules: 'rule_id',
};

const ENUMS: Record<string, string[]> = {
  container_category: ['DRY', 'REF'],
  container_state: ['LOADED', 'EMPTY'],
  status_code: ['SOC', 'COC'],
  operation_type: ['LOAD', 'UNLOAD'],
  service_unit: ['PER_TRIP', 'PER_SERVICE'],
};

const INTEGER_FIELDS = new Set([
  'container_id', 'container_size', 'location_id', 'territory_group_id', 'status_id', 'terminal_id',
  'rate_id', 'rule_id', 'km_from', 'km_to', 'weight_from_kg', 'weight_to_kg', 'overweight_threshold_kg',
  'free_loading_hours', 'customs_free_hours', 'cargo_tariff_class', 'free_storage_days',
]);
const NON_NEGATIVE_FIELDS = new Set(['round_trip_km', 'km_from', 'km_to', 'weight_from_kg', 'weight_to_kg']);
const DATE_FIELDS = new Set(['rate_start_date', 'rate_finish_date']);
const BOOLEAN_FIELDS = new Set([
  'deadhead_full_rate', 'round_partial_ton_up', 'round_partial_hour_up', 'round_distance_km_up',
]);
const OPTIONAL_FIELDS = new Set([
  'weight_to_kg', 'rate_finish_date', 'cargo_tariff_class', 'free_storage_days', 'coefficient',
  'surcharge_rub', 'genset_overtime_per_hour_rub',
]);
const NUMERIC_FIELDS = new Set([
  'round_trip_km', 'km_from', 'km_to', 'weight_from_kg', 'weight_to_kg', 'rate', 'coefficient',
  'surcharge_rub', 'genset_per_day_rub', 'extra_address_rub', 'overweight_threshold_kg',
  'overweight_per_ton_rub', 'dangerous_cargo_rub', 'free_loading_hours', 'overtime_per_hour_rub',
  'genset_overtime_per_hour_rub', 'customs_free_hours', 'customs_per_hour_rub', 'customs_max_per_day_rub',
  'free_storage_days', 'rule_value', 'ref_surcharge_rub', 'cargo_tariff_class',
]);

const FK_RULES: Array<[string, string, string]> = [
  ['locations', 'territory_group_id', 'territory_groups'],
  ['terminals', 'location_id', 'locations'], ['location_distances', 'location_id', 'locations'],
  ['location_distances', 'terminal_id', 'terminals'], ['auto_dry_rates', 'terminal_id', 'terminals'],
  ['auto_ref_rates', 'territory_group_id', 'territory_groups'], ['auto_rules', 'terminal_id', 'terminals'],
  ['rail_rates', 'from_location_id', 'locations'], ['rail_rates', 'to_location_id', 'locations'],
  ['rail_rates', 'container_id', 'containers'], ['rail_service_rates', 'from_location_id', 'locations'],
  ['rail_service_rates', 'to_location_id', 'locations'], ['rail_service_rates', 'container_id', 'containers'],
  ['sea_lilo_rates', 'from_terminal_id', 'terminals'], ['sea_lilo_rates', 'to_terminal_id', 'terminals'],
  ['sea_lilo_rates', 'container_id', 'containers'], ['sea_lilo_rates', 'status_id', 'container_statuses'],
  ['sea_fios_rates', 'from_terminal_id', 'terminals'], ['sea_fios_rates', 'to_terminal_id', 'terminals'],
  ['sea_fios_rates', 'container_id', 'containers'], ['container_usage_rates', 'container_id', 'containers'],
  ['container_usage_rates', 'status_id', 'container_statuses'], ['mainline_auto_rates', 'setup_location_id', 'locations'],
  ['mainline_auto_rates', 'service_location_id', 'locations'], ['mainline_auto_rates', 'return_location_id', 'locations'],
];

function isBlank(value: Cell): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function asString(value: Cell): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

function isNumber(value: Cell): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeKey(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function dateValue(value: Cell): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, parsed.S));
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function isOptionalField(sheetName: string, field: string): boolean {
  if (field === 'cargo_tariff_class') return sheetName === 'rail_rates';
  return OPTIONAL_FIELDS.has(field);
}

function parseArgs(argv: string[]): CliArgs {
  let file: string | undefined;
  let report: string | undefined;
  let expectedSha: string | undefined;
  let mode: Mode | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--validate' || arg === '--dry-run' || arg === '--apply') {
      if (mode) throw new Error('Exactly one of --validate, --dry-run, or --apply must be specified.');
      mode = arg.slice(2) as Mode;
    } else if (arg === '--file') {
      file = argv[++i];
    } else if (arg === '--report') {
      report = argv[++i];
    } else if (arg === '--expected-sha') {
      expectedSha = argv[++i];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!file) throw new Error('--file is required.');
  if (!mode) throw new Error('Exactly one of --validate, --dry-run, or --apply must be specified.');
  if (mode === 'apply' && !expectedSha) throw new Error('--expected-sha is required with --apply.');
  if (expectedSha && !/^[a-fA-F0-9]{64}$/.test(expectedSha)) throw new Error('--expected-sha must be a 64-character hexadecimal SHA-256 digest.');
  return { mode, file: resolve(file), report, expectedSha: expectedSha?.toLowerCase() };
}

function readWorkbook(file: string, errors: string[], warnings: string[]) {
  if (!existsSync(file)) {
    errors.push(`Workbook does not exist: ${file}`);
    return null;
  }
  const bytes = readFileSync(file);
  const workbookSha256 = createHash('sha256').update(bytes).digest('hex');
  const workbookSize = statSync(file).size;
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, { type: 'buffer', cellDates: true });
  } catch (error) {
    errors.push(`Unable to open workbook: ${String(error)}`);
    return { workbookSha256, workbookSize, sheets: {}, counts: {} };
  }
  const extra = workbook.SheetNames.filter((name) => !EXPECTED_SHEETS.includes(name as typeof EXPECTED_SHEETS[number]));
  if (extra.length) warnings.push(`Extra sheets: ${extra.join(', ')}`);
  const sheets: Record<string, Row[]> = {};
  const counts: Record<string, number> = {};
  for (const sheetName of EXPECTED_SHEETS) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      errors.push(`Missing required sheet: ${sheetName}`);
      continue;
    }
    const raw = XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, defval: null, raw: true });
    const actualHeaders = (raw[0] ?? []).map((value) => asString(value));
    const expectedHeaders = HEADERS[sheetName];
    const missing = expectedHeaders.filter((header) => !actualHeaders.includes(header));
    const extraHeaders = actualHeaders.filter((header) => header && !expectedHeaders.includes(header));
    if (missing.length) errors.push(`${sheetName}: missing headers: ${missing.join(', ')}`);
    if (extraHeaders.length) warnings.push(`${sheetName}: extra headers: ${extraHeaders.join(', ')}`);
    if (expectedHeaders.some((header, index) => actualHeaders[index] !== header)) errors.push(`${sheetName}: headers must match the expected order exactly`);
    const rows = raw.slice(1).filter((values) => values.some((value) => !isBlank(value))).map((values) => {
      const row: Row = {};
      expectedHeaders.forEach((header, index) => { row[header] = values[index]; });
      return row;
    });
    sheets[sheetName] = rows;
    counts[sheetName] = rows.length;
  }
  return { workbookSha256, workbookSize, sheets, counts };
}

function validateRows(sheets: Record<string, Row[]>, errors: string[], warnings: string[]) {
  const ids: Record<string, Set<number>> = {};
  for (const sheetName of EXPECTED_SHEETS) {
    const rows = sheets[sheetName] ?? [];
    const primaryKey = PRIMARY_KEYS[sheetName];
    ids[sheetName] = new Set<number>();
    rows.forEach((row, index) => {
      const rowLabel = `${sheetName} row ${index + 2}`;
      for (const field of HEADERS[sheetName]) {
        const value = row[field];
        if (!isOptionalField(sheetName, field) && isBlank(value)) {
          errors.push(`${rowLabel}: ${field} is required`);
          continue;
        }
        if (isBlank(value)) continue;
        if (ENUMS[field] && !ENUMS[field].includes(asString(value))) {
          errors.push(`${rowLabel}: invalid ${field} value ${asString(value)}`);
        }
        if (INTEGER_FIELDS.has(field) && (!isNumber(value) || !Number.isInteger(value))) {
          errors.push(`${rowLabel}: ${field} must be an integer`);
        }
        if (INTEGER_FIELDS.has(field) && isNumber(value) && value <= 0 && field.endsWith('_id')) {
          errors.push(`${rowLabel}: ${field} must be positive`);
        }
        if (NUMERIC_FIELDS.has(field) && !isNumber(value) && !INTEGER_FIELDS.has(field)) {
          errors.push(`${rowLabel}: ${field} must be numeric`);
        }
        if (BOOLEAN_FIELDS.has(field) && typeof value !== 'boolean') {
          errors.push(`${rowLabel}: ${field} must be boolean`);
        }
        if (DATE_FIELDS.has(field) && !dateValue(value)) {
          errors.push(`${rowLabel}: ${field} must be a valid date`);
        }
        if (NON_NEGATIVE_FIELDS.has(field) && isNumber(value) && value < 0) {
          errors.push(`${rowLabel}: ${field} must be non-negative`);
        }
      }
      if (primaryKey && isNumber(row[primaryKey])) {
        if (ids[sheetName].has(row[primaryKey])) errors.push(`${rowLabel}: duplicate ${primaryKey} ${row[primaryKey]}`);
        ids[sheetName].add(row[primaryKey]);
      }
      const start = dateValue(row.rate_start_date);
      const finish = dateValue(row.rate_finish_date);
      if (start && finish && finish < start) errors.push(`${rowLabel}: rate_finish_date is before rate_start_date`);
      if (isNumber(row.km_from) && isNumber(row.km_to) && row.km_from > row.km_to) errors.push(`${rowLabel}: km_from is greater than km_to`);
      if (isNumber(row.weight_from_kg) && isNumber(row.weight_to_kg) && row.weight_from_kg > row.weight_to_kg) errors.push(`${rowLabel}: weight_from_kg is greater than weight_to_kg`);
    });
  }
  const locationKeys = new Map<string, number>();
  for (const [index, row] of (sheets.locations ?? []).entries()) {
    const key = `${normalizeKey(asString(row.location_city))}|${normalizeKey(asString(row.location_region))}`;
    const previous = locationKeys.get(key);
    if (previous !== undefined) errors.push(`locations row ${index + 2}: duplicate normalized city+region key (also row ${previous})`);
    locationKeys.set(key, index + 2);
  }
  return ids;
}

function validateForeignKeys(sheets: Record<string, Row[]>, ids: Record<string, Set<number>>, errors: string[]) {
  const result: Record<string, { checked: number; missing: number }> = {};
  for (const [sourceSheet, field, targetSheet] of FK_RULES) {
    const key = `${sourceSheet}.${field}->${targetSheet}`;
    const rows = sheets[sourceSheet] ?? [];
    let missing = 0;
    for (const row of rows) {
      const value = row[field];
      if (isBlank(value)) continue;
      if (!ids[targetSheet]?.has(Number(value))) {
        missing += 1;
        errors.push(`Foreign key ${key}: missing value ${String(value)}`);
      }
    }
    result[key] = { checked: rows.filter((row) => !isBlank(row[field])).length, missing };
  }
  return result;
}

type LocationRow = { id: string; city: string; region: string; country: string; code: string; tariffLocationId: number | null; territoryGroupId: number | null };

type ExistingAssignment = {
  locationId: number;
  territoryGroupId: number;
  databaseId: string;
  assignTariffLocationId: boolean;
  assignTerritoryGroupId: boolean;
};

type NewLocation = {
  city: string;
  region: string;
  country: string;
  tariffLocationId: number;
  territoryGroupId: number;
  code: string;
  source: string;
};

type LocationPlan = {
  workbookCount: number;
  existingMatchCount: number;
  newLocationCount: number;
  ambiguousCount: number;
  conflictCount: number;
  countryWarningCount: number;
  existingAssignments: ExistingAssignment[];
  newLocations: NewLocation[];
  ambiguousLocations: unknown[];
  conflicts: unknown[];
  codeCollisions: unknown[];
};

type DatabasePreflight = {
  locationCount: number;
  normalizedTableCounts: Record<string, number>;
  locationPlan: LocationPlan;
};

type ApplySection = {
  attempted: boolean;
  committed: boolean;
  transactionIsolation: string;
  locations: { existingMatched: number; existingUpdated: number; existingNoOp: number; created: number };
  insertedRows: Record<string, number>;
  verification: {
    normalizedTableCounts: Record<string, number>;
    mappedWorkbookLocationCount: number | null;
    expectedLocationCount: number | null;
    actualLocationCount: number | null;
  };
  error?: string;
};

function emptyLocationPlan(workbookCount = 0): LocationPlan {
  return { workbookCount, existingMatchCount: 0, newLocationCount: 0, ambiguousCount: 0, conflictCount: 0, countryWarningCount: 0, existingAssignments: [], newLocations: [], ambiguousLocations: [], conflicts: [], codeCollisions: [] };
}

async function normalizedTableCounts(db: DatabaseClient): Promise<Record<string, number>> {
  const [territoryGroups, cargo, containers, containerStatuses, terminals, locationDistances, autoDryRates, autoRefRates, autoRules, railRates, railServiceRates, seaLiloRates, seaFiosRates, seaFiosRules, containerUsageRates, mainlineAutoRates, mainlineAutoRules] = await Promise.all([
    db.territoryGroup.count(), db.cargo.count(), db.container.count(), db.containerStatus.count(),
    db.terminal.count(), db.locationDistance.count(), db.autoDryRate.count(), db.autoRefRate.count(),
    db.autoRule.count(), db.railRate.count(), db.railServiceRate.count(), db.seaLiloRate.count(),
    db.seaFiosRate.count(), db.seaFiosRule.count(), db.containerUsageRate.count(),
    db.mainlineAutoRate.count(), db.mainlineAutoRule.count(),
  ]);
  return {
    territory_groups: territoryGroups, cargo, containers, container_statuses: containerStatuses,
    terminals, location_distances: locationDistances, auto_dry_rates: autoDryRates,
    auto_ref_rates: autoRefRates, auto_rules: autoRules, rail_rates: railRates,
    rail_service_rates: railServiceRates, sea_lilo_rates: seaLiloRates,
    sea_fios_rates: seaFiosRates, sea_fios_rules: seaFiosRules,
    container_usage_rates: containerUsageRates, mainline_auto_rates: mainlineAutoRates,
    mainline_auto_rules: mainlineAutoRules,
  };
}

function buildLocationPlan(locations: LocationRow[], workbookLocations: Row[], errors: string[], warnings: string[]): LocationPlan {
  const existingByKey = new Map<string, LocationRow[]>();
  const existingCodes = new Set(locations.map((location) => normalizeKey(location.code)));
  for (const location of locations) {
    const key = `${normalizeKey(location.city)}|${normalizeKey(location.region)}`;
    const list = existingByKey.get(key) ?? [];
    list.push(location);
    existingByKey.set(key, list);
  }
  const plan = emptyLocationPlan(workbookLocations.length);
  const plannedCodes = new Set<string>();
  for (const row of workbookLocations) {
    const key = `${normalizeKey(asString(row.location_city))}|${normalizeKey(asString(row.location_region))}`;
    const matches = existingByKey.get(key) ?? [];
    const workbookLocationId = Number(row.location_id);
    const workbookTerritoryGroupId = Number(row.territory_group_id);
    if (matches.length > 1) {
      plan.ambiguousCount += 1;
      plan.ambiguousLocations.push({ locationId: workbookLocationId, city: row.location_city, region: row.location_region, matchCount: matches.length });
      errors.push(`Ambiguous Location match for ${asString(row.location_city)}, ${asString(row.location_region)}: ${matches.length} database matches`);
      continue;
    }
    if (matches.length === 0) {
      plan.newLocationCount += 1;
      const code = `TARIFF_LOC_${workbookLocationId}`;
      const collision = existingCodes.has(normalizeKey(code)) || plannedCodes.has(normalizeKey(code));
      if (collision) {
        plan.codeCollisions.push({ locationId: workbookLocationId, code });
        errors.push(`Location code collision: ${code}`);
      }
      plannedCodes.add(normalizeKey(code));
      plan.newLocations.push({
        city: asString(row.location_city), region: asString(row.location_region),
        country: asString(row.location_country), tariffLocationId: workbookLocationId,
        territoryGroupId: workbookTerritoryGroupId, code, source: 'tariff_data_v1',
      });
      continue;
    }
    plan.existingMatchCount += 1;
    const match = matches[0];
    if (normalizeKey(match.country) !== normalizeKey(asString(row.location_country))) {
      plan.countryWarningCount += 1;
      warnings.push(`Country mismatch for ${row.location_city}, ${row.location_region}: workbook=${row.location_country}, database=${match.country}`);
    }
    const conflict = (match.tariffLocationId !== null && match.tariffLocationId !== workbookLocationId)
      || (match.territoryGroupId !== null && match.territoryGroupId !== workbookTerritoryGroupId);
    if (conflict) {
      plan.conflictCount += 1;
      plan.conflicts.push({ locationId: workbookLocationId, city: row.location_city, region: row.location_region, databaseTariffLocationId: match.tariffLocationId, workbookTariffLocationId: workbookLocationId, databaseTerritoryGroupId: match.territoryGroupId, workbookTerritoryGroupId });
      errors.push(`Location conflict for ${row.location_city}, ${row.location_region}`);
    } else {
      plan.existingAssignments.push({
        locationId: workbookLocationId, territoryGroupId: workbookTerritoryGroupId,
        databaseId: match.id, assignTariffLocationId: match.tariffLocationId === null,
        assignTerritoryGroupId: match.territoryGroupId === null,
      });
    }
  }
  return plan;
}

async function databasePreflight(db: DatabaseClient, sheets: Record<string, Row[]>, errors: string[], warnings: string[]): Promise<DatabasePreflight> {
  const locations = await db.location.findMany({ select: { id: true, city: true, region: true, country: true, code: true, tariffLocationId: true, territoryGroupId: true } });
  const counts = await normalizedTableCounts(db);
  for (const [table, count] of Object.entries(counts)) {
    if (count !== 0) errors.push(`Database blocker: ${table} contains ${count} rows; expected 0 for initial bootstrap.`);
  }
  return { locationCount: locations.length, normalizedTableCounts: counts, locationPlan: buildLocationPlan(locations, sheets.locations ?? [], errors, warnings) };
}

async function databaseDryRun(sheets: Record<string, Row[]>, errors: string[], warnings: string[]) {
  const { PrismaClient: RuntimePrismaClient } = await import('@prisma/client');
  const prisma = new RuntimePrismaClient();
  try {
    return await databasePreflight(prisma, sheets, errors, warnings);
  } finally {
    await prisma.$disconnect();
  }
}

function requiredDate(value: Cell, field: string): Date {
  const parsed = dateValue(value);
  if (!parsed) throw new Error(`Validated date is missing or invalid: ${field}`);
  return parsed;
}

function optionalDate(value: Cell): Date | null {
  return isBlank(value) ? null : requiredDate(value, 'rate_finish_date');
}

function optionalNumber(value: Cell): number | null {
  return isBlank(value) ? null : Number(value);
}

async function insertWorkbookTables(
  tx: Prisma.TransactionClient,
  sheets: Record<string, Row[]>,
): Promise<Record<string, number>> {
  const inserted: Record<string, number> = {};
  inserted.territory_groups = (await tx.territoryGroup.createMany({ data: (sheets.territory_groups ?? []).map((row) => ({ id: Number(row.territory_group_id), code: asString(row.territory_group_code), name: asString(row.territory_group_name) })) })).count;
  inserted.containers = (await tx.container.createMany({ data: (sheets.containers ?? []).map((row) => ({ id: Number(row.container_id), size: Number(row.container_size), type: asString(row.container_type), category: asString(row.container_category) as ContainerCategory })) })).count;
  inserted.container_statuses = (await tx.containerStatus.createMany({ data: (sheets.container_statuses ?? []).map((row) => ({ id: Number(row.status_id), code: asString(row.status_code) as ContainerStatusCode, name: asString(row.status_name) })) })).count;
  inserted.cargo = (await tx.cargo.createMany({ data: (sheets.cargo ?? []).map((row) => ({ id: Number(row.cargo_id), name: asString(row.cargo_name), etsng: asString(row.cargo_etsng), tariffClass: Number(row.cargo_tariff_class) })) })).count;
  return inserted;
}

async function insertDependentTables(
  tx: Prisma.TransactionClient,
  sheets: Record<string, Row[]>,
  Decimal: typeof Prisma.Decimal,
  inserted: Record<string, number>,
) {
  const decimal = (value: Cell) => new Decimal(asString(value));
  inserted.terminals = (await tx.terminal.createMany({ data: (sheets.terminals ?? []).map((row) => ({ id: Number(row.terminal_id), name: asString(row.terminal_name), locationId: Number(row.location_id) })) })).count;
  inserted.location_distances = (await tx.locationDistance.createMany({ data: (sheets.location_distances ?? []).map((row) => ({ locationId: Number(row.location_id), terminalId: Number(row.terminal_id), roundTripKm: decimal(row.round_trip_km) })) })).count;
  inserted.auto_dry_rates = (await tx.autoDryRate.createMany({ data: (sheets.auto_dry_rates ?? []).map((row) => ({ id: Number(row.rate_id), terminalId: Number(row.terminal_id), kmFrom: Number(row.km_from), kmTo: Number(row.km_to), weightFromKg: Number(row.weight_from_kg), weightToKg: optionalNumber(row.weight_to_kg), rate: decimal(row.rate), rateStartDate: requiredDate(row.rate_start_date, 'rate_start_date'), rateFinishDate: optionalDate(row.rate_finish_date) })) })).count;
  inserted.auto_ref_rates = (await tx.autoRefRate.createMany({ data: (sheets.auto_ref_rates ?? []).map((row) => ({ id: Number(row.rate_id), territoryGroupId: Number(row.territory_group_id), coefficient: isBlank(row.coefficient) ? null : decimal(row.coefficient), surchargeRub: isBlank(row.surcharge_rub) ? null : decimal(row.surcharge_rub), gensetPerDayRub: decimal(row.genset_per_day_rub), rateStartDate: requiredDate(row.rate_start_date, 'rate_start_date'), rateFinishDate: optionalDate(row.rate_finish_date) })) })).count;
  inserted.auto_rules = (await tx.autoRule.createMany({ data: (sheets.auto_rules ?? []).map((row) => ({ id: Number(row.rule_id), terminalId: Number(row.terminal_id), extraAddressRub: decimal(row.extra_address_rub), deadheadFullRate: Boolean(row.deadhead_full_rate), overweightThresholdKg: Number(row.overweight_threshold_kg), overweightPerTonRub: decimal(row.overweight_per_ton_rub), dangerousCargoRub: decimal(row.dangerous_cargo_rub), freeLoadingHours: Number(row.free_loading_hours), overtimePerHourRub: decimal(row.overtime_per_hour_rub), gensetOvertimePerHourRub: isBlank(row.genset_overtime_per_hour_rub) ? null : decimal(row.genset_overtime_per_hour_rub), customsFreeHours: Number(row.customs_free_hours), customsPerHourRub: decimal(row.customs_per_hour_rub), customsMaxPerDayRub: decimal(row.customs_max_per_day_rub), roundPartialTonUp: Boolean(row.round_partial_ton_up), roundPartialHourUp: Boolean(row.round_partial_hour_up), rateStartDate: requiredDate(row.rate_start_date, 'rate_start_date'), rateFinishDate: optionalDate(row.rate_finish_date), roundDistanceKmUp: Boolean(row.round_distance_km_up) })) })).count;
  inserted.rail_rates = (await tx.railRate.createMany({ data: (sheets.rail_rates ?? []).map((row) => ({ id: Number(row.rate_id), fromLocationId: Number(row.from_location_id), toLocationId: Number(row.to_location_id), containerId: Number(row.container_id), containerState: asString(row.container_state) as ContainerState, cargoTariffClass: optionalNumber(row.cargo_tariff_class), freeStorageDays: optionalNumber(row.free_storage_days), rate: decimal(row.rate), rateStartDate: requiredDate(row.rate_start_date, 'rate_start_date'), rateFinishDate: optionalDate(row.rate_finish_date) })) })).count;
  inserted.rail_service_rates = (await tx.railServiceRate.createMany({ data: (sheets.rail_service_rates ?? []).map((row) => ({ id: Number(row.rate_id), fromLocationId: Number(row.from_location_id), toLocationId: Number(row.to_location_id), containerId: Number(row.container_id), containerState: asString(row.container_state) as ContainerState, serviceCode: asString(row.service_code), serviceUnit: asString(row.service_unit) as RailServiceUnit, rate: decimal(row.rate), rateStartDate: requiredDate(row.rate_start_date, 'rate_start_date'), rateFinishDate: optionalDate(row.rate_finish_date) })) })).count;
  inserted.sea_lilo_rates = (await tx.seaLiloRate.createMany({ data: (sheets.sea_lilo_rates ?? []).map((row) => ({ id: Number(row.rate_id), fromTerminalId: Number(row.from_terminal_id), toTerminalId: Number(row.to_terminal_id), containerId: Number(row.container_id), statusId: Number(row.status_id), containerState: asString(row.container_state) as ContainerState, rate: decimal(row.rate), rateStartDate: requiredDate(row.rate_start_date, 'rate_start_date'), rateFinishDate: optionalDate(row.rate_finish_date) })) })).count;
  inserted.sea_fios_rates = (await tx.seaFiosRate.createMany({ data: (sheets.sea_fios_rates ?? []).map((row) => ({ id: Number(row.rate_id), fromTerminalId: Number(row.from_terminal_id), toTerminalId: Number(row.to_terminal_id), containerId: Number(row.container_id), containerState: asString(row.container_state) as ContainerState, rate: decimal(row.rate), rateStartDate: requiredDate(row.rate_start_date, 'rate_start_date'), rateFinishDate: optionalDate(row.rate_finish_date) })) })).count;
  inserted.sea_fios_rules = (await tx.seaFiosRule.createMany({ data: (sheets.sea_fios_rules ?? []).map((row) => ({ id: Number(row.rule_id), code: asString(row.rule_code), value: decimal(row.rule_value), unit: asString(row.rule_unit), rateStartDate: requiredDate(row.rate_start_date, 'rate_start_date'), rateFinishDate: optionalDate(row.rate_finish_date) })) })).count;
  inserted.container_usage_rates = (await tx.containerUsageRate.createMany({ data: (sheets.container_usage_rates ?? []).map((row) => ({ id: Number(row.rate_id), containerId: Number(row.container_id), statusId: Number(row.status_id), rate: decimal(row.rate), rateStartDate: requiredDate(row.rate_start_date, 'rate_start_date'), rateFinishDate: optionalDate(row.rate_finish_date), rateType: String(row.rate_type ?? 'USAGE').toUpperCase() as any, originTerminalId: row.origin_terminal_id == null || row.origin_terminal_id === '' ? null : Number(row.origin_terminal_id) })) })).count;
  inserted.mainline_auto_rates = (await tx.mainlineAutoRate.createMany({ data: (sheets.mainline_auto_rates ?? []).map((row) => ({ id: Number(row.rate_id), operationType: asString(row.operation_type) as MainlineOperationType, setupLocationId: Number(row.setup_location_id), serviceLocationId: Number(row.service_location_id), returnLocationId: Number(row.return_location_id), weightFromKg: Number(row.weight_from_kg), weightToKg: optionalNumber(row.weight_to_kg), rate: decimal(row.rate), rateStartDate: requiredDate(row.rate_start_date, 'rate_start_date'), rateFinishDate: optionalDate(row.rate_finish_date) })) })).count;
  inserted.mainline_auto_rules = (await tx.mainlineAutoRule.createMany({ data: (sheets.mainline_auto_rules ?? []).map((row) => ({ id: Number(row.rule_id), extraAddressRub: decimal(row.extra_address_rub), deadheadFullRate: Boolean(row.deadhead_full_rate), refSurchargeRub: decimal(row.ref_surcharge_rub), overweightThresholdKg: Number(row.overweight_threshold_kg), overweightPerTonRub: decimal(row.overweight_per_ton_rub), gensetPerDayRub: decimal(row.genset_per_day_rub), dangerousCargoRub: decimal(row.dangerous_cargo_rub), freeLoadingHours: Number(row.free_loading_hours), overtimePerHourRub: decimal(row.overtime_per_hour_rub), gensetOvertimePerHourRub: decimal(row.genset_overtime_per_hour_rub), customsFreeHours: Number(row.customs_free_hours), customsPerHourRub: decimal(row.customs_per_hour_rub), customsMaxPerDayRub: decimal(row.customs_max_per_day_rub), roundPartialTonUp: Boolean(row.round_partial_ton_up), roundPartialHourUp: Boolean(row.round_partial_hour_up), rateStartDate: requiredDate(row.rate_start_date, 'rate_start_date'), rateFinishDate: optionalDate(row.rate_finish_date) })) })).count;
}

async function databaseApply(sheets: Record<string, Row[]>, sheetCounts: Record<string, number>, warnings: string[]): Promise<{ database: DatabasePreflight; apply: ApplySection; errors: string[] }> {
  const runtime = await import('@prisma/client');
  const prisma = new runtime.PrismaClient();
  const apply: ApplySection = {
    attempted: true, committed: false, transactionIsolation: 'Serializable',
    locations: { existingMatched: 0, existingUpdated: 0, existingNoOp: 0, created: 0 },
    insertedRows: {},
    verification: { normalizedTableCounts: {}, mappedWorkbookLocationCount: null, expectedLocationCount: null, actualLocationCount: null },
  };
  let database: DatabasePreflight = { locationCount: 0, normalizedTableCounts: {}, locationPlan: emptyLocationPlan(sheets.locations?.length ?? 0) };
  const applyErrors: string[] = [];
  try {
    await prisma.$transaction(async (tx) => {
      const transactionErrors: string[] = [];
      database = await databasePreflight(tx, sheets, transactionErrors, warnings);
      if (transactionErrors.length > 0) throw new Error(`Apply preflight failed:\n${transactionErrors.join('\n')}`);

      const plan = database.locationPlan;
      apply.locations.existingMatched = plan.existingMatchCount;
      const inserted = await insertWorkbookTables(tx, sheets);

      for (const assignment of plan.existingAssignments) {
        const data: { tariffLocationId?: number; territoryGroupId?: number } = {};
        if (assignment.assignTariffLocationId) data.tariffLocationId = assignment.locationId;
        if (assignment.assignTerritoryGroupId) data.territoryGroupId = assignment.territoryGroupId;
        if (Object.keys(data).length === 0) {
          apply.locations.existingNoOp += 1;
        } else {
          await tx.location.update({ where: { id: assignment.databaseId }, data });
          apply.locations.existingUpdated += 1;
        }
      }
      const created = await tx.location.createMany({ data: plan.newLocations });
      apply.locations.created = created.count;

      await insertDependentTables(tx, sheets, runtime.Prisma.Decimal, inserted);
      apply.insertedRows = inserted;

      const verifiedCounts = await normalizedTableCounts(tx);
      apply.verification.normalizedTableCounts = verifiedCounts;
      for (const [table, expected] of Object.entries(sheetCounts)) {
        if (table === 'locations') continue;
        const actual = verifiedCounts[table];
        if (actual !== expected) throw new Error(`Verification failed for ${table}: expected ${expected}, found ${String(actual)}.`);
      }

      const workbookLocationIds = (sheets.locations ?? []).map((row) => Number(row.location_id));
      const mapped = await tx.location.findMany({ where: { tariffLocationId: { in: workbookLocationIds } }, select: { tariffLocationId: true } });
      const distinctMappedIds = new Set(mapped.map((row) => row.tariffLocationId));
      apply.verification.mappedWorkbookLocationCount = mapped.length;
      if (mapped.length !== workbookLocationIds.length || distinctMappedIds.size !== workbookLocationIds.length) {
        throw new Error(`Location verification failed: expected ${workbookLocationIds.length} unique mapped workbook locations, found ${mapped.length}.`);
      }
      const allMappedLocations = await tx.location.findMany({
        where: { tariffLocationId: { not: null } },
        select: { tariffLocationId: true },
      });
      const allMappedIds = allMappedLocations
        .map((row) => row.tariffLocationId)
        .filter((value): value is number => value !== null);
      if (new Set(allMappedIds).size !== allMappedIds.length) {
        throw new Error('Location verification failed: duplicate non-null tariffLocationId values exist.');
      }
      const actualLocationCount = await tx.location.count();
      const expectedLocationCount = database.locationCount + plan.newLocationCount;
      apply.verification.expectedLocationCount = expectedLocationCount;
      apply.verification.actualLocationCount = actualLocationCount;
      if (actualLocationCount !== expectedLocationCount) throw new Error(`Location count verification failed: expected ${expectedLocationCount}, found ${actualLocationCount}.`);
    }, { isolationLevel: runtime.Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 120_000 });
    apply.committed = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    apply.error = message;
    applyErrors.push(message);
    console.error(`Apply transaction failed and was rolled back: ${message}`);
  } finally {
    await prisma.$disconnect();
  }
  return { database, apply, errors: applyErrors };
}

function printReport(report: any) {
  console.log(`Mode: ${report.mode}`);
  console.log(`Workbook: ${report.workbookPath}`);
  console.log(`SHA-256: ${report.workbookSha256}`);
  console.log(`Size: ${report.workbookSize} bytes`);
  console.log('Sheet counts:');
  for (const [sheet, count] of Object.entries(report.sheetCounts)) console.log(`  ${sheet}: ${count}`);
  console.log(`Validation errors: ${report.validation.errors.length}`);
  console.log(`Validation warnings: ${report.validation.warnings.length}`);
  if (report.foreignKeyValidation) console.log(`Foreign-key checks: ${Object.values(report.foreignKeyValidation).reduce((sum: number, item: any) => sum + item.checked, 0)} values checked`);
  if (report.database.locationCount !== null) console.log(`Database Location rows: ${report.database.locationCount}`);
  if (report.summary) console.log(`Blockers: ${report.summary.blockerCount}; warnings: ${report.summary.warningCount}; readyForApply: ${report.summary.readyForApply}`);
  if (report.apply) console.log(`Apply attempted: ${report.apply.attempted}; committed: ${report.apply.committed}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const errors: string[] = [];
  const warnings: string[] = [];
  const workbook = readWorkbook(args.file, errors, warnings);
  const sheets = workbook?.sheets ?? {};
  const ids = validateRows(sheets, errors, warnings);
  const foreignKeyValidation = validateForeignKeys(sheets, ids, errors);
  let database = { locationCount: null as number | null, normalizedTableCounts: {} as Record<string, number> };
  let locationPlan: LocationPlan = emptyLocationPlan(sheets.locations?.length ?? 0);
  let apply: ApplySection | undefined;

  if (args.mode === 'apply') {
    apply = {
      attempted: false, committed: false, transactionIsolation: 'Serializable',
      locations: { existingMatched: 0, existingUpdated: 0, existingNoOp: 0, created: 0 },
      insertedRows: {},
      verification: { normalizedTableCounts: {}, mappedWorkbookLocationCount: null, expectedLocationCount: null, actualLocationCount: null },
    };
    if (workbook?.workbookSha256 && workbook.workbookSha256 !== args.expectedSha) {
      errors.push(`SHA-256 mismatch for ${basename(args.file)}: expected ${args.expectedSha}, calculated ${workbook.workbookSha256}. Database connection was not opened.`);
    }
  }

  if (args.mode === 'dry-run' && errors.length === 0) {
    const result = await databaseDryRun(sheets, errors, warnings);
    database = { locationCount: result.locationCount, normalizedTableCounts: result.normalizedTableCounts };
    locationPlan = result.locationPlan;
  }
  if (args.mode === 'apply' && errors.length === 0 && workbook) {
    const result = await databaseApply(sheets, workbook.counts, warnings);
    database = { locationCount: result.database.locationCount, normalizedTableCounts: result.database.normalizedTableCounts };
    locationPlan = result.database.locationPlan;
    apply = result.apply;
    errors.push(...result.errors);
  }
  const blockerCount = errors.length;
  const report = {
    mode: args.mode,
    workbookPath: args.file,
    workbookSha256: workbook?.workbookSha256 ?? null,
    workbookSize: workbook?.workbookSize ?? null,
    generatedAt: new Date().toISOString(),
    sheetCounts: workbook?.counts ?? {},
    validation: { errors, warnings },
    foreignKeyValidation,
    database,
    locationPlan,
    ...(apply ? { apply } : {}),
    summary: { blockerCount, warningCount: warnings.length, readyForApply: errors.length === 0 },
  };
  printReport(report);
  if (args.report) writeFileSync(resolve(args.report), JSON.stringify(report, null, 2));
  if (errors.length > 0 || (args.mode === 'apply' && !apply?.committed)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
