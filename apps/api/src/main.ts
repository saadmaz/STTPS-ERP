import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import * as cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Security
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cookieParser());

  // CORS
  app.enableCors({
    origin: config.get("FRONTEND_URL", "http://localhost:3000"),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global prefix
  app.setGlobalPrefix("api/v1");

  // Swagger
  if (config.get("NODE_ENV") !== "production") {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("STTPS ERP API")
      .setDescription("Enterprise Resource Planning Platform API")
      .setVersion("1.0")
      .addBearerAuth()
      .addCookieAuth("refresh_token")
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("api/docs", app, document);
  }

  const port = config.get<number>("PORT", 3001);
  await app.listen(port);
  console.log(`🚀 STTPS API running on http://localhost:${port}`);
  console.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();
