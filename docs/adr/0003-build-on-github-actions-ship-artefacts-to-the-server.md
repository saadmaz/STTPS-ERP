# ADR-0003: Build on GitHub Actions, ship artefacts to the server

<!-- nav -->
<sub><a href="../../README.md">Project README</a> · <a href="../README.md">Documentation index</a></sub>

| Status | Date |
| --- | --- |
| Superseded by [ADR-0004](0004-host-on-cloudflare.md) | 2026-11-16 |

## Decision

Run `npm ci` and the production build on GitHub Actions and ship the built artefact (standalone Next.js output, compiled NestJS) to the server over SSH.

## Alternatives considered

Building on the server after a `git pull`.

## Rationale

The host has a tight disk quota, a slow CPU and kills long SSH sessions, which made on-server builds unreliable.
