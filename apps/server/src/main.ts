import 'reflect-metadata';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: true, credentials: true });

  const mediaRoot = resolve(process.env.MEDIA_ROOT || './data/media');
  await mkdir(mediaRoot, { recursive: true });
  app.useStaticAssets(mediaRoot, { prefix: '/media' });

  const port = Number(process.env.PORT || 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`[server] listening on :${port}, media root: ${mediaRoot}`);
}

void bootstrap();
