import { Injectable, InternalServerErrorException } from '@nestjs/common';

type BitrixResponse = {
  result?: unknown;
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
