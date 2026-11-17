# Deployment

<!-- nav -->

<sub><a href="../README.md">Project README</a> · <a href="README.md">Documentation index</a></sub>

> How STTPS ERP reaches production. Part of the [project documentation](README.md).

> [!IMPORTANT]
> Hosting is moving to **Cloudflare**, and the ERP is not in production yet. The previous shared-hosting pipeline (SSH deploys to Passenger, start files and server scripts) has been removed. Nothing deploys automatically until the Cloudflare setup below is in place.

## Environments

| Environment   | Branch    | URL                                                  | Status |
| ------------- | --------- | ---------------------------------------------------- | ------ |
| `development` | `develop` | [dev.erp.sttps.co](https://dev.erp.sttps.co)         | Created with the Cloudflare setup |
| `production`  | `main`    | [erp.sttps.co](https://erp.sttps.co)                 | Created with the Cloudflare setup |

Both are GitHub Environments with their own variables and secrets. Production accepts deployments from `main` only; development from `develop` only.

### Promotion

1. Feature branches merge into `develop`.
2. A release pull request from `develop` into `main` (see [runbooks/release.md](runbooks/release.md)) promotes the change.
3. Once the Cloudflare deploy workflow exists, merging it deploys to production.

## Cloudflare setup

| App | Target | How |
| --- | --- | --- |
| `web` (Next.js) | Cloudflare Workers | Build with [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare), as Tank Sudda does. Add `open-next.config.ts` and `wrangler.jsonc`; set `NEXT_PUBLIC_API_URL` at build time. |
| `admin` (Next.js) | Cloudflare Workers | Same as `web`, as a separate Worker. |
| `api` (NestJS) | Cloudflare Containers | The NestJS server needs a full Node.js runtime. Package `npm run build` output in a `Dockerfile` and run it as a Cloudflare Container behind a Worker, with the secrets below. |

Then:

- [ ] Add a `deploy.yml` workflow following the shared pattern: detect which app changed, deploy `api`, then `web`, then `admin`; `main` → production, `develop` → development (gated by `DEVELOPMENT_ENABLED`).
- [ ] Store `CLOUDFLARE_API_TOKEN` as a repository secret and `CLOUDFLARE_ACCOUNT_ID` as a repository variable.
- [ ] Point `erp`, `admin.erp` and `api.erp` on the `sttps.co` zone at the Workers (custom domains).
- [ ] Deploy Firestore rules and indexes: `firebase deploy --only firestore:rules,firestore:indexes`.

## Secrets and variables

| Name | Where | Purpose |
| --- | --- | --- |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | API runtime secrets | Firestore service account |
| `JWT_SECRET` | API runtime secret | Access-token signing |
| `FRONTEND_URL`, `ADMIN_URL` | API runtime variables | CORS origins |
| `WEB_NEXT_PUBLIC_API_URL`, `ADMIN_NEXT_PUBLIC_API_URL` | Environment secrets | API URL compiled into `web` and `admin` |

Every variable is described in [CONFIGURATION.md](CONFIGURATION.md).

## Firestore

The platform layer runs on Cloud Firestore. `firestore.rules` and `firestore.indexes.json` live at the repository root; the admin console's list endpoints need the indexes deployed before first use. Seed a new project with `npm run seed:firestore` in `api/`.

## Post-deployment checks

1. `https://erp.sttps.co/login` and `https://admin.erp.sttps.co` load.
2. The API answers through `https://api.erp.sttps.co`, and Swagger documentation is reachable.
3. A user can sign in to `web` and an administrator to `admin`.
