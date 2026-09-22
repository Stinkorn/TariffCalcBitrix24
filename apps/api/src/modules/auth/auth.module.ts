import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module';
import { BitrixModule } from '../bitrix/bitrix.module';
import { AuthController } from './auth.controller';
import { BitrixAuthService } from './bitrix-auth.service';
import { AppTokenService } from './app-token.service';

@Module({
  imports: [PrismaModule, BitrixModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [BitrixAuthService, AppTokenService],
  exports: [BitrixAuthService, AppTokenService]
})
export class AuthModule {}
