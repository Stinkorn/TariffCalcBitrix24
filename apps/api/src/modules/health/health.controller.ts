import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';

@Controller('health')
@Public()
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
