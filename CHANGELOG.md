# Changelog

<!-- nav -->
<p align="center"><a href="README.md">README</a> · <a href="CONTRIBUTING.md">Contributing</a> · <a href="CODE_OF_CONDUCT.md">Code of Conduct</a> · <a href="SECURITY.md">Security</a> · <strong>Changelog</strong> · <a href="LICENSE">License</a></p>

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Versions below `1.0.0` are pre-production.

## [Unreleased]

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

[Unreleased]: https://github.com/saadmaz/STTPS-ERP/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/saadmaz/STTPS-ERP/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/saadmaz/STTPS-ERP/releases/tag/v0.1.0
