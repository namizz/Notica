import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as express from 'express';
import { join } from 'path';
import { ValidationPipe } from '@nestjs/common';
import {
  appRole,
  runsDeliveryWorker,
  validateProductionEnvironment,
} from './config/environment';
import { RedisIoAdapter } from './realtime/redis-io.adapter';

async function bootstrap() {
  validateProductionEnvironment();
  const app = await NestFactory.create(AppModule);

  // Drain in-flight delivery jobs, close sockets, and disconnect Prisma and the
  // realtime Redis clients when the platform sends SIGTERM.
  app.enableShutdownHooks();

  // Room membership must be shared so any instance can reach a socket held by
  // another one. Must be registered before listen().
  const redisIoAdapter = new RedisIoAdapter(app);
  redisIoAdapter.connect();
  app.useWebSocketAdapter(redisIoAdapter);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false,
      },
    }),
  );

  // Serve the SDK statically
  app.use('/sdk', express.static(join(process.cwd(), 'public')));

  const config = new DocumentBuilder()
    .setTitle('Notica API')
    .setDescription('The Notica Notification Infrastructure API')
    .setVersion('1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'api-key')
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, documentFactory);

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        return callback(null, true);
      }
      const isLocalhost =
        origin.startsWith('http://localhost:') ||
        origin.startsWith('https://localhost:') ||
        origin.startsWith('http://127.0.0.1:') ||
        origin.startsWith('https://127.0.0.1:');
      if (isLocalhost) {
        callback(null, true);
      } else {
        const allowed = [process.env.FRONTEND_URL || 'http://localhost:3000'];
        if (allowed.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      }
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization, x-api-key',
  });

  const port = process.env.PORT ?? 8000;
  await app.listen(port, '0.0.0.0');

  console.log(`\n====================================================`);
  console.log(`  Notica Services Started Successfully!`);
  console.log(`  --------------------------------------------------`);
  console.log(
    `  Role:         ${appRole()} (delivery worker: ${
      runsDeliveryWorker() ? 'on' : 'off'
    })`,
  );
  console.log(`  Backend API:  http://localhost:${port}`);
  console.log(`  Swagger Docs: http://localhost:${port}/api-docs`);
  console.log(
    `  Frontend Web: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`,
  );
  console.log(`====================================================\n`);
}
void bootstrap();
