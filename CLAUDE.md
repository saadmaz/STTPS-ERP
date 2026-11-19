# STTPS ERP: working notes for Claude

Read this file in full before changing anything. It records the conventions the codebase relies on but cannot enforce on its own. When something here disagrees with what you see in the code, the code wins: fix this file in the same commit.

## 1. What we are doing

- `docs/BLUEPRINT.md` is the product spec. `docs/IMPLEMENTATION-PLAN.md` is the phase plan. Its checkboxes (`- [x]` / `- [ ]`, with *italic notes* on partly done items) are the source of truth for progress.
- **Pick the next unchecked item in phase order** and build it end to end: API, tests, web screens, docs. Then commit, push and move on. The owner has said not to ask for approval between items.
- Finished: Phase 0 (most), Phase 1 (except sales analytics), Phase 2 (all), Phase 3 Employees. Next: **Phase 3 Workforce**, continuing with Recruitment/ATS.

## 2. Git and release rules (strict)

- Work on `develop`, commit there and push directly (`git push origin develop`). Never commit to `main`.
- Conventional commit messages: `feat(module): …`, `fix(…): …`, `chore: …`. One commit per finished item. Each commit must pass lint, typecheck, build and tests.
- **No AI attribution anywhere.** No `Co-Authored-By` trailers, no "Generated with…", no mention of Claude, Anthropic or AI in commits, PRs, comments or release notes.
- Never force-push and never rewrite history.
- Do **not** release after each item. When the whole plan is done, follow `docs/runbooks/release.md`: bump all three `package.json` versions, move the CHANGELOG `Unreleased` section, open one PR `develop` → `main`, **squash-merge it** (so no Dependabot co-author lines appear), tag it and publish the GitHub release.
- Dependabot is deliberately disabled. Fix vulnerable dependencies by hand. The push warning about vulnerabilities on `main` refers to the old tree and clears at release.
- After pushing, check CI with `gh run list --branch develop --limit 3`. If it is red, fix it before starting the next item.

## 3. Repository layout

```
api/    NestJS 12 (ESM, TypeScript 6), firebase-admin; Firestore is the only database
web/    Next.js 16, React 19, TanStack Query, Tailwind 3 (class dark mode), zod
admin/  separate Next.js admin console
docs/   blueprint, plan, runbooks
firestore.indexes.json  GENERATED: never edit by hand (see §5)
```

- `api/src/platform/` is the shared kernel: `data` (repository, money, sequences, unique, index registry), `crud` (MasterDataService and controller factory), `approvals`, `events`, `jobs`, `audit`, `records` (comments, tags, links, activity), `files`, `search`, `custom-fields`, `modules` (catalog), `notifications`.
- Domain modules live in `api/src/<module>/`: `org`, `crm`, `products`, `inventory`, `sales`, `procurement`, `finance`. The `finance` folder also holds the `expenses` and `assets` modules, each with its own `@RequireModule`.
- `api/legacy/` and `web/legacy/` contain old Prisma-era code for modules not yet rebuilt (hr, projects, eam, fsm, quality, ehs, manufacturing…). Treat it as **reference only**: never import from it. Delete a legacy folder in the same commit that rebuilds its module.
- Web: `web/src/modules/<module>/` holds `config.tsx` (API clients and `MasterConfig` screens) and `screens.tsx`, plus extra files as needed. Pages under `web/src/app/(platform)/<module>/` are thin wrappers that render module components.

## 4. API patterns (copy these, don't invent new ones)

**Best templates to copy:** `api/src/procurement/` (a full module: services, module, DTOs, models) and `api/src/finance/` (ledger postings, AR/AP, budgets, expenses, assets).

### Master data / documents
- Services extend `MasterDataService<Doc, CreateDto, UpdateDto>` (`platform/crud/master-data.service.ts`).
  - **Config:** `module`, `entity`, `label`, `collection`, `route`, plus optional `uniqueFields`, `references`, `parentField`, `filterFields`, `numbering` (`{ field, key, prefix, yearly }`), `large` (a `LargeListSpec` for big collections), `permission` (override) and `customFields`.
  - **Hooks:** `toNew` and `toPatch` map DTOs to documents. `validate` and `derive` are read phase. `beforeWrite` and `afterWrite` are write phase. Use `searchEntry` for global search.
  - **Pre-computing lines:** override `create`/`update` to do the reads outside the transaction (prices, products, rates), then pass the results through a `built` field on the DTO object. See `PurchaseOrderService` and `InvoiceService`.
- **Controllers:** `createMasterDataController({ path, tag, module, permission, service, createDto, updateDto })` gives list, get, history, create, patch (with `If-Match`), archive and restore. Extra actions go in a hand-written controller using `@RequireModule`, `@RequirePermission`, `@HttpCode(200)` on POST actions, and `@Body(validated(Dto))`.
- **Controller order:** list hand-written action controllers **before** the `...crud` controllers in `@Module({ controllers })`, so their literal routes win.
- Request context comes from `@Ctx() ctx: RequestContext`. For event handlers, build one with `systemContext(event, userId)`.

### Firestore transactions: the rule that causes most bugs
**All reads must happen before any write inside a transaction.** Every service that touches several documents uses a two-phase shape:
```ts
const plan = await this.ledger.prepare(tx, ctx, input, { withNumber: true }); // reads only
const approval = await this.prepareApprove(tx, ctx, before);                  // reads only
const request = await this.approvals.open(tx, ctx, prepared);                // reads, then writes
plan.commitNew(); approval.apply();                                           // writes only
```
- Never call `repo.get`, `tx.get`, `ledger.prepare`, `approvals.open` or `sequences.reserve` after a write in the same transaction.
- `approvals.prepare()` runs **outside** the transaction. Inside it, call `approvals.open(tx, …)`; if it returns `status === "approved"` (no workflow applies), apply at once, otherwise set `pending_approval`. Handle the result by subscribing to `APPROVAL_COMPLETED` in `onModuleInit`. Copy `PurchaseOrderService.submit` exactly.
- Two separate "prepare" helpers that both load the same document will overwrite each other's writes. If two changes touch one doc (for example stock on hand and on-order), make them one change. See `onOrderDelta` in `InventoryLedger.prepare`.

### Money, quantities, dates
- Money is **integer minor units** (cents). Quantities are **integer thousandths** (`QTY_SCALE = 1000`). Rates and percentages are **hundredths of a percent** (1800 = 18%).
- Use the helpers in `platform/data/money.ts`: `toMinor`, `fromMinor`, `toQty`, `extend(qty, unitPrice)`, `applyRate`, `allocate`. **Never use floats** for money.
- DTOs take money and quantities as **strings** (regexes `MONEY`, `QTY`), converted in the service.
- Dates are ISO strings `YYYY-MM-DD`; fiscal periods are `YYYY-MM`.
- Foreign currency: convert with `toBase(amount, rate, currency, base)` from `finance/ar.services.ts`. Rates are decimal strings looked up through `ExchangeRateService.rateOn`.

### Ledger postings
- Post only through `GeneralLedger` (`finance/ledger.service.ts`), either `prepare(...)` then `commitNew()`/`writeLedger()`, or `post()` in its own transaction. It checks fiscal periods, rejects group accounts and guards control accounts.
- Look up accounts by role with `ledger.account(settings, "receivable" | "payable" | "bank" | …)` (`POSTING_ROLES` in `finance.models.ts`). Never hard-code account ids.
- Automatic postings from events go through `AutoPostingService`. A failure becomes a posting issue, not an exception.

### Events and jobs
- Publish with `events.publish(tx, ctx, "PastTenseName", { entity, entityId }, payload)` inside the business transaction (transactional outbox).
- Subscribe with `events.subscribe(type, "module.uniqueName", handler)`. Handlers must be idempotent.
- `BACKGROUND_WORKERS` is off in tests; call `app.get(JobQueueService).drain()` to run handlers.
- There is no cron scheduler yet. Scheduled work is exposed as an explicit "run" endpoint (see recurring journals and the depreciation run).

## 5. Adding a new module: checklist

1. `api/src/<mod>/<mod>.models.ts`: `COLLECTIONS`, document interfaces, `LISTS: LargeListSpec` for large collections.
2. `<mod>.dto.ts`: class-validator DTOs (`PartialType` for updates).
3. `<mod>.services.ts` and `<mod>.module.ts`: import the modules whose services you need (`OrgModule`, `SalesModule`, `FinanceModule` …). Watch for import cycles.
4. `api/src/platform/modules/catalog.ts`: set `available: true` and add `permissions: [...entityPermissions(mod, entity, "label")]` plus any custom codes.
5. `api/src/app.module.ts`: add the module to `imports`.
6. `api/src/platform/data/indexes.ts`: add `largeListIndexes(...)` for large lists, plus explicit composite indexes for any query that combines equality with a range or order on another field. Then run `npm run indexes` (in `api/`) and commit the regenerated `firestore.indexes.json`. A test fails when they drift. Budget: at most 180 indexes.
7. Delete `api/legacy/<mod>` and `web/legacy/<mod>` if they exist.
8. Write `api/test/http/<mod>.spec.ts` (see §7).
9. Web: `web/src/modules/<mod>/`, pages under `web/src/app/(platform)/<mod>/`, and a section in `web/src/components/layout/Sidebar.tsx` with `module` and `permission` set.
10. Docs: tick the plan checkbox (with an *italic note* if partial) and add an `### Added` entry under `## [Unreleased]` in `CHANGELOG.md`, written for users.

## 6. Web patterns

- **Lists and records:** define a `MasterConfig<T>` (columns, filters, fields, title, subtitle, status, `editable`, `actions`, `details`, `extra`) and render it with `MasterListPage` / `MasterRecordPage` (`components/master/MasterData.tsx`). The record page already includes the Activity and Files tabs.
- **API clients:** `crud<T>(path)` from `lib/api.ts`. Show errors with `errorMessage(e)` and `toast`.
- **Action buttons:** `Action` from `modules/sales/config.tsx` handles a permission check, an optional confirm dialog with a reason, POST, then refresh. Use `ConfirmDialog` (`components/ui/kit.tsx`, which accepts `children` for extra fields) for small forms.
- **Permissions:** `useCan("module.entity.action")`; never show controls the user cannot use.
- **Formatting:** `formatMoney(minor, currency)` and `formatDate`. Quantities display as `n / 1000`.
- **React lint rules that fail the build:**
  - No `setState` inside `useEffect` to seed forms. Load the data in a parent, then render a child form that takes it as initial state through props (see `NewOrder` / `OrderForm` in procurement).
  - No impure calls in render or in `useState(value)`. Write `useState(() => new Date(...))`, not `useState(new Date(Date.now()))`.
- Dark mode: every colour class needs its `dark:` pair. Layouts must work at phone width.
- No browser is available here, so UI is verified by typecheck, lint and build only.

## 7. Tests and checks

- API tests are HTTP tests against the Firestore emulator. Copy the setup in `api/test/http/procurement.spec.ts` or `finance.spec.ts`:
  - **Tenant and auth:** `createApp()` and `seedTenant(app, viewerPermissions)` give users `admin` (all permissions), `viewer` (only the listed permissions) and `outsider`. Headers come from `as()`.
  - **Finance tests:** call `POST /api/v1/finance/setup`, then create a fiscal year with `POST /api/v1/org/fiscal-years` (`startDate` is the first of a month).
  - **Approvals:** `POST /api/v1/workflow/definitions`, then approve as another user, then `drain()`.
  - Assert the money exactly in minor units. Work the arithmetic out in a comment, including 18% VAT, the default tax code.
- **Run the tests from PowerShell inside `api/`** (a lowercase drive path breaks vitest's suite detection):
  - One file: `npx -y firebase-tools@15.36.0 emulators:exec --only firestore --project demo-sttps-erp "vitest run test/http/<file>.spec.ts"`
  - The whole suite: `npm test` (about 2–3 minutes).
- **Before every commit:**
  - `api`: `npx tsc --noEmit -p tsconfig.json`, `npm run lint` (0 errors), `npm test`.
  - `web`: `npx tsc --noEmit`, `npm run lint` (0 errors), `npm run build`. Stale `.next/types` errors after deleting a route go away after `npm run build`.
- Existing lint *warnings* (3 in api, 6 in web) are known; don't add new ones.

## 8. Environment gotchas (Windows)

- Prefer the **PowerShell** tool for npm, tests and git. The Bash tool is Git Bash: fine for `grep`, `sed` and `gh`.
- Bash heredocs containing backticks or `${…}` fail with "unexpected EOF". To make multi-line edits, write a Python script into the scratchpad with the Write tool and run `python <path>`, or use the Edit tool.
- Never write literal invisible characters (a BOM, for example) into source. Use escapes like `﻿`.
- Never kill processes broadly. If the emulator hangs, stop only the process on its port.
- Don't add `firebase-tools` as a dependency; it is pinned through `npx` in the test script.

## 9. Domain notes for the next phases

- **Sri Lankan payroll (Phase 3):**
  - **Make the statutory figures configurable data, not code.** That covers EPF (employee 8%, employer 12%), ETF (employer 3%), the APIT tax tables and any stamp duty. Effective-dated rows let changes take effect without a deploy.
  - **Give each rule a test** that works through an example payslip by hand.
  - **Post payroll through `GeneralLedger`:** salaries expense against payroll liabilities (`subtype: "payroll"`), with employees as `partyType: "employee"`.
- **Employees vs users:** `EmployeeDoc.userId` (`api/src/hr/`) now links an employee to the platform user they sign in as, checked against `companyUsers` (not the generic `references` config: users have no `companyId`). Expense claims still key off the **user id** directly — leave that alone; payroll and self-service should resolve the employee from `userId`, not the other way round.
- **Sensitive HR fields:** `EmployeeDoc.compensation`, `bankDetails` and `nationalId` need `hr.employee.compensation`, checked in `EmployeeService` (read redaction in `get`/`list`/`history`, write guard in `toNew`/`toPatch`) — not the generic Phase 0 record-level-scope engine, which still doesn't exist. Copy this per-field pattern for other sensitive data before that engine lands.
- **Budget control:** procurement already calls `BudgetService.check`. Any new spending document (projects, maintenance work orders) should call it the same way.

## 10. Review hotspots (for a later review by a stronger model)

Areas where subtle errors are most likely and that deserve a careful second look:
- **Transaction ordering** (reads before writes) in every service with `prepare*` / `apply`, especially new code.
- **Ledger correctness:**
  - **Balanced entries:** `GeneralLedger.normalise` throws on unbalanced journals, but the sign conventions in AR/AP/bank/asset postings deserve checking.
  - **FX differences** in receipts and payments.
  - **Disposal gain or loss.**
- **Three-way match** (`finance/ap.services.ts`, `matchBill`) and the commitments in budget control (`finance/budget.ts`).
- **Concurrency on hot documents:** stock summaries, GL monthly balances, sequences.
- **Access control:** the catalog permissions on every route. Record-level scoping (Phase 0 open item) is not done: for example, any user with `expenses.claim.view` sees all claims, and any `hr.employee.view` holder sees every employee (just not their compensation).
- **Sensitive-field redaction:** `EmployeeService`'s compensation masking is hand-written per field; check it stays in sync if `EmployeeDoc` grows more sensitive fields, and that no new read path (reports, exports, search) bypasses `get`/`list`/`history` and reads the collection directly.
- **Payroll statutory calculations** (once built).
