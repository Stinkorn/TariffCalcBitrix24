import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { buildRequestFingerprint } from '../modules/calculations/calculations.service';

type Mode = 'dry-run' | 'apply';
type Row = any;

function parseMode(argv: string[]): Mode {
  const mode = argv.includes('--apply') ? 'apply' : 'dry-run';
  const unknown = argv.filter((arg) => arg !== '--apply' && arg !== '--dry-run');
  if (unknown.length || (argv.includes('--apply') && argv.includes('--dry-run'))) throw new Error(`Unknown or conflicting arguments: ${unknown.join(' ') || '--apply and --dry-run'}`);
  return mode;
}

function record(value: unknown): value is Record<string, any> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function value(value: unknown) { return value === undefined || value === null || value === '' ? null : value; }

function snapshotFields(row: Row) {
  const snapshot = row.tariffSnapshot;
  if (!record(snapshot) || !record(snapshot.request)) return null;
  const request = snapshot.request;
  const fields = {
    category: value(request.category),
    originLocationId: value(request.originLocationId),
    destinationLocationId: value(request.destinationLocationId),
    containerId: value(request.containerId),
    cargoId: value(request.cargoId),
    owner: value(request.owner),
    paymentDelayDays: value(request.paymentDelayDays),
    services: record(request.services) ? request.services : null,
  };
  return { snapshot, request, fields };
}

function merged(row: Row, fields: ReturnType<typeof snapshotFields> extends infer T ? T extends { fields: infer F } ? F : never : never) {
  return {
    portalDomain: row.portalDomain,
    counterpartyId: row.counterpartyId,
    counterpartyName: row.counterpartyName,
    category: row.category ?? fields.category,
    originLocationId: row.originLocationId ?? fields.originLocationId,
    destinationLocationId: row.destinationLocationId ?? fields.destinationLocationId,
    containerId: row.containerId ?? fields.containerId,
    cargoId: row.cargoId ?? fields.cargoId,
    owner: row.owner ?? fields.owner,
    weightKg: row.weightKg,
    paymentDelayDays: row.paymentDelayDays ?? fields.paymentDelayDays,
    services: row.services ?? fields.services,
  };
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.calculation.findMany({ orderBy: { createdAt: 'desc' } });
    let alreadyComplete = 0;
    let recoverable = 0;
    let fingerprintRecoverable = 0;
    let pdfSnapshotValid = 0;
    let insufficientSnapshot = 0;
    let conflicts = 0;
    const updates: Array<{ id: string; data: Record<string, unknown>; fingerprint: string | null }> = [];
    const fingerprintRows = new Map<string, Row[]>();
    for (const row of rows) {
      const parsed = snapshotFields(row);
      if (!parsed) { insufficientSnapshot += 1; continue; }
      const data: Record<string, unknown> = {};
      for (const key of ['category', 'originLocationId', 'destinationLocationId', 'containerId', 'cargoId', 'owner', 'paymentDelayDays', 'services'] as const) {
        const fromSnapshot = parsed.fields[key];
        if (row[key] === null && fromSnapshot !== null) data[key] = fromSnapshot;
        if (row[key] !== null && fromSnapshot !== null && JSON.stringify(row[key]) !== JSON.stringify(fromSnapshot)) conflicts += 1;
      }
      const candidate = merged(row, parsed.fields);
      let fingerprint: string | null = row.requestFingerprint;
      if (!fingerprint) {
        fingerprint = buildRequestFingerprint(candidate as any);
        if (fingerprint) fingerprintRecoverable += 1;
      }
      if (Object.keys(data).length || (fingerprint && !row.requestFingerprint)) { recoverable += 1; updates.push({ id: row.id, data, fingerprint }); } else alreadyComplete += 1;
      if (record(parsed.snapshot.quote) && Array.isArray(parsed.snapshot.quote.breakdown) && Array.isArray(parsed.snapshot.quote.routeStages)) pdfSnapshotValid += 1;
      else insufficientSnapshot += 1;
      if (fingerprint) { const key = `${row.portalDomain ?? ''}:${fingerprint}`; fingerprintRows.set(key, [...(fingerprintRows.get(key) ?? []), { ...row, requestFingerprint: fingerprint }]); }
    }
    const report = { mode, scanned: rows.length, alreadyComplete, recoverable, fingerprintRecoverable, pdfSnapshotValid, insufficientSnapshot, wouldUpdate: updates.length, conflicts };
    console.log(JSON.stringify(report, null, 2));
    if (mode === 'dry-run' || updates.length === 0) return;
    await prisma.$transaction(async (tx) => {
      for (const update of updates) {
        await tx.calculation.update({ where: { id: update.id }, data: { ...update.data, ...(update.fingerprint ? { requestFingerprint: update.fingerprint } : {}) } });
      }
      for (const group of fingerprintRows.values()) {
        if (group.some((row) => row.isCurrent)) continue;
        const newest = group.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
        if (newest?.requestFingerprint) await tx.calculation.update({ where: { id: newest.id }, data: { isCurrent: true } });
      }
    });
    console.log(`Applied updates: ${updates.length}`);
  } finally { await prisma.$disconnect(); }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
