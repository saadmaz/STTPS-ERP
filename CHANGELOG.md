<a id="top"></a>

<div align="center">

<img src=".github/assets/changelog.svg" alt="STTPS ERP: Changelog" width="100%">

<br/>

<p><strong>Every notable change to this project, newest first.</strong></p>

<a href="README.md"><img alt="README" src="https://img.shields.io/badge/README-374151?style=for-the-badge&labelColor=111827"></a>
<a href="CONTRIBUTING.md"><img alt="Contributing" src="https://img.shields.io/badge/Contributing-374151?style=for-the-badge&labelColor=111827"></a>
<a href="CODE_OF_CONDUCT.md"><img alt="Code of Conduct" src="https://img.shields.io/badge/Code%20of%20Conduct-374151?style=for-the-badge&labelColor=111827"></a>
<a href="SECURITY.md"><img alt="Security" src="https://img.shields.io/badge/Security-374151?style=for-the-badge&labelColor=111827"></a>
<a href="CHANGELOG.md"><img alt="Changelog" src="https://img.shields.io/badge/Changelog-818cf8?style=for-the-badge&labelColor=111827"></a>
<a href="LICENSE.md"><img alt="License" src="https://img.shields.io/badge/License-374151?style=for-the-badge&labelColor=111827"></a>

</div>

---

<div align="center">

<a href="https://github.com/saadmaz/STTPS-ERP/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/saadmaz/STTPS-ERP?include_prereleases&style=flat-square&label=latest%20release&labelColor=111827&color=818cf8"></a>
<a href="https://github.com/saadmaz/STTPS-ERP/compare/main...develop"><img alt="Changes waiting for release" src="https://img.shields.io/github/commits-difference/saadmaz/STTPS-ERP?base=main&head=develop&style=flat-square&label=unreleased%20commits&labelColor=111827&color=374151"></a>

</div>

> [!NOTE]
> The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Each version links to its full comparison at the bottom of this page, and to its [release notes](https://github.com/saadmaz/STTPS-ERP/releases).

## [Unreleased]

### Added

- Product blueprint (`docs/BLUEPRINT.md`) and a new phase-based implementation plan covering every blueprint section, replacing the Prisma-era plan.

- Platform kernel in the API (`api/src/platform`): company-scoped repository with pagination, archiving and optimistic concurrency; exact money and quantity arithmetic; gap-free document numbering; audit trail service; durable background job queue; transactional domain-event outbox.
- Organisation module: branches, departments, teams, cost centres, business units, fiscal years with monthly periods (open, soft-closed, locked) and exchange rates, each with audit history, archiving and per-company unique codes.
- Approval engine (`/workflow`): configurable workflows per record type with conditions, conditional and parallel steps, approvers by user, role, permission or department manager, delegation, timeouts with escalation, and approve, reject, request changes, reassign and cancel. Outcomes are published as `ApprovalCompleted` events.
- Notification centre (`/me/notifications`): in-app notifications, unread counts, per-category muting, and email delivery through Resend when `RESEND_API_KEY` is set.
- Record features for every record type (`/records/:type/:id/...`): comments with @mentions that notify, tags, links between records, one activity timeline (changes, comments and approval decisions) and file attachments.
- Files on Cloudflare R2 through presigned upload and download URLs, with size verification, versions, and forced downloads for content types that could run script.
- Custom fields per record type (`/settings/custom-fields`) with typed validation, saved list views (private or shared), and global search (`/search`) that only returns record types the user may view.
- Staff app rebuilt on a shared UI system: navigation driven by the enabled modules and the user's permissions, a command palette (Ctrl K) with global search, a notifications bell with unread counts, dark mode, and a mobile navigation drawer.
- Standard list screens (search, sort, filters, archived toggle, column chooser, saved views, CSV export) and record pages (details, custom fields, tags, activity with comments, files, related records, edit, archive and restore).
- Screens for branches, departments, teams, cost centres, business units, fiscal years (with period opening, closing and locking) and exchange rates.
- Home with work waiting for you, My Work, notifications, approval decisions, and settings for modules, approval workflows, delegations and custom fields.
- Two-step sign-in with authenticator apps (TOTP) and single-use recovery codes, a signed-in devices list with sign-out per device, and password change, all under Settings, Security.
- My Work (`/me/work`): approvals waiting for me and my open requests.
- Module activation per tenant (`/platform/modules`) with dependency checks, and a code-defined permission catalogue synced to Firestore.
- Firestore composite indexes generated from a registry (`npm run indexes`), checked by a test.
- API test suite on the Firestore emulator (`npm test` in `api/`), run in CI.

### Changed

- The old module screens, which called API modules that are switched off, moved to `web/legacy/` as reference until each module is rebuilt.
- API upgraded to NestJS 12 (ES modules), firebase-admin 14 and TypeScript 6. `web` and `admin` upgraded to Next.js 16, zod 4 and the flat ESLint config of `eslint-config-next` 16. All three apps report no known vulnerabilities.
- The unported Prisma modules moved to `api/legacy/` as reference code; Prisma is no longer installed.
- Dependabot removed; dependencies are now updated directly by maintainers.

### Security

- Every API route now requires a signed-in user unless marked public, and permissions are checked against a verified company membership. Previously the permission guard ran before authentication and rejected every protected route.
- Refresh tokens are stored only as SHA-256 hashes, so a database read no longer exposes usable sessions. Existing sessions end with this release; users sign in again.
- Five failed sign-ins lock the email for 15 minutes, and unknown emails take as long to reject as wrong passwords.
- Passwords need 10 or more characters with a letter and a digit. Changing a password or having it reset signs out other devices.
- MFA secrets are encrypted at rest (AES-256-GCM) and TOTP codes cannot be replayed.
- User and company updates accept only their editable fields. Previously any signed-in user could set privilege flags such as `isSuperAdmin` or `isPlatformAdmin` on any user of their tenant.
- User management, company creation and company settings now require the matching permission or tenant administrator rights.
- Password hashes and MFA secrets are stripped from every API response.
- The seed script no longer creates accounts with fixed passwords; it reads them from the environment or generates random ones.
- The API refuses to start without a `JWT_SECRET` of at least 32 characters instead of falling back to a built-in default.
- The staff login form no longer pre-fills demo credentials.

## [0.4.1] - 2026-11-18

### Changed

- Dependency updates in web and admin: Next.js and PostCSS, sonner 2, @types/node, follow-redirects and postcss-selector-parser.

## [0.4.0] - 2026-11-17

### Added

- ESLint in `api`, `web` and `admin` (TypeScript rules, plus Next.js core web vitals for the two front ends), with a `lint` script in each app and a lint step in CI. `any` types are warnings while modules are ported.
- Cloudflare hosting: `web` and `admin` on Workers through OpenNext, and `api` in a Cloudflare Container behind a Worker, with production and development environments. Production deploys switch on with the `CLOUDFLARE_ENABLED` variable.
- One Deploy workflow that deploys only the apps that changed, in order: api, web, admin.

## [0.3.0] - 2026-11-17

### Removed

- Unused imports and variables flagged by the new lint setup.
- Unused dependencies in `web` (13) and `admin` (11), including ESLint, which was installed but never configured, and the `lint` scripts that could not run.
- Shared-hosting deployment: the SSH deploy workflow, Passenger start files for `web` and `admin`, the server-side deploy script, Next.js standalone output and the `dotenv` dependency it needed. Hosting moves to Cloudflare.

## [0.2.3] - 2026-11-17

### Changed

- Contributing, Security Policy, Code of Conduct, License and Changelog redesigned with branded headers, navigation, tables, diagrams and callouts; the licence is now LICENSE.md.

## [0.2.2] - 2026-11-17

### Changed

- README shows the development environment as awaiting host setup until development deploys are enabled.

## [0.2.1] - 2026-11-17

### Changed

- Redesigned README with a brand banner, live release, CI and deployment badges, action buttons, feature grid, diagrams and collapsible panels.
- Navigation bars and callouts across the contributing, security, conduct and documentation pages.

## [0.2.0] - 2026-11-17

### Added

- Development and production environments: `develop` deploys to development and `main` to production, through one Deploy workflow and GitHub Environments with per-environment settings.

## [0.1.0] - 2026-11-16

First pre-production release. The platform and identity layer is complete; domain modules are being ported to Firestore.

### Added

- **api:** NestJS API with JWT authentication, multi-tenancy, companies, users, roles and permissions, and admin endpoints on Cloud Firestore; Swagger documentation; Firestore seeding script.
- **web:** staff application with dashboard and screens for finance, inventory, procurement, sales and CRM, manufacturing, HR, EAM, FSM, quality, EHS, projects, analytics and settings.
- **admin:** platform admin console for tenants, companies, users and roles.
- Firestore security rules and composite indexes.
- Independent deploy pipelines per app, building on GitHub Actions and shipping standalone artefacts to Passenger.
- Continuous integration on every push and pull request: type check and production build for every app.
- Product, technical, flow, schema, design and implementation documentation under `docs/`.
- Project governance: proprietary licence, security policy, contribution guidelines, code of conduct, issue forms, pull request template, CODEOWNERS and Dependabot.
- Standard documentation layout shared by every STTPS repository: architecture, configuration, deployment, decision records (ADRs) and release and rollback runbooks, indexed in `docs/README.md`.

### Changed

- API persistence migrated from Prisma and PostgreSQL to Cloud Firestore to suit the hosting platform.

### Security

- Next.js upgraded from 15.1.4 to 15.5.29 in `web` and `admin`, closing critical advisories, and semver-compatible dependency fixes applied across all apps.
- Server access details removed from the deployment guide.

[Unreleased]: https://github.com/saadmaz/STTPS-ERP/compare/v0.4.1...HEAD
[0.4.1]: https://github.com/saadmaz/STTPS-ERP/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/saadmaz/STTPS-ERP/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/saadmaz/STTPS-ERP/compare/v0.2.3...v0.3.0
[0.2.3]: https://github.com/saadmaz/STTPS-ERP/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/saadmaz/STTPS-ERP/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/saadmaz/STTPS-ERP/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/saadmaz/STTPS-ERP/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/saadmaz/STTPS-ERP/releases/tag/v0.1.0
