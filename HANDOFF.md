# Handoff — STTPS ERP build-out

This file tracks exactly where the autonomous build-out stands, for picking the work back up in a new session (including a plain terminal `claude` session, which has no memory of prior conversations). Read this file, then `CLAUDE.md` in full, before touching anything.

**Last updated:** 2026-11-20, after finishing Logistics and fleet (API + web, a fresh build) and pushing to `develop`.

## ⚠️ Marketing is the LAST item. When it's done, the whole plan is done — follow the release runbook

Once Marketing ships, **every phase of `docs/IMPLEMENTATION-PLAN.md` is checked off.** At that point, stop adding features and follow `docs/runbooks/release.md` exactly, per `CLAUDE.md` §2: bump all three `package.json` versions, move the CHANGELOG `Unreleased` section into a new dated release section, open **one** PR `develop` → `main`, **squash-merge it** (so no stray co-author lines appear), tag it and publish the GitHub release. Read `docs/runbooks/release.md` itself before starting the release steps — this file only flags that the trigger condition is now exactly one module away; don't build Marketing and then keep looking for a next item that doesn't exist, and don't skip the release step because it hasn't been needed for the whole rest of this build-out.

## Standing instructions (apply to all future work here, not just this item)

- Work goes straight to `develop`. One squash-merged release PR to `main` happens only when the whole implementation plan is done — not before (see the warning above: that point is now).
- **Do not stop to ask for approval between items.** Build end-to-end (API → tests → web → docs → commit → push → verify CI), then move to the next unchecked item without pausing to summarize-and-wait. This was an explicit, emphatic correction from the owner earlier in the build — see the `feedback_autonomous_continuation` memory.
- No AI attribution anywhere (commit messages, PR text, code comments) — see global `CLAUDE.md` rules (`C:\Users\Saad\.claude\CLAUDE.md`).
- Before each commit: `tsc --noEmit`, `eslint`, the full API test suite, and for web changes `tsc --noEmit` + `eslint` + `next build`. All must be clean.
- **Run `npm test` / `vitest` via the PowerShell tool, not Bash.** Git Bash's lowercase-drive-letter cwd (`c:/Work/...`) crashes vitest's module runner on this machine with a confusing `TypeError: Cannot read properties of undefined (reading 'config')`. This is NOT a real dependency problem — don't touch `vite`'s version over it. See `CLAUDE.md` §8.
- After every push: `gh run list --branch develop --limit 3` then `gh run watch <id> --exit-status` to confirm CI is actually green, not just that it started.
- Update `CHANGELOG.md`, `docs/IMPLEMENTATION-PLAN.md` (tick the checkbox with an honest scope note — what's built, what's deliberately not, and why) and `CLAUDE.md` (§1 status line, §5 index budget if it changed, a domain note in §9) **only once an item is actually complete** (API + web + tests).
- **Check `ls api/legacy web/legacy` fresh before assuming a module needs a legacy-folder deletion** — not every Phase 5 item has one (Warehouse, POS and Logistics didn't; all three are fresh builds). Don't assume either way without checking.
- **Enabling a module (`available: true`) that `test/http/guards.spec.ts`'s "lists modules for navigation and protects module switches" test hard-codes as its not-yet-available example will break that test.** It currently points at `analytics` (in the `intelligence` group, outside Phase 5's list) — check `api/src/platform/modules/catalog.ts` before assuming that's still true, and fix the test in the same commit if not.
- **A small, long-standing cleanup debt noticed but out of scope to fix unless asked:** `api/legacy/{eam,fsm,projects}` and `web/legacy/{eam,fsm,projects,sales}` still exist even though Projects and Sales were already rebuilt in earlier phases.

## Firestore composite-index budget — read before adding any `large:` list

Firestore's real ceiling is **200 composite indexes per database**. Current count: **199/200** (`node -e "console.log(require('./firestore.indexes.json').indexes.length)"` from the repo root — the file lives at the repo root, not inside `api/`). **Only 1 slot left, for Marketing — the very last Phase 5 item.**

Give Marketing's `large` list, **if it needs one at all**, to its single most genuinely high-volume entity (likely campaign sends, or leads/segment members — assess honestly, don't assume) using the zero-indexed-filter trick (1 index, not 2+):

```ts
{ filters: [], sorts: [{ field: "createdAt", direction: "desc" }] }
```

If Marketing's natural candidate doesn't clearly need `large` (the way EHS's three collections didn't), **prefer leaving everything small** — there is no slack left to recover from spending the last slot on something that turns out not to need it. **Two steps are easy to forget and silently do nothing if skipped, if a `large` list is added:** (1) register the new `largeListIndexes(...)` call in `api/src/platform/data/indexes.ts`, and (2) run `npm run indexes` from `api/` and commit the regenerated root `firestore.indexes.json`. Missing either one means the service declares `large` but the index was never generated — this happened once already on Quality's first pass, caught only by manually re-checking the index count after generating, not by any test failing.

## Current state of the implementation plan

- **Phases 0–4: complete** (pushed, CI green).
- **Phase 5 ("Advanced operations"): in progress, one item left.**
  - Manufacturing (§17), MRP, Quality (§17), EHS, Warehouse management (§8), POS (§20), Logistics and fleet (§18) — **all done, API + web.**
  - **Marketing (§19) — not started. This is the last item in the entire implementation plan.**

## Everything built this build-out session, for reference (seven items, all API + web + tests)

**Manufacturing** (`api/src/manufacturing/`): work centres/machines, BOMs/routings, production orders (the one `large` list).
**MRP** (same module): demand forecasts + sales-order demand netted against stock/on-order/production; one-BOM-level explosion.
**Quality** (`api/src/quality/`): inspection plans, inspections (auto-derived pass/fail), non-conformances. `InspectionDoc` is the one `large` list. A port (minus the legacy's out-of-scope Audit entity).
**EHS** (`api/src/ehs/`): incidents, risk assessments, permits to work. All three stayed small lists. A port (no blueprint section existed).
**Warehouse management** (`api/src/warehouse/`, `imports: [InventoryModule, SalesModule, ProcurementModule]`): put-away rules, FIFO/FEFO/zone picking + wave picking, a task queue (the one `large` list) auto-populated from `GoodsReceived`/`SalesOrderConfirmed`, scan-by-code. A fresh build.
**POS** (`api/src/pos/`, `imports: [InventoryModule, SalesModule, FinanceModule]`): terminals, cashier shifts, sales (the one `large` list; hand-written transactional `create()`/`refund()`/`void()`, not `super.create()`), a loyalty-points balance. A fresh build.
**Logistics and fleet** (`api/src/logistics/`, `imports: [SalesModule]`): vehicles, fuel logs, routes (the one `large` list) — a planning/dispatch layer over Sales' existing `DeliveryDoc`, not a second delivery concept. A fresh build.

Web (`web/src/modules/{manufacturing,quality,ehs,warehouse,pos,logistics}/*`): all seven items have full screens, sidebar entries, and at least one standalone tool page where a generic MasterConfig form couldn't fit the flow (Warehouse's Scan/Picking, POS's Register, Logistics' New-route page) — the pattern for a "page instead of a drawer" is `createHref` on the `MasterConfig`, pointing at a hand-built page under the module's own route folder (a literal static folder like `logistics/routes/new/` coexisting with the `[entity]/[id]` dynamic catch-all one level up — Next.js resolves the static one first; this now has three working examples in this codebase, not just the one from `hr/leave-rollover`).

Tests: `api/test/http/{manufacturing,manufacturing-mrp,quality,ehs,warehouse,pos,logistics}.spec.ts` (7+6+8+5+5+7+4 = 42 tests). Full suite re-run clean (257 tests) before the Logistics commit. Web has no component tests (no browser available in this environment) — verified by `tsc --noEmit` + `eslint` (0 errors) + `next build` only, per CLAUDE.md §6.

Docs updated throughout: `docs/IMPLEMENTATION-PLAN.md` checkboxes ticked with scope notes, `CHANGELOG.md` `### Added` entries, `CLAUDE.md` §1 status line, §5 index-budget narrative (now 199/200, 1 left), and a §9 domain note for every item — read those domain notes before touching any of these modules, they carry real gotchas (e.g. Logistics' settle-condition bug that an early draft had, caught only by the test run).

## Marketing: what to build next (the last item)

Read the plan line in full before starting (`docs/IMPLEMENTATION-PLAN.md`, Phase 5: *"Marketing (§19): campaigns with budget, audience, channels and assets, segments from CRM, automated sequences (welcome, nurture, renewal, re-engagement), and campaign ROI and cost per lead."*). Read `docs/BLUEPRINT.md` §19 ("Marketing") in full. The catalog stub is `mod({ key: "marketing", name: "Marketing", description: "Campaigns, segments and marketing automation.", group: "advanced", available: false, dependsOn: ["crm"] })`.

Check `api/legacy` and `web/legacy` for a `marketing` folder before assuming this is a fresh build or a port — not checked yet as of this handoff.

Likely shape, to validate against the blueprint and any legacy code rather than taken as fixed:
- Campaigns: master data (name, type/channel, budget, start/end dates, status draft→active→completed).
- Segments: almost certainly built from CRM's existing `AccountDoc`/`LeadDoc`/`ContactDoc` filters (a saved query — check whether the platform's existing "saved list views" feature, `platform/custom-fields` or search index, already covers "a saved filter over a CRM collection" before building a new segment-definition entity from scratch) rather than a parallel customer-list concept.
- Automated sequences (welcome, nurture, renewal, re-engagement): this is the item most likely to need real infrastructure that doesn't exist yet — there is no outbound-email-sequencing engine anywhere in this codebase (Resend is wired for transactional notification email only, per the Phase 0 notification centre). A full drip-sequence engine is a large undertaking; consider scoping this to **sequence definitions and enrollment tracking** (what step a contact is on, when they'll advance) without actually sending scheduled marketing email, and document that cut explicitly and honestly, the same way EHS/Logistics/POS all had documented cuts, rather than silently building something that looks complete but doesn't send anything.
- Campaign ROI and cost per lead: likely a reporting query joining Campaign budget/cost against CRM leads tagged with a `campaignId` (add that as a field on `LeadDoc` if it doesn't already link back to a source campaign — check first) — not a new financial-posting concept.
- Firestore index budget: **exactly 1 slot left, for the whole rest of this build-out.** Read the budget section above in full before adding any `large` list; if campaign sends or segment membership turns out not to need indexed querying, prefer leaving it small.
- Check `guards.spec.ts`'s "module not available yet" test if this item changes any module's `available` flag to `true`.

Build it the same end-to-end way as every other item: API, tests, web screens, docs, commit, push, verify CI, delete any matching legacy folder if one exists, update this file. **Then follow the release-runbook warning at the top of this file — do not look for a next Phase 5 item, there isn't one.**

## Where to find things

- Blueprint (source of truth for scope): `docs/BLUEPRINT.md`.
- Plan checkboxes (source of truth for what's done): `docs/IMPLEMENTATION-PLAN.md`.
- Conventions, patterns, module checklist, domain notes, review hotspots: `CLAUDE.md` (repo root). **Read this in full before writing any code** — it is kept deliberately current and is denser than this file.
- Release process (needed very soon — see the warning above): `docs/runbooks/release.md`.
- Global rules (git workflow, no AI attribution): `C:\Users\Saad\.claude\CLAUDE.md`.
- Persistent cross-session memory: `C:\Users\Saad\.claude\projects\C--Work-STTPS-STTPS-ERP\memory\` (`MEMORY.md` is the index). Relevant entries: `sttps-erp-build.md` (this project), `feedback_autonomous_continuation.md` (the "don't stop between items" correction).
