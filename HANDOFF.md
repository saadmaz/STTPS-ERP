# Handoff — STTPS ERP build-out

This file tracks exactly where the autonomous build-out stands, for picking the work back up in a new session (including a plain terminal `claude` session, which has no memory of prior conversations). Read this file, then `CLAUDE.md` in full, before touching anything.

**Last updated:** 2026-11-20, after finishing Warehouse management (API + web, a fresh build on top of Phase 1's Inventory) and pushing to `develop`.

## Standing instructions (apply to all future work here, not just this item)

- Work goes straight to `develop`. One squash-merged release PR to `main` happens only when the whole implementation plan is done — not before.
- **Do not stop to ask for approval between items.** Build end-to-end (API → tests → web → docs → commit → push → verify CI), then move to the next unchecked item without pausing to summarize-and-wait. This was an explicit, emphatic correction from the owner earlier in the build — see the `feedback_autonomous_continuation` memory.
- No AI attribution anywhere (commit messages, PR text, code comments) — see global `CLAUDE.md` rules (`C:\Users\Saad\.claude\CLAUDE.md`).
- Before each commit: `tsc --noEmit`, `eslint`, the full API test suite, and for web changes `tsc --noEmit` + `eslint` + `next build`. All must be clean.
- **Run `npm test` / `vitest` via the PowerShell tool, not Bash.** Git Bash's lowercase-drive-letter cwd (`c:/Work/...`) crashes vitest's module runner on this machine with a confusing `TypeError: Cannot read properties of undefined (reading 'config')`. This is NOT a real dependency problem — don't touch `vite`'s version over it. See `CLAUDE.md` §8.
- After every push: `gh run list --branch develop --limit 3` then `gh run watch <id> --exit-status` to confirm CI is actually green, not just that it started.
- Update `CHANGELOG.md`, `docs/IMPLEMENTATION-PLAN.md` (tick the checkbox with an honest scope note — what's built, what's deliberately not, and why) and `CLAUDE.md` (§1 status line, §5 index budget if it changed, a domain note in §9) **only once an item is actually complete** (API + web + tests).
- **Check `ls api/legacy web/legacy` fresh before assuming a module needs a legacy-folder deletion** — not every Phase 5 item has one (Warehouse didn't; it's a fresh build extending Phase 1's Inventory, not a port). Don't assume either way without checking.
- **Enabling a module (`available: true`) that `test/http/guards.spec.ts`'s "lists modules for navigation and protects module switches" test hard-codes as its not-yet-available example will break that test.** It currently points at `analytics` (in the `intelligence` group, outside Phase 5's list) — check `api/src/platform/modules/catalog.ts` before assuming that's still true, and fix the test in the same commit if not.
- **A small, long-standing cleanup debt noticed but out of scope to fix unless asked:** `api/legacy/{eam,fsm,projects}` and `web/legacy/{eam,fsm,projects,sales}` still exist even though Projects and Sales were already rebuilt in earlier phases — they were apparently never deleted when those modules shipped. Not touched this session since it wasn't part of any current item; worth a deliberate cleanup pass if the owner ever asks, but don't delete them as a drive-by while working on something else.

## Firestore composite-index budget — read before adding any `large:` list

Firestore's real ceiling is **200 composite indexes per database**. Current count: **197/200** (`node -e "console.log(require('./firestore.indexes.json').indexes.length)"` from the repo root — the file lives at the repo root, not inside `api/`). Only **3 slots left**, for exactly 3 remaining modules (POS, Logistics, Marketing) — there is nothing to spare.

The owner's standing decision: **spend what's left, prioritized**, one `large` list per module at most, only on the single most genuinely high-volume entity, using the zero-indexed-filter trick below. Do not ask again. **With exactly 3 modules and 3 slots left, if POS and Logistics each take one, Marketing gets the last one — raise it explicitly only if a module's natural candidate genuinely doesn't need `large` (as EHS's didn't), which would leave a slot spare for later; don't spend defensively "just in case."**

The cost-minimizing trick, used for `ProductionOrderDoc`, `InspectionDoc` and `WarehouseTaskDoc` (1 index each, not 2+):

```ts
{ filters: [], sorts: [{ field: "createdAt", direction: "desc" }] }
```

— any other useful filter (`status`, `productId`, etc.) stays in `filterFields` only, served by the in-memory over-fetch path in `queryList`. Likely candidates in priority order: **POS sale transactions**, **Logistics delivery orders**; Marketing's core entity (campaigns?) felt less obviously high-volume when this was last assessed, so weigh that honestly rather than assuming it needs one. **Two steps are easy to forget and silently do nothing if skipped:** (1) register the new `largeListIndexes(...)` call in `api/src/platform/data/indexes.ts` (import the collection/list constants from the module's `.models.ts`, add one line), and (2) actually run `npm run indexes` from `api/` and commit the regenerated root `firestore.indexes.json`. Missing either one means the service declares `large` but the index was never generated — this happened once already on Quality's first pass, caught only by manually re-checking the index count after generating, not by any test failing.

## Current state of the implementation plan

- **Phases 0–4: complete** (pushed, CI green). Phase 4 finished with Support desk, Customer portal, and Document management.
- **Phase 5 ("Advanced operations", `docs/IMPLEMENTATION-PLAN.md` around line 248): in progress.**
  - **Manufacturing (§17) — done, API + web.**
  - **MRP — done, API + web.**
  - **Quality (§17) — done, API + web.** A port (minus the legacy's out-of-scope Audit entity).
  - **EHS — done, API + web.** A port (no blueprint section exists for this one).
  - **Warehouse management (§8) — done, API + web.** A fresh build on top of Phase 1's Inventory (no legacy folder existed for it). Ticked in the plan, changelog and `CLAUDE.md` §9 entries added.
  - **POS (§20) — not started. This is the immediate next task.**
  - After POS: Logistics and fleet (§18), Marketing (§19) — not started, in that plan order.

## Manufacturing, MRP, Quality, EHS and Warehouse management: what was built (for reference, all five items are finished)

**Manufacturing** (`api/src/manufacturing/`): work centres/machines, BOMs/routings (versioned, draft→active→obsolete), production orders (the one `large` list, zero indexed filters).

**MRP** (same module as Manufacturing): demand forecasts + sales-order demand netted against stock/on-order/existing production orders; a shortage becomes a planned production order or purchase, one BOM level deep.

**Quality** (`api/src/quality/`, its own module): inspection plans, inspections (auto-derived pass/fail), non-conformances (corrective/preventive actions). `InspectionDoc` is the one `large` list.

**EHS** (`api/src/ehs/`, its own module): incidents, risk assessments (scored hazards), permits to work. All three stayed small lists — the budget was judged better spent elsewhere.

**Warehouse management** (`api/src/warehouse/`, its own module, `imports: [InventoryModule, SalesModule, ProcurementModule]`): put-away rules; a picking-suggestion engine (FIFO/FEFO/zone) plus wave picking across several deliveries; a warehouse task queue (the one `large` list) auto-populated from `GoodsReceived` and `SalesOrderConfirmed` events, with a scan-by-code lookup for the mobile barcode/QR flow. Tasks track work; they don't move stock — see `CLAUDE.md` §9 for exactly why and what the ledger does and doesn't track per bin.

Web (`web/src/modules/{manufacturing,quality,ehs,warehouse}/*`): all five items have full screens and sidebar entries. Warehouse additionally has two standalone tool pages (`/warehouse/scan`, `/warehouse/picking`) alongside its list/record screens — the pattern to copy for any future "type a code" or "run a computation and show the result" page is `web/src/modules/hr/leave.tsx`'s `LeaveRolloverPage` (a `PageHeader` + `card` + a mutation, no `MasterConfig` involved).

Tests: `api/test/http/{manufacturing,manufacturing-mrp,quality,ehs,warehouse}.spec.ts` (7+6+8+5+5 = 31 tests across the five items). Full suite re-run clean (246 tests) before the Warehouse commit. Web has no component tests (no browser available in this environment) — verified by `tsc --noEmit` + `eslint` (0 errors) + `next build` only, per CLAUDE.md §6.

Docs updated: `docs/IMPLEMENTATION-PLAN.md` checkboxes ticked with scope notes, `CHANGELOG.md` `### Added` entries, `CLAUDE.md` §1 status line, §5 index-budget narrative (197/200, 3 left, one per remaining module), and a §9 domain note for each item.

## POS: what to build next

Read the plan line in full before starting (`docs/IMPLEMENTATION-PLAN.md`, Phase 5: *"POS (§20): terminals, cashier shifts with opening/closing cash, barcode cart, promotions, loyalty, split tender (cash, card, QR), refunds and exchanges, receipts, offline queue, inventory and GL posting."*). Read `docs/BLUEPRINT.md` §20 ("POS & Retail") in full. The catalog stub is `mod({ key: "pos", name: "POS & Retail", description: "Point of sale, shifts, loyalty and promotions.", group: "advanced", available: false, dependsOn: ["sales", "inventory"] })` — it already names `sales`/`inventory` as dependencies, so expect this to lean on both heavily (sales order/delivery equivalents, stock issue, GL posting through `AutoPostingService`/`GeneralLedger` the way every other stock-moving or revenue-recognising module does).

Check `api/legacy` and `web/legacy` for a `pos` folder before assuming this is a fresh build or a port — not checked yet as of this handoff. If one exists, read it in full for entity shape (terminals, shifts, sale transactions, payments) before writing anything new, the same way Quality and EHS were read; if not, it's a fresh build like Manufacturing/MRP/Warehouse.

Likely shape, to validate against the blueprint and any legacy code rather than taken as fixed:
- Terminals: simple master data (a register/device identity per location).
- Cashier shifts: open with a starting cash float, close reconciling counted vs. expected cash, probably per terminal per cashier (platform user id, the same "platform user, not HR employee" choice Tasks/Projects already made for similar reasons — don't add an HR dependency unless the blueprint specifically calls for linking to `EmployeeDoc`).
- Sale transactions: likely the module's one plausibly-`large` list (one row per sale, high volume, comparable to Attendance/Tickets) — this is the leading candidate for the one remaining index slot this module might spend; weigh it against Logistics' delivery orders before actually spending it, per the budget section above.
- Split tender, refunds/exchanges, receipts: modeled on Sales' existing order/delivery/return patterns and Finance's receipt/payment patterns — read `api/src/sales/sales.services.ts` and `api/src/finance/ar.services.ts` before inventing new shapes.
- Promotions/loyalty: check whether Products' existing `DiscountRule` (`api/src/products/`) already covers promotions before building a parallel discount engine; loyalty (points balance per customer) is more likely genuinely new.
- Offline queue: probably out of scope for a first pass (no offline-sync infrastructure exists anywhere else in this codebase) — if so, document that cut explicitly rather than attempting real offline support.
- Inventory and GL posting: reuse `InventoryLedger` (a new movement type, the same way Sales/Procurement each post their own type without going through Adjustments — see Maintenance's domain note for the established reasoning) and `AutoPostingService`/`GeneralLedger` for revenue/COGS/cash postings, not new parallel posting logic.

Build it the same end-to-end way as every other item: API, tests, web screens, docs, commit, push, verify CI, delete any matching legacy folder if one exists, update this file.

## Where to find things

- Blueprint (source of truth for scope): `docs/BLUEPRINT.md`.
- Plan checkboxes (source of truth for what's done): `docs/IMPLEMENTATION-PLAN.md`.
- Conventions, patterns, module checklist, domain notes, review hotspots: `CLAUDE.md` (repo root). **Read this in full before writing any code** — it is kept deliberately current and is denser than this file.
- Global rules (git workflow, no AI attribution): `C:\Users\Saad\.claude\CLAUDE.md`.
- Persistent cross-session memory: `C:\Users\Saad\.claude\projects\C--Work-STTPS-STTPS-ERP\memory\` (`MEMORY.md` is the index). Relevant entries: `sttps-erp-build.md` (this project), `feedback_autonomous_continuation.md` (the "don't stop between items" correction).
