export const CANONICAL_INSTALLED_PORTAL_STATUS = 'INSTALLED';

// Bitrix has historically sent "L" for a legitimate local application install.
// Keep it accepted for existing portals, but do not accept arbitrary statuses.
export const INSTALLED_PORTAL_STATUSES = new Set([
  CANONICAL_INSTALLED_PORTAL_STATUS,
  'L'
]);

export function isInstalledBitrixPortal(portal: {
  appStatus: string;
  uninstalledAt: Date | null;
}) {
  return portal.uninstalledAt === null && INSTALLED_PORTAL_STATUSES.has(portal.appStatus);
}
