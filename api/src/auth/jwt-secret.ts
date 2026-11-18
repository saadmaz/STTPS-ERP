import { ConfigService } from "@nestjs/config";

/** The signing secret. Refuses to start with a missing or weak secret instead of falling back to a default. */
export function jwtSecret(config: ConfigService): string {
  const secret = config.get<string>("JWT_SECRET");
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set to at least 32 characters (openssl rand -base64 48)");
  }
  return secret;
}
