# ADR-0001: Three standalone applications instead of a monorepo

| Status | Date |
| --- | --- |
| Accepted | 2026-11-16 |

## Decision

Ship `api/`, `web/` and `admin/` as independent applications, each with its own `package.json`, lockfile and deploy workflow.

## Alternatives considered

A Turborepo or pnpm workspace monorepo with shared packages.

## Rationale

On constrained shared hosting, independent builds and deploys mean a failure in one app never blocks the others, and each app can be redeployed on its own.
