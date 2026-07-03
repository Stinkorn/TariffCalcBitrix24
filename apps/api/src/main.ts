import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './modules/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const port = Number(configService.get('APP_PORT', 9099));
  const webOrigin =
    configService.get<string>('WEB_PUBLIC_URL') ??
    configService.get<string>('WEB_ORIGIN', 'http://localhost:5173');

  app.enableCors({ origin: webOrigin });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true
    })
  );

  await app.listen(port);
}

bootstrap();
