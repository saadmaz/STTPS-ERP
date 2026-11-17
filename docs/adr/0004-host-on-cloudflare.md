# ADR-0004: Host on Cloudflare

<!-- nav -->

<sub><a href="../../README.md">Project README</a> · <a href="../README.md">Documentation index</a></sub>

| Status | Date |
| --- | --- |
| Accepted | 2026-11-17 |

## Decision

Move hosting from shared cPanel hosting to Cloudflare: `web` and `admin` on Workers through OpenNext, and `api` in Cloudflare Containers. Remove the previous host's pipeline: the SSH deploy workflow, Passenger start files, the server-side deploy script and Next.js standalone output.

## Alternatives considered

Staying on the shared host; a dedicated virtual server.

## Rationale

The shared host could not build the apps, killed long SSH sessions and had no PostgreSQL. Cloudflare already hosts the group's websites, so moving the ERP there puts every STTPS application on one platform. See [DEPLOYMENT.md](../DEPLOYMENT.md#cloudflare-setup).
