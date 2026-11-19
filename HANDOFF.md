# Handoff — STTPS ERP build-out

This file tracks exactly where the autonomous build-out stands, for picking the work back up in a new session (including a plain terminal `claude` session, which has no memory of prior conversations). Read this file, then `CLAUDE.md` in full, before touching anything.

**Last updated:** 2026-11-20, after finishing Manufacturing's web screens (API was already done) and pushing to `develop`.

## Standing instructions (apply to all future work here, not just this item)

- Work goes straight to `develop`. One squash-merged release PR to `main` happens only when the whole implementation plan is done — not before.
- **Do not stop to ask for approval between items.** Build end-to-end (API → tests → web → docs → commit → push → verify CI), then move to the next unchecked item without pausing to summarize-and-wait. This was an explicit, emphatic correction from the owner earlier in the build — see the `feedback_autonomous_continuation` memory.
- No AI attribution anywhere (commit messages, PR text, code comments) — see global `CLAUDE.md` rules (`C:\Users\Saad\.claude\CLAUDE.md`).
- Before each commit: `tsc --noEmit`, `eslint`, the full API test suite, and for web changes `tsc --noEmit` + `eslint` + `next build`. All must be clean.
- **Run `npm test` / `vitest` via the PowerShell tool, not Bash.** Git Bash's lowercase-drive-letter cwd (`c:/Work/...`) crashes vitest's module runner on this machine with a confusing `TypeError: Cannot read properties of undefined (reading 'config')`. This is NOT a real dependency problem — don't touch `vite`'s version over it. See `CLAUDE.md` §8.
- After every push: `gh run list --branch develop --limit 3` then `gh run watch <id> --exit-status` to confirm CI is actually green, not just that it started.
- Update `CHANGELOG.md`, `docs/IMPLEMENTATION-PLAN.md` (tick the checkbox with an honest scope note — what's built, what's deliberately not, and why) and `CLAUDE.md` (§1 status line, §5 index budget if it changed, a domain note in §9) **only once an item is actually complete** (API + web + tests).
- **Delete the matching `api/legacy/<mod>` and `web/legacy/<mod>` folders in the same commit that finishes rebuilding a module** (CLAUDE.md §3, step 7 of the module checklist in §5). This was missed for Manufacturing's API-only commit and only caught and fixed once the web half landed too — check for this explicitly on every remaining Phase 5 module (MRP folds into the existing `manufacturing` legacy folder question — there isn't one; Quality, EHS, Warehouse (`eam`/`fsm`-adjacent?), POS, Logistics and Marketing each need their own check against `api/legacy/` and `web/legacy/`'s current contents, not assumed from memory).

## Firestore composite-index budget — read before adding any `large:` list

Firestore's real ceiling is **200 composite indexes per database**. Current count: **195/200** (`node -e "console.log(require('./firestore.indexes.json').indexes.length)"` from the repo root — note: the file lives at the repo root, not inside `api/`).

The owner was asked how to spend the remaining ~5 slots across the rest of Phase 5 (MRP, Quality, EHS, Warehouse, POS, Logistics, Marketing — several of which have a plausibly high-volume core entity) and chose: **"Spend it, prioritized"** — give `large` only to the single most genuinely high-volume entity per module, in build order, until the budget runs out; every later module gets a small, bounded list with a documented risk note (the same pattern Calendar/Maintenance/Asset-audits already used). Do not ask again; this is a standing decision for the rest of Phase 5.

The cost-minimizing trick already applied to `ProductionOrderDoc` (cost: **1** index, not 2+): give its `large` spec **zero indexed filters**, just the default sort —

```ts
{ filters: [], sorts: [{ field: "createdAt", direction: "desc" }] }
```

— and let any other useful filter (`status`, `productId`, etc.) stay in `filterFields` only, served by the in-memory over-fetch path in `queryList`. Reuse this exact shape for the next high-volume entity (candidates, in order of how likely they are to need it: POS sale transactions, Logistics delivery orders, Warehouse picking tasks, Quality inspections) rather than the older multi-filter `large` specs other modules used when the budget wasn't tight.

## Current state of the implementation plan

- **Phases 0–4: complete** (pushed, CI green). Phase 4 finished with Support desk, Customer portal, and Document management.
- **Phase 5 ("Advanced operations", `docs/IMPLEMENTATION-PLAN.md` around line 248): in progress.**
  - **Manufacturing (§17) — done, API + web.** Ticked in the plan, changelog and `CLAUDE.md` §9 entries added, legacy folders (`api/legacy/manufacturing`, `web/legacy/manufacturing`) deleted.
  - **MRP — not started. This is the immediate next task.**
  - After MRP: Quality (§17), EHS, Warehouse management (§8), POS (§20), Logistics and fleet (§18), Marketing (§19) — not started, in that plan order.

## Manufacturing: what was built (for reference, this item is finished)

API (`api/src/manufacturing/`): `WorkCentreService`, `MachineService` (small-list master data); `BomService`, `RoutingService` (versioned per product via `revision` — **not** `BaseDoc.version` — draft→active→obsolete, variable-length lines/operations added via PATCH, `activate()` refuses zero lines/operations); `ProductionOrderService` (the one `large` list, zero indexed filters; resolves active BOM/routing, computes material requirements with scrap via `extend()`/`applyRate()`, snapshots routing operations; lifecycle release→start→recordOutput/completeOperation/logDowntime→completed, plus cancel). Material issue/output tracked for costing only, not posted to Inventory or the GL (same gap as Maintenance, documented).

Web (`web/src/modules/manufacturing/{config,screens}.tsx`, routes under `web/src/app/(platform)/manufacturing/[entity]/...`, sidebar entry): plain CRUD for work centres/machines; BOMs and routings with a new variable-length line/operation editor pattern (local row state, add/remove buttons, one "Save" PATCHing the whole array with `If-Match`) plus activate/obsolete actions; production orders with release/start/record-output/complete-operation/log-downtime/cancel actions and a read-only materials/operations breakdown in `extra()`.

Tests: `api/test/http/manufacturing.spec.ts` (7 tests, from the earlier API-only commit) — unchanged by the web work; full suite re-run clean (222 tests) before this commit. Web has no component tests (no browser available in this environment) — verified by `tsc --noEmit` + `eslint` (0 errors) + `next build` only, per CLAUDE.md §6.

Docs updated as part of this item: `docs/IMPLEMENTATION-PLAN.md` checkbox ticked with a scope note, `CHANGELOG.md` `### Added` entries (API + web), `CLAUDE.md` §1 status line and a new §9 domain note (`revision`-not-`version` gotcha, the zero-indexed-filter `large` trick, the new array-field editor pattern).

## MRP: what to build next

Read the plan line in full before starting: *"MRP: demand from orders and forecasts, net requirements, planned production orders and planned purchases that convert into requisitions, capacity view."* Also skim `docs/BLUEPRINT.md`'s manufacturing/MRP section (not yet re-read this session — do that first) and `api/legacy/` (already deleted for manufacturing, so check whether a separate `api/legacy/mrp`-ish area ever existed, e.g. inside the old manufacturing Prisma models, for reference only — never import from it).

Likely shape, to validate against the blueprint rather than taken as fixed:
- Demand sources: confirmed sales orders (open quantity not yet delivered) and, if the blueprint calls for it, a manual forecast entry per product/period.
- Net requirements: demand minus on-hand/on-order stock (read via Inventory's existing position query — don't duplicate stock logic) minus already-planned production, exploded through each product's active BOM (recursive for multi-level BOMs if the blueprint wants that depth; a single-level explosion may be a reasonable, documented scope cut otherwise).
- Output: planned production orders (probably a lighter-weight "planned" record distinct from `ProductionOrderDoc`, or a `status: "planned"` `ProductionOrderDoc` created directly — decide based on whether a planned order needs to differ in shape, and document the choice) and planned purchase requisitions that convert into real `PurchaseRequisition`s in Procurement (reuse `ProcurementModule`'s existing requisition creation path rather than inventing a new one).
- A capacity view: rough load per work centre from planned/released orders' routing operations against `WorkCentreDoc.capacityHoursPerDay` — likely read-only reporting, not a new scheduling engine.
- Watch for the Firestore transaction read-before-write rule and the index budget (see above) if MRP needs its own collection with a `large` list — it almost certainly doesn't need to be `large` itself (an MRP run's output rows are better modelled as ephemeral/regenerated-on-demand or small, not a per-event high-volume collection), but confirm that against the actual design before writing `platform/data/indexes.ts` changes.

Build it the same end-to-end way as every other item: API (service + DTOs + controller + module + catalog permissions + indexes if any), tests (`api/test/http/mrp.spec.ts` or folded into `manufacturing.spec.ts` if it stays in the same module — decide and note which), web screens, docs, commit, push, verify CI, update this file.

## Where to find things

- Blueprint (source of truth for scope): `docs/BLUEPRINT.md`.
- Plan checkboxes (source of truth for what's done): `docs/IMPLEMENTATION-PLAN.md`.
- Conventions, patterns, module checklist, domain notes, review hotspots: `CLAUDE.md` (repo root). **Read this in full before writing any code** — it is kept deliberately current and is denser than this file.
- Global rules (git workflow, no AI attribution): `C:\Users\Saad\.claude\CLAUDE.md`.
- Persistent cross-session memory: `C:\Users\Saad\.claude\projects\C--Work-STTPS-STTPS-ERP\memory\` (`MEMORY.md` is the index). Relevant entries: `sttps-erp-build.md` (this project), `feedback_autonomous_continuation.md` (the "don't stop between items" correction).
