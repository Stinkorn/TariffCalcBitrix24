import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { resolve } from 'path';
import { BitrixModule } from './bitrix/bitrix.module';
import { CalculatorModule } from './calculator/calculator.module';
import { CalculationsModule } from './calculations/calculations.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DictionariesModule } from './dictionaries/dictionaries.module';

const defaultWebDistPath = resolve(__dirname, '..', '..', '..', 'web', 'dist');

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true
    }),
    ServeStaticModule.forRoot({
      rootPath: process.env.WEB_DIST_PATH || defaultWebDistPath,
      exclude: ['/health', '/calculator*', '/calculations*', '/bitrix*']
    }),
    PrismaModule,
    HealthModule,
    BitrixModule,
    DictionariesModule,
    CalculationsModule,
    CalculatorModule
  ]
})
export class AppModule {}
