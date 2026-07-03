import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ExpressAdapter } from '@nestjs/platform-express';
import * as classTransformer from 'class-transformer';
import * as classValidator from 'class-validator';
import { AppModule } from './modules/app.module';

const express = require('express');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, new ExpressAdapter());
  const configService = app.get(ConfigService);
  const port = Number(configService.get('APP_PORT', 9099));
  const webOrigin =
    configService.get<string>('WEB_PUBLIC_URL') ??
    configService.get<string>('WEB_ORIGIN', 'http://localhost:5173');

  app.enableCors({ origin: webOrigin });
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      transformerPackage: classTransformer,
      validatorPackage: classValidator
    })
  );

  await app.listen(port);
}

bootstrap();
