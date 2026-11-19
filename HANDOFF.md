# Handoff — STTPS ERP build-out

This file tracks exactly where the autonomous build-out stands, for picking the work back up in a new session (including a plain terminal `claude` session, which has no memory of prior conversations). Read this file, then `CLAUDE.md` in full, before touching anything.

**Last updated:** 2026-11-20, after finishing EHS (API + web, a port of the legacy module) and pushing to `develop`.

## Standing instructions (apply to all future work here, not just this item)

- Work goes straight to `develop`. One squash-merged release PR to `main` happens only when the whole implementation plan is done — not before.
- **Do not stop to ask for approval between items.** Build end-to-end (API → tests → web → docs → commit → push → verify CI), then move to the next unchecked item without pausing to summarize-and-wait. This was an explicit, emphatic correction from the owner earlier in the build — see the `feedback_autonomous_continuation` memory.
- No AI attribution anywhere (commit messages, PR text, code comments) — see global `CLAUDE.md` rules (`C:\Users\Saad\.claude\CLAUDE.md`).
- Before each commit: `tsc --noEmit`, `eslint`, the full API test suite, and for web changes `tsc --noEmit` + `eslint` + `next build`. All must be clean.
- **Run `npm test` / `vitest` via the PowerShell tool, not Bash.** Git Bash's lowercase-drive-letter cwd (`c:/Work/...`) crashes vitest's module runner on this machine with a confusing `TypeError: Cannot read properties of undefined (reading 'config')`. This is NOT a real dependency problem — don't touch `vite`'s version over it. See `CLAUDE.md` §8.
- After every push: `gh run list --branch develop --limit 3` then `gh run watch <id> --exit-status` to confirm CI is actually green, not just that it started.
- Update `CHANGELOG.md`, `docs/IMPLEMENTATION-PLAN.md` (tick the checkbox with an honest scope note — what's built, what's deliberately not, and why) and `CLAUDE.md` (§1 status line, §5 index budget if it changed, a domain note in §9) **only once an item is actually complete** (API + web + tests).
- **Delete the matching `api/legacy/<mod>` and `web/legacy/<mod>` folders in the same commit that finishes rebuilding a module** (CLAUDE.md §3, step 7 of the module checklist in §5). Run `ls api/legacy web/legacy` fresh each time — don't assume from memory what's still there, since it shrinks with every module rebuilt. **A module called a "port" in the plan means the legacy code is real reference** — read it in full first, but still rebuild against this codebase's own patterns rather than translating line-by-line, and still check the blueprint (if one exists for that module — EHS had none at all, Quality did) for what's actually in scope before assuming every legacy entity needs porting.
- **Enabling a module (`available: true`) that `test/http/guards.spec.ts`'s "lists modules for navigation and protects module switches" test hard-codes as its not-yet-available example will break that test.** It's been bumped from `quality` → `ehs` → now `analytics` (in the `intelligence` group, well outside Phase 5's remaining list, chosen to stay stable longer) each time one more module went live. **Check `api/src/platform/modules/catalog.ts` for a module that's still `available: false` before assuming `analytics` is still safe**, and fix the test in the same commit if not.

## Firestore composite-index budget — read before adding any `large:` list

Firestore's real ceiling is **200 composite indexes per database**. Current count: **196/200** (`node -e "console.log(require('./firestore.indexes.json').indexes.length)"` from the repo root — the file lives at the repo root, not inside `api/`). Only **4 slots left.** EHS added zero (all three of its collections are small lists on purpose — see below).

The owner's standing decision for the rest of Phase 5 (Warehouse management, POS, Logistics and fleet, Marketing): **spend the remaining 4 slots prioritized**, one `large` list per module at most, only on the single most genuinely high-volume entity, using the zero-indexed-filter trick below; every other collection stays small with a documented risk note. Do not ask again. **With exactly 4 modules left and 4 slots left, if all four take one each there is nothing left over — raise it explicitly if a fifth ever seems to need one, don't just spend the last slot without checking the running count first.**

The cost-minimizing trick, used for `ProductionOrderDoc` and `InspectionDoc` (1 index each, not 2+):

```ts
{ filters: [], sorts: [{ field: "createdAt", direction: "desc" }] }
```

— any other useful filter (`status`, `productId`, etc.) stays in `filterFields` only, served by the in-memory over-fetch path in `queryList`. Likely candidates in priority order: POS sale transactions, Logistics delivery orders, Warehouse picking tasks. **Two steps are easy to forget and silently do nothing if skipped:** (1) register the new `largeListIndexes(...)` call in `api/src/platform/data/indexes.ts` (import the collection/list constants from the module's `.models.ts`, add one line), and (2) actually run `npm run indexes` from `api/` and commit the regenerated root `firestore.indexes.json`. Missing either one means the service declares `large` but the index was never generated — this happened once already on Quality's first pass, caught only by manually re-checking the index count after generating, not by any test failing.

## Current state of the implementation plan

- **Phases 0–4: complete** (pushed, CI green). Phase 4 finished with Support desk, Customer portal, and Document management.
- **Phase 5 ("Advanced operations", `docs/IMPLEMENTATION-PLAN.md` around line 248): in progress.**
  - **Manufacturing (§17) — done, API + web.**
  - **MRP — done, API + web.**
  - **Quality (§17) — done, API + web.** A port (minus the legacy's out-of-scope Audit entity).
  - **EHS — done, API + web.** A port (no blueprint section exists for this one — the plan line and legacy code were the only spec). Ticked in the plan, changelog and `CLAUDE.md` §9 entries added, legacy folders deleted.
  - **Warehouse management (§8) — not started. This is the immediate next task.**
  - After Warehouse: POS (§20), Logistics and fleet (§18), Marketing (§19) — not started, in that plan order.

## Manufacturing, MRP, Quality and EHS: what was built (for reference, all four items are finished)

**Manufacturing** (`api/src/manufacturing/`): work centres/machines (small-list master data); BOMs/routings (versioned per product via `revision`, **not** `BaseDoc.version`, draft→active→obsolete); production orders (the one `large` list, zero indexed filters; release→start→recordOutput/completeOperation/logDowntime→completed, plus cancel).

**MRP** (`api/src/manufacturing/manufacturing-mrp.*`, same module as Manufacturing): demand forecasts + sales-order demand netted against `onHand + onOrder + existing production orders`; a shortage explodes its BOM one level and becomes a planned production order or purchase, each convertible or dismissable.

**Quality** (`api/src/quality/`, its own module): inspection plans (checklist items), inspections (created against a plan, completed with auto-derived pass/fail, or cancelled), non-conformances (corrective/preventive actions through to closure). `InspectionDoc` is the one `large` list.

**EHS** (`api/src/ehs/`, its own module): incidents (report→investigate→close), risk assessments (hazards scored 1–5, draft→active), permits to work (pending→approved/rejected→closed). All three are small lists — the index budget is now too tight to spend on EHS when Warehouse/POS/Logistics are explicitly prioritized ahead of it.

Web (`web/src/modules/{manufacturing,quality,ehs}/*`): all four items have full list/record screens and sidebar entries. The variable-length array-field editor pattern (local row state, add/remove, one "Save" PATCHing the whole array with `If-Match`) was established for BOM lines/routing operations, then reused as-is for Quality's plan checklist and EHS's hazards.

Tests: `api/test/http/{manufacturing,manufacturing-mrp,quality,ehs}.spec.ts` (7+6+8+5 = 26 tests across the four items). Full suite re-run clean (241 tests) before the EHS commit. Web has no component tests (no browser available in this environment) — verified by `tsc --noEmit` + `eslint` (0 errors) + `next build` only, per CLAUDE.md §6.

Docs updated: `docs/IMPLEMENTATION-PLAN.md` checkboxes ticked with scope notes, `CHANGELOG.md` `### Added` entries, `CLAUDE.md` §1 status line, §5 index-budget narrative (196/200, 4 left), and a §9 domain note for each item.

## Warehouse management: what to build next

Read the plan line in full before starting (`docs/IMPLEMENTATION-PLAN.md`, Phase 5: *"Warehouse management (§8): zones, bins and racks, put-away rules, picking strategies (FIFO, FEFO, zone, wave), warehouse task queue, and a mobile barcode/QR scanning flow."*). Read `docs/BLUEPRINT.md` §8 ("Inventory & Warehouse Management") in full, especially its `### Warehouse` subsection — Inventory's own warehouses/bins already exist (`api/src/inventory/`, `WarehouseService`, `LocationService`) from Phase 1, so **check carefully how much of §8's warehouse scope is already built there** before writing new code; this item is likely an *extension* of Inventory (zones/racks as a refinement of the existing bin/location model, picking strategies, a task queue) rather than a brand-new module from scratch. Decide whether it lives inside `InventoryModule` (extending `LocationService`/adding a new `WarehouseTaskService` sibling file, the `hr-attendance.services.ts`-next-to-`hr.services.ts` pattern) or as its own module importing `InventoryModule` — read Inventory's current code first, this is a real judgment call, not a given.

Check `api/legacy/eam` and `api/legacy/fsm` too, not just whichever folder is literally named "warehouse" (there may not be one) — the legacy Prisma schema may have called this something else, or split it across folders; search `api/legacy/prisma-schema` or `api/prisma/schema.prisma`-equivalent reference for warehouse/bin/pick/wave terminology before concluding there's nothing to port. This item wasn't called a "port" in the plan line the way Quality and EHS were, so it may be more of a fresh build on top of existing Inventory — don't assume either way without checking.

- Mobile barcode/QR scanning flow: likely a simple scan-driven UI (type a code into a text input that acts like a scanner, matching how Attendance's QR clock-in and Assets' QR labels already work in this codebase) rather than any native/camera integration — check those two for the established pattern before inventing a new one.
- Picking strategies (FIFO/FEFO/zone/wave): FIFO/FEFO might already be partly covered by Inventory's existing costing-layer/lot-expiry logic (`CostLayerDoc`, lot tracking) — read `inventory.ledger.ts` before building parallel logic.
- Firestore index budget: only 4 slots left, shared across this, POS, Logistics and Marketing. A warehouse task queue is a plausible `large`-list candidate (per-pick-task, high volume) — but weigh it against POS/Logistics being explicitly prioritized ahead of it per the owner's decision; raise the tradeoff if it's genuinely a close call rather than silently spending the slot.
- Remember to register any new `largeListIndexes(...)` in `api/src/platform/data/indexes.ts` and run `npm run indexes` from `api/` if a `large` list is added (missed once already for Quality — see the budget section above).
- Check `guards.spec.ts`'s "module not available yet" test if this item changes any module's `available` flag to `true` (see the standing instruction above).

Build it the same end-to-end way as every other item: API, tests, web screens, docs, commit, push, verify CI, delete any matching legacy folder, update this file.

## Where to find things

- Blueprint (source of truth for scope): `docs/BLUEPRINT.md`.
- Plan checkboxes (source of truth for what's done): `docs/IMPLEMENTATION-PLAN.md`.
- Conventions, patterns, module checklist, domain notes, review hotspots: `CLAUDE.md` (repo root). **Read this in full before writing any code** — it is kept deliberately current and is denser than this file.
- Global rules (git workflow, no AI attribution): `C:\Users\Saad\.claude\CLAUDE.md`.
- Persistent cross-session memory: `C:\Users\Saad\.claude\projects\C--Work-STTPS-STTPS-ERP\memory\` (`MEMORY.md` is the index). Relevant entries: `sttps-erp-build.md` (this project), `feedback_autonomous_continuation.md` (the "don't stop between items" correction).
