import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      ok: true,
      service: 'bitrix24-tariff-calculator-api',
      timestamp: new Date().toISOString()
    };
  }
}
