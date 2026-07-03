import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpException,
  Post,
  Query,
  Res
} from '@nestjs/common';
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

type InstallResponseFormat = 'html' | 'json';

type InstallViewModel = {
  title: string;
  message: string;
  portalDomain: string | null;
  placementBindStatus: string;
  shouldCallInstallFinish: boolean;
  isSuccess: boolean;
  diagnostics?: string[];
};

@Controller('bitrix')
export class BitrixController {
  constructor(
    private readonly configService: ConfigService,
    private readonly bitrixPlacementService: BitrixPlacementService
  ) {}

  @Get('install')
  async installInfo(
    @Query('format') format: string | undefined,
    @Res({ passthrough: true }) response: any
  ) {
    const status = await this.bitrixPlacementService.getStatus();
    const responseFormat = this.resolveInstallResponseFormat(format);

    if (responseFormat === 'json') {
      return status;
    }

    response.type('html');
    return this.renderInstallPage({
      title: 'Приложение Калькулятор перевозки',
      message: status.savedPortalExists && status.accessTokenExists
        ? 'Тарифный калькулятор установлен'
        : 'Проверьте публичный backend URL, установите локальное приложение Bitrix24 и дождитесь завершения установки.',
      portalDomain: status.savedPortalDomain ?? status.portalDomain,
      placementBindStatus: status.placementScopeIncluded
        ? 'Placement scope доступен, проверьте placement.get и интерфейс сделки'
        : 'Статус placement bind неизвестен или scope placement не выдан',
      shouldCallInstallFinish:
        status.savedPortalExists &&
        status.accessTokenExists &&
        status.refreshTokenExists,
      isSuccess:
        status.savedPortalExists &&
        status.accessTokenExists &&
        status.refreshTokenExists,
      diagnostics: [
        `APP_PUBLIC_URL: ${status.appPublicUrl ?? 'not configured'}`,
        `WEB_PUBLIC_URL: ${status.webPublicUrl ?? 'not configured'}`,
        `BITRIX_CLIENT_ID: ${status.clientIdConfigured ? 'configured' : 'missing'}`,
        `BITRIX_CLIENT_SECRET: ${status.clientSecretConfigured ? 'configured' : 'missing'}`,
        `Placement scope: ${status.applicationScope ?? 'missing'}`
      ]
    });
  }

  @Post('install')
  async install(
    @Body() body: BitrixInstallPayload,
    @Query('format') format: string | undefined,
    @Headers('referer') referer?: string,
    @Headers('origin') origin?: string,
    @Res({ passthrough: true }) response?: any
  ) {
    const responseFormat = this.resolveInstallResponseFormat(format);

    try {
      const result = await this.bitrixPlacementService.installApp(body, { referer, origin });
      if (responseFormat === 'json') {
        return result;
      }

      response?.type('html');
      return this.renderInstallPage({
        title: 'Приложение Калькулятор перевозки',
        message: 'Тарифный калькулятор установлен',
        portalDomain: result.portalDomain,
        placementBindStatus: this.describePlacementBindStatus(result.placementBind),
        shouldCallInstallFinish:
          result.success === true && result.placementBind?.success === true,
        isSuccess:
          result.success === true && result.placementBind?.success === true,
        diagnostics: [
          `memberId: ${result.memberId}`,
          `placement bind: ${this.describePlacementBindStatus(result.placementBind)}`
        ]
      });
    } catch (error) {
      if (responseFormat === 'json') {
        throw error;
      }

      response?.type('html');
      response?.status(this.resolveHttpStatus(error));

      return this.renderInstallPage({
        title: 'Ошибка установки приложения',
        message: this.extractInstallErrorMessage(error),
        portalDomain: this.extractPortalDomain(body),
        placementBindStatus: 'Не выполнен',
        shouldCallInstallFinish: false,
        isSuccess: false,
        diagnostics: this.extractInstallDiagnostics(error)
      });
    }
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
    return this.bitrixPlacementService.bindDealTab(body.domain);
  }

  @Post('placement/bind-debug')
  async placementBindDebug(@Body() body: PlacementAuthPayload) {
    return this.bitrixPlacementService.bindDebugPlacement(body.domain);
  }

  @Post('placement/unbind')
  async placementUnbind(@Body() body: PlacementAuthPayload) {
    return this.bitrixPlacementService.unbindDealTab(body.domain);
  }

  @Post('placement/unbind-debug')
  async placementUnbindDebug(@Body() body: PlacementAuthPayload) {
    return this.bitrixPlacementService.unbindDebugPlacement(body.domain);
  }

  @Get('placement/list')
  async placementList(@Query('domain') domain?: string) {
    return this.bitrixPlacementService.getPlacementBindings(domain);
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

  private resolveInstallResponseFormat(format?: string): InstallResponseFormat {
    return String(format).toLowerCase() === 'json' ? 'json' : 'html';
  }

  private renderInstallPage(view: InstallViewModel) {
    const title = this.escapeHtml(view.title);
    const message = this.escapeHtml(view.message);
    const portalDomain = this.escapeHtml(view.portalDomain ?? 'unknown');
    const placementBindStatus = this.escapeHtml(view.placementBindStatus);
    const diagnostics = (view.diagnostics ?? [])
      .map((item) => `<li>${this.escapeHtml(item)}</li>`)
      .join('');
    const installScript = view.shouldCallInstallFinish
      ? `
    <script>
      BX24.init(function () {
        BX24.installFinish();
      });
    </script>`
      : '';

    return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <script src="//api.bitrix24.com/api/v1/"></script>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #111827; background: #f8fafc; }
      .box { max-width: 760px; padding: 20px; border: 1px solid #d1d5db; border-radius: 8px; background: #ffffff; }
      h1 { margin-top: 0; }
      .status { color: ${view.isSuccess ? '#166534' : '#991b1b'}; }
      ul { padding-left: 20px; }
      code { background: #f3f4f6; padding: 2px 4px; border-radius: 4px; }
    </style>
  </head>
  <body>
    <div class="box">
      <h1>${title}</h1>
      <p class="status">${message}</p>
      <p>portalDomain: <strong>${portalDomain}</strong></p>
      <p>placement bind status: <strong>${placementBindStatus}</strong></p>
      ${diagnostics ? `<ul>${diagnostics}</ul>` : ''}
      <p>JSON debug: <code>/bitrix/install?format=json</code></p>
    </div>${installScript}
  </body>
</html>`;
  }

  private describePlacementBindStatus(placementBind: unknown) {
    if (!placementBind || typeof placementBind !== 'object') {
      return 'Unknown';
    }

    const record = placementBind as {
      success?: boolean;
      alreadyBound?: boolean;
      error?: string;
      result?: unknown;
    };

    if (record.success && record.alreadyBound) {
      return 'Already bound';
    }

    if (record.success) {
      return 'Bound successfully';
    }

    if (typeof record.error === 'string' && record.error.trim()) {
      return record.error.trim();
    }

    return 'Bind failed';
  }

  private extractInstallErrorMessage(error: unknown) {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'string') {
        return response;
      }
      if (response && typeof response === 'object' && 'message' in response) {
        const message = (response as { message?: unknown }).message;
        if (Array.isArray(message)) {
          return message.join('; ');
        }
        if (typeof message === 'string') {
          return message;
        }
      }
      return error.message;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'Установка завершилась с ошибкой';
  }

  private extractInstallDiagnostics(error: unknown) {
    if (!(error instanceof BadRequestException)) {
      return undefined;
    }

    const response = error.getResponse();
    if (!response || typeof response !== 'object') {
      return undefined;
    }

    const diagnostics: string[] = [];
    const missingRequiredFields = (response as { missingRequiredFields?: unknown }).missingRequiredFields;
    if (Array.isArray(missingRequiredFields) && missingRequiredFields.length > 0) {
      diagnostics.push(`Missing fields: ${missingRequiredFields.join(', ')}`);
    }

    const receivedKeys = (response as { receivedKeys?: unknown }).receivedKeys;
    if (Array.isArray(receivedKeys) && receivedKeys.length > 0) {
      diagnostics.push(`Received keys: ${receivedKeys.join(', ')}`);
    }

    const receivedAuthKeys = (response as { receivedAuthKeys?: unknown }).receivedAuthKeys;
    if (Array.isArray(receivedAuthKeys) && receivedAuthKeys.length > 0) {
      diagnostics.push(`Received auth keys: ${receivedAuthKeys.join(', ')}`);
    }

    return diagnostics.length > 0 ? diagnostics : undefined;
  }

  private extractPortalDomain(body: BitrixInstallPayload) {
    return body.DOMAIN ?? body.domain ?? null;
  }

  private resolveHttpStatus(error: unknown) {
    return error instanceof HttpException ? error.getStatus() : 500;
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
