# Handoff — STTPS ERP build-out

This file tracks exactly where the autonomous build-out stands, for picking the work back up in a new session (including a plain terminal `claude` session, which has no memory of prior conversations). Read this file, then `CLAUDE.md` in full, before touching anything.

**Last updated:** 2026-11-20, after finishing Quality (API + web, a port of the legacy module) and pushing to `develop`.

## Standing instructions (apply to all future work here, not just this item)

- Work goes straight to `develop`. One squash-merged release PR to `main` happens only when the whole implementation plan is done — not before.
- **Do not stop to ask for approval between items.** Build end-to-end (API → tests → web → docs → commit → push → verify CI), then move to the next unchecked item without pausing to summarize-and-wait. This was an explicit, emphatic correction from the owner earlier in the build — see the `feedback_autonomous_continuation` memory.
- No AI attribution anywhere (commit messages, PR text, code comments) — see global `CLAUDE.md` rules (`C:\Users\Saad\.claude\CLAUDE.md`).
- Before each commit: `tsc --noEmit`, `eslint`, the full API test suite, and for web changes `tsc --noEmit` + `eslint` + `next build`. All must be clean.
- **Run `npm test` / `vitest` via the PowerShell tool, not Bash.** Git Bash's lowercase-drive-letter cwd (`c:/Work/...`) crashes vitest's module runner on this machine with a confusing `TypeError: Cannot read properties of undefined (reading 'config')`. This is NOT a real dependency problem — don't touch `vite`'s version over it. See `CLAUDE.md` §8.
- After every push: `gh run list --branch develop --limit 3` then `gh run watch <id> --exit-status` to confirm CI is actually green, not just that it started.
- Update `CHANGELOG.md`, `docs/IMPLEMENTATION-PLAN.md` (tick the checkbox with an honest scope note — what's built, what's deliberately not, and why) and `CLAUDE.md` (§1 status line, §5 index budget if it changed, a domain note in §9) **only once an item is actually complete** (API + web + tests).
- **Delete the matching `api/legacy/<mod>` and `web/legacy/<mod>` folders in the same commit that finishes rebuilding a module** (CLAUDE.md §3, step 7 of the module checklist in §5). This was missed once for Manufacturing's API-only commit — check for it explicitly on every remaining Phase 5 module by running `ls api/legacy web/legacy` fresh each time, never from memory of what used to be there (the tree shrinks every time a module is rebuilt). **A module explicitly called a "port" in the plan (Quality was; EHS probably is too, given its description) means the legacy code is a real reference this time** — read it in full before writing anything new, then still rebuild against this codebase's Firestore/MasterDataService patterns rather than translating it line-by-line, and still delete it once done. Don't assume every legacy entity needs porting: Quality's legacy module had a separate "Audit" entity that isn't in the blueprint's Quality subsection, so it was dropped — check the blueprint section, not just the legacy schema, for what's actually in scope.

## Firestore composite-index budget — read before adding any `large:` list

Firestore's real ceiling is **200 composite indexes per database**. Current count: **196/200** (`node -e "console.log(require('./firestore.indexes.json').indexes.length)"` from the repo root — note: the file lives at the repo root, not inside `api/`). Only **4 slots left.**

The owner was asked how to spend the remaining slots across the rest of Phase 5 (EHS, Warehouse, POS, Logistics, Marketing — several of which have a plausibly high-volume core entity) and chose: **"Spend it, prioritized"** — give `large` only to the single most genuinely high-volume entity per module, in build order, until the budget runs out; every later module gets a small, bounded list with a documented risk note (the same pattern Calendar/Maintenance/Asset-audits already used). Do not ask again; this is a standing decision for the rest of Phase 5. **With only 4 slots left, at most 4 more modules can get the one-index `large` treatment — if EHS, Warehouse, POS and Logistics each take one, Marketing gets none; raise that tradeoff explicitly when it actually comes up (don't pre-decide it now), and double-check the running count before every `largeListIndexes` addition from here on.**

The cost-minimizing trick, now used twice (`ProductionOrderDoc`, `InspectionDoc`), costing exactly **1** index each, not 2+: give the `large` spec **zero indexed filters**, just the default sort —

```ts
{ filters: [], sorts: [{ field: "createdAt", direction: "desc" }] }
```

— and let any other useful filter (`status`, `productId`, etc.) stay in `filterFields` only, served by the in-memory over-fetch path in `queryList`. Reuse this exact shape for the next high-volume entity (candidates, in order of how likely they are to need it: POS sale transactions, Logistics delivery orders, Warehouse picking tasks) rather than the older multi-filter `large` specs other modules used when the budget wasn't tight. **Remember to actually register the new `largeListIndexes(...)` call in `api/src/platform/data/indexes.ts`** (import the collection/list constants, add one line near the bottom) **and run `npm run indexes` from `api/`** — this was missed once for Quality's first pass (the service declared `large` but the index was never added to the registry, so the count silently stayed unchanged; caught only by manually re-checking the count after generating, not by any test) before the index was actually wired in.

## Current state of the implementation plan

- **Phases 0–4: complete** (pushed, CI green). Phase 4 finished with Support desk, Customer portal, and Document management.
- **Phase 5 ("Advanced operations", `docs/IMPLEMENTATION-PLAN.md` around line 248): in progress.**
  - **Manufacturing (§17) — done, API + web.**
  - **MRP — done, API + web.**
  - **Quality (§17) — done, API + web.** A port of the legacy module (minus its out-of-scope Audit entity). Ticked in the plan, changelog and `CLAUDE.md` §9 entries added, legacy folders deleted.
  - **EHS — not started. This is the immediate next task.**
  - After EHS: Warehouse management (§8), POS (§20), Logistics and fleet (§18), Marketing (§19) — not started, in that plan order.

## Manufacturing, MRP and Quality: what was built (for reference, all three items are finished)

**Manufacturing** (`api/src/manufacturing/`): `WorkCentreService`, `MachineService` (small-list master data); `BomService`, `RoutingService` (versioned per product via `revision` — **not** `BaseDoc.version` — draft→active→obsolete, variable-length lines/operations added via PATCH); `ProductionOrderService` (the one `large` list, zero indexed filters; release→start→recordOutput/completeOperation/logDowntime→completed, plus cancel). Material issue/output tracked for costing only, not posted to Inventory or the GL.

**MRP** (`api/src/manufacturing/manufacturing-mrp.*`, same module/catalog key as Manufacturing — not its own module, like Payroll under `hr`): `DemandForecastService` and `MrpService`. `ManufacturingModule` `imports: [InventoryModule, SalesModule, ProcurementModule]`. `POST /manufacturing/mrp-runs` nets demand against `onHand + onOrder + existing production orders`, explodes a shortage's BOM **one level**, and suggests planned production or purchases, each convertible or dismissable. Full netting-formula reasoning is in `CLAUDE.md` §9.

**Quality** (`api/src/quality/`, its own module and catalog key — a genuinely separate blueprint section, unlike MRP): `InspectionPlanService` (checklist items, optionally scoped to a product/stage), `InspectionService` (created against a plan, completed with per-item responses that auto-derive the overall result, or cancelled), `NonConformanceService` (corrective/preventive actions through to closure). `InspectionDoc` is the one `large` list. Links to GRNs/production/anything else reuse the generic related-records feature, not bespoke fields — see `CLAUDE.md` §9's Quality note for what was deliberately dropped from the legacy port (the Audit entity) and why.

Web (`web/src/modules/manufacturing/*`, `web/src/modules/quality/*`): all three items have full list/record screens, sidebar entries, and the variable-length array-field editor pattern (BOM lines, routing operations, plan checklist items) established in Manufacturing and reused as-is in Quality.

Tests: `api/test/http/{manufacturing,manufacturing-mrp,quality}.spec.ts` (7 + 6 + 8 tests). Fixing a collateral regression: adding Quality (`available: true`) broke `guards.spec.ts`'s "module not available yet" negative test, which had hard-coded `quality` as its example of a not-yet-available module — fixed by swapping it to `ehs` (still `available: false`); **if EHS is the next module built, that test will need the same fix again, swapped to whichever module is still unavailable at the time** (check `api/src/platform/modules/catalog.ts` for one, don't assume `ehs` stays available forever). Full suite re-run clean (236 tests) before the Quality commit. Web has no component tests (no browser available in this environment) — verified by `tsc --noEmit` + `eslint` (0 errors) + `next build` only, per CLAUDE.md §6.

Docs updated: `docs/IMPLEMENTATION-PLAN.md` checkboxes ticked with scope notes (all three items), `CHANGELOG.md` `### Added` entries, `CLAUDE.md` §1 status line, §5 index-budget narrative (now 196/200, 4 left), and domain notes in §9 for each item.

## EHS: what to build next

Read the plan line in full before starting (`docs/IMPLEMENTATION-PLAN.md`, Phase 5). As of this handoff it hadn't been re-read this session — do that first, along with `docs/BLUEPRINT.md`'s EHS section (search for "EHS" or "Health & Safety" — it may be numbered differently from §17, the way Quality turned out to be a subsection rather than its own top-level number; don't assume a section number without checking). The catalog stub is `mod({ key: "ehs", name: "Health & Safety", description: "Incidents, risk assessments and permits to work.", group: "advanced", available: false })` (`api/src/platform/modules/catalog.ts`) — that description is the closest thing to a scope summary that exists before reading the blueprint properly.

Read `api/legacy/ehs` and `web/legacy/ehs` in full before writing anything new — check first whether the plan or the legacy folder's shape calls this a "port" the way Quality explicitly was; either way, the legacy code is useful reference for entity shape, but rebuild against this codebase's Firestore/MasterDataService patterns, don't translate it line-by-line.

Likely shape, to validate against the blueprint and legacy code rather than taken as fixed:
- Incidents: report → investigate → root cause → corrective actions → closure. Likely close in shape to Quality's `NonConformanceService` (actions array, severity, closure) — check whether that's close enough to justify copying the pattern directly.
- Risk assessments: hazard identification, likelihood/severity scoring, controls, review dates.
- Permits to work: a permit type, validity window, sign-off, maybe linked to a work order (Maintenance) or production order (Manufacturing) via the generic related-records feature — not a bespoke link field, following the Documents/Quality precedent.
- Firestore index budget: only **4 slots left** total across EHS, Warehouse, POS, Logistics and Marketing — think hard before giving EHS's most likely high-volume entity (probably Incidents) a `large` list; it may not need one if incident volume is genuinely low relative to, say, POS transactions. Read the budget section above in full and update the running count honestly once decided.
- Remember to actually wire `largeListIndexes(...)` into `api/src/platform/data/indexes.ts` and run `npm run indexes` if a `large` list is added — this was missed on the first pass for Quality (see the budget section above).
- Check `guards.spec.ts`'s "module not available yet" test (`test/http/guards.spec.ts`, search for `.set(as("admin")).send({ enabled: true }).expect(400)`) — if EHS becomes `available: true`, that test needs its hard-coded module key swapped to whatever's still unavailable at the time (check the catalog first, don't assume).

Build it the same end-to-end way as every other item: API (models + DTOs + services + controller + module + catalog permissions + indexes if any), tests (`api/test/http/ehs.spec.ts`), web screens, docs, commit, push, verify CI, delete `api/legacy/ehs` and `web/legacy/ehs`, update this file.

## Where to find things

- Blueprint (source of truth for scope): `docs/BLUEPRINT.md`.
- Plan checkboxes (source of truth for what's done): `docs/IMPLEMENTATION-PLAN.md`.
- Conventions, patterns, module checklist, domain notes, review hotspots: `CLAUDE.md` (repo root). **Read this in full before writing any code** — it is kept deliberately current and is denser than this file.
- Global rules (git workflow, no AI attribution): `C:\Users\Saad\.claude\CLAUDE.md`.
- Persistent cross-session memory: `C:\Users\Saad\.claude\projects\C--Work-STTPS-STTPS-ERP\memory\` (`MEMORY.md` is the index). Relevant entries: `sttps-erp-build.md` (this project), `feedback_autonomous_continuation.md` (the "don't stop between items" correction).
