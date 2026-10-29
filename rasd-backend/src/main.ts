import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const trustProxy = Number(process.env.TRUST_PROXY);
  app.set('trust proxy', Number.isInteger(trustProxy) && trustProxy > 0 ? trustProxy : 1);

  const origins = (process.env.FRONTEND_URL ?? 'http://localhost:3001')
    .split(',')
    .map((s) => s.trim());

  app.enableCors({ origin: origins, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();

