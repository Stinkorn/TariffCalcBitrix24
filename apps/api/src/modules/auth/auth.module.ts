import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { BitrixModule } from '../bitrix/bitrix.module';
import { AuthController } from './auth.controller';
import { BitrixAuthService } from './bitrix-auth.service';

@Module({
  imports: [PrismaModule, BitrixModule],
  controllers: [AuthController],
  providers: [BitrixAuthService],
  exports: [BitrixAuthService]
})
export class AuthModule {}
