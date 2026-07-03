import { Body, Controller, Get, Header, Post, Query } from '@nestjs/common';
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
  DOMAIN?: string;
  PLACEMENT?: string;
};

type PlacementAuthPayload = {
  domain?: string;
  accessToken?: string;
};

@Controller('bitrix')
export class BitrixController {
  constructor(
    private readonly configService: ConfigService,
    private readonly bitrixPlacementService: BitrixPlacementService
  ) {}

  @Get('install')
  @Header('Content-Type', 'text/html; charset=utf-8')
  installInfo() {
    const status = this.bitrixPlacementService.getStatus();
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
      <p>Проверьте публичный backend URL и зарегистрируйте вкладку сделки.</p>
      <p>APP_PUBLIC_URL: <strong>${status.appPublicUrl ?? 'not configured'}</strong></p>
      <p>WEB_PUBLIC_URL: <strong>${status.webPublicUrl ?? 'not configured'}</strong></p>
      <p>WEBHOOK mode (DEV ONLY): <strong>${status.webhookConfigured ? 'enabled' : 'disabled'}</strong></p>
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
  install(@Body() body: BitrixInstallPayload) {
    return {
      success: true,
      received: body,
      todo: 'Persist portal and token data in PostgreSQL'
    };
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
    const result = await this.bitrixPlacementService.bindDealTab({
      domain: body.domain,
      accessToken: body.accessToken
    });
    return { success: true, result };
  }

  @Post('placement/unbind')
  async placementUnbind(@Body() body: PlacementAuthPayload) {
    const result = await this.bitrixPlacementService.unbindDealTab({
      domain: body.domain,
      accessToken: body.accessToken
    });
    return { success: true, result };
  }

  @Get('placement/status')
  placementStatus() {
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
