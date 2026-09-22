import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRoleCode } from '@prisma/client';
import { AppTokenService } from './app-token.service';
import { AppJwtPayload } from './app-token.types';
import { AuthenticatedPrincipal, AuthenticatedRequest } from './auth.types';
import { IS_PUBLIC_KEY } from './public.decorator';

const VALID_ROLES = new Set<UserRoleCode>([
  UserRoleCode.ADMIN,
  UserRoleCode.LEAD,
  UserRoleCode.MANAGER
]);

@Injectable()
export class AppJwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly appTokenService: AppTokenService
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request.headers.authorization);
    const payload = await this.appTokenService.verify(token);
    const principal = this.validatePayload(payload);

    request.user = principal;
    return true;
  }

  private extractBearerToken(value: string | undefined) {
    if (typeof value !== 'string') {
      throw new UnauthorizedException('Authentication required');
    }

    const parts = value.trim().split(/\s+/);
    if (
      parts.length !== 2 ||
      parts[0].toLowerCase() !== 'bearer' ||
      parts[1].length === 0
    ) {
      throw new UnauthorizedException('Authentication required');
    }

    return parts[1];
  }

  private validatePayload(payload: AppJwtPayload): AuthenticatedPrincipal {
    if (
      !this.isNonEmptyString(payload?.sub) ||
      !this.isNonEmptyString(payload?.portalId) ||
      !this.isNonEmptyString(payload?.bitrixUserId) ||
      !VALID_ROLES.has(payload?.role as UserRoleCode) ||
      !this.isTimestamp(payload?.iat) ||
      !this.isTimestamp(payload?.exp)
    ) {
      throw new UnauthorizedException('Invalid application token');
    }

    return {
      userId: payload.sub,
      portalId: payload.portalId,
      bitrixUserId: payload.bitrixUserId,
      role: payload.role
    };
  }

  private isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private isTimestamp(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
  }
}
