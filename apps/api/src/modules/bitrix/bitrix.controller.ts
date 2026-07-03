import { Body, Controller, Get, Header, Headers, Post, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  detectDomain,
  parsePlacementOptions,
  sanitizeContext
} from './bitrix-placement.util';
import { BitrixPlacementService } from './bitrix-placement.service';

type BitrixInstallPayload = {
  AUTH_ID?: string;
  REFRESH_ID?: string;
  member_id?: string;
  MEMBER_ID?: string;
  DOMAIN?: string;
  domain?: string;
  SERVER_ENDPOINT?: string;
  client_endpoint?: string;
  PLACEMENT?: string;
  AUTH_EXPIRES?: string | number;
  expires?: string | number;
  expires_at?: string | number;
  APPLICATION_SCOPE?: string;
  scope?: string;
  status?: string;
};

type PlacementAuthPayload = {
  domain?: string;
};

@Controller('bitrix')
export class BitrixController {
  constructor(
    private readonly configService: ConfigService,
    private readonly bitrixPlacementService: BitrixPlacementService
  ) {}

  @Get('install')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async installInfo() {
    const status = await this.bitrixPlacementService.getStatus();
    const bindEndpoint = '/bitrix/placement/bind';

    return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Приложение Калькулятор перевозки</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
      .box { max-width: 760px; padding: 16px; border: 1px solid #d1d5db; border-radius: 8px; }
      .ok { color: #166534; }
      .warn { color: #92400e; }
      button { margin-top: 16px; padding: 10px 14px; }
      code { background: #f3f4f6; padding: 2px 4px; border-radius: 4px; }
    </style>
  </head>
  <body>
    <div class="box">
      <h1>Приложение Калькулятор перевозки</h1>
      <p>Проверьте публичный backend URL, установите локальное приложение Bitrix24 и зарегистрируйте вкладку сделки.</p>
      <p>APP_PUBLIC_URL: <strong>${status.appPublicUrl ?? 'not configured'}</strong></p>
      <p>WEB_PUBLIC_URL: <strong>${status.webPublicUrl ?? 'not configured'}</strong></p>
      <p>BITRIX_CLIENT_ID: <strong>${status.clientIdConfigured ? 'configured' : 'missing'}</strong></p>
      <p>BITRIX_CLIENT_SECRET: <strong>${status.clientSecretConfigured ? 'configured' : 'missing'}</strong></p>
      <p>Saved portal: <strong>${status.savedPortalExists ? 'yes' : 'no'}</strong></p>
      <p>Access token: <strong>${status.accessTokenExists ? 'saved' : 'missing'}</strong></p>
      <p>Refresh token: <strong>${status.refreshTokenExists ? 'saved' : 'missing'}</strong></p>
      <p>Application scope: <strong>${status.applicationScope ?? 'missing'}</strong></p>
      <p>WEBHOOK mode (legacy): <strong>${status.webhookConfigured ? 'configured but not used for placement.bind' : 'not configured'}</strong></p>
      <p class="${status.configured ? 'ok' : 'warn'}">
        Env status: ${status.configured ? 'configured' : 'configure APP_PUBLIC_URL and WEB_PUBLIC_URL'}
      </p>
      <form method="post" action="${bindEndpoint}">
        <button type="submit">Зарегистрировать вкладку сделки</button>
      </form>
      <p>Manual API: <code>POST ${bindEndpoint}</code></p>
    </div>
  </body>
</html>`;
  }

  @Post('install')
  async install(
    @Body() body: BitrixInstallPayload,
    @Headers('referer') referer?: string,
    @Headers('origin') origin?: string
  ) {
    return this.bitrixPlacementService.installApp(body, { referer, origin });
  }

  @Get('deal-tab')
  @Header('Content-Type', 'text/html; charset=utf-8')
  dealTab(@Query() query: Record<string, unknown>) {
    const safeQuery = sanitizeContext(query);
    const { dealId, raw } = parsePlacementOptions(safeQuery);
    const detectedDealId =
      dealId ??
      (safeQuery.dealId
        ? String(safeQuery.dealId)
        : safeQuery.ID
          ? String(safeQuery.ID)
          : null);
    const domain = detectDomain(safeQuery);
    const publicUrl = this.configService.get<string>(
      'WEB_PUBLIC_URL',
      'http://localhost:5173'
    );

    const frontendUrl = new URL('/deal-calculator', publicUrl);
    if (detectedDealId) {
      frontendUrl.searchParams.set('dealId', detectedDealId);
    }
    if (domain) {
      frontendUrl.searchParams.set('domain', domain);
    }

    const iframeUrl = frontendUrl.toString();
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Калькулятор перевозки</title>
    <style>
      html, body { margin: 0; padding: 0; width: 100%; min-height: 100%; }
      iframe { border: 0; width: 100%; min-height: 900px; }
    </style>
  </head>
  <body>
    <iframe src="${iframeUrl}" title="Калькулятор перевозки"></iframe>
  </body>
</html>`;
  }

  @Post('placement/bind')
  async placementBind(@Body() body: PlacementAuthPayload) {
    const result = await this.bitrixPlacementService.bindDealTab(body.domain);
    return { success: true, result };
  }

  @Post('placement/unbind')
  async placementUnbind(@Body() body: PlacementAuthPayload) {
    const result = await this.bitrixPlacementService.unbindDealTab(body.domain);
    return { success: true, result };
  }

  @Get('placement/status')
  async placementStatus() {
    return this.bitrixPlacementService.getStatus();
  }

  @Get('debug/context')
  debugContext(@Query() query: Record<string, unknown>) {
    const safeQuery = sanitizeContext(query);
    const parsed = parsePlacementOptions(safeQuery);
    const detectedDealId =
      parsed.dealId ??
      (safeQuery.dealId ? String(safeQuery.dealId) : safeQuery.ID ? String(safeQuery.ID) : null);
    const detectedDomain = detectDomain(safeQuery);
    const publicUrl = this.configService.get<string>(
      'WEB_PUBLIC_URL',
      'http://localhost:5173'
    );
    const frontendUrl = new URL('/deal-calculator', publicUrl);
    if (detectedDealId) {
      frontendUrl.searchParams.set('dealId', detectedDealId);
    }
    if (detectedDomain) {
      frontendUrl.searchParams.set('domain', detectedDomain);
    }

    return {
      query: safeQuery,
      parsedPlacementOptions: parsed.raw,
      detectedDealId,
      detectedDomain,
      frontendUrl: frontendUrl.toString()
    };
  }
}
