# ADR-0002: Cloud Firestore instead of PostgreSQL

<!-- nav -->
<sub><a href="../../README.md">Project README</a> · <a href="../README.md">Documentation index</a></sub>

| Status | Date |
| --- | --- |
| Accepted | 2026-11-16 |

## Decision

Persist platform data in Cloud Firestore through `firebase-admin`. `api/prisma/schema.prisma` is kept only as the reference model for modules not yet ported.

## Alternatives considered

PostgreSQL through Prisma, as originally planned; MySQL, the only database the hosting plan offers.

## Rationale

The hosting plan has no PostgreSQL. Firestore matches the stack already proven in production for Polish Station POS on the same host and removes database administration from the team.
