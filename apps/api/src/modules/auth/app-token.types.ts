import { UserRoleCode } from '@prisma/client';

/** Claims issued by this application, never by Bitrix24. */
export interface AppJwtPayload {
  sub: string;
  portalId: string;
  bitrixUserId: string;
  role: UserRoleCode;
  iat?: number;
  exp?: number;
}
