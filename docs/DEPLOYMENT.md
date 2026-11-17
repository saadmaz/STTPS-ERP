# Deployment Guide — STTPS ERP

## Environments

| Environment | Branch | URL | Deploys |
| --- | --- | --- | --- |
| `development` | `develop` | [dev.erp.sttps.co](https://dev.erp.sttps.co) | Automatically on every merge into `develop` |
| `production` | `main` | [erp.sttps.co](https://erp.sttps.co) | Automatically when `develop` is promoted to `main` by a release pull request |

The Deploy workflow builds on GitHub Actions and ships each changed app over SSH to Passenger. Each environment is a GitHub Environment with its own variables (`APP_URL` and host settings) and secrets, so one workflow serves both. Production accepts deployments from `main` only; development from `develop` only.

Development deploys are switched on per repository by setting the `DEVELOPMENT_ENABLED` repository variable to `true` once the development host exists. Until then, `develop` is built and tested by CI but not deployed.

### Setting up development

cPanel: create `dev.erp.sttps.co`, `dev.admin.erp.sttps.co` and `dev.api.erp.sttps.co` as Node.js apps; set development-environment secrets for `WEB_NEXT_PUBLIC_API_URL`, `ADMIN_NEXT_PUBLIC_API_URL` and a separate `api/.env` on the server.

### Promotion

1. Feature branches merge into `develop` and deploy to development.
2. When development is verified, open a release pull request from `develop` into `main` (see [runbooks/release.md](runbooks/release.md)).
3. Merging it deploys to production.

Target: **erp.sttps.co**, hosted on **Zircon Hosting (cPanel)**, same hosting provider as `pos.polishstation.lk`. This guide follows that project's proven pattern, adapted for three apps instead of one.

**Live server details:** the cPanel username, host, SSH port and deploy key are stored as GitHub Actions secrets and in the team password manager. They are deliberately not written here.

| App     | Subdomain             | Status |
| ------- | ---------------------- | ------ |
| `web`   | `erp.sttps.co`          | ✅ live (Node.js Selector app created, `.next/standalone` build shipped) |
| `admin` | `admin.erp.sttps.co`    | ✅ live |
| `api`   | `api.erp.sttps.co`      | Node.js Selector app created; code not deployed yet — needs Firestore credentials first (see §2) |

SSL is already issued for all three (AutoSSL/Let's Encrypt, confirmed via `uapi SSL installed_hosts` — a `*.erp.sttps.co` wildcard plus a dedicated `erp.sttps.co` cert). Nothing to do there.

## 1. Architecture

Three independent, standalone apps — no monorepo tooling, no shared packages. Each has its own `package.json`, lockfile, and deploy pipeline, so a broken build in one never blocks the others.

| App     | Tech                    | Subdomain            | Local port |
| ------- | ----------------------- | --------------------- | ---------- |
| `web/`  | Next.js 15 (App Router) | `erp.sttps.co`         | 3000       |
| `admin/`| Next.js 15 (App Router) | `admin.erp.sttps.co`   | 3002       |
| `api/`  | NestJS 10 + Firestore   | `api.erp.sttps.co`     | 3001       |

**Database: Firestore, not PostgreSQL.** This cPanel plan has no PostgreSQL at all (confirmed via `uapi Postgresql list_databases` → "This server does not support this functionality", only MySQL is offered) — the API was migrated from Prisma/Postgres to Firebase Firestore to match `polish-station-pos`'s proven stack on this same host. `api/prisma/schema.prisma` is kept on disk as the reference data model for the ~70 not-yet-migrated ERP modules (see the migration plan referenced below) but is not connected to anything live. Redis, GCS, and SendGrid appear in old planning docs but were never wired into any code — don't provision them until a feature actually needs them.

Only the platform/identity layer (auth, tenants, companies, users, roles/permissions, the admin console) is live on Firestore today. The other 12 ERP domain modules (finance, inventory, procurement, sales/CRM, manufacturing, HR, EAM, FSM, quality, EHS, projects) are deliberately commented out of `api/src/app.module.ts` pending a documented Phase 2 backlog — `web`'s pages for those modules will show empty/error states until each is ported, which is expected mid-migration, not a bug.

## 2. Prerequisites before the API goes live

1. **Create a dedicated Firebase project** for STTPS-ERP at console.firebase.google.com (confirmed: not sharing `polish-station-pos`'s project). Enable **Firestore in Native mode**, pick a region.
2. **Project Settings → Service Accounts → Generate new private key** → gives `project_id` / `client_email` / `private_key`.
3. **Write those three values into `api/.env`** on the already-provisioned `api.erp.sttps.co` server over SSH (never commit the file or the JSON). This is the one remaining blocker before `api` can go live.
4. Once live: `firebase deploy --only firestore:rules,firestore:indexes` (from repo root, needs `firebase login` once) to push `firestore.rules`/`firestore.indexes.json` — without the indexes, several admin-console list endpoints will throw a Firestore error on first use (with a direct console link to auto-create the missing index, as a fallback).

## 3. One-time cPanel setup (per app)

Repeat for each of the three apps, substituting the subdomain/path:

1. **cPanel → Domains → Create A New Domain**: create the subdomain (e.g. `api.erp.sttps.co`), document root doesn't matter much since Passenger serves the app directly — point it at e.g. `/home/<user>/api.erp.sttps.co`.
2. **cPanel → SSL/TLS Status → AutoSSL**: run it for the subdomain once DNS resolves.
3. **cPanel → Setup Node.js App → Create Application**:
   - Node.js version: **22** (matches `engines.node` in every `package.json`)
   - Application mode: Production
   - Application root: `api.erp.sttps.co` (or `web.…`, `admin.…`)
   - Application URL: the subdomain
   - Application startup file: `dist/main.js` for `api`; `start.mjs` for `web` and `admin`
4. Click **Create** — this provisions the `nodevenv` that `npm`/`node` run inside of.

## 4. Getting the code onto the server

**Recommended: one shared git clone, three app roots pointing into it.**

```bash
# SSH into the server once, as the cPanel user:
cd ~
git clone git@github.com:saadmaz/STTPS-ERP.git sttps-erp
# or, if the repo is private and you don't have a personal key on the server:
#   add the deploy public key (the deploy public key) to
#   GitHub → repo → Settings → Deploy keys (read-only is enough), then use
#   the corresponding private key as the SSH_DEPLOY_KEY GitHub secret below.
```

Then point each cPanel Node app's **Application root** at a subfolder of this one clone: `~/sttps-erp/web`, `~/sttps-erp/admin`, `~/sttps-erp/api`. One `git pull` at `~/sttps-erp` updates the source for all three; each app is installed/built independently.

First build, per app (from inside the app's nodevenv):

```bash
source ~/nodevenv/sttps-erp/web/22/bin/activate   # path cPanel shows you after step 3
cd ~/sttps-erp/web
npm ci
npm run build
mkdir -p tmp && touch tmp/restart.txt   # tells Passenger to (re)load the app
```

For `api`, also run once, after `.env` is uploaded (§5):

```bash
cd ~/sttps-erp/api
npm run seed:firestore   # first deploy only — seeds the permission catalog,
                          # the platform tenant/admin, and a demo tenant/admin
```

## 5. Environment variables

None of the three apps' `.env` files are committed (see each app's `.env.example`). Upload each manually via SFTP or cPanel File Manager, then lock it down:

```bash
chmod 600 ~/sttps-erp/api/.env
```

- `api/.env`: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (§2), `JWT_SECRET`, `JWT_EXPIRES_IN`, `PORT` (Passenger sets this — leave unset in `.env` or let it be overridden), `NODE_ENV=production`, `FRONTEND_URL=https://erp.sttps.co`, `ADMIN_URL=https://admin.erp.sttps.co`, plus the inert `DATABASE_URL` placeholder from `.env.example` (needed only so `prisma generate` succeeds at install time — never actually connected to).
- `web/.env` and `admin/.env`: only `NEXT_PUBLIC_API_URL=https://api.erp.sttps.co`. **This is baked in at build time**, not read at runtime — if you change it, you must rebuild (`npm run build`), not just restart.

Passenger does not source `.env` files itself. `web/start.mjs` and `admin/start.mjs` already `import "dotenv/config"` as their first line; NestJS's `ConfigModule.forRoot({ isGlobal: true })` loads `.env` internally, so `api` needs no equivalent change.

## 6. CI/CD — GitHub Actions (SSH-based, auto-deploy on push to `main`)

`.github/workflows/deploy.yml` deploys all three apps. On each push to `main` (production) or `develop` (development) it detects which app folders changed and deploys only those, in order: `api`, then `web`, then `admin`. Each app is type-checked and built on GitHub Actions, shipped to the server over SSH, and restarted under Passenger. Server paths come from the environment variables `API_APP_PATH`, `WEB_APP_PATH` and `ADMIN_APP_PATH`.

**GitHub repo secrets required** (Settings → Secrets and variables → Actions):

| Secret                     | Value                                                                 |
| -------------------------- | ---------------------------------------------------------------------- |
| `SSH_HOST`                 | Zircon server hostname/IP                                              |
| `SSH_USER`                 | cPanel username                                                        |
| `SSH_PORT`                 | usually `22` (confirm with Zircon/cPanel → SSH Access)                 |
| `SSH_DEPLOY_KEY`           | private half of a dedicated deploy key — **not** your personal key     |
| `SERVER_REPO_DIR`          | `/home/<user>/sttps-erp` (the shared clone from §4)                    |
| `WEB_NEXT_PUBLIC_API_URL`  | `https://api.erp.sttps.co` (validation-build only)                     |
| `ADMIN_NEXT_PUBLIC_API_URL`| `https://api.erp.sttps.co` (validation-build only)                     |

Generate a dedicated SSH keypair for this (don't reuse your personal one) — `ssh-keygen -t ed25519 -f sttps_ci_deploy -C "sttps-erp CI"`, add the `.pub` half to the server's `~/.ssh/authorized_keys`, and put the private half in `SSH_DEPLOY_KEY`.

## 7. Firestore schema changes

There's no migration system to run — Firestore is schemaless. "Schema changes" here means:

- **Document shape changes**: edit the relevant interface in `api/src/firestore/models.ts` and the service methods that read/write it. No backfill mechanism exists yet; for now, handle missing fields defensively in code (`?? default`) rather than assuming every existing doc has every field.
- **New composite indexes**: add to `firestore.indexes.json`, then `firebase deploy --only firestore:indexes`. Firestore also surfaces a direct console link to auto-create a missing index the first time an unindexed query runs, as a fallback if one is forgotten.
- **Seed data changes**: edit `api/scripts/seed-firestore.ts` (idempotent — re-running it skips anything that already exists via the `tenantSlugIndex`/`emailIndex` lookups, safe to run again).

See the Firestore migration plan (Phase 1 complete: platform/auth/admin console; Phase 2 backlog: the 12 remaining ERP modules, ported module-by-module following the same pattern) for the full data-model rationale.

## 8. Rollback

Since the deployed directory is the git working tree:

```bash
# from your machine
git revert <bad-commit-sha>
git push origin main   # redeploys automatically via the matching workflow

# or, emergency, directly on the server
cd ~/sttps-erp && git reset --hard <last-good-sha>
cd web && npm ci && npm run build && touch tmp/restart.txt   # repeat per affected app
```

## 9. If SSH-based deploy proves unreliable (FTP fallback)

`pos.polishstation.lk` on this same host originally tried cPanel's Git Version Control + UAPI-triggered pulls and found it unreliable enough to switch to a GitHub Actions → FTPS (`lftp`) push instead, uploading only the built output (never `node_modules`) and touching `tmp/restart.txt` to reload Passenger. If the SSH approach above hits the same wall here:

- For `web`/`admin`: both already build with `output: "standalone"` in `next.config.ts`, which produces a self-contained `.next/standalone/` (its own minimal `server.js` + only the node_modules it actually needs) — ship that directory instead of the full source, avoiding the "FTP-uploading node_modules times out" problem entirely.
- For `api`: `nest build` alone still needs full `node_modules` on the server (Prisma's native query-engine binary makes a single-file bundle impractical); if FTP becomes necessary, install dependencies via cPanel's Node.js Selector UI ("Run NPM Install") after uploading source, rather than trying to FTP `node_modules` directly.

## 10. Troubleshooting

| Symptom                                        | Likely cause                                                   | Fix                                                                                       |
| ----------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Deploy succeeds, site shows old version         | Passenger didn't reload                                           | `touch ~/sttps-erp/<app>/tmp/restart.txt`                                                   |
| 500 on every API request right after deploy     | `.env` missing or `DATABASE_URL`/`JWT_SECRET` unset               | Check cPanel → Setup Node.js App → your app → **Logs**; confirm `.env` exists and is readable |
| `502`/`503` from Apache                         | Passenger couldn't spawn the Node process                         | Confirm Node version in the app matches the provisioned nodevenv (22)                       |
| CORS errors in the browser console              | `FRONTEND_URL`/`ADMIN_URL` on the API don't match the live origins| Update `api/.env`, restart (`touch tmp/restart.txt`) — no rebuild needed, read at runtime    |
| Login works locally but not in prod             | `NEXT_PUBLIC_API_URL` was wrong at build time                     | Fix the GitHub secret, then rebuild (restart alone won't pick up a build-time var change)    |
