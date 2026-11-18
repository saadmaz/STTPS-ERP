# Configuration

<!-- nav -->
<sub><a href="../README.md">Project README</a> · <a href="README.md">Documentation index</a></sub>

> Environment variables for the three STTPS ERP applications. Part of the [project documentation](README.md).

## api

Copy `api/.env.example` to `api/.env` for local work; never commit it. In Cloudflare these values are runtime secrets of the API container.

| Variable | Purpose |
| --- | --- |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Service account for Firestore. **Secret.** The private key is stored on one line with literal `\n` sequences |
| `FIRESTORE_EMULATOR_HOST` | Development and CI only; never set in production |
| `JWT_SECRET` | Signing secret for access tokens, at least 32 random characters (`openssl rand -base64 48`). The API refuses to start without it. **Secret** |
| `JWT_EXPIRES_IN` | Access token lifetime, default `15m` |
| `PORT` | Listening port, default `3001` |
| `NODE_ENV` | `development` or `production` |
| `FRONTEND_URL`, `ADMIN_URL` | Allowed CORS origins; must match the deployed `web` and `admin` origins exactly |
| `BACKGROUND_WORKERS` | Set to `off` to stop the job worker and permission sync in this process (tests set it); leave unset in production |
| `RESEND_API_KEY` | Resend API key for notification email. Without it, email is logged instead of sent. **Secret** |
| `EMAIL_FROM` | Sender for notification email, default `STTPS ERP <no-reply@sttps.co>` |
| `SEED_PLATFORM_ADMIN_PASSWORD`, `SEED_DEMO_ADMIN_PASSWORD` | Optional passwords for accounts created by `npm run seed:firestore`; random ones are generated and printed when unset |

## web and admin

Copy `.env.example` to `.env.local` in each app.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Base URL of the API. Compiled into the client bundle at build time, so changing it requires a rebuild |

## Firestore

`firestore.rules` and `firestore.indexes.json` at the repository root are deployed with `firebase deploy --only firestore:rules,firestore:indexes`. `firestore.indexes.json` is generated from `api/src/platform/data/indexes.ts` with `npm run indexes` in `api/`; a test fails when the two drift. Deploy indexes before the API version that needs them.
