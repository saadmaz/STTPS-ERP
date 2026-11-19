import { NestFactory } from "@nestjs/core";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module.js";
import { configureApp } from "./configure-app.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  app.enableShutdownHooks();
  configureApp(app);

  if (config.get("NODE_ENV") !== "production") {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("STTPS ERP API")
      .setDescription("Enterprise Resource Planning Platform API")
      .setVersion("1.0")
      .addBearerAuth()
      .addCookieAuth("refresh_token")
      .build();
    SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  const port = config.get<number>("PORT", 3001);
  await app.listen(port);
  console.log(`STTPS API listening on http://localhost:${port}`);
}

bootstrap();
