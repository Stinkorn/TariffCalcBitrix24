import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { DictionariesService } from './dictionaries.service';

type CreateLocationBody = {
  city?: string;
  region?: string;
};

@Controller('dictionaries')
export class DictionariesController {
  constructor(private readonly dictionariesService: DictionariesService) {}

  @Get('bootstrap')
  getBootstrap() {
    return this.dictionariesService.getBootstrap();
  }

  @Get('locations')
  getLocations(@Query('search') search?: string) {
    return this.dictionariesService.getLocations(search);
  }

  @Post('locations')
  @HttpCode(201)
  createLocation(@Body() body: CreateLocationBody) {
    return this.dictionariesService.createLocation(body);
  }

  @Post('locations/seed')
  @HttpCode(200)
  seedLocations() {
    return this.dictionariesService.seedLocations();
  }

  @Post('locations/sync/bitrix')
  @HttpCode(200)
  syncLocationsFromBitrix() {
    return this.dictionariesService.syncLocationsFromBitrix();
  }

  @Get('locations/sync/bitrix/debug')
  debugLocationsBitrixSync(@Query('limit') limit?: string) {
    return this.dictionariesService.debugLocationsBitrixSync(limit);
  }
}
