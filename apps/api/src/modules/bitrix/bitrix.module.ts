import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { BitrixController } from './bitrix.controller';
import { BitrixPlacementService } from './bitrix-placement.service';
import { BitrixRestClient } from './bitrix-rest.client';

@Module({
  imports: [PrismaModule],
  controllers: [BitrixController],
  providers: [BitrixPlacementService, BitrixRestClient]
})
export class BitrixModule {}
