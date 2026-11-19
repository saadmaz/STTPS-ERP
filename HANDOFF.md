# Handoff — STTPS ERP build-out

This file tracks exactly where the autonomous build-out stands, for picking the work back up in a new session (including a plain terminal `claude` session, which has no memory of prior conversations). Read this file, then `CLAUDE.md` in full, before touching anything.

**Last updated:** 2026-11-20, after finishing POS (API + web, a fresh build) and pushing to `develop`.

## Standing instructions (apply to all future work here, not just this item)

- Work goes straight to `develop`. One squash-merged release PR to `main` happens only when the whole implementation plan is done — not before.
- **Do not stop to ask for approval between items.** Build end-to-end (API → tests → web → docs → commit → push → verify CI), then move to the next unchecked item without pausing to summarize-and-wait. This was an explicit, emphatic correction from the owner earlier in the build — see the `feedback_autonomous_continuation` memory.
- No AI attribution anywhere (commit messages, PR text, code comments) — see global `CLAUDE.md` rules (`C:\Users\Saad\.claude\CLAUDE.md`).
- Before each commit: `tsc --noEmit`, `eslint`, the full API test suite, and for web changes `tsc --noEmit` + `eslint` + `next build`. All must be clean.
- **Run `npm test` / `vitest` via the PowerShell tool, not Bash.** Git Bash's lowercase-drive-letter cwd (`c:/Work/...`) crashes vitest's module runner on this machine with a confusing `TypeError: Cannot read properties of undefined (reading 'config')`. This is NOT a real dependency problem — don't touch `vite`'s version over it. See `CLAUDE.md` §8.
- After every push: `gh run list --branch develop --limit 3` then `gh run watch <id> --exit-status` to confirm CI is actually green, not just that it started.
- Update `CHANGELOG.md`, `docs/IMPLEMENTATION-PLAN.md` (tick the checkbox with an honest scope note — what's built, what's deliberately not, and why) and `CLAUDE.md` (§1 status line, §5 index budget if it changed, a domain note in §9) **only once an item is actually complete** (API + web + tests).
- **Check `ls api/legacy web/legacy` fresh before assuming a module needs a legacy-folder deletion** — not every Phase 5 item has one (Warehouse and POS didn't; both are fresh builds). Don't assume either way without checking.
- **Enabling a module (`available: true`) that `test/http/guards.spec.ts`'s "lists modules for navigation and protects module switches" test hard-codes as its not-yet-available example will break that test.** It currently points at `analytics` (in the `intelligence` group, outside Phase 5's list) — check `api/src/platform/modules/catalog.ts` before assuming that's still true, and fix the test in the same commit if not.
- **A small, long-standing cleanup debt noticed but out of scope to fix unless asked:** `api/legacy/{eam,fsm,projects}` and `web/legacy/{eam,fsm,projects,sales}` still exist even though Projects and Sales were already rebuilt in earlier phases.

## Firestore composite-index budget — read before adding any `large:` list

Firestore's real ceiling is **200 composite indexes per database**. Current count: **198/200** (`node -e "console.log(require('./firestore.indexes.json').indexes.length)"` from the repo root — the file lives at the repo root, not inside `api/`). Only **2 slots left**, for exactly 2 remaining modules (Logistics, Marketing) — there is nothing to spare.

The owner's standing decision: **spend what's left, prioritized**, one `large` list per module at most, only on the single most genuinely high-volume entity, using the zero-indexed-filter trick below. Do not ask again. **Logistics' delivery orders are the more obvious high-volume candidate of the two remaining modules; Marketing's core entity (campaigns) felt less obviously high-volume when this was last assessed — weigh that honestly against what Marketing actually turns out to need, rather than assuming either way.**

The cost-minimizing trick, used for `ProductionOrderDoc`, `InspectionDoc`, `WarehouseTaskDoc` and `PosSaleDoc` (1 index each, not 2+):

```ts
{ filters: [], sorts: [{ field: "createdAt", direction: "desc" }] }
```

— any other useful filter (`status`, `productId`, etc.) stays in `filterFields` only, served by the in-memory over-fetch path in `queryList`. **Two steps are easy to forget and silently do nothing if skipped:** (1) register the new `largeListIndexes(...)` call in `api/src/platform/data/indexes.ts` (import the collection/list constants from the module's `.models.ts`, add one line), and (2) actually run `npm run indexes` from `api/` and commit the regenerated root `firestore.indexes.json`. Missing either one means the service declares `large` but the index was never generated — this happened once already on Quality's first pass, caught only by manually re-checking the index count after generating, not by any test failing.

## Current state of the implementation plan

- **Phases 0–4: complete** (pushed, CI green). Phase 4 finished with Support desk, Customer portal, and Document management.
- **Phase 5 ("Advanced operations", `docs/IMPLEMENTATION-PLAN.md` around line 248): in progress.**
  - **Manufacturing (§17) — done, API + web.**
  - **MRP — done, API + web.**
  - **Quality (§17) — done, API + web.** A port (minus the legacy's out-of-scope Audit entity).
  - **EHS — done, API + web.** A port (no blueprint section exists for this one).
  - **Warehouse management (§8) — done, API + web.** A fresh build on top of Phase 1's Inventory.
  - **POS (§20) — done, API + web.** A fresh build. Ticked in the plan, changelog and `CLAUDE.md` §9 entries added.
  - **Logistics and fleet (§18) — not started. This is the immediate next task.**
  - After Logistics: Marketing (§19) — not started. **Marketing is the last Phase 5 item** — once it's done, Phase 5 is complete and the whole implementation plan is done, which means the release process applies (see below).

## ⚠️ When Marketing is finished: the whole plan is done — follow the release runbook

Once Marketing ships, **every phase of `docs/IMPLEMENTATION-PLAN.md` is checked off.** At that point, stop adding features and follow `docs/runbooks/release.md` exactly, per `CLAUDE.md` §2: bump all three `package.json` versions, move the CHANGELOG `Unreleased` section into a new dated release section, open **one** PR `develop` → `main`, **squash-merge it** (so no stray co-author lines appear), tag it and publish the GitHub release. This is a standing instruction already in `CLAUDE.md` §2 — this note just flags that the trigger condition is now close (one module away), so the next session doesn't build Logistics, build Marketing, and then keep going into nothing, or forget the release step entirely because it hasn't been needed for the whole rest of this build-out.

## Manufacturing, MRP, Quality, EHS, Warehouse management and POS: what was built (for reference, all six items are finished)

**Manufacturing** (`api/src/manufacturing/`): work centres/machines, BOMs/routings, production orders (the one `large` list).
**MRP** (same module): demand forecasts + sales-order demand netted against stock/on-order/production; one-BOM-level explosion.
**Quality** (`api/src/quality/`): inspection plans, inspections (auto-derived pass/fail), non-conformances. `InspectionDoc` is the one `large` list.
**EHS** (`api/src/ehs/`): incidents, risk assessments, permits to work. All three stayed small lists.
**Warehouse management** (`api/src/warehouse/`, `imports: [InventoryModule, SalesModule, ProcurementModule]`): put-away rules, FIFO/FEFO/zone picking suggestions + wave picking, a task queue (the one `large` list) auto-populated from `GoodsReceived`/`SalesOrderConfirmed`, scan-by-code lookup.
**POS** (`api/src/pos/`, `imports: [InventoryModule, SalesModule, FinanceModule]`): terminals, cashier shifts, sales (the one `large` list, `PosSaleService.create()`/`refund()`/`void()` are hand-written transactional methods, not `super.create()` — read `CLAUDE.md` §9's POS note in full before touching any of the three), a simple loyalty-points balance. Pricing bypasses Sales' `LinePricer`; refunds/voids reverse stock and the GL directly.

Web (`web/src/modules/{manufacturing,quality,ehs,warehouse,pos}/*`): all six items have full screens and sidebar entries. POS additionally has a Register page (`/pos/register`, `web/src/modules/pos/register.tsx`) — a cart/payment/receipt flow, the most elaborate standalone tool page in this codebase so far (more than Warehouse's Scan/Picking pages); look at it before building anything similarly interactive.

Tests: `api/test/http/{manufacturing,manufacturing-mrp,quality,ehs,warehouse,pos}.spec.ts` (7+6+8+5+5+7 = 38 tests across the six items). Full suite re-run clean (253 tests) before the POS commit. Web has no component tests (no browser available in this environment) — verified by `tsc --noEmit` + `eslint` (0 errors) + `next build` only, per CLAUDE.md §6.

Docs updated: `docs/IMPLEMENTATION-PLAN.md` checkboxes ticked with scope notes, `CHANGELOG.md` `### Added` entries, `CLAUDE.md` §1 status line, §5 index-budget narrative (198/200, 2 left), and a §9 domain note for each item.

## Logistics and fleet: what to build next

Read the plan line in full before starting (`docs/IMPLEMENTATION-PLAN.md`, Phase 5: *"Logistics and fleet (§18): delivery orders, route planning (stops, sequence, ETA, capacity), driver app flow with proof of delivery, failed deliveries, vehicles, fuel logs, insurance and licence expiry, fleet costs."*). Read `docs/BLUEPRINT.md` §18 ("Logistics & Fleet") in full. The catalog stub is `mod({ key: "logistics", name: "Logistics & Fleet", description: "Delivery routes, drivers, vehicles and fleet costs.", group: "advanced", available: false, dependsOn: ["sales"] })`.

Check `api/legacy` and `web/legacy` for a `logistics`, `fleet` or similarly-named folder before assuming this is a fresh build or a port — not checked yet as of this handoff.

Likely shape, to validate against the blueprint and any legacy code rather than taken as fixed:
- **"Delivery orders" is a real naming risk — Sales already has `DeliveryDoc`** (pick/pack/dispatch, `api/src/sales/sales.services.ts`). Read that in full before inventing a second "delivery" concept: this item's "delivery orders" with route planning and a driver app flow is likely a **logistics layer on top of** Sales' existing deliveries (assigning a vehicle/driver/route/stop-sequence to one or more `DeliveryDoc`s, like Warehouse's task queue sat on top of Inventory/Sales/Procurement rather than re-deriving stock movement) — not a parallel order-fulfilment entity. Decide this deliberately and document the choice, the same way Warehouse's domain note explains why tasks don't move stock themselves.
- Vehicles, fuel logs, insurance/licence expiry, fleet costs: plausibly straightforward master data + child records, closer to Assets' register (`finance/assets.ts`) than to anything stock- or GL-heavy — check whether fleet costs should post to the GL at all (fuel/maintenance expenses might reuse Finance's existing Expense Claims rather than a new posting path) before building parallel accounting.
- Driver app flow / proof of delivery: likely another "type a code" or simple status-update flow from a driver's own account — check whether drivers are platform users (like Tasks/Projects' "platform user, not HR employee" choice) or need their own lighter auth surface (like Support's customer portal) before assuming either.
- Route planning (stops, sequence, ETA): probably a plain ordered list of stops with manual sequencing, not real routing/ETA computation (no mapping/routing API integration exists anywhere in this codebase) — if so, document that cut explicitly rather than attempting real ETA math.
- Firestore index budget: only **2 slots left**, shared with Marketing. Delivery orders/route stops are a plausible `large`-list candidate (see the budget section above) — but this is likely the stronger candidate of the two remaining modules; weigh it honestly rather than assuming.
- Remember to register any new `largeListIndexes(...)` in `api/src/platform/data/indexes.ts` and run `npm run indexes` from `api/` if a `large` list is added.
- Check `guards.spec.ts`'s "module not available yet" test if this item changes any module's `available` flag to `true`.

Build it the same end-to-end way as every other item: API, tests, web screens, docs, commit, push, verify CI, delete any matching legacy folder if one exists, update this file. **Then move straight to Marketing — and remember the release-runbook note above once that's done.**

## Where to find things

- Blueprint (source of truth for scope): `docs/BLUEPRINT.md`.
- Plan checkboxes (source of truth for what's done): `docs/IMPLEMENTATION-PLAN.md`.
- Conventions, patterns, module checklist, domain notes, review hotspots: `CLAUDE.md` (repo root). **Read this in full before writing any code** — it is kept deliberately current and is denser than this file.
- Global rules (git workflow, no AI attribution): `C:\Users\Saad\.claude\CLAUDE.md`.
- Persistent cross-session memory: `C:\Users\Saad\.claude\projects\C--Work-STTPS-STTPS-ERP\memory\` (`MEMORY.md` is the index). Relevant entries: `sttps-erp-build.md` (this project), `feedback_autonomous_continuation.md` (the "don't stop between items" correction).
