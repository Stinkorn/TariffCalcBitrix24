import { Controller, Get } from '@nestjs/common';

@Controller('dictionaries')
export class DictionariesController {
  @Get('bootstrap')
  getBootstrap() {
    return {
      routeTypes: ['KLD_OUT', 'KLD_IN'],
      transportTypes: ['AUTO', 'RAIL', 'SEA', 'MULTIMODAL'],
      containerTypes: ['20DC', '40DC', '40HC', '20REF', '40REF'],
      containerStatuses: ['EMPTY', 'LOADED'],
      currencies: ['EUR', 'USD', 'RUB'],
      marginTypes: ['percent', 'fixed']
    };
  }
}
