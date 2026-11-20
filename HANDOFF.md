# Handoff — STTPS ERP build-out

**Phase 6 (Intelligence and integrations) is in progress.** Phases 0–5 are done and released as v0.5.0. The Automation engine, the Report builder and the Dashboard builder (Phase 6's first three items) are now built — API, tests, web screens, docs — on `develop`, not yet released.

**Last updated:** 2026-11-20, after the Dashboard builder.

## Automation engine: done

- `api/src/automation/` (`AutomationRuleService`, `AutomationEngineService`): no-code rules (trigger → conditions → actions) over the ~20 domain events already published across the codebase. See `CLAUDE.md` §9's Automation domain note for the full design and scope cuts before touching this.
- Spent nothing from the Firestore index budget (still 199/200) — a rule's firing history lives in a capped array field on the rule itself, not a new collection.
- Web: `web/src/modules/automation/` (rules list/record, conditions and actions row editors, a test-run dialog), a sidebar entry, pages under `web/src/app/(platform)/automation/`.
- Tests: `api/test/http/automation.spec.ts` (5 tests).

## Report builder: done

- `api/src/reports/` (`ReportDefinitionService`, `ReportingEngineService`): report definitions over six sources (sales orders, invoices, expense claims, purchase orders, leads, tasks), filtered/grouped/aggregated/sorted/compared in memory via a new `reportRows()` on `MasterDataService` itself. Reuses the existing `analytics` catalog stub (now `available: true`). See `CLAUDE.md` §9's Report builder domain note before touching this.
- **Fixed a real bug while building this**: the filter/condition evaluator (duplicated between this and Automation) treated any non-numeric comparison in `gt`/`gte`/`lt`/`lte` as always `false`, silently breaking date/timestamp filtering in both engines. Fixed in both with a lexical fallback.
- New API dependency: `exceljs` (Excel export). A transitive `uuid` advisory in its tree was checked and judged not reachable through how `exceljs` actually calls it — see the CLAUDE.md note.
- Spent nothing from the Firestore index budget (still 199/200) — everything runs in memory over the capped `reportRows()` result.
- **Flipping `analytics` to `available: true` broke `test/http/guards.spec.ts`'s hard-coded "not yet available" example again** (same recurring gotcha noted for EHS) — it now points at `ai`.
- Web: `web/src/modules/reports/` (definitions list/record, filter/column/aggregation/calculated-field row editors, a run panel with table/pivot views and CSV/Excel download), a sidebar entry, pages under `web/src/app/(platform)/reports/`.
- Tests: `api/test/http/reports.spec.ts` (3 tests).
- Not built, each a documented scope cut (see the plan entry and CLAUDE.md §9): PDF export, scheduled email delivery (no cron scheduler yet), real chart rendering (no charting library existed yet at that point — added in the next item, below).

## Dashboard builder: done

- `api/src/reports/dashboards.*` (`KpiDefinitionService`, `DashboardService`, `DashboardEngineService`), a sibling-file split inside the existing `reports` module/`analytics` catalog key — see `CLAUDE.md` §9's Dashboard builder domain note before touching this.
- KPIs read a target metric live from one report's `summary` on every run (no snapshot/history); a dashboard's widgets (kpi, report_table, report_chart, report_pivot, alerts) are each computed independently, so one widget lacking permission degrades gracefully instead of failing the whole dashboard (the same pattern Calendar already established).
- New web dependency: `recharts` (the first charting library anywhere in this web app) — bar/line/pie for report_chart widgets.
- Spent nothing from the Firestore index budget (still 199/200) — both new collections are small lists, everything computed in memory via the existing report engine.
- Web: `web/src/modules/reports/dashboards.tsx` (KPI and dashboard list/record screens, a widget editor, a live dashboard viewer with charts), sidebar entries for Dashboards and KPIs under Reports.
- Tests: `api/test/http/dashboards.spec.ts` (3 tests).
- Not built, each a documented scope cut: Calendar/Funnel/Map widget types, drag-and-drop widget layout, a materialised/cached KPI history.

## If picking this up cold

1. Re-read `docs/IMPLEMENTATION-PLAN.md`'s Phase 6 section. The next unchecked item in phase order is the **Analytics store** (a Firestore → BigQuery export), followed by the AI items, API platform, Integrations, then Mobile (PWA).
2. Before diverging into anything else (the leftover Phase 0/1 items — sales analytics, record-level scope, audit trail, import/export, dashboard framework — or Phase 7), check with the owner: Phase 6/7 items are much larger and more ambiguous than a Phase 5 module, each closer to its own mini-project than a well-specified CRUD module.
3. Don't release yet — only three Phase 6 items are done. Follow `docs/runbooks/release.md` when told to, not automatically after each item (unlike the Phase 5 convention noted in earlier history below).

## Standing instructions (apply to any future work here)

- No AI attribution anywhere (commit messages, PR text, code comments) — see global `CLAUDE.md` rules (`C:\Users\Saad\.claude\CLAUDE.md`).
- Before each commit: `tsc --noEmit`, `eslint`, the full API test suite, and for web changes `tsc --noEmit` + `eslint` + `next build`. All must be clean.
- **Run `npm test` / `vitest` via the PowerShell tool, not Bash.** Git Bash's lowercase-drive-letter cwd (`c:/Work/...`) crashes vitest's module runner on this machine. This is NOT a real dependency problem. See `CLAUDE.md` §8.
- After every push: `gh run list --branch develop --limit 3` then `gh run watch <id> --exit-status` to confirm CI is actually green.
- Never force-push or rewrite published history. Never skip hooks.

## Firestore composite-index budget: still 199/200

One slot of headroom remains. The Automation engine, the Report builder and the Dashboard builder all spent nothing (see above). The zero-indexed-filter trick (`{ filters: [], sorts: [{ field: "createdAt", direction: "desc" }] }`) costs exactly 1 index per `large` list and should be the default reach if that last slot is ever spent — see `CLAUDE.md` §5 for the full history of how each of the prior five slots was spent (or deliberately not spent).

## Release v0.5.0: done (for reference — Phases 0–5)

- `develop` had diverged from `main` (main was last released at v0.4.1 and never caught up) — merging `main` into `develop` was needed before the release PR could merge cleanly; conflicts were only in `CHANGELOG.md` and each app's `package.json`/`package-lock.json` (version numbers, plus `develop`'s already-upgraded dependencies — `qrcode`, zod 4, a newer `react-hook-form` — which were correctly kept). **If a future release hits the same "PR not mergeable" error, check for this exact situation first**: `git log origin/main ^origin/develop` to see what's on `main` only, before assuming something is actually broken.
- PR #48 `develop` → `main`, squash-merged as `chore(release): v0.5.0`.
- Tagged `v0.5.0` on `main`, tag pushed.
- GitHub release published at `v0.5.0` (`--prerelease`, since the project is pre-1.0) with the CHANGELOG `[0.5.0]` section as notes.
- **Post-deployment checks from `docs/DEPLOYMENT.md` could not be completed**: `https://erp.sttps.co/` returned `503`, and `api.erp.sttps.co`/`admin.erp.sttps.co` didn't respond at all. This matches the Deploy workflow showing `skipped` on both this push and the prior v0.4.1 release — production deploys are gated behind a `CLOUDFLARE_ENABLED` variable that isn't on yet (per `CLAUDE.md`/the changelog's own notes on this). **This is a pre-existing infrastructure state, not something broken by this release** — the owner needs to flip that variable on and re-check the three post-deployment checks themselves once they do.
- The `release/v0.5.0` branch was left on the remote (not deleted) — harmless, already merged; delete it whenever convenient.

## Everything built through Phase 5, for reference (eight items, all API + web + tests)

**Manufacturing** (`api/src/manufacturing/`): work centres/machines, BOMs/routings, production orders (the one `large` list).
**MRP** (same module): demand forecasts + sales-order demand netted against stock/on-order/production; one-BOM-level explosion.
**Quality** (`api/src/quality/`): inspection plans, inspections (auto-derived pass/fail), non-conformances. `InspectionDoc` is the one `large` list. A port (minus the legacy's out-of-scope Audit entity).
**EHS** (`api/src/ehs/`): incidents, risk assessments, permits to work. All three stayed small lists. A port (no blueprint section existed).
**Warehouse management** (`api/src/warehouse/`, `imports: [InventoryModule, SalesModule, ProcurementModule]`): put-away rules, FIFO/FEFO/zone picking + wave picking, a task queue (the one `large` list) auto-populated from `GoodsReceived`/`SalesOrderConfirmed`, scan-by-code. A fresh build.
**POS** (`api/src/pos/`, `imports: [InventoryModule, SalesModule, FinanceModule]`): terminals, cashier shifts, sales (the one `large` list; hand-written transactional `create()`/`refund()`/`void()`), a loyalty-points balance. A fresh build.
**Logistics and fleet** (`api/src/logistics/`, `imports: [SalesModule]`): vehicles, fuel logs, routes (the one `large` list) — a planning layer over Sales' existing `DeliveryDoc`. A fresh build.
**Marketing** (`api/src/marketing/`, `imports: [CrmModule]`): campaigns, segments (a saved CRM filter), sequences + enrollments (definitions and tracking only, nothing sent), a campaign ROI/cost-per-lead report. All small lists. A fresh build.

## Where to find things

- Blueprint (source of truth for scope): `docs/BLUEPRINT.md`.
- Plan checkboxes: `docs/IMPLEMENTATION-PLAN.md`.
- Conventions, patterns, module checklist, domain notes, review hotspots: `CLAUDE.md` (repo root).
- Release process: `docs/runbooks/release.md`.
- Global rules (git workflow, no AI attribution): `C:\Users\Saad\.claude\CLAUDE.md`.
- Persistent cross-session memory: `C:\Users\Saad\.claude\projects\C--Work-STTPS-STTPS-ERP\memory\` (`MEMORY.md` is the index).
