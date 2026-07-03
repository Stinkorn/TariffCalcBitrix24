type AnyRecord = Record<string, unknown>;

function tryParseJson(value: string): AnyRecord | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as AnyRecord;
    }
    return null;
  } catch {
    return null;
  }
}

export function parsePlacementOptions(source: AnyRecord): {
  dealId: string | null;
  raw: AnyRecord | null;
} {
  const placementValue =
    source.PLACEMENT_OPTIONS ??
    source.placement_options ??
    source.placementOptions ??
    null;

  let raw: AnyRecord | null = null;
  if (typeof placementValue === 'string') {
    raw = tryParseJson(placementValue);
  } else if (
    placementValue &&
    typeof placementValue === 'object' &&
    !Array.isArray(placementValue)
  ) {
    raw = placementValue as AnyRecord;
  }

  const dealIdValue =
    raw?.ID ?? raw?.ENTITY_ID ?? raw?.entityId ?? raw?.dealId ?? null;
  const dealId =
    dealIdValue === null || dealIdValue === undefined ? null : String(dealIdValue);

  return { dealId, raw };
}

export function detectDomain(source: AnyRecord): string | null {
  const domainValue =
    source.DOMAIN ??
    source.domain ??
    source.portalDomain ??
    source.portal_domain ??
    source.member_id ??
    source.MEMBER_ID ??
    null;

  if (domainValue === null || domainValue === undefined || domainValue === '') {
    return null;
  }

  return String(domainValue);
}

export function sanitizeContext(source: AnyRecord): AnyRecord {
  const blockedKeys = ['auth_id', 'refresh_id', 'access_token', 'refresh_token', 'database_url'];

  const result: AnyRecord = {};
  for (const [key, value] of Object.entries(source)) {
    const normalizedKey = key.toLowerCase();
    const isBlocked =
      blockedKeys.includes(normalizedKey) ||
      normalizedKey.includes('token') ||
      normalizedKey.includes('password');
    if (isBlocked) {
      continue;
    }
    result[key] = value;
  }
  return result;
}
