import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'warn', 'error', 'debug'],
  });

  app.use(helmet());

  // CORS — el web vive en múltiples subdominios (app.<root>, admin.<slug>.<root>,
  // <slug>.<root>, apex). Aceptamos cualquier subdominio del ROOT_DOMAIN; en dev
  // también lvh.me y localhost.
  const rootDomain = process.env.ROOT_DOMAIN ?? 'lvh.me';
  const allowedRoots = [rootDomain];
  if (process.env.NODE_ENV !== 'production') {
    if (!allowedRoots.includes('lvh.me')) allowedRoots.push('lvh.me');
    if (!allowedRoots.includes('localhost')) allowedRoots.push('localhost');
  }
  const extraOrigins = (process.env.WEB_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const wildcardRe = new RegExp(
    `^https?://([a-z0-9-]+\\.)*(${allowedRoots.map((r) => r.replace(/\./g, '\\.')).join('|')})(:\\d+)?$`,
    'i',
  );
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) return callback(null, true);
      if (extraOrigins.includes(origin) || wildcardRe.test(origin)) return callback(null, true);
      Logger.warn(`CORS blocked: ${origin}`, 'CORS');
      return callback(null, false);
    },
    credentials: true,
  });

  // La validación se hace con Zod (ZodValidationPipe por endpoint), no con
  // class-validator, así que no registramos el ValidationPipe global.
  app.useGlobalFilters(new AllExceptionsFilter());
  app.setGlobalPrefix('v1');

  const port = Number(process.env.API_PORT ?? 3201);
  await app.listen(port);
  Logger.log(`soyTuTurno API ready on http://localhost:${port}/v1`, 'Bootstrap');
}

bootstrap();
