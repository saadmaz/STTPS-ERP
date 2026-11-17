# Documentation

Every STTPS repository uses the same documentation layout. Start with the core documents, then the decision records and runbooks.

## Core

| Document | Covers |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the system is built, its components and how data flows |
| [CONFIGURATION.md](CONFIGURATION.md) | Environment variables, configuration files and where each value lives |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Hosting, the delivery pipeline, first-time setup and post-deployment checks |

## Decisions and operations

| Document | Covers |
| --- | --- |
| [adr/](adr/README.md) | Architecture decision records |
| [runbooks/](runbooks/README.md) | Release and rollback procedures |

## Product and reference

| Document | Covers |
| --- | --- |
| [APP-FLOW.md](APP-FLOW.md) | User journeys and application flow |
| [ARCHITECTURE-PLAN.md](ARCHITECTURE-PLAN.md) | Long-term target architecture and roadmap (not as-built) |
| [BACKEND-SCHEMA.md](BACKEND-SCHEMA.md) | Data model |
| [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) | Phased delivery plan |
| [PRD.md](PRD.md) | Product requirements |
| [TRD.md](TRD.md) | Technical requirements |
| [UI-UX-DESIGN-BRIEF.md](UI-UX-DESIGN-BRIEF.md) | Design brief |

## Conventions

- Top-level documents use `UPPER-KEBAB-CASE.md`; documents inside folders use `lower-kebab-case.md`.
- Update the relevant document in the same pull request as the change it describes.
- Record significant technical decisions as ADRs rather than editing older documents.
