import {
  BadRequestException,
  Injectable,
  InternalServerErrorException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BitrixRestClient } from './bitrix-rest.client';

const PLACEMENT = 'CRM_DEAL_DETAIL_TAB';
const TITLE = 'Калькулятор перевозки';
const DESCRIPTION = 'Расчет стоимости перевозки по тарифам';

type BindAuthInput = {
  domain?: string;
  accessToken?: string;
};

@Injectable()
export class BitrixPlacementService {
  constructor(
    private readonly configService: ConfigService,
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

  getStatus() {
    const appPublicUrl = this.configService.get<string>('APP_PUBLIC_URL') ?? null;
    const webPublicUrl = this.configService.get<string>('WEB_PUBLIC_URL') ?? null;
    const portalDomain = this.configService.get<string>('BITRIX_PORTAL_DOMAIN') ?? null;
    const webhookUrl = this.configService.get<string>('BITRIX_WEBHOOK_URL') ?? null;

    return {
      configured: Boolean(appPublicUrl && webPublicUrl),
      appPublicUrl,
      webPublicUrl,
      portalDomain,
      handlerUrl: appPublicUrl ? `${appPublicUrl.replace(/\/+$/, '')}/bitrix/deal-tab` : null,
      webhookConfigured: Boolean(webhookUrl)
    };
  }

  async bindDealTab(authInput?: BindAuthInput) {
    return this.callBitrixMethod(
      'placement.bind',
      {
        PLACEMENT: PLACEMENT,
        HANDLER: this.getHandlerUrl(),
        TITLE: TITLE,
        DESCRIPTION: DESCRIPTION
      },
      authInput
    );
  }

  async unbindDealTab(authInput?: BindAuthInput) {
    return this.callBitrixMethod(
      'placement.unbind',
      {
        PLACEMENT: PLACEMENT,
        HANDLER: this.getHandlerUrl()
      },
      authInput
    );
  }

  async getPlacementBindings(authInput?: BindAuthInput) {
    return this.callBitrixMethod('placement.get', {}, authInput);
  }

  private async callBitrixMethod(
    method: string,
    params: Record<string, unknown>,
    authInput?: BindAuthInput
  ) {
    const webhookUrl = this.configService.get<string>('BITRIX_WEBHOOK_URL')?.trim();
    if (webhookUrl) {
      // DEV ONLY: webhook mode for local testing without full OAuth flow.
      return this.bitrixRestClient.callWebhook(webhookUrl, method, params);
    }

    const domain = authInput?.domain?.trim();
    const accessToken = authInput?.accessToken?.trim();
    if (domain && accessToken) {
      return this.bitrixRestClient.callMethod(domain, accessToken, method, params);
    }

    throw new BadRequestException('BITRIX_WEBHOOK_URL is not configured');
  }
}
