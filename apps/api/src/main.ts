import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as express from 'express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
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
  await app.listen(port);

  console.log(`\n====================================================`);
  console.log(`  Notica Services Started Successfully!`);
  console.log(`  --------------------------------------------------`);
  console.log(`  Backend API:  http://localhost:${port}`);
  console.log(`  Swagger Docs: http://localhost:${port}/api-docs`);
  console.log(`  Frontend Web: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  console.log(`====================================================\n`);
}
bootstrap();
