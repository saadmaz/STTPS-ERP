# Handoff — STTPS ERP build-out

**The entire implementation plan is done, and v0.5.0 has shipped.** `develop` and `main` are merged and released. There is no next feature queued — check `docs/IMPLEMENTATION-PLAN.md` for whether a new phase has been scoped before starting anything.

**Last updated:** 2026-11-20, after releasing v0.5.0 (tag pushed, GitHub release published as a pre-release).

## Release v0.5.0: done

- `develop` had diverged from `main` (main was last released at v0.4.1 and never caught up) — merging `main` into `develop` was needed before the release PR could merge cleanly; conflicts were only in `CHANGELOG.md` and each app's `package.json`/`package-lock.json` (version numbers, plus `develop`'s already-upgraded dependencies — `qrcode`, zod 4, a newer `react-hook-form` — which were correctly kept). **If a future release hits the same "PR not mergeable" error, check for this exact situation first**: `git log origin/main ^origin/develop` to see what's on `main` only, before assuming something is actually broken.
- PR #48 `develop` → `main`, squash-merged as `chore(release): v0.5.0`.
- Tagged `v0.5.0` on `main`, tag pushed.
- GitHub release published at `v0.5.0` (`--prerelease`, since the project is pre-1.0) with the CHANGELOG `[0.5.0]` section as notes.
- **Post-deployment checks from `docs/DEPLOYMENT.md` could not be completed**: `https://erp.sttps.co/` returned `503`, and `api.erp.sttps.co`/`admin.erp.sttps.co` didn't respond at all. This matches the Deploy workflow showing `skipped` on both this push and the prior v0.4.1 release — production deploys are gated behind a `CLOUDFLARE_ENABLED` variable that isn't on yet (per `CLAUDE.md`/the changelog's own notes on this). **This is a pre-existing infrastructure state, not something broken by this release** — the owner needs to flip that variable on and re-check the three post-deployment checks themselves once they do.
- The `release/v0.5.0` branch was left on the remote (not deleted) — harmless, already merged; delete it whenever convenient.

## If picking this up cold

There is no outstanding work item. Before doing anything:
1. Re-read `docs/IMPLEMENTATION-PLAN.md` for whether a new phase (6?) has been added since this was written.
2. If genuinely nothing is queued, this file's job is done — treat any new request as its own task, not a continuation of this build-out.

## Standing instructions (apply to any future work here)

- No AI attribution anywhere (commit messages, PR text, code comments) — see global `CLAUDE.md` rules (`C:\Users\Saad\.claude\CLAUDE.md`).
- Before each commit: `tsc --noEmit`, `eslint`, the full API test suite, and for web changes `tsc --noEmit` + `eslint` + `next build`. All must be clean.
- **Run `npm test` / `vitest` via the PowerShell tool, not Bash.** Git Bash's lowercase-drive-letter cwd (`c:/Work/...`) crashes vitest's module runner on this machine. This is NOT a real dependency problem. See `CLAUDE.md` §8.
- After every push: `gh run list --branch develop --limit 3` then `gh run watch <id> --exit-status` to confirm CI is actually green.
- Never force-push or rewrite published history. Never skip hooks.

## Firestore composite-index budget: final state

**199/200.** One slot of headroom remains for any future module. The zero-indexed-filter trick (`{ filters: [], sorts: [{ field: "createdAt", direction: "desc" }] }`) costs exactly 1 index per `large` list and should be the default reach if that headroom is ever spent — see `CLAUDE.md` §5 for the full history of how each of the last five slots was spent (or deliberately not spent).

## Everything built across this whole Phase 5 build-out, for reference (eight items, all API + web + tests)

**Manufacturing** (`api/src/manufacturing/`): work centres/machines, BOMs/routings, production orders (the one `large` list).
**MRP** (same module): demand forecasts + sales-order demand netted against stock/on-order/production; one-BOM-level explosion.
**Quality** (`api/src/quality/`): inspection plans, inspections (auto-derived pass/fail), non-conformances. `InspectionDoc` is the one `large` list. A port (minus the legacy's out-of-scope Audit entity).
**EHS** (`api/src/ehs/`): incidents, risk assessments, permits to work. All three stayed small lists. A port (no blueprint section existed).
**Warehouse management** (`api/src/warehouse/`, `imports: [InventoryModule, SalesModule, ProcurementModule]`): put-away rules, FIFO/FEFO/zone picking + wave picking, a task queue (the one `large` list) auto-populated from `GoodsReceived`/`SalesOrderConfirmed`, scan-by-code. A fresh build.
**POS** (`api/src/pos/`, `imports: [InventoryModule, SalesModule, FinanceModule]`): terminals, cashier shifts, sales (the one `large` list; hand-written transactional `create()`/`refund()`/`void()`), a loyalty-points balance. A fresh build.
**Logistics and fleet** (`api/src/logistics/`, `imports: [SalesModule]`): vehicles, fuel logs, routes (the one `large` list) — a planning layer over Sales' existing `DeliveryDoc`. A fresh build.
**Marketing** (`api/src/marketing/`, `imports: [CrmModule]`): campaigns, segments (a saved CRM filter), sequences + enrollments (definitions and tracking only, nothing sent), a campaign ROI/cost-per-lead report. All small lists. A fresh build.

Web (`web/src/modules/{manufacturing,quality,ehs,warehouse,pos,logistics,marketing}/*`): every item has full screens, sidebar entries, and standalone tool pages where a generic form couldn't fit the flow (Warehouse's Scan/Picking, POS's Register, Logistics' New-route page) — the `createHref` + hand-built-page-under-a-static-folder pattern, with three working examples now plus the original `hr/leave-rollover`.

Tests: one `api/test/http/<module>.spec.ts` per item (manufacturing 7, manufacturing-mrp 6, quality 8, ehs 5, warehouse 5, pos 7, logistics 4, marketing 7 — 49 tests across the eight items this phase added). Full suite (264 tests) passed clean before the Marketing commit.

Docs updated throughout: every `docs/IMPLEMENTATION-PLAN.md` checkbox has a scope note, `CHANGELOG.md` has an `### Added` entry per item under `## [Unreleased]` (now due to move into a dated release — see the warning above), `CLAUDE.md` §1/§5/§9 are current. Read the §9 domain notes before touching any Phase 5 module — they carry real, hard-won gotchas (Logistics' settle-condition bug, Marketing's `sequences` field-name collision with `MasterDataService`'s own field, MRP's netting-formula reasoning, POS's hand-written transactional services, and more).

## Where to find things

- Blueprint (source of truth for scope): `docs/BLUEPRINT.md`.
- Plan checkboxes (now all checked): `docs/IMPLEMENTATION-PLAN.md`.
- Conventions, patterns, module checklist, domain notes, review hotspots: `CLAUDE.md` (repo root).
- **Release process (the actual next step): `docs/runbooks/release.md`.**
- Global rules (git workflow, no AI attribution): `C:\Users\Saad\.claude\CLAUDE.md`.
- Persistent cross-session memory: `C:\Users\Saad\.claude\projects\C--Work-STTPS-STTPS-ERP\memory\` (`MEMORY.md` is the index).
