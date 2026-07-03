import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { BitrixRestClient } from './bitrix-rest.client';

const PLACEMENT = 'CRM_DEAL_DETAIL_TAB';
const TITLE = 'Тарифный калькулятор';
const DESCRIPTION = 'Расчет стоимости перевозки по тарифам';

type BitrixInstallPayload = {
  AUTH_ID?: string;
  REFRESH_ID?: string;
  member_id?: string;
  MEMBER_ID?: string;
  DOMAIN?: string;
  domain?: string;
  AUTH_EXPIRES?: string | number;
  expires?: string | number;
  expires_at?: string | number;
  scope?: string;
  status?: string;
  auth?: {
    access_token?: string;
    refresh_token?: string;
    expires?: string | number;
    domain?: string;
    member_id?: string;
    scope?: string;
  };
};

type NormalizedInstallPayload = {
  domain?: string;
  memberId?: string;
  accessToken?: string;
  refreshToken?: string;
  expires?: string | number;
  expiresAt?: string | number;
  scope?: string;
  status?: string;
  receivedKeys: string[];
  receivedAuthKeys: string[];
};

@Injectable()
export class BitrixPlacementService {
  private readonly logger = new Logger(BitrixPlacementService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly bitrixRestClient: BitrixRestClient
  ) {}

  getHandlerUrl() {
    const appPublicUrl = this.configService.get<string>('APP_PUBLIC_URL');
    if (!appPublicUrl) {
      throw new InternalServerErrorException('APP_PUBLIC_URL is not configured');
    }
    const normalized = appPublicUrl.replace(/\/+$/, '');
    return `${normalized}/bitrix/deal-tab`;
  }

  async installApp(payload: BitrixInstallPayload | Record<string, unknown>) {
    const normalized = this.normalizeInstallPayload(payload);

    this.logger.log(
      `Bitrix install payload received: keys=${JSON.stringify(normalized.receivedKeys)}, authKeys=${JSON.stringify(normalized.receivedAuthKeys)}`
    );

    const domain = normalized.domain?.trim();
    const memberId = normalized.memberId?.trim();
    const accessToken = normalized.accessToken?.trim();
    const refreshToken = normalized.refreshToken?.trim();

    const missingRequiredFields = [
      !domain ? 'domain' : null,
      !memberId ? 'member_id' : null,
      !accessToken ? 'access_token' : null,
      !refreshToken ? 'refresh_token' : null
    ].filter((value): value is string => Boolean(value));

    if (missingRequiredFields.length > 0) {
      throw new BadRequestException({
        message:
          'Bitrix install payload is incomplete. Expected DOMAIN/domain, member_id/MEMBER_ID, AUTH_ID/auth.access_token and REFRESH_ID/auth.refresh_token.',
        error: 'Bad Request',
        statusCode: 400,
        receivedKeys: normalized.receivedKeys,
        receivedAuthKeys: normalized.receivedAuthKeys,
        missingRequiredFields
      });
    }

    const safeDomain = domain as string;
    const safeMemberId = memberId as string;
    const safeAccessToken = accessToken as string;
    const safeRefreshToken = refreshToken as string;

    const portal = await this.prisma.bitrixPortal.upsert({
      where: { memberId: safeMemberId },
      create: {
        memberId: safeMemberId,
        domain: safeDomain,
        appStatus: normalized.status?.trim() || 'INSTALLED'
      },
      update: {
        domain: safeDomain,
        appStatus: normalized.status?.trim() || 'INSTALLED',
        uninstalledAt: null
      }
    });

    const latestToken = await this.prisma.bitrixToken.findFirst({
      where: { portalId: portal.id },
      orderBy: { createdAt: 'desc' }
    });

    const tokenData = {
      accessToken: safeAccessToken,
      refreshToken: safeRefreshToken,
      expiresAt: this.resolveExpiresAt({
        AUTH_EXPIRES: normalized.expires,
        expires: normalized.expires,
        expires_at: normalized.expiresAt
      }),
      scope: normalized.scope?.trim() || null
    };

    if (latestToken) {
      await this.prisma.bitrixToken.update({
        where: { id: latestToken.id },
        data: tokenData
      });
    } else {
      await this.prisma.bitrixToken.create({
        data: {
          portalId: portal.id,
          ...tokenData
        }
      });
    }

    let placementBind: { success: boolean; result?: unknown; error?: string };
    try {
      const result = await this.bindDealTab(safeDomain);
      placementBind = { success: true, result };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'placement.bind failed';
      this.logger.warn(`Bitrix install saved portal, but placement bind failed: ${message}`);
      placementBind = { success: false, error: message };
    }

    return {
      success: true,
      portalDomain: portal.domain,
      memberId: portal.memberId,
      tokenExpiresAt: tokenData.expiresAt.toISOString(),
      placementBind
    };
  }

  async getStatus() {
    const appPublicUrl = this.configService.get<string>('APP_PUBLIC_URL') ?? null;
    const webPublicUrl = this.configService.get<string>('WEB_PUBLIC_URL') ?? null;
    const portalDomain = this.configService.get<string>('BITRIX_PORTAL_DOMAIN') ?? null;
    const webhookUrl = this.configService.get<string>('BITRIX_WEBHOOK_URL') ?? null;
    const clientId = this.configService.get<string>('BITRIX_CLIENT_ID') ?? null;
    const clientSecret = this.configService.get<string>('BITRIX_CLIENT_SECRET') ?? null;
    const savedPortal = await this.findSavedPortal(portalDomain ?? undefined);
    const latestToken = savedPortal
      ? await this.prisma.bitrixToken.findFirst({
          where: { portalId: savedPortal.id },
          orderBy: { createdAt: 'desc' }
        })
      : null;

    return {
      configured: Boolean(appPublicUrl && webPublicUrl),
      appPublicUrl,
      webPublicUrl,
      portalDomain,
      handlerUrl: appPublicUrl ? `${appPublicUrl.replace(/\/+$/, '')}/bitrix/deal-tab` : null,
      clientIdConfigured: Boolean(clientId),
      clientSecretConfigured: Boolean(clientSecret),
      savedPortalExists: Boolean(savedPortal),
      accessTokenExists: Boolean(latestToken?.accessToken),
      refreshTokenExists: Boolean(latestToken?.refreshToken),
      tokenExpiresAt: latestToken?.expiresAt.toISOString() ?? null,
      webhookConfigured: Boolean(webhookUrl),
      webhookUsedForPlacementBind: false
    };
  }

  async bindDealTab(domain?: string) {
    const auth = await this.getPortalAuth(domain);
    return this.callBitrixMethod(
      'placement.bind',
      {
        PLACEMENT: PLACEMENT,
        HANDLER: this.getHandlerUrl(),
        TITLE: TITLE,
        DESCRIPTION: DESCRIPTION
      },
      auth
    );
  }

  async unbindDealTab(domain?: string) {
    const auth = await this.getPortalAuth(domain);
    return this.callBitrixMethod(
      'placement.unbind',
      {
        PLACEMENT: PLACEMENT,
        HANDLER: this.getHandlerUrl()
      },
      auth
    );
  }

  async getPlacementBindings(domain?: string) {
    const auth = await this.getPortalAuth(domain);
    return this.callBitrixMethod('placement.get', {}, auth);
  }

  private async callBitrixMethod(
    method: string,
    params: Record<string, unknown>,
    authInput: { domain: string; accessToken: string }
  ) {
    return this.bitrixRestClient.callMethod(authInput.domain, authInput.accessToken, method, params);
  }

  private async getPortalAuth(
    requestedDomain?: string
  ): Promise<{ domain: string; accessToken: string }> {
    const portal = await this.findSavedPortal(requestedDomain);
    if (!portal) {
      throw new BadRequestException(
        'Bitrix app is not installed yet. Open local app install URL in Bitrix24.'
      );
    }

    const latestToken = await this.prisma.bitrixToken.findFirst({
      where: { portalId: portal.id },
      orderBy: { createdAt: 'desc' }
    });

    if (!latestToken) {
      throw new BadRequestException(
        'Bitrix app is not installed yet. Open local app install URL in Bitrix24.'
      );
    }

    if (latestToken.expiresAt.getTime() <= Date.now() + 60_000) {
      const refreshed = await this.refreshPortalToken(portal.id, latestToken.refreshToken);
      return {
        domain: portal.domain,
        accessToken: refreshed.accessToken
      };
    }

    return {
      domain: portal.domain,
      accessToken: latestToken.accessToken
    };
  }

  private async refreshPortalToken(
    portalId: string,
    refreshToken: string
  ): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
    const clientId = this.configService.get<string>('BITRIX_CLIENT_ID')?.trim();
    const clientSecret = this.configService.get<string>('BITRIX_CLIENT_SECRET')?.trim();

    if (!clientId || !clientSecret) {
      throw new InternalServerErrorException(
        'BITRIX_CLIENT_ID and BITRIX_CLIENT_SECRET must be configured for token refresh'
      );
    }

    const refreshed = await this.bitrixRestClient.refreshAccessToken({
      clientId,
      clientSecret,
      refreshToken
    });

    const latestToken = await this.prisma.bitrixToken.findFirst({
      where: { portalId },
      orderBy: { createdAt: 'desc' }
    });

    if (!latestToken) {
      throw new NotFoundException('Saved Bitrix token not found');
    }

    const expiresAt = this.resolveExpiresAt({
      expires: refreshed.expires ?? refreshed.expires_in
    });

    await this.prisma.bitrixToken.update({
      where: { id: latestToken.id },
      data: {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        expiresAt,
        scope: refreshed.scope ?? latestToken.scope
      }
    });

    const nextAccessToken = refreshed.access_token;
    const nextRefreshToken = refreshed.refresh_token;

    if (!nextAccessToken || !nextRefreshToken) {
      throw new InternalServerErrorException('Bitrix OAuth refresh response is incomplete');
    }

    return {
      accessToken: nextAccessToken,
      refreshToken: nextRefreshToken,
      expiresAt
    };
  }

  private async findSavedPortal(requestedDomain?: string) {
    const configuredDomain =
      requestedDomain?.trim() || this.configService.get<string>('BITRIX_PORTAL_DOMAIN')?.trim();

    if (configuredDomain) {
      return this.prisma.bitrixPortal.findUnique({
        where: { domain: configuredDomain }
      });
    }

    return this.prisma.bitrixPortal.findFirst({
      orderBy: { updatedAt: 'desc' }
    });
  }

  private resolveExpiresAt(payload: {
    AUTH_EXPIRES?: string | number;
    expires?: string | number;
    expires_at?: string | number;
  }) {
    if (payload.expires_at !== undefined) {
      const raw = Number(payload.expires_at);
      if (Number.isFinite(raw) && raw > 0) {
        return raw > 1_000_000_000_000 ? new Date(raw) : new Date(raw * 1000);
      }
    }

    const expiresSeconds = Number(payload.AUTH_EXPIRES ?? payload.expires ?? 3600);
    if (Number.isFinite(expiresSeconds) && expiresSeconds > 0) {
      return new Date(Date.now() + expiresSeconds * 1000);
    }

    return new Date(Date.now() + 3600 * 1000);
  }

  private normalizeInstallPayload(
    payload: BitrixInstallPayload | Record<string, unknown>
  ): NormalizedInstallPayload {
    const source = (payload ?? {}) as BitrixInstallPayload;
    const auth =
      source.auth && typeof source.auth === 'object' && !Array.isArray(source.auth)
        ? source.auth
        : undefined;

    return {
      domain: this.readString(source.DOMAIN) ?? this.readString(source.domain) ?? this.readString(auth?.domain),
      memberId:
        this.readString(source.member_id) ??
        this.readString(source.MEMBER_ID) ??
        this.readString(auth?.member_id),
      accessToken:
        this.readString(source.AUTH_ID) ?? this.readString(auth?.access_token),
      refreshToken:
        this.readString(source.REFRESH_ID) ?? this.readString(auth?.refresh_token),
      expires: source.AUTH_EXPIRES ?? auth?.expires ?? source.expires,
      expiresAt: source.expires_at,
      scope: this.readString(source.scope) ?? this.readString(auth?.scope),
      status: this.readString(source.status),
      receivedKeys: Object.keys(source),
      receivedAuthKeys: auth ? Object.keys(auth) : []
    };
  }

  private readString(value: unknown) {
    if (typeof value !== "string") {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
}
