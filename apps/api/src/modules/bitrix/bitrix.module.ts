import { Module } from '@nestjs/common';
import { BitrixController } from './bitrix.controller';
import { BitrixPlacementService } from './bitrix-placement.service';
import { BitrixRestClient } from './bitrix-rest.client';

@Module({
  controllers: [BitrixController],
  providers: [BitrixPlacementService, BitrixRestClient]
})
export class BitrixModule {}
