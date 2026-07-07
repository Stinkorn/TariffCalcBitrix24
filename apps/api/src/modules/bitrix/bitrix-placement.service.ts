import {
  BadRequestException,
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { BitrixRestClient } from './bitrix-rest.client';

const PRIMARY_PLACEMENT = {
  placement: 'CRM_DEAL_DETAIL_TAB',
  title: 'Тарифный калькулятор',
  description: 'Расчет стоимости перевозки по тарифам'
} as const;

const DEBUG_PLACEMENT = {
  placement: 'CRM_DEAL_DETAIL_ACTIVITY',
  title: 'Тест калькулятора',
  description: 'Диагностическая привязка тарифного калькулятора'
} as const;

type PlacementConfig = typeof PRIMARY_PLACEMENT | typeof DEBUG_PLACEMENT;

type BitrixPlacementAuth = {
  domain: string;
  accessToken: string;
  scope?: string | null;
};

type BitrixInstallPayload = {
  AUTH_ID?: string;
  REFRESH_ID?: string;
  member_id?: string;
  MEMBER_ID?: string;
  DOMAIN?: string;
  domain?: string;
  SERVER_ENDPOINT?: string;
  client_endpoint?: string;
  AUTH_EXPIRES?: string | number;
  expires?: string | number;
  expires_at?: string | number;
  APPLICATION_SCOPE?: string;
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

type BitrixInstallRequestContext = {
  referer?: string;
  origin?: string;
};

type TimelineCommentPayload = {
  portalDomain?: string;
  route?: string;
  from?: string;
  to?: string;
  cargoType?: string;
  cargoParams?: string;
  weightKg?: number;
  volumeM3?: number;
  selectedTariff?: string;
  finalPrice: number;
  currency?: string;
  calculationDateTime?: string;
  calculationId?: string;
};

type BitrixCounterpartyResponse = {
  dealId: string;
  type: 'company' | 'contact' | 'unknown';
  id: string | null;
  name: string | null;
};

type BitrixDealPrefillResponse = {
  dealId: string;
  cargoName: string;
  cargoNameRaw?: string;
  cargoNameResolved?: boolean;
  vehicleType: string;
  vehicleTypeRaw?: string;
  vehicleTypeResolved?: boolean;
  origin: string;
  originRaw: string;
  originResolved: boolean;
  destination: string;
  destinationRaw: string;
  destinationResolved: boolean;
};

type BitrixDealPrefillDebugResponse = {
  dealId: string;
  fields: Array<{
    fieldName: string;
    rawValue: string | string[] | null;
    resolvedValue: string;
    resolved: boolean;
    metadata: {
      fieldName: string;
      userTypeId: string;
      listCount: number;
    } | null;
    selectedItems: Array<{
      id: string;
      value: string;
    }>;
  }>;
};

type BitrixCrmUserField = {
  FIELD_NAME?: unknown;
  USER_TYPE_ID?: unknown;
  LIST?: unknown;
  SETTINGS?: unknown;
  SETTINGS_1?: unknown;
  SETTINGS_2?: unknown;
};

type ResolvedUserFieldValue = {
  rawValue: string | string[] | null;
  rawValueForResponse: string;
  resolvedValue: string;
  resolved: boolean;
  metadata: {
    fieldName: string;
    userTypeId: string;
    listCount: number;
    settings?: Record<string, unknown> | null;
    iblockId?: string | null;
    iblockTypeId?: string | null;
    resolverMethod?: string | null;
    resolveError?: string | null;
  } | null;
  selectedItems: Array<{
    id: string;
    value: string;
  }>;
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

  async installApp(
    payload: BitrixInstallPayload | Record<string, unknown>,
    requestContext?: BitrixInstallRequestContext
  ) {
    const normalized = this.normalizeInstallPayload(payload, requestContext);

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
          'Bitrix install payload is incomplete. Expected DOMAIN/domain/SERVER_ENDPOINT, member_id/MEMBER_ID, AUTH_ID/auth.access_token and REFRESH_ID/auth.refresh_token.',
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
      savedPortalDomain: savedPortal?.domain ?? null,
      handlerUrl: appPublicUrl ? `${appPublicUrl.replace(/\/+$/, '')}/bitrix/deal-tab` : null,
      clientIdConfigured: Boolean(clientId),
      clientSecretConfigured: Boolean(clientSecret),
      savedPortalExists: Boolean(savedPortal),
      accessTokenExists: Boolean(latestToken?.accessToken),
      refreshTokenExists: Boolean(latestToken?.refreshToken),
      tokenExpiresAt: latestToken?.expiresAt.toISOString() ?? null,
      applicationScope: latestToken?.scope ?? null,
      placementScopeIncluded: this.hasPlacementScope(latestToken?.scope),
      listsScopeIncluded: this.hasListsScope(latestToken?.scope),
      webhookConfigured: Boolean(webhookUrl),
      webhookUsedForPlacementBind: false
    };
  }

  async bindDealTab(domain?: string) {
    return this.bindPlacement(PRIMARY_PLACEMENT, domain);
  }

  async bindDebugPlacement(domain?: string) {
    return this.bindPlacement(DEBUG_PLACEMENT, domain);
  }

  async unbindDealTab(domain?: string) {
    return this.unbindPlacement(PRIMARY_PLACEMENT, domain);
  }

  async unbindDebugPlacement(domain?: string) {
    return this.unbindPlacement(DEBUG_PLACEMENT, domain);
  }

  async getPlacementBindings(domain?: string) {
    const auth = await this.getPortalAuth(domain);
    const handler = this.getHandlerUrl();
    const result = await this.callBitrixMethod('placement.get', {}, auth);
    return {
      success: true,
      placements: [PRIMARY_PLACEMENT, DEBUG_PLACEMENT].map((config) => ({
        placement: config.placement,
        handler,
        title: config.title
      })),
      portalDomain: auth.domain,
      result
    };
  }

  async addDealTimelineComment(dealId: string, payload: TimelineCommentPayload) {
    const auth = await this.getPortalAuth(payload.portalDomain);
    const comment = this.buildTimelineComment(payload);

    this.logger.log(
      `Writing Bitrix deal timeline comment: portal=${auth.domain}, dealId=${dealId}, fields=${JSON.stringify(Object.keys(payload).sort())}`
    );

    try {
      const result = await this.addTimelineEntryWithFallback(auth, dealId, comment);

      return {
        success: true,
        dealId,
        message: 'Расчет записан в сделку Bitrix24',
        bitrixResult: result
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Bitrix timeline comment request failed';
      this.logger.warn(
        `Bitrix deal timeline comment failed: portal=${auth.domain}, dealId=${dealId}, message=${message}`
      );
      throw new BadGatewayException(
        `Не удалось записать расчет в таймлайн Bitrix24: ${message}`
      );
    }
  }

  async getDealCounterparty(dealId: string, portalDomain?: string): Promise<BitrixCounterpartyResponse> {
    const auth = await this.getPortalAuth(portalDomain);

    try {
      const dealResponse = await this.callBitrixMethod(
        'crm.deal.get',
        { id: dealId },
        auth
      ) as { result?: Record<string, unknown> };

      const deal = dealResponse?.result ?? {};
      const companyId = this.readEntityId(deal.COMPANY_ID);
      const contactId = this.readEntityId(deal.CONTACT_ID);
      const title = this.readString(deal.TITLE) ?? null;

      if (companyId) {
        const companyResponse = await this.callBitrixMethod(
          'crm.company.get',
          { id: companyId },
          auth
        ) as { result?: Record<string, unknown> };
        const company = companyResponse?.result ?? {};
        return {
          dealId,
          type: 'company',
          id: companyId,
          name: this.readString(company.TITLE) ?? this.readString(company.COMPANY_TITLE) ?? title
        };
      }

      if (contactId) {
        const contactResponse = await this.callBitrixMethod(
          'crm.contact.get',
          { id: contactId },
          auth
        ) as { result?: Record<string, unknown> };
        const contact = contactResponse?.result ?? {};
        return {
          dealId,
          type: 'contact',
          id: contactId,
          name: this.buildContactName(contact) ?? title
        };
      }

      return {
        dealId,
        type: 'unknown',
        id: null,
        name: title
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bitrix counterparty request failed';
      this.logger.warn(`Bitrix counterparty load failed: portal=${auth.domain}, dealId=${dealId}, message=${message}`);
      throw new BadGatewayException(`Не удалось загрузить контрагента сделки: ${message}`);
    }
  }

  async getDealPrefill(dealId: string, portalDomain?: string): Promise<BitrixDealPrefillResponse> {
    const auth = await this.getPortalAuth(portalDomain);
    const iblockElementCache = new Map<string, string>();

    try {
      const dealResponse = await this.callBitrixMethod(
        'crm.deal.get',
        { id: dealId },
        auth
      ) as { result?: Record<string, unknown> };

      const deal = dealResponse?.result ?? {};
      const userFields = await this.getDealUserFields(auth);
      const cargo = await this.resolveCrmUserFieldValue(
        auth,
        iblockElementCache,
        userFields,
        'UF_CRM_1779800821',
        deal.UF_CRM_1779800821
      );
      const vehicle = await this.resolveCrmUserFieldValue(
        auth,
        iblockElementCache,
        userFields,
        'UF_CRM_1744631495248',
        deal.UF_CRM_1744631495248
      );
      const origin = await this.resolveCrmUserFieldValue(
        auth,
        iblockElementCache,
        userFields,
        'UF_CRM_1742553879',
        deal.UF_CRM_1742553879
      );
      const destination = await this.resolveCrmUserFieldValue(
        auth,
        iblockElementCache,
        userFields,
        'UF_CRM_1742558888',
        deal.UF_CRM_1742558888
      );

      return {
        dealId,
        cargoName: cargo.resolvedValue,
        cargoNameRaw: cargo.rawValueForResponse,
        cargoNameResolved: cargo.resolved,
        vehicleType: vehicle.resolvedValue,
        vehicleTypeRaw: vehicle.rawValueForResponse,
        vehicleTypeResolved: vehicle.resolved,
        origin: origin.resolvedValue,
        originRaw: origin.rawValueForResponse,
        originResolved: origin.resolved,
        destination: destination.resolvedValue,
        destinationRaw: destination.rawValueForResponse,
        destinationResolved: destination.resolved
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bitrix deal prefill request failed';
      this.logger.warn(`Bitrix deal prefill load failed: portal=${auth.domain}, dealId=${dealId}, message=${message}`);
      throw new BadGatewayException(`Не удалось загрузить prefill сделки: ${message}`);
    }
  }

  async getDealPrefillDebug(
    dealId: string,
    portalDomain?: string
  ): Promise<BitrixDealPrefillDebugResponse> {
    const auth = await this.getPortalAuth(portalDomain);
    const iblockElementCache = new Map<string, string>();

    try {
      const dealResponse = await this.callBitrixMethod(
        'crm.deal.get',
        { id: dealId },
        auth
      ) as { result?: Record<string, unknown> };

      const deal = dealResponse?.result ?? {};
      const userFields = await this.getDealUserFields(auth);
      const fieldNames = [
        'UF_CRM_1742553879',
        'UF_CRM_1742558888',
        'UF_CRM_1744631495248',
        'UF_CRM_1779800821'
      ] as const;

      return {
        dealId,
        fields: await Promise.all(
          fieldNames.map(async (fieldName) => {
            const resolved = await this.resolveCrmUserFieldValue(
              auth,
              iblockElementCache,
              userFields,
              fieldName,
              deal[fieldName]
            );
            return {
              fieldName,
              rawValue: resolved.rawValue,
              resolvedValue: resolved.resolvedValue,
              resolved: resolved.resolved,
              metadata: resolved.metadata,
              selectedItems: resolved.selectedItems
            };
          })
        )
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bitrix deal prefill debug request failed';
      this.logger.warn(`Bitrix deal prefill debug failed: portal=${auth.domain}, dealId=${dealId}, message=${message}`);
      throw new BadGatewayException(`Не удалось загрузить debug prefill сделки: ${message}`);
    }
  }

  private async addTimelineEntryWithFallback(
    auth: BitrixPlacementAuth,
    dealId: string,
    comment: string
  ) {
    try {
      return await this.callBitrixMethod(
        'crm.timeline.comment.add',
        {
          fields: {
            ENTITY_ID: dealId,
            ENTITY_TYPE: 'deal',
            COMMENT: comment
          }
        },
        auth
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'crm.timeline.comment.add failed';
      if (!this.shouldFallbackToActivity(message)) {
        throw error;
      }

      this.logger.warn(
        `Bitrix timeline comment method unavailable, fallback to crm.activity.add: portal=${auth.domain}, dealId=${dealId}, message=${message}`
      );

      return this.callBitrixMethod(
        'crm.activity.add',
        {
          fields: {
            OWNER_TYPE_ID: 2,
            OWNER_ID: Number(dealId),
            TYPE_ID: 4,
            SUBJECT: 'Расчет тарифа',
            DESCRIPTION: comment,
            DESCRIPTION_TYPE: 3
          }
        },
        auth
      );
    }
  }

  private async bindPlacement(config: PlacementConfig, domain?: string) {
    const auth = await this.getPortalAuth(domain);
    this.assertPlacementScope(auth.scope);
    const handler = this.getHandlerUrl();
    try {
      const result = await this.callBitrixMethod(
        'placement.bind',
        {
          PLACEMENT: config.placement,
          HANDLER: handler,
          TITLE: config.title,
          DESCRIPTION: config.description
        },
        auth
      );

      return {
        success: true,
        alreadyBound: false,
        message: 'Placement handler bound successfully',
        placement: config.placement,
        handler,
        title: config.title,
        portalDomain: auth.domain,
        result
      };
    } catch (error) {
      const mapped = this.mapPlacementError(error, auth.domain, handler, config);
      if (mapped) {
        return mapped;
      }
      throw error;
    }
  }

  private async unbindPlacement(config: PlacementConfig, domain?: string) {
    const auth = await this.getPortalAuth(domain);
    const handler = this.getHandlerUrl();
    const result = await this.callBitrixMethod(
      'placement.unbind',
      {
        PLACEMENT: config.placement,
        HANDLER: handler
      },
      auth
    );

    return {
      success: true,
      placement: config.placement,
      handler,
      portalDomain: auth.domain,
      result
    };
  }

  private async callBitrixMethod(
    method: string,
    params: Record<string, unknown>,
    authInput: BitrixPlacementAuth
  ) {
    return this.bitrixRestClient.callMethod(authInput.domain, authInput.accessToken, method, params);
  }

  private async getDealUserFields(auth: BitrixPlacementAuth) {
    const response = await this.callBitrixMethod('crm.deal.userfield.list', {}, auth) as {
      result?: unknown;
    };
    return Array.isArray(response.result) ? (response.result as BitrixCrmUserField[]) : [];
  }

  private async resolveCrmUserFieldValue(
    auth: BitrixPlacementAuth,
    iblockElementCache: Map<string, string>,
    userFields: BitrixCrmUserField[],
    fieldName: string,
    rawValue: unknown
  ): Promise<ResolvedUserFieldValue> {
    const baseResolved = this.resolveCrmUserFieldEnumValue(userFields, fieldName, rawValue);
    const metadata = baseResolved.metadata;

    if (!metadata || metadata.userTypeId.toLowerCase() !== 'iblock_element') {
      return baseResolved;
    }

    const field = userFields.find((item) => this.readScalarString(item.FIELD_NAME) === fieldName);
    const settings = this.extractUserFieldSettings(field);
    const iblockId = this.findSettingValue(settings, ['IBLOCK_ID', 'iblockId', 'IBlockId']);
    const iblockTypeId =
      this.findSettingValue(settings, ['IBLOCK_TYPE_ID', 'iblockTypeId', 'IBlockTypeId']) ?? 'lists';
    const normalizedIds = this.readStringArray(rawValue).filter((item) => item !== '0');
    const debugMetadata = {
      ...metadata,
      settings,
      iblockId,
      iblockTypeId,
      resolverMethod: null as string | null,
      resolveError: null as string | null
    };

    if (!iblockId) {
      return {
        ...baseResolved,
        metadata: {
          ...debugMetadata,
          resolveError: 'IBLOCK_ID not found in user field settings'
        },
        selectedItems: []
      };
    }

    try {
      const selectedItems = await this.resolveIblockElementItems(
        auth,
        iblockElementCache,
        iblockId,
        iblockTypeId,
        normalizedIds
      );

      if (selectedItems.length === 0) {
        return {
          ...baseResolved,
          metadata: {
            ...debugMetadata,
            resolverMethod: 'lists.element.get',
            resolveError: 'No iblock elements resolved for provided IDs'
          },
          selectedItems: []
        };
      }

      return {
        rawValue: Array.isArray(rawValue) ? normalizedIds : normalizedIds[0] ?? null,
        rawValueForResponse: normalizedIds.join(', '),
        resolvedValue: selectedItems.map((item) => item.value).join(', '),
        resolved: true,
        metadata: {
          ...debugMetadata,
          resolverMethod: 'lists.element.get'
        },
        selectedItems
      };
    } catch (error) {
      return {
        ...baseResolved,
        metadata: {
          ...debugMetadata,
          resolverMethod: 'lists.element.get',
          resolveError: error instanceof Error ? error.message : 'Unknown iblock_element resolve error'
        },
        selectedItems: []
      };
    }
  }

  private async resolveIblockElementItems(
    auth: BitrixPlacementAuth,
    iblockElementCache: Map<string, string>,
    iblockId: string,
    iblockTypeId: string,
    ids: string[]
  ) {
    const uniqueIds = Array.from(new Set(ids));
    const missingIds = uniqueIds.filter((id) => !iblockElementCache.has(`${iblockId}:${id}`));

    if (missingIds.length > 0) {
      const response = await this.callBitrixMethod(
        'lists.element.get',
        {
          IBLOCK_TYPE_ID: iblockTypeId,
          IBLOCK_ID: iblockId,
          FILTER: {
            ID: missingIds
          }
        },
        auth
      ) as { result?: unknown };

      for (const item of this.extractIblockElements(response.result)) {
        const id = this.readScalarString(item.ID);
        const value = this.readScalarString(item.NAME);
        if (!id || !value) {
          continue;
        }
        iblockElementCache.set(`${iblockId}:${id}`, value);
      }
    }

    return uniqueIds
      .map((id) => {
        const value = iblockElementCache.get(`${iblockId}:${id}`);
        return value ? { id, value } : null;
      })
      .filter((item): item is { id: string; value: string } => Boolean(item));
  }

  private extractIblockElements(result: unknown) {
    if (Array.isArray(result)) {
      return result.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>;
    }

    if (!result || typeof result !== 'object') {
      return [];
    }

    return Object.values(result as Record<string, unknown>).filter(
      (item) => item && typeof item === 'object'
    ) as Array<Record<string, unknown>>;
  }

  async getPortalAuth(
    requestedDomain?: string
  ): Promise<BitrixPlacementAuth> {
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
        accessToken: refreshed.accessToken,
        scope: refreshed.scope
      };
    }

    return {
      domain: portal.domain,
      accessToken: latestToken.accessToken,
      scope: latestToken.scope
    };
  }

  private async refreshPortalToken(
    portalId: string,
    refreshToken: string
  ): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date; scope?: string | null }> {
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
      expiresAt,
      scope: refreshed.scope ?? latestToken.scope
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
    payload: BitrixInstallPayload | Record<string, unknown>,
    requestContext?: BitrixInstallRequestContext
  ): NormalizedInstallPayload {
    const source = (payload ?? {}) as BitrixInstallPayload;
    const auth =
      source.auth && typeof source.auth === 'object' && !Array.isArray(source.auth)
        ? source.auth
        : undefined;
    const resolvedDomain = this.resolveInstallDomain(source, auth, requestContext);

    return {
      domain: resolvedDomain,
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
      scope:
        this.readString(source.APPLICATION_SCOPE) ??
        this.readString(source.scope) ??
        this.readString(auth?.scope),
      status: this.readString(source.status),
      receivedKeys: Object.keys(source),
      receivedAuthKeys: auth ? Object.keys(auth) : []
    };
  }

  private resolveInstallDomain(
    source: BitrixInstallPayload,
    auth: BitrixInstallPayload['auth'],
    requestContext?: BitrixInstallRequestContext
  ) {
    const candidates = [
      this.readString(source.DOMAIN),
      this.readString(source.domain),
      this.extractDomainFromServerEndpoint(source.SERVER_ENDPOINT),
      this.extractDomainFromServerEndpoint(source.client_endpoint),
      this.readString(auth?.domain),
      this.extractDomainFromRefererOrOrigin(requestContext?.referer),
      this.extractDomainFromRefererOrOrigin(requestContext?.origin),
      this.readString(this.configService.get<string>('BITRIX_PORTAL_DOMAIN'))
    ];

    for (const candidate of candidates) {
      const normalized = this.normalizePortalDomain(candidate);
      if (normalized) {
        return normalized;
      }
    }

    return undefined;
  }

  private readString(value: unknown) {
    if (typeof value !== "string") {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private readScalarString(value: unknown) {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return undefined;
  }

  private readStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value
        .map((item) => this.readScalarString(item))
        .filter((item): item is string => Boolean(item));
    }

    const scalar = this.readScalarString(value);
    return scalar ? [scalar] : [];
  }

  private extractUserFieldSettings(field?: BitrixCrmUserField) {
    if (!field || typeof field !== 'object') {
      return null;
    }

    for (const key of ['SETTINGS', 'settings', 'SETTINGS_1', 'SETTINGS_2']) {
      const value = (field as Record<string, unknown>)[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return this.toSafeObject(value as Record<string, unknown>);
      }
    }

    return null;
  }

  private findSettingValue(
    settings: Record<string, unknown> | null,
    keys: string[]
  ) {
    if (!settings) {
      return null;
    }

    for (const key of keys) {
      const value = this.readScalarString(settings[key]);
      if (value) {
        return value;
      }
    }

    return null;
  }

  private toSafeObject(record: Record<string, unknown>) {
    const safe: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (this.isSensitiveKey(key)) {
        continue;
      }

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        safe[key] = this.toSafeObject(value as Record<string, unknown>);
        continue;
      }

      if (Array.isArray(value)) {
        safe[key] = value.map((item) => {
          if (item && typeof item === 'object') {
            return this.toSafeObject(item as Record<string, unknown>);
          }
          return item;
        });
        continue;
      }

      safe[key] = value;
    }

    return safe;
  }

  private isSensitiveKey(key: string) {
    return /access[_-]?token|refresh[_-]?token|client[_-]?secret|webhook|auth/i.test(key);
  }

  private resolveCrmUserFieldEnumValue(
    userFields: BitrixCrmUserField[],
    fieldName: string,
    rawValue: unknown
  ): ResolvedUserFieldValue {
    const field = userFields.find((item) => this.readScalarString(item.FIELD_NAME) === fieldName);
    const userTypeId = this.readScalarString(field?.USER_TYPE_ID)?.toLowerCase() ?? '';
    const rawItems = this.readStringArray(rawValue);
    const listItemsRaw = Array.isArray(field?.LIST) ? field?.LIST : [];
    const listItems = listItemsRaw
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }
        const record = item as Record<string, unknown>;
        const id = this.readScalarString(record.ID);
        const value = this.readScalarString(record.VALUE);
        if (!id || !value) {
          return null;
        }
        return { id, value };
      })
      .filter((item): item is { id: string; value: string } => Boolean(item));

    const metadata = field
      ? {
          fieldName,
          userTypeId: this.readScalarString(field.USER_TYPE_ID) ?? '',
          listCount: listItems.length,
          settings: null,
          iblockId: null,
          iblockTypeId: null,
          resolverMethod: userTypeId === 'enumeration' || userTypeId === 'list' ? 'enum-list' : null,
          resolveError: null
        }
      : null;

    if (userTypeId === 'enumeration' || userTypeId === 'list') {
      const selectedItems = rawItems
        .map((item) => listItems.find((listItem) => listItem.id === item))
        .filter((item): item is { id: string; value: string } => Boolean(item));

      return {
        rawValue: Array.isArray(rawValue) ? rawItems : rawItems[0] ?? null,
        rawValueForResponse: rawItems.join(', '),
        resolvedValue: selectedItems.map((item) => item.value).join(', '),
        resolved: selectedItems.length > 0,
        metadata,
        selectedItems
      };
    }

    const scalarValue = rawItems.join(', ');
    return {
      rawValue: Array.isArray(rawValue) ? rawItems : rawItems[0] ?? null,
      rawValueForResponse: scalarValue,
      resolvedValue: scalarValue,
      resolved: scalarValue.length > 0,
      metadata,
      selectedItems: []
    };
  }

  private readEntityId(value: unknown) {
    const raw = this.readString(value);
    return raw && raw !== '0' ? raw : null;
  }

  private buildContactName(contact: Record<string, unknown>) {
    const parts = [
      this.readString(contact.NAME),
      this.readString(contact.SECOND_NAME),
      this.readString(contact.LAST_NAME)
    ].filter((part): part is string => Boolean(part));

    if (parts.length > 0) {
      return parts.join(' ');
    }

    return this.readString(contact.FULL_NAME) ?? null;
  }

  private extractDomainFromServerEndpoint(value: unknown) {
    const endpoint = this.readString(value);
    if (!endpoint) {
      return undefined;
    }

    const normalized = endpoint.includes('://') ? endpoint : `https://${endpoint}`;

    try {
      const url = new URL(normalized);
      return url.hostname || undefined;
    } catch {
      return endpoint
        .replace(/^https?:\/\//i, '')
        .replace(/^\/+/, '')
        .split('/')[0]
        .trim() || undefined;
    }
  }

  private extractDomainFromRefererOrOrigin(value?: string) {
    const domain = this.extractDomainFromServerEndpoint(value);
    return this.normalizePortalDomain(domain);
  }

  private normalizePortalDomain(value?: string) {
    const domain = this.readString(value);
    if (!domain) {
      return undefined;
    }

    const normalized = domain
      .replace(/^https?:\/\//i, '')
      .replace(/^\/+/, '')
      .split('/')[0]
      .trim()
      .toLowerCase();

    if (!normalized || normalized === 'oauth.bitrix24.tech') {
      return undefined;
    }

    return normalized;
  }

  private hasPlacementScope(scope?: string | null) {
    return this.hasScope(scope, 'placement');
  }

  hasListsScope(scope?: string | null) {
    return this.hasScope(scope, 'lists');
  }

  private assertPlacementScope(scope?: string | null) {
    if (this.hasPlacementScope(scope)) {
      return;
    }

    throw new BadRequestException(
      'В локальном приложении Bitrix24 нужно добавить scope placement / Встраивание приложений и переустановить приложение'
    );
  }

  assertListsScope(scope?: string | null) {
    if (this.hasListsScope(scope)) {
      return;
    }

    throw new BadRequestException(
      'Добавьте право lists в локальном приложении Bitrix24 и переустановите приложение.'
    );
  }

  private hasScope(scope: string | null | undefined, expectedScope: string) {
    if (!scope) {
      return false;
    }

    const normalized = scope
      .split(/[,\s]+/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    return normalized.includes(expectedScope.toLowerCase());
  }

  private mapPlacementError(
    error: unknown,
    portalDomain: string,
    handler: string,
    config: PlacementConfig
  ) {
    if (
      error instanceof Error &&
      /handler already binded/i.test(error.message)
    ) {
      return {
        success: true,
        alreadyBound: true,
        message: 'Placement handler is already bound',
        placement: config.placement,
        handler,
        title: config.title,
        portalDomain
      };
    }

    if (
      error instanceof Error &&
      /higher privileges than provided by the access token/i.test(error.message)
    ) {
      throw new BadRequestException(
        'В локальном приложении Bitrix24 нужно добавить scope placement / Встраивание приложений и переустановить приложение'
      );
    }

    return null;
  }

  private buildTimelineComment(payload: TimelineCommentPayload) {
    const route = this.buildRoute(payload);
    const cargo = this.buildCargoLabel(payload);
    const weightVolume = this.buildWeightVolumeLabel(payload);
    const lines = [
      'Расчет тарифа',
      `Маршрут: ${route}`,
      `Груз: ${cargo}`,
      `Вес/объем: ${weightVolume}`,
      `Тариф: ${payload.selectedTariff?.trim() || '-'}`,
      `Итоговая цена: ${this.formatNumber(payload.finalPrice)}${payload.currency ? ` ${payload.currency}` : ''}`,
      `Дата расчета: ${this.formatCalculationDate(payload.calculationDateTime)}`
    ];

    if (payload.calculationId?.trim()) {
      lines.push(`ID расчета: ${payload.calculationId.trim()}`);
    }

    return lines.join('\n');
  }

  private formatCalculationDate(value?: string) {
    if (!value) {
      return new Date().toLocaleString('ru-RU');
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return parsed.toLocaleString('ru-RU');
  }

  private formatNumber(value: number) {
    return Number(value).toLocaleString('ru-RU', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3
    });
  }

  private buildRoute(payload: TimelineCommentPayload) {
    if (payload.route?.trim()) {
      return payload.route.trim();
    }

    const from = payload.from?.trim();
    const to = payload.to?.trim();
    if (from || to) {
      return `${from || '-'} -> ${to || '-'}`;
    }

    return '-';
  }

  private buildCargoLabel(payload: TimelineCommentPayload) {
    const values = [payload.cargoType?.trim(), payload.cargoParams?.trim()].filter(Boolean);
    return values.length > 0 ? values.join(', ') : '-';
  }

  private buildWeightVolumeLabel(payload: TimelineCommentPayload) {
    const weight =
      payload.weightKg === undefined || payload.weightKg === null
        ? '-'
        : `${this.formatNumber(payload.weightKg)} кг`;
    const volume =
      payload.volumeM3 === undefined || payload.volumeM3 === null
        ? '-'
        : `${this.formatNumber(payload.volumeM3)} м3`;
    return `${weight} / ${volume}`;
  }

  private shouldFallbackToActivity(message: string) {
    return /method not found|unknown method|not supported|not available/i.test(message);
  }
}
