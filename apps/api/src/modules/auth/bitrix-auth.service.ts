import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { UserRoleCode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BitrixRestClient } from '../bitrix/bitrix-rest.client';
import { BitrixBootstrapDto } from './dto/bitrix-bootstrap.dto';

type BitrixUserCurrentResponse = {
  result?: {
    ID?: unknown;
    id?: unknown;
  };
};

const ALLOWED_ROLE_CODES = new Set<UserRoleCode>([
  UserRoleCode.ADMIN,
  UserRoleCode.LEAD,
  UserRoleCode.MANAGER
]);

@Injectable()
export class BitrixAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bitrixRestClient: BitrixRestClient
  ) {}

  async bootstrap(dto: BitrixBootstrapDto) {
    const domain = this.normalizePortalDomain(dto.domain);
    if (!domain) {
      throw new BadRequestException('Invalid Bitrix auth context');
    }

    const portal = await this.prisma.bitrixPortal.findFirst({
      where: {
        domain,
        appStatus: 'INSTALLED',
        uninstalledAt: null
      }
    });

    if (!portal || (dto.member_id && dto.member_id.trim() !== portal.memberId)) {
      throw new UnauthorizedException('Invalid Bitrix authentication');
    }

    let currentUser: BitrixUserCurrentResponse;
    try {
      // The browser token is used only for this verification request.
      // It is never persisted, logged, or returned to the caller.
      currentUser = (await this.bitrixRestClient.callMethod(
        portal.domain,
        dto.access_token,
        'user.current',
        {}
      )) as BitrixUserCurrentResponse;
    } catch {
      throw new UnauthorizedException('Invalid Bitrix authentication');
    }

    const bitrixUserId = this.readUserId(currentUser.result?.ID ?? currentUser.result?.id);
    if (!bitrixUserId) {
      throw new UnauthorizedException('Invalid Bitrix authentication');
    }

    const user = await this.prisma.user.findUnique({
      where: {
        portalId_bitrixUserId: {
          portalId: portal.id,
          bitrixUserId
        }
      },
      include: { role: true }
    });

    if (
      !user ||
      !user.enabled ||
      !user.isActive ||
      !user.role ||
      !ALLOWED_ROLE_CODES.has(user.role.code)
    ) {
      throw new ForbiddenException('Bitrix user is not allowed');
    }

    return {
      authenticated: true,
      user: {
        id: user.id,
        bitrixUserId,
        role: user.role.code
      }
    };
  }

  private readUserId(value: unknown) {
    if (typeof value !== 'string' && typeof value !== 'number') {
      return null;
    }

    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizePortalDomain(value: string) {
    const normalized = value
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/^\/+/, '')
      .split('/')[0]
      .trim()
      .toLowerCase();

    if (!normalized || normalized === 'oauth.bitrix24.tech') {
      return null;
    }

    return normalized;
  }
}
