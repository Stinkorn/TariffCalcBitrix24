import { Injectable, InternalServerErrorException } from '@nestjs/common';

type BitrixResponse = {
  result?: unknown;
  error?: string;
  error_description?: string;
};

type BitrixOAuthRefreshResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number | string;
  expires?: number | string;
  domain?: string;
  member_id?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

@Injectable()
export class BitrixRestClient {
  private readonly timeoutMs = 15000;

  async callMethod(
    domain: string,
    accessToken: string,
    method: string,
    params: Record<string, unknown>
  ) {
    const url = `https://${domain}/rest/${method}.json`;
    return this.postJson(url, {
      ...params,
      auth: accessToken
    });
  }

  async callWebhook(
    webhookUrl: string,
    method: string,
    params: Record<string, unknown>
  ) {
    const normalized = webhookUrl.replace(/\/+$/, '');
    const url = `${normalized}/${method}.json`;
    return this.postJson(url, params);
  }

  async refreshAccessToken(input: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch('https://oauth.bitrix.info/oauth/token/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: input.clientId,
          client_secret: input.clientSecret,
          refresh_token: input.refreshToken
        }).toString(),
        signal: controller.signal
      });

      const data = (await response.json()) as BitrixOAuthRefreshResponse;
      if (!response.ok) {
        throw new InternalServerErrorException(
          `Bitrix OAuth HTTP ${response.status}: ${data.error_description ?? data.error ?? 'Unknown error'}`
        );
      }

      if (data.error || data.error_description) {
        throw new InternalServerErrorException(
          `Bitrix OAuth error: ${data.error_description ?? data.error}`
        );
      }

      if (!data.access_token || !data.refresh_token) {
        throw new InternalServerErrorException('Bitrix OAuth response is missing tokens');
      }

      return data;
    } catch (error) {
      if (
        error instanceof InternalServerErrorException ||
        (error instanceof Error && error.name === 'AbortError')
      ) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new InternalServerErrorException('Bitrix OAuth request timeout');
        }
        throw error;
      }
      throw new InternalServerErrorException('Bitrix OAuth request failed');
    } finally {
      clearTimeout(timeout);
    }
  }

  private async postJson(url: string, payload: Record<string, unknown>) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const data = (await response.json()) as BitrixResponse;
      if (!response.ok) {
        throw new InternalServerErrorException(
          `Bitrix REST HTTP ${response.status}: ${data.error_description ?? data.error ?? 'Unknown error'}`
        );
      }

      if (data.error || data.error_description) {
        throw new InternalServerErrorException(
          `Bitrix REST error: ${data.error_description ?? data.error}`
        );
      }

      return data;
    } catch (error) {
      if (
        error instanceof InternalServerErrorException ||
        (error instanceof Error && error.name === 'AbortError')
      ) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new InternalServerErrorException('Bitrix REST request timeout');
        }
        throw error;
      }
      throw new InternalServerErrorException('Bitrix REST request failed');
    } finally {
      clearTimeout(timeout);
    }
  }
}
