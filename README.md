<div align="center">

# STTPS ERP

**Multi-tenant enterprise resource planning for the STTPS group.**

One platform for identity, companies, finance, inventory, procurement, sales, manufacturing, HR, assets, field service, quality, EHS and projects across every STTPS business.

[![App](https://img.shields.io/badge/app-erp.sttps.co-374151?style=flat-square&labelColor=111827)](https://erp.sttps.co)
[![CI](https://github.com/saadmaz/STTPS-ERP/actions/workflows/ci.yml/badge.svg)](https://github.com/saadmaz/STTPS-ERP/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-v0.1.0-374151?style=flat-square&labelColor=111827)](https://github.com/saadmaz/STTPS-ERP/releases)
![License](https://img.shields.io/badge/license-proprietary-374151?style=flat-square&labelColor=111827)

[**erp.sttps.co**](https://erp.sttps.co) · [Documentation](docs/README.md) · [Report a bug](https://github.com/saadmaz/STTPS-ERP/issues/new?template=bug_report.yml) · [Request a change](https://github.com/saadmaz/STTPS-ERP/issues/new?template=feature_request.yml)

</div>

---

## Contents

- [About](#about)
- [Features](#features)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Project structure](#project-structure)
- [Quality checks](#quality-checks)
- [Deployment](#deployment)
- [Documentation](#documentation)
- [Releases and versioning](#releases-and-versioning)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## About

STTPS ERP is the operating platform for the STTPS group of companies. It is multi-tenant from the ground up: each tenant holds one or more companies, and every user, role and permission is scoped to them.

| | |
| --- | --- |
| **Organisation** | STTPS (Pvt) Ltd |
| **Status** | Pre-production: platform layer built, domain modules being ported |
| **Production** | [erp.sttps.co](https://erp.sttps.co) |
| **Admin console** | [admin.erp.sttps.co](https://admin.erp.sttps.co) |
| **API** | `api.erp.sttps.co` |
| **Contact** | [hello@sttps.co](mailto:hello@sttps.co) |
| **Maintainer** | [Saad Mazhar](https://github.com/saadmaz) |

## Features

- **Multi-tenancy:** tenants, companies within them, and per-company scoping of every user, role and permission.
- **Identity and access:** short-lived JWT access tokens with refresh sessions stored in Firestore, roles and fine-grained permissions enforced by API guards.
- **Admin console:** platform administration of tenants, companies, users and roles.
- **Domain modules:** finance, inventory, procurement, sales and CRM, manufacturing, HR, enterprise asset management, field service, quality, EHS and projects, with screens in the staff application and APIs being ported to Firestore.
- **API documentation:** Swagger, generated from the NestJS controllers.
- **Independent delivery:** each application builds, deploys and rolls back on its own.

## Architecture

Three standalone applications: a NestJS API on Cloud Firestore, a Next.js staff application and a Next.js admin console. Each has its own lockfile and deploy pipeline, so a failure in one never blocks the others.

The full picture, with diagrams, is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Significant decisions are recorded as [ADRs](docs/adr/README.md).

## Tech stack

| App | Technology | Local port |
| --- | --- | --- |
| `web/` | Next.js 15 (App Router), React 19, TanStack Query, Zustand, Tailwind CSS | 3000 |
| `admin/` | Next.js 15 (App Router), React 19, Tailwind CSS | 3002 |
| `api/` | NestJS 10, Passport JWT, Swagger, `firebase-admin` (Firestore) | 3001 |

All three run on Node.js 22 under Phusion Passenger on cPanel hosting.

## Getting started

### Prerequisites

- Node.js 22
- npm 10 or later
- A Firebase project with Firestore in Native mode, and a service account for the API

### Install and run

Each app is installed and run on its own:

```sh
git clone https://github.com/saadmaz/STTPS-ERP.git
cd STTPS-ERP

cd api   && npm ci && cp .env.example .env && npm run dev    # http://localhost:3001
cd ../web   && npm ci && cp .env.example .env.local && npm run dev # http://localhost:3000
cd ../admin && npm ci && cp .env.example .env.local && npm run dev # http://localhost:3002
```

Fill in each file from its `.env.example`. Seed a development Firestore project with `npm run seed:firestore` in `api/`.

### Scripts

| Command | `api` | `web` / `admin` |
| --- | --- | --- |
| `npm run dev` | NestJS in watch mode | Next.js dev server |
| `npm run build` | Compile to `dist/` | Standalone production build |
| `npm start` | Run the compiled API | Run the production server (`start.mjs`) |
| `npm run typecheck` | `tsc --noEmit` | `tsc --noEmit` |
| `npm run seed:firestore` | Seed Firestore with platform data | |

## Configuration

`api` reads its Firebase service account, JWT secret and CORS origins from `api/.env`; `web` and `admin` need only `NEXT_PUBLIC_API_URL`, which is compiled in at build time.

Every variable, where it is set and which are secret: [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

## Project structure

```
.
├── .github/workflows/     # CI, plus one deploy workflow per app
├── api/                   # NestJS API: auth, tenant, company, user, admin and domain modules
│   ├── prisma/            # Reference data model for modules not yet ported (not connected)
│   ├── scripts/           # Firestore seeding
│   └── deploy.sh          # Server-side deploy script
├── web/                   # Staff application: dashboard and every domain module
├── admin/                 # Platform admin console: tenants, companies, users and roles
├── docs/                  # Architecture, configuration, deployment, ADRs, runbooks and product docs
├── firestore.rules        # Firestore security rules
└── firestore.indexes.json # Composite indexes required by the admin console
```

## Quality checks

Every push and pull request to `main` runs the [CI workflow](.github/workflows/ci.yml): a type check and production build for `api`, `web` and `admin`. Run the same checks locally before opening a pull request:

```sh
npm run typecheck && npm run build  # in each of api/, web/ and admin/
```

## Deployment

Each app deploys independently on push to `main` when its own folder changes. Builds run on GitHub Actions and the artefact is shipped to the host over SSH and restarted under Passenger.

Setup, secrets and post-deployment checks are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). To release or roll back, follow the [runbooks](docs/runbooks/README.md).

## Documentation

All documentation lives in [`docs/`](docs/README.md), using the same layout in every STTPS repository.

| Document | Covers |
| --- | --- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the system is built and how data flows |
| [CONFIGURATION.md](docs/CONFIGURATION.md) | Environment variables and configuration files |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Hosting, the delivery pipeline and first-time setup |
| [adr/](docs/adr/README.md) | Architecture decision records |
| [runbooks/](docs/runbooks/README.md) | Release and rollback procedures |

Product and reference documents for this project are listed in the [documentation index](docs/README.md).

## Releases and versioning

The project follows [Semantic Versioning](https://semver.org). Each release is tagged `vX.Y.Z` and published on the [Releases](https://github.com/saadmaz/STTPS-ERP/releases) page. Versions below `1.0.0` are pre-production. Notable changes are recorded in [CHANGELOG.md](CHANGELOG.md), and the release procedure is in [docs/runbooks/release.md](docs/runbooks/release.md).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the branching model, commit conventions and pull request checklist. All participants are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Please do not report security issues in public issues. See [SECURITY.md](SECURITY.md) for how to report a vulnerability privately.

## License

Copyright © 2026 STTPS (Pvt) Ltd. All rights reserved.

This is proprietary software. No permission is granted to use, copy, modify or distribute it without prior written consent. See [LICENSE](LICENSE).
