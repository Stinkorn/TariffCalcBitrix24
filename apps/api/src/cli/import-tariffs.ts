import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import * as XLSX from 'xlsx';

type Mode = 'validate' | 'dry-run';
type Cell = unknown;
type Row = Record<string, Cell>;

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

const NORMALIZED_TABLES = [
  'territory_groups', 'cargo', 'containers', 'container_statuses', 'terminals', 'location_distances',
  'auto_dry_rates', 'auto_ref_rates', 'auto_rules', 'rail_rates', 'rail_service_rates', 'sea_lilo_rates',
  'sea_fios_rates', 'sea_fios_rules', 'container_usage_rates', 'mainline_auto_rates', 'mainline_auto_rules',
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

function parseArgs(argv: string[]): { mode: Mode; file: string; report?: string } {
  let file: string | undefined;
  let report: string | undefined;
  let mode: Mode | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') throw new Error('Apply mode is not implemented in the read-only importer stage.');
    if (arg === '--validate' || arg === '--dry-run') {
      if (mode) throw new Error('Exactly one of --validate or --dry-run must be specified.');
      mode = arg.slice(2) as Mode;
    } else if (arg === '--file') {
      file = argv[++i];
    } else if (arg === '--report') {
      report = argv[++i];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!file) throw new Error('--file is required.');
  if (!mode) throw new Error('Exactly one of --validate or --dry-run must be specified.');
  return { mode, file: resolve(file), report };
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

async function databaseDryRun(sheets: Record<string, Row[]>, errors: string[], warnings: string[]) {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const locations = await prisma.location.findMany({ select: { id: true, city: true, region: true, country: true, code: true, tariffLocationId: true, territoryGroupId: true } });
    const normalizedTableCounts: Record<string, number> = {};
    for (const table of NORMALIZED_TABLES) normalizedTableCounts[table] = await (prisma as any)[delegateName(table)].count();
    for (const [table, count] of Object.entries(normalizedTableCounts)) if (count !== 0) errors.push(`Database blocker: ${table} contains ${count} rows; expected 0 for initial bootstrap.`);
    const existingByKey = new Map<string, LocationRow[]>();
    const existingCodes = new Set(locations.map((location) => normalizeKey(location.code)));
    for (const location of locations) {
      const key = `${normalizeKey(location.city)}|${normalizeKey(location.region)}`;
      const list = existingByKey.get(key) ?? [];
      list.push(location);
      existingByKey.set(key, list);
    }
    const plan = { workbookCount: (sheets.locations ?? []).length, existingMatchCount: 0, newLocationCount: 0, ambiguousCount: 0, conflictCount: 0, countryWarningCount: 0, existingAssignments: [] as unknown[], newLocations: [] as unknown[], ambiguousLocations: [] as unknown[], conflicts: [] as unknown[], codeCollisions: [] as unknown[] };
    const plannedCodes = new Set<string>();
    for (const row of sheets.locations ?? []) {
      const key = `${normalizeKey(asString(row.location_city))}|${normalizeKey(asString(row.location_region))}`;
      const matches = existingByKey.get(key) ?? [];
      const workbookLocationId = Number(row.location_id);
      const workbookTerritoryGroupId = Number(row.territory_group_id);
      if (matches.length > 1) {
        plan.ambiguousCount += 1;
        plan.ambiguousLocations.push({ locationId: workbookLocationId, city: row.location_city, region: row.location_region, matchCount: matches.length });
        continue;
      }
      if (matches.length === 0) {
        plan.newLocationCount += 1;
        const code = `TARIFF_LOC_${workbookLocationId}`;
        const collision = existingCodes.has(normalizeKey(code)) || plannedCodes.has(normalizeKey(code));
        if (collision) { plan.codeCollisions.push({ locationId: workbookLocationId, code }); errors.push(`Location code collision: ${code}`); }
        plannedCodes.add(normalizeKey(code));
        plan.newLocations.push({ city: row.location_city, region: row.location_region, country: row.location_country, tariffLocationId: workbookLocationId, territoryGroupId: workbookTerritoryGroupId, code, source: 'tariff_data_v1' });
        continue;
      }
      plan.existingMatchCount += 1;
      const match = matches[0];
      if (normalizeKey(match.country) !== normalizeKey(asString(row.location_country))) {
        plan.countryWarningCount += 1;
        warnings.push(`Country mismatch for ${row.location_city}, ${row.location_region}: workbook=${row.location_country}, database=${match.country}`);
      }
      const conflict = (match.tariffLocationId !== null && match.tariffLocationId !== workbookLocationId) || (match.territoryGroupId !== null && match.territoryGroupId !== workbookTerritoryGroupId);
      if (conflict) {
        plan.conflictCount += 1;
        const detail = { locationId: workbookLocationId, city: row.location_city, region: row.location_region, databaseTariffLocationId: match.tariffLocationId, workbookTariffLocationId: workbookLocationId, databaseTerritoryGroupId: match.territoryGroupId, workbookTerritoryGroupId };
        plan.conflicts.push(detail);
        errors.push(`Location conflict for ${row.location_city}, ${row.location_region}`);
      } else {
        plan.existingAssignments.push({ locationId: workbookLocationId, databaseId: match.id, assignTariffLocationId: match.tariffLocationId === null, assignTerritoryGroupId: match.territoryGroupId === null });
      }
    }
    return { locationCount: locations.length, normalizedTableCounts, locationPlan: plan };
  } finally {
    await prisma.$disconnect();
  }
}

function delegateName(table: string): string {
  return table.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
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
  let locationPlan: any = { workbookCount: sheets.locations?.length ?? 0, existingMatchCount: 0, newLocationCount: 0, ambiguousCount: 0, conflictCount: 0, countryWarningCount: 0, existingAssignments: [], newLocations: [], ambiguousLocations: [], conflicts: [], codeCollisions: [] };
  if (args.mode === 'dry-run' && errors.length === 0) {
    const result = await databaseDryRun(sheets, errors, warnings);
    database = { locationCount: result.locationCount, normalizedTableCounts: result.normalizedTableCounts };
    locationPlan = result.locationPlan;
  }
  const blockerCount = errors.length + locationPlan.ambiguousCount + locationPlan.conflictCount + locationPlan.codeCollisions.length + Object.values(database.normalizedTableCounts).filter((count) => count !== 0).length;
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
    summary: { blockerCount, warningCount: warnings.length + locationPlan.countryWarningCount, readyForApply: args.mode === 'validate' ? errors.length === 0 : blockerCount === 0 },
  };
  printReport(report);
  if (args.report) writeFileSync(resolve(args.report), JSON.stringify(report, null, 2));
  if (errors.length > 0 || blockerCount > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
