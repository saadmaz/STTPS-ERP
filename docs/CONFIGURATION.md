# Configuration

<!-- nav -->
<sub><a href="../README.md">Project README</a> · <a href="README.md">Documentation index</a></sub>

> Environment variables for the three STTPS ERP applications. Part of the [project documentation](README.md).

## api

Copy `api/.env.example` to `api/.env`. On the server the file is placed manually and never committed.

| Variable | Purpose |
| --- | --- |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Service account for Firestore. **Secret.** The private key is stored on one line with literal `\n` sequences |
| `FIRESTORE_EMULATOR_HOST` | Development and CI only; never set in production |
| `JWT_SECRET` | Signing secret for access tokens, at least 32 random characters (`openssl rand -base64 48`). **Secret** |
| `JWT_EXPIRES_IN` | Access token lifetime, default `15m` |
| `PORT` | Listening port, default `3001` |
| `NODE_ENV` | `development` or `production` |
| `FRONTEND_URL`, `ADMIN_URL` | Allowed CORS origins; must match the deployed `web` and `admin` origins exactly |
| `DATABASE_URL` | Inert placeholder kept so `prisma generate` succeeds; not connected |

## web and admin

Copy `.env.example` to `.env.local` in each app.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Base URL of the API. Compiled into the client bundle at build time, so changing it requires a rebuild |

## Firestore

`firestore.rules` and `firestore.indexes.json` at the repository root are deployed with `firebase deploy --only firestore:rules,firestore:indexes`. The admin console's list endpoints need the indexes.
