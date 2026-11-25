import { BadRequestException, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import {
  DocumentBuilder,
  SwaggerDocumentOptions,
  SwaggerModule,
} from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import express from 'express';
import { join } from 'path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: false });
  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port', 3000);
  const origin = configService.get<string | string[]>('app.origin', 'http://localhost:5173');
  const appName = configService.get<string>('app.name', 'Nest API Starter');
  const localUploadDir = configService.get<string>('storage.localUploadDir', 'uploads');
  const trustProxyHops = configService.get<number>('APP_TRUST_PROXY_HOPS', 0);

  // 仅在后端完全位于可信反向代理后时启用；用于让 request.ip 正确读取代理传递的真实用户 IP。
  if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) {
    app.set('trust proxy', trustProxyHops);
  }

  app.useStaticAssets(join(process.cwd(), localUploadDir), {
    prefix: `/${localUploadDir}/`,
    setHeaders: (response) => {
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    },
  });

  // 微信支付回调验签必须使用原始请求体，不能先被 JSON body parser 改写。
  app.use('/api/v1/wechatpay/transfer/notify', express.raw({ type: '*/*' }));

  // Runtime evidence and import payloads can legitimately exceed Express' 100 KB default.
  // Register the bounded parsers after the raw webhook route so signature verification remains intact.
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { limit: '1mb', extended: true });

  app.enableCors({
    origin,
    credentials: true,
  });
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: (errors) =>
        new BadRequestException({
          message: '参数校验失败',
          errors: errors.map((error) => ({
            field: error.property,
            errors: Object.values(error.constraints ?? {}),
          })),
        }),
    }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle(appName)
    .setDescription('中后台/H5/小程序通用 API 文档')
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: '在此输入 accessToken',
      },
      'BearerAuth',
    )
    .build();

  const swaggerOptions: SwaggerDocumentOptions = {
    autoTagControllers: false,
    operationIdFactory: (controllerKey: string, methodKey: string) => {
      const controller = controllerKey.replace(/Controller$/, '');
      return `${controller}.${methodKey}`;
    },
  };

  const document = SwaggerModule.createDocument(app, swaggerConfig, swaggerOptions);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
    yamlDocumentUrl: 'docs-yaml',
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  await app.listen(port, configService.get<string>('HOST') || '127.0.0.1');
}

void bootstrap();
