// Cloudflare Worker in front of the STTPS ERP API container. Every request is
// forwarded to the NestJS server in the container (see Dockerfile). Secrets
// are Worker secrets and settings are Worker variables, both passed to the
// container as environment variables.
import { Container, getContainer } from "@cloudflare/containers";

interface Env {
  API_SERVER: DurableObjectNamespace<ApiServer>;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  FRONTEND_URL: string;
  ADMIN_URL: string;
}

export class ApiServer extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = "30m";

  constructor(ctx: DurableObjectState<Env>, env: Env) {
    super(ctx, env);
    this.envVars = {
      NODE_ENV: "production",
      PORT: "8080",
      FIREBASE_PROJECT_ID: env.FIREBASE_PROJECT_ID,
      FIREBASE_CLIENT_EMAIL: env.FIREBASE_CLIENT_EMAIL,
      FIREBASE_PRIVATE_KEY: env.FIREBASE_PRIVATE_KEY,
      JWT_SECRET: env.JWT_SECRET,
      JWT_EXPIRES_IN: env.JWT_EXPIRES_IN,
      FRONTEND_URL: env.FRONTEND_URL,
      ADMIN_URL: env.ADMIN_URL,
    };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return getContainer(env.API_SERVER).fetch(request);
  },
};
