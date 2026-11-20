# Handoff — STTPS ERP build-out

**Phase 6 (Intelligence and integrations) has been worked through in full, and Phase 1 is now fully closed out too.** Phases 0–5 are done and released as v0.5.0. Ten of Phase 6's eleven line items are now done: the Automation engine, the Report builder, the Dashboard builder, the Analytics store, all four AI items (assistant, document processing, insights, agents), the API platform, and Mobile (an installable PWA). The eleventh, Integrations, is **partly** done (SMS/WhatsApp notification channels only) and left unchecked in the plan on purpose — most of what it names is still real, undone work needing third-party accounts this environment doesn't have. Sales analytics (Phase 1's one leftover item) is also now done. Everything here is on `develop`, not yet released. Also fixed one unrelated pre-existing flaky test along the way (`api/test/http/auth.spec.ts`'s MFA replay check could cross a TOTP step boundary).

**Last updated:** 2026-11-20, after Sales analytics. This is a natural stopping point. Phase 6 is effectively done and Phase 1 is fully closed; what's left (the rest of Integrations, Phase 7, or the remaining Phase 0 leftovers) needs a real decision from the owner about scope and priority, not another "pick the next item."

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

## Analytics store: done

- `api/src/reports/bigquery-exporter.ts` + `analytics-export.services.ts` (`BigQueryExporter`, `AnalyticsExportService`), sibling files in the existing `reports` module/`analytics` catalog key. `POST /analytics/export/run` streams each report source's rows (reusing the Report builder's registry) into one BigQuery table per tenant+source. See `CLAUDE.md` §9's Analytics store domain note before touching this.
- New API dependency: `@google-cloud/bigquery`. No new `npm audit` findings (still just the two pre-existing `exceljs`/`uuid` ones, already assessed).
- `BigQueryExporter` follows `EmailSender`'s exact pattern: no `BIGQUERY_DATASET` env var means log-and-no-op — this project has no real GCP project wired up anywhere, including CI, so that's the path every test and every environment today actually takes.
- No web UI (this is a data pipe for an external BI tool, not an ERP screen, per the blueprint).
- Tests: `api/test/http/analytics-export.spec.ts` (3 tests).
- Not built, each a documented scope cut: actual forecasting (out of scope for "get the data somewhere"), per-tenant datasets (one shared dataset, per-tenant tables, to avoid per-tenant GCP provisioning), a typed BigQuery schema per source (one JSON column for now).

## AI assistant: done

- `api/src/ai/` (`AiAssistantService`): `POST /ai/assistant/ask`, a short Claude tool-use loop (model `claude-sonnet-5-5`, via a new `@anthropic-ai/sdk` dependency) with two tools — `run_report` (the Report builder's engine, ad-hoc) and `my_work_summary` (existing approvals/notifications services). Every tool call runs with the asking user's own permissions, so the assistant never sees more than that user already could. See `CLAUDE.md` §9's AI assistant domain note before touching this.
- No `ANTHROPIC_API_KEY` set means a friendly not-configured answer (the `EmailSender`/`BigQueryExporter` pattern again) — the path this project's own tests and CI take.
- **Flipping `ai` to `available: true` broke `test/http/guards.spec.ts`'s hard-coded example a third time** — it now points at `integrations`, the last `false` module in the `intelligence` group.
- Web: `web/src/modules/ai/assistant.tsx`, a one-page chat at `/ai`, a sidebar entry.
- Tests: `api/test/http/ai.spec.ts` (3 tests).
- Not built, each a documented scope cut: AI insights/agents (the next two plan items), more tools (each needs a registered report source first), multi-turn memory (each `ask` is stateless).

## AI document processing: done

- `api/src/ai/document-extraction.*` + `document-extractor.services.ts` (`DocumentExtractionService`, `DocumentExtractorService`): `POST /ai/document-extractions` takes a base64 file + doc type, forces one Claude tool call against a per-doc-type schema, and stores the structured result for review. See `CLAUDE.md` §9's AI document processing note before touching this — **important finding there**: the backend has no existing path to read an uploaded file's bytes (Files/R2 only ever gives the client a presigned URL), which is why this feature takes the file directly rather than reusing Files.
- `PATCH :id` is the review step (`reviewedData`); `POST :id/create-draft` only supports `docType: "receipt"` → an expense claim draft. The other four doc types (invoice, purchase_order, cv, bank_statement) extract and review but return a clear 400 on `create-draft`, not a silent no-op.
- Web: `web/src/modules/ai/document-extraction.tsx` (list/record with a JSON review textarea and a create-draft dialog), a dedicated upload page at `/ai/document-extractions/new`, a sidebar entry.
- Tests: `api/test/http/document-extraction.spec.ts` (2 tests).

## AI insights: done

- `api/src/ai/insights.services.ts` (`InsightsService`), `GET /ai/insights/run`. Two deterministic signals (sales decline month-over-month, expense-claim anomalies past 2.5x average), reusing `ReportingEngineService.rowsFor()`; an optional one-paragraph Claude narration with a plain-joined-messages fallback when unconfigured. See `CLAUDE.md` §9's AI insights note.
- Web: `web/src/modules/ai/insights.tsx`, page at `/ai/insights`, sidebar entry.
- Tests: `api/test/http/insights.spec.ts` (2 tests).
- Not built, each a documented scope cut: demand/cash-flow/supplier/project-risk signals (each needs an unregistered report source), real time-series forecasting.

## AI agents: done

- `api/src/ai/agents.services.ts` (`AiAgentService`, `AgentActionStore`), `POST /ai/agents/act`. Two tiers wired up with one example action each: `notify_user` (low-risk, executes immediately) and `create_requisition` (approval-required, routes through the existing generic workflow/approval engine exactly like `PurchaseOrderService.submit()` does, auto-approving when no workflow is configured). See `CLAUDE.md` §9's AI agents note before touching this.
- Every call is audited regardless of tier; a baseline `ai.agents.act` permission plus a per-action tier permission, checked inside the service (not a single static route permission).
- No new web screen — a pending approval already surfaces in the existing generic My Work / approvals inbox.
- Tests: `api/test/http/agents.spec.ts` (3 tests, including a full pending → approve → executed round trip).
- Not built, each a documented scope cut: a larger action catalog, a distinct `recommend` tier (folded into `read_only` — nothing yet needs them to differ).

**All four AI items (blueprint §28) are now done.** This closes out the AI Layer entirely.

## API platform: done

- `api/src/platform/api-keys/` + `api/src/platform/webhooks/` (new shared-kernel features, registered in `PlatformModule`, not a domain module). `common/guards/jwt-auth.guard.ts` (the global guard) now also accepts an `x-api-key` header, so every existing `/api/v1/...` route already works with a scoped API key — no per-route changes needed. See `CLAUDE.md` §9's API platform note (and the new §10 review-hotspot entry) before touching the guard again.
- Rate limiting is a per-process in-memory sliding window (not distributed). Webhooks subscribe to the same ~20 domain event types Automation knows about (an independent second copy of that list, since `platform/` must not depend on a domain module) and deliver via the job queue, recording delivery status/error on the webhook record.
- **Flipping `integrations` to `available: true` means every catalog module is now available** — `test/http/guards.spec.ts`'s module-switch test now checks against a literal nonexistent key instead of a real "not yet available" module, since there isn't one left; this should be stable going forward.
- Web: `web/src/modules/platform/integrations.tsx` (API keys and webhooks list/record), dedicated create pages at `/settings/api-keys/new` (shows the secret once) and `/settings/webhooks/new`, sidebar entries under Settings.
- Tests: `api/test/http/api-platform.spec.ts` (4 tests). The full suite was re-run after this item specifically because it touches the global auth guard, not just the usual new-tests check.
- Not built, each a documented scope cut: OAuth clients, a detailed per-request log, a separate usage dashboard.

## Integrations: partly done (SMS/WhatsApp only)

- `api/src/platform/notifications/sms.sender.ts` (`SmsSender`), alongside the existing `EmailSender`. `NotifyInput.textChannel` ("sms" | "whatsapp") is an explicit per-call opt-in; AR dunning (`finance/ar-extras.ts`) uses it from dunning level 2 onward as a real, working example. `NotificationPreferencesDoc.muted.text` follows the existing `inApp`/`email` shape. No `TWILIO_*` env vars means log-and-no-op. See `CLAUDE.md` §9's Integrations note before touching this.
- No web screen (there wasn't one for the existing email/in-app preferences either — a pre-existing gap, not a regression here).
- Tests: `api/test/http/notifications-channels.spec.ts` (1 test) plus the existing `ar-extras.spec.ts` dunning test, which already exercises the new code path.
- **The rest of this plan item is real, substantial, undone work**: payment gateways (Stripe/PayPal — a payment-intent lifecycle plus a signed inbound webhook), bank feeds (needs its own "bank transaction import" entity — AI document processing's `bank_statement` extraction gives a partial head start, reviewed data but no draft-creation path yet), push notifications (no device-token storage or FCM/APNs wiring exists), Google Workspace/Microsoft 365 (OAuth app registration; Calendar sync specifically already cut in the Calendar note), e-commerce order import (no inbound-webhook-to-draft-order mapping), courier tracking (no mapping/routing/carrier API integration anywhere in this codebase, the same gap Logistics' own note names). **The plan checkbox was deliberately left unchecked, not ticked with a scope note** — unlike every other item this phase, most of what this one names is still undone.

## Mobile / PWA: done

- Entirely in `web/`, no backend changes: `web/src/app/manifest.ts`, `public/icon.svg`, `public/sw.js` (registered in production only — never in dev, to avoid fighting Turbopack's hot reload with a stale cached bundle), and an `/offline` fallback page. See `CLAUDE.md` §9's Mobile/PWA note before touching this.
- The "focused flows" blueprint §37 names were already built in Phase 4/5 (warehouse scanning, driver routes, managers' approvals via My Work) — this item is purely the installability/offline wrapper, not a parallel mobile build.
- The service worker never caches `/api/...` responses — only the offline fallback page for navigations — since stale cached ERP data served while "offline" would be misleading, not helpful.
- No new tests (nothing to test at the HTTP level; verified via `tsc`/`eslint`/`next build` only, per this project's usual web-verification approach with no browser available here).

**Phase 6 is now effectively complete** (10 of 11 items fully done, Integrations partly done). This is a natural stopping point.

## Sales analytics: done (Phase 1 is now fully closed out)

- `SalesAnalyticsService` in `api/src/sales/sales.services.ts`, `GET /sales/analytics` — mirrors the exact shape CRM's and Procurement's own analytics services already use. See `CLAUDE.md` §9's Sales analytics note before touching this (in particular: revenue is net of tax/discount, not the order's tax-inclusive total; margin is an estimate from each product's current purchase price, not a historical cost snapshot; there's no "by branch" breakdown since neither orders nor accounts carry a branchId anywhere in this codebase).
- Web: `/sales` (previously no overview page existed there), mirroring `/crm`'s dashboard layout.
- Tests: `api/test/http/sales-analytics.spec.ts` (2 tests).

**Phase 1 is now fully done.** Only Phase 0 has real leftovers now: record-level scope, audit trail writes from every service, an import/export framework, and the dashboard-widget framework (this last one is arguably superseded in spirit by the Dashboard builder already shipped in Phase 6, though it was scoped as a Phase 0 "framework" item specifically — worth a quick look before assuming it's actually still needed as originally written).

## If picking this up cold

1. Phase 6 is done except for the rest of Integrations (payment gateways, bank feeds, push notifications, Google Workspace/Microsoft 365, e-commerce order import, courier tracking — see the Integrations section above for what's genuinely still needed for each). None of these are "pick the next checkbox and go" — each needs a real decision from the owner about priority and, for most, actual third-party credentials/accounts this environment doesn't have.
2. Phase 1 is fully done. The alternative is Phase 7 (Hardening and 1.0: security, reliability, performance, accessibility, industry templates, data migration tooling, a documentation pass, then the 1.0.0 release) or the remaining Phase 0 leftovers (record-level scope, audit trail, import/export, dashboard framework).
3. **Check with the owner before starting any of the above** — don't default to "keep picking the next unchecked item" the way earlier phases did; that convention applied while Phases 0–6 were a well-defined, mostly-buildable backlog. What's left now is genuinely a set of different, larger decisions — record-level scope in particular is a codebase-wide architectural change (CLAUDE.md §10 calls it out as the single most consistently-flagged gap), not a bounded single-module item like everything built this session.
4. Don't release yet. Follow `docs/runbooks/release.md` when told to.

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
