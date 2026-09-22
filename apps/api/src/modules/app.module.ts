import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { BitrixModule } from './bitrix/bitrix.module';
import { CalculatorModule } from './calculator/calculator.module';
import { CalculationsModule } from './calculations/calculations.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DictionariesModule } from './dictionaries/dictionaries.module';
import { TariffsModule } from './tariffs/tariffs.module';
import { AuthModule } from './auth/auth.module';
import { DEFAULT_WEB_DIST_PATH } from '../web-dist-path';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true
    }),
    ServeStaticModule.forRoot({
      rootPath: process.env.WEB_DIST_PATH || DEFAULT_WEB_DIST_PATH,
      exclude: ['/health', '/calculator*', '/calculations*', '/bitrix*', '/tariffs*']
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    BitrixModule,
    DictionariesModule,
    TariffsModule,
    CalculationsModule,
    CalculatorModule
  ]
})
export class AppModule {}
