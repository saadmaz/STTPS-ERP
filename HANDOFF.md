# Handoff — STTPS ERP build-out

This file tracks exactly where the autonomous build-out stands, for picking the work back up in a new session (including a plain terminal `claude` session, which has no memory of prior conversations). Read this file, then `CLAUDE.md` in full, before touching anything.

**Last updated:** 2026-11-20, after finishing MRP (API + web) and pushing to `develop`.

## Standing instructions (apply to all future work here, not just this item)

- Work goes straight to `develop`. One squash-merged release PR to `main` happens only when the whole implementation plan is done — not before.
- **Do not stop to ask for approval between items.** Build end-to-end (API → tests → web → docs → commit → push → verify CI), then move to the next unchecked item without pausing to summarize-and-wait. This was an explicit, emphatic correction from the owner earlier in the build — see the `feedback_autonomous_continuation` memory.
- No AI attribution anywhere (commit messages, PR text, code comments) — see global `CLAUDE.md` rules (`C:\Users\Saad\.claude\CLAUDE.md`).
- Before each commit: `tsc --noEmit`, `eslint`, the full API test suite, and for web changes `tsc --noEmit` + `eslint` + `next build`. All must be clean.
- **Run `npm test` / `vitest` via the PowerShell tool, not Bash.** Git Bash's lowercase-drive-letter cwd (`c:/Work/...`) crashes vitest's module runner on this machine with a confusing `TypeError: Cannot read properties of undefined (reading 'config')`. This is NOT a real dependency problem — don't touch `vite`'s version over it. See `CLAUDE.md` §8.
- After every push: `gh run list --branch develop --limit 3` then `gh run watch <id> --exit-status` to confirm CI is actually green, not just that it started.
- Update `CHANGELOG.md`, `docs/IMPLEMENTATION-PLAN.md` (tick the checkbox with an honest scope note — what's built, what's deliberately not, and why) and `CLAUDE.md` (§1 status line, §5 index budget if it changed, a domain note in §9) **only once an item is actually complete** (API + web + tests).
- **Delete the matching `api/legacy/<mod>` and `web/legacy/<mod>` folders in the same commit that finishes rebuilding a module** (CLAUDE.md §3, step 7 of the module checklist in §5). This was missed for Manufacturing's API-only commit and only caught and fixed once the web half landed too — check for this explicitly on every remaining Phase 5 module. MRP needed no separate check (it lives inside the already-handled `manufacturing` legacy folder, already deleted). Quality, EHS, Warehouse (`eam`/`fsm`-adjacent?), POS, Logistics and Marketing each still need their own check against `api/legacy/` and `web/legacy/`'s **current** contents (`ls api/legacy web/legacy`), not assumed from memory — the legacy tree shrinks every time a module is rebuilt, so don't trust an old mental list of what's in there.

## Firestore composite-index budget — read before adding any `large:` list

Firestore's real ceiling is **200 composite indexes per database**. Current count: **195/200**, unchanged by Manufacturing or MRP's web work (`node -e "console.log(require('./firestore.indexes.json').indexes.length)"` from the repo root — note: the file lives at the repo root, not inside `api/`).

The owner was asked how to spend the remaining ~5 slots across the rest of Phase 5 (Quality, EHS, Warehouse, POS, Logistics, Marketing — several of which have a plausibly high-volume core entity) and chose: **"Spend it, prioritized"** — give `large` only to the single most genuinely high-volume entity per module, in build order, until the budget runs out; every later module gets a small, bounded list with a documented risk note (the same pattern Calendar/Maintenance/Asset-audits already used). Do not ask again; this is a standing decision for the rest of Phase 5.

The cost-minimizing trick already applied to `ProductionOrderDoc` (cost: **1** index, not 2+): give its `large` spec **zero indexed filters**, just the default sort —

```ts
{ filters: [], sorts: [{ field: "createdAt", direction: "desc" }] }
```

— and let any other useful filter (`status`, `productId`, etc.) stay in `filterFields` only, served by the in-memory over-fetch path in `queryList`. Reuse this exact shape for the next high-volume entity (candidates, in order of how likely they are to need it: POS sale transactions, Logistics delivery orders, Warehouse picking tasks, Quality inspections) rather than the older multi-filter `large` specs other modules used when the budget wasn't tight. MRP's own two new collections (`DemandForecastDoc`, `MrpRunDoc`) are both plain small master-data lists, not `large` — neither is a per-event high-volume collection, so the budget is still untouched at 195/200.

## Current state of the implementation plan

- **Phases 0–4: complete** (pushed, CI green). Phase 4 finished with Support desk, Customer portal, and Document management.
- **Phase 5 ("Advanced operations", `docs/IMPLEMENTATION-PLAN.md` around line 248): in progress.**
  - **Manufacturing (§17) — done, API + web.**
  - **MRP — done, API + web.** Ticked in the plan, changelog and `CLAUDE.md` §9 entries added.
  - **Quality (§17) — not started. This is the immediate next task.**
  - After Quality: EHS, Warehouse management (§8), POS (§20), Logistics and fleet (§18), Marketing (§19) — not started, in that plan order.

## Manufacturing and MRP: what was built (for reference, both items are finished)

API (`api/src/manufacturing/`): `WorkCentreService`, `MachineService` (small-list master data); `BomService`, `RoutingService` (versioned per product via `revision` — **not** `BaseDoc.version` — draft→active→obsolete, variable-length lines/operations added via PATCH, `activate()` refuses zero lines/operations); `ProductionOrderService` (the one `large` list, zero indexed filters; resolves active BOM/routing, computes material requirements with scrap via `extend()`/`applyRate()`, snapshots routing operations; lifecycle release→start→recordOutput/completeOperation/logDowntime→completed, plus cancel). Material issue/output tracked for costing only, not posted to Inventory or the GL (same gap as Maintenance, documented).

MRP (`api/src/manufacturing/manufacturing-mrp.*`, sibling-file split like `hr-attendance.*`, same `manufacturing` catalog module — not its own module, same reasoning as Payroll under `hr`): `DemandForecastService` (small master data, a qty per product/month) and `MrpService`. `ManufacturingModule` now `imports: [InventoryModule, SalesModule, ProcurementModule]` to reach `InventoryReports`, `OrderService` and `RequisitionService`. `POST /manufacturing/mrp-runs` (the generic create route, not a separate "run" action) nets open sales-order and forecast demand against `onHand + onOrder + existing planned/released/in-progress production orders`, explodes a shortage's active BOM **one level** into component demand, and suggests a planned production order or planned purchase per shortage — each convertible (creates a real `ProductionOrderDoc` or `RequisitionDoc`, two sequential operations, not one transaction) or dismissable. Full reasoning, including why `onHand` and not `onHand − reserved` is used for netting, is in `CLAUDE.md` §9's MRP note — read that before changing `MrpService.computePlan`.

Web (`web/src/modules/manufacturing/{config,screens}.tsx`): plain CRUD for work centres/machines/demand forecasts; BOMs and routings with a variable-length line/operation editor (local row state, add/remove buttons, one "Save" PATCHing the whole array with `If-Match`) plus activate/obsolete actions; production orders with release/start/record-output/complete-operation/log-downtime/cancel actions and a read-only materials/operations breakdown; MRP runs with a demand table and planned-production/planned-purchase tables, each suggested line getting Convert/Dismiss buttons.

Tests: `api/test/http/manufacturing.spec.ts` (7 tests) and `api/test/http/manufacturing-mrp.spec.ts` (6 tests, new). Full suite re-run clean (228 tests) before the MRP commit. Web has no component tests (no browser available in this environment) — verified by `tsc --noEmit` + `eslint` (0 errors) + `next build` only, per CLAUDE.md §6.

Docs updated: `docs/IMPLEMENTATION-PLAN.md` checkboxes ticked with scope notes (both items), `CHANGELOG.md` `### Added` entries, `CLAUDE.md` §1 status line and two new §9 domain notes.

## Quality: what to build next

Read the plan line in full before starting (`docs/IMPLEMENTATION-PLAN.md`, Phase 5): *"Quality (§17): inspection plans, incoming, in-process and finished inspections, sampling, defects, non-conformance and CAPA, linked to GRNs and production. Port of the quality module."* Also read `docs/BLUEPRINT.md`'s §17 quality section and `api/legacy/quality` / `web/legacy/quality` in full before writing anything new — this one is explicitly called a **port**, unlike Manufacturing/MRP which were built fresh, so the legacy Prisma-era code is a real reference this time, not just something to delete. Still never import from it directly; read it for the shape, then rebuild against this codebase's Firestore/MasterDataService patterns.

Likely shape, to validate against the blueprint and the legacy code rather than taken as fixed:
- Inspection plans: master data per product (or product category) defining what to check and sampling rules.
- Inspections: incoming (linked to a `GoodsReceiptDoc` from Procurement), in-process (linked to a `ProductionOrderDoc`/operation from Manufacturing) and finished-goods inspections, each with pass/fail per characteristic and an overall result.
- Defects and non-conformance records, with a CAPA (corrective and preventive action) workflow — check whether the existing generic `ApprovalsService` fits CAPA sign-off, the way Documents/Quotes reuse it, before building a bespoke workflow.
- Cross-module links: `ProcurementModule` (for GRN-linked incoming inspection) and `ManufacturingModule`/`TasksModule`-equivalent (for in-process). Check for import cycles the same way MRP's `imports: [InventoryModule, SalesModule, ProcurementModule]` was checked — Quality importing Procurement and Manufacturing should be fine (neither imports back), but verify before writing the module file.
- Firestore index budget: almost certainly needs at least one `large` list (inspections are plausibly high-volume, one per GRN line or production order). Use the zero-indexed-filter trick from the budget section above, and update the budget section here once spent.

Build it the same end-to-end way as every other item: API (models + DTOs + services + controller + module + catalog permissions + indexes if any), tests (`api/test/http/quality.spec.ts`), web screens, docs, commit, push, verify CI, delete `api/legacy/quality` and `web/legacy/quality`, update this file.

## Where to find things

- Blueprint (source of truth for scope): `docs/BLUEPRINT.md`.
- Plan checkboxes (source of truth for what's done): `docs/IMPLEMENTATION-PLAN.md`.
- Conventions, patterns, module checklist, domain notes, review hotspots: `CLAUDE.md` (repo root). **Read this in full before writing any code** — it is kept deliberately current and is denser than this file.
- Global rules (git workflow, no AI attribution): `C:\Users\Saad\.claude\CLAUDE.md`.
- Persistent cross-session memory: `C:\Users\Saad\.claude\projects\C--Work-STTPS-STTPS-ERP\memory\` (`MEMORY.md` is the index). Relevant entries: `sttps-erp-build.md` (this project), `feedback_autonomous_continuation.md` (the "don't stop between items" correction).
