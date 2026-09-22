import { UserRoleCode } from '@prisma/client';

export interface AuthenticatedPrincipal {
  userId: string;
  portalId: string;
  bitrixUserId: string;
  role: UserRoleCode;
}

export type AuthenticatedRequest = {
  headers: {
    authorization?: string;
  };
  user: AuthenticatedPrincipal;
};
