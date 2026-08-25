# Deployment Guide — STTPS ERP

Target: **erp.sttps.co**, hosted on **Zircon Hosting (cPanel)**, same hosting provider as `pos.polishstation.lk`. This guide follows that project's proven pattern, adapted for three apps instead of one.

## 1. Architecture

Three independent, standalone apps — no monorepo tooling, no shared packages. Each has its own `package.json`, lockfile, and deploy pipeline, so a broken build in one never blocks the others.

| App     | Tech                    | Subdomain            | Local port |
| ------- | ----------------------- | --------------------- | ---------- |
| `web/`  | Next.js 15 (App Router) | `erp.sttps.co`         | 3000       |
| `admin/`| Next.js 15 (App Router) | `admin.erp.sttps.co`   | 3002       |
| `api/`  | NestJS 10 + Prisma      | `api.erp.sttps.co`     | 3001       |

Database: **PostgreSQL** only (`api/prisma/schema.prisma`). Redis, GCS, and SendGrid appear in old planning docs but are not wired into any code yet — don't provision them until a feature actually needs them.

## 2. What you (the user) need to do first

These are things only you can do — account access, DNS, and secrets:

1. **Confirm Zircon plan capabilities.** Log into cPanel and check:
   - **Setup Node.js App** icon exists (CloudLinux NodeJS Selector) — required for Passenger to run these apps.
   - **PostgreSQL Databases** icon exists. Many shared cPanel plans only offer MySQL/MariaDB. If Postgres isn't available, use a managed external Postgres instead (e.g. Neon or Supabase free tier) and just point `DATABASE_URL` at it — nothing else changes.
   - **SSH Access** is enabled for the account (cPanel → Security → SSH Access). If Zircon doesn't grant real shell access, see §9 (FTP fallback).
2. **DNS**: create `A` records pointing `erp.sttps.co`, `api.erp.sttps.co`, and `admin.erp.sttps.co` at the Zircon server's IP (wherever `sttps.co`'s nameservers are managed).
3. **Give me** (once you have them): the cPanel username, the server hostname/IP for SSH, and confirmation of which of the above is available. I can't proceed with the actual server setup without these — nothing else in this repo needed them until now.
4. **Generate production secrets** (or ask me to generate them): `JWT_SECRET` (32+ random chars — `openssl rand -base64 48`), and the production `DATABASE_URL`.

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

For `api`, also run once (and after any schema change):

```bash
cd ~/sttps-erp/api
npx prisma migrate deploy   # once migrations exist — see §7
# or, until migrations are set up: npx prisma db push
npx prisma db seed          # first deploy only, seeds permissions/roles
```

## 5. Environment variables

None of the three apps' `.env` files are committed (see each app's `.env.example`). Upload each manually via SFTP or cPanel File Manager, then lock it down:

```bash
chmod 600 ~/sttps-erp/api/.env
```

- `api/.env`: `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `PORT` (Passenger sets this — leave unset in `.env` or let it be overridden), `NODE_ENV=production`, `FRONTEND_URL=https://erp.sttps.co`, `ADMIN_URL=https://admin.erp.sttps.co`.
- `web/.env` and `admin/.env`: only `NEXT_PUBLIC_API_URL=https://api.erp.sttps.co`. **This is baked in at build time**, not read at runtime — if you change it, you must rebuild (`npm run build`), not just restart.

Passenger does not source `.env` files itself. `web/start.mjs` and `admin/start.mjs` already `import "dotenv/config"` as their first line; NestJS's `ConfigModule.forRoot({ isGlobal: true })` loads `.env` internally, so `api` needs no equivalent change.

## 6. CI/CD — GitHub Actions (SSH-based, auto-deploy on push to `main`)

`.github/workflows/deploy-web.yml`, `deploy-admin.yml`, `deploy-api.yml` are already in this repo. Each triggers only on changes to its own folder, runs a type-check + build as a validation gate, then SSHes in and does the real `git pull && npm ci && npm run build && restart` on the server.

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

## 7. Database migrations

The schema currently has no `prisma/migrations` folder — the team has been using `prisma db push` (fine for early development, risky for production: no history, no rollback). Before the first real production deploy, generate an initial migration locally against a throwaway database:

```bash
cd api
npx prisma migrate dev --name init
git add prisma/migrations && git commit
```

From then on, use `npx prisma migrate deploy` on the server (§4) instead of `db push`, and commit every new migration the same way.

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
