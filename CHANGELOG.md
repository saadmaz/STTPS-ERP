<a id="top"></a>

<div align="center">

<img src=".github/assets/changelog.svg" alt="STTPS ERP: Changelog" width="100%">

<br/>

<p><strong>Every notable change to this project, newest first.</strong></p>

<a href="README.md"><img alt="README" src="https://img.shields.io/badge/README-374151?style=for-the-badge&labelColor=111827"></a>
<a href="CONTRIBUTING.md"><img alt="Contributing" src="https://img.shields.io/badge/Contributing-374151?style=for-the-badge&labelColor=111827"></a>
<a href="CODE_OF_CONDUCT.md"><img alt="Code of Conduct" src="https://img.shields.io/badge/Code%20of%20Conduct-374151?style=for-the-badge&labelColor=111827"></a>
<a href="SECURITY.md"><img alt="Security" src="https://img.shields.io/badge/Security-374151?style=for-the-badge&labelColor=111827"></a>
<a href="CHANGELOG.md"><img alt="Changelog" src="https://img.shields.io/badge/Changelog-818cf8?style=for-the-badge&labelColor=111827"></a>
<a href="LICENSE.md"><img alt="License" src="https://img.shields.io/badge/License-374151?style=for-the-badge&labelColor=111827"></a>

</div>

---

<div align="center">

<a href="https://github.com/saadmaz/STTPS-ERP/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/saadmaz/STTPS-ERP?include_prereleases&style=flat-square&label=latest%20release&labelColor=111827&color=818cf8"></a>
<a href="https://github.com/saadmaz/STTPS-ERP/compare/main...develop"><img alt="Changes waiting for release" src="https://img.shields.io/github/commits-difference/saadmaz/STTPS-ERP?base=main&head=develop&style=flat-square&label=unreleased%20commits&labelColor=111827&color=374151"></a>

</div>

> [!NOTE]
> The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Each version links to its full comparison at the bottom of this page, and to its [release notes](https://github.com/saadmaz/STTPS-ERP/releases).

## [Unreleased]

### Added

- Product blueprint (`docs/BLUEPRINT.md`) and a new phase-based implementation plan covering every blueprint section, replacing the Prisma-era plan.

- Platform kernel in the API (`api/src/platform`): company-scoped repository with pagination, archiving and optimistic concurrency; exact money and quantity arithmetic; gap-free document numbering; audit trail service; durable background job queue; transactional domain-event outbox.
- Organisation module: branches, departments, teams, cost centres, business units, fiscal years with monthly periods (open, soft-closed, locked) and exchange rates, each with audit history, archiving and per-company unique codes.
- Approval engine (`/workflow`): configurable workflows per record type with conditions, conditional and parallel steps, approvers by user, role, permission or department manager, delegation, timeouts with escalation, and approve, reject, request changes, reassign and cancel. Outcomes are published as `ApprovalCompleted` events.
- Notification centre (`/me/notifications`): in-app notifications, unread counts, per-category muting, and email delivery through Resend when `RESEND_API_KEY` is set.
- Record features for every record type (`/records/:type/:id/...`): comments with @mentions that notify, tags, links between records, one activity timeline (changes, comments and approval decisions) and file attachments.
- Files on Cloudflare R2 through presigned upload and download URLs, with size verification, versions, and forced downloads for content types that could run script.
- Custom fields per record type (`/settings/custom-fields`) with typed validation, saved list views (private or shared), and global search (`/search`) that only returns record types the user may view.
- Staff app rebuilt on a shared UI system: navigation driven by the enabled modules and the user's permissions, a command palette (Ctrl K) with global search, a notifications bell with unread counts, dark mode, and a mobile navigation drawer.
- Standard list screens (search, sort, filters, archived toggle, column chooser, saved views, CSV export) and record pages (details, custom fields, tags, activity with comments, files, related records, edit, archive and restore).
- Screens for branches, departments, teams, cost centres, business units, fiscal years (with period opening, closing and locking) and exchange rates.
- Home with work waiting for you, My Work, notifications, approval decisions, and settings for modules, approval workflows, delegations and custom fields.
- Two-step sign-in with authenticator apps (TOTP) and single-use recovery codes, a signed-in devices list with sign-out per device, and password change, all under Settings, Security.
- CRM API (`/crm`): customers with automatic numbering, credit limits and hierarchy; contacts; leads with rule-based scoring, routing and duplicate detection; lead conversion into customer, contact and opportunity in one step; opportunity pipeline with stage history, probabilities and win or loss reasons; activities tied to any CRM record; CRM analytics (funnel, pipeline, win rate, sales cycle, rep results).
- CRM screens: overview with funnel, sources and pipeline; leads with conversion; customers with their contacts and deals; contacts; opportunities with a stage picker and a pipeline board; activities with completion. Creating a likely duplicate shows the matches and asks before saving.
- Products API (`/products`): product master with automatic SKUs, product types, units of measure with conversions, barcodes, variants, bundles, costing method, lot, serial and expiry tracking flags; categories; price lists with quantity breaks and validity dates, activated through the approval engine; discount rules by product, category, customer or segment; a pricing endpoint that resolves customer list, default list or product price and applies discounts. Customers can carry their own price list.
- Product screens: products, categories, units of measure, price lists with their prices and activation, and discount rules.
- Inventory (`/inventory`): an append-only stock ledger with balances per warehouse and lot, per-product position and value, weighted-average, FIFO or standard costing, lot, expiry and serial-number tracking, negative-stock policy, reservations, warehouses and bin locations, adjustments with reasons and approval, transfers through in-transit, stock counts that lock the warehouse and post differences, reorder points with low-stock alerts, and reports for valuation, reorder, expiring lots, slow-moving stock, ageing and the ledger. Every posting publishes a `StockMoved` event for finance.
- Inventory screens: stock and value, reorder, expiring lots and the ledger; adjustments and transfers with a line editor; stock counts; warehouses with their stock.
- Sales API (`/sales`): quotes priced from the pricing engine with tax and line discounts, revisions, approval above a discount threshold, a private customer link to accept or reject, and conversion to orders; sales orders with a credit-limit check (approval or block), stock reservation and backorders; deliveries through pick, pack, dispatch (issuing the reserved stock) and proof of delivery; returns received back into stock at their original cost. Events `SalesOrderConfirmed`, `GoodsDispatched`, `SalesDelivered` and `SalesReturnReceived` feed invoicing in Phase 2.
- Sales screens: quotes (submit, send with a copied customer link, revise, convert), sales orders (confirm, deliver, reserve shortages, cancel), deliveries (pick, pack, dispatch, proof of delivery, failure, return), returns, and the public quote page customers use to accept or decline.
- Procurement API (`/procurement`): suppliers with bank details, certifications, status and a performance score from on-time delivery and accepted quantity; purchase requisitions routed through approval thresholds; requests for quotation with side-by-side comparison and an award that raises the purchase order (a reason is required when skipping the cheapest complete quote); purchase orders with value-based approval, supplier confirmation, amendments that go back through approval, and cancel or close; goods receipts with inspection rejects, lots, expiry and serials, posting accepted goods into stock at the order price (converted to the company currency); supplier returns shipped out at cost. Approved orders count as stock on order. Events `PurchaseOrderApproved`, `GoodsReceived` and `SupplierReturnShipped` feed accounts payable and three-way matching in Phase 2.
- Procurement screens: requisitions, RFQs (quote entry, comparison and award), purchase orders (submit, send, supplier confirmation, amend, receive, cancel), goods receipts, supplier returns and suppliers. A procurement overview shows spend by supplier, category and department, open commitments, price variance against standard cost, lead times and delivery performance.
- Finance API (`/finance`): chart of accounts with groups, control accounts and a one-step standard chart with posting rules; a posting engine that checks fiscal periods (locked, soft-closed) and keeps monthly balances; manual journals with approval, posting and reversal; stock value posted automatically from every stock movement (receipts against goods-received-not-invoiced, deliveries to cost of sales, adjustments), with failed postings kept as issues to retry; trial balance, profit and loss, balance sheet and account ledgers with running balances.
- Finance screens: overview with setup, journals and journal entry, chart of accounts, posting rules, posting issues, trial balance, profit and loss, balance sheet and account ledger.
- Accounts receivable: customer invoices drafted from dispatched deliveries at the order prices (or automatically on dispatch), manual invoices and credit notes (also drafted or raised automatically from received sales returns), posting to receivables, revenue and output tax; customer receipts that settle the oldest invoices first or as allocated, keep overpayments on account and book exchange differences for foreign-currency invoices; applying credit notes to invoices; write-offs to a bad-debt account; ageing by days past due; and customer statements with a running balance. Events `InvoicePosted`, `CreditNotePosted` and `PaymentReceived`.
- Receivables screens: invoices and credit notes (post, record payment, credit, apply credit, write off), customer receipts, ageing, printable statements, and an Invoice action on dispatched deliveries.
- Deposit, milestone and recurring invoices: a sales order's billing schedule (a percentage of the order's net total or a fixed amount, per entry) raises deposit invoices that post to a customer deposits account instead of revenue, and milestone invoices as ordinary revenue; a fully-paid deposit is later applied to the delivery invoice it covers. Recurring invoice schedules generate and post an invoice for the same customer and lines on each due date, re-priced at current tax rates, with a catch-up "run due now" action. Dunning: invoices crossing a configured days-overdue threshold raise an in-app alert to the account owner and queue a reminder email to the customer, once per threshold.
- Billing schedule, recurring invoices and dunning screens: a billing schedule editor and per-entry "Raise invoice" on the sales order page, a deposit's "Apply deposit" action on the invoice page, a recurring invoices list with "Run due now", and "Send reminders" on the receivables ageing page.
- Accounts payable: supplier bills drafted from goods receipts at the order prices or entered against expense accounts; three-way matching of quantity billed against quantity accepted (less returns) and price against the order, with bills that do not match held until someone with override rights posts them with a reason; duplicate supplier invoice numbers refused; posting that clears goods received not invoiced and books price variances and input tax; debit notes and applying them; supplier payments that settle the oldest bills first or as allocated, keep advances on account and book exchange differences; payment runs that pay chosen bills in one go; payables ageing, bills due for payment and supplier statements. Events `BillPosted`, `DebitNotePosted` and `SupplierPaymentMade`.
- Payables screens: supplier bills (match status, post with override, pay, debit note, apply debit), supplier payments, payment run, payables ageing, supplier statements, and a Bill action on posted goods receipts.
- Banking and cash: bank and cash accounts with book balances, transfers between them, statement import from CSV (flexible columns, separators and date formats) or OFX/QFX with duplicates skipped, automatic matching of exact amounts within a week, manual matching to one or more ledger lines, posting bank charges or interest straight from a statement line, and reconciliation to the statement balance with the outstanding items recorded; reconciled lines can no longer be unmatched.
- Banking screens: accounts overview with transfers, and per account: statement upload, lines to match, matching dialog, reconciliation and history.
- Budgets per fiscal year for the company or a department, branch, cost centre or project, with amounts per period or spread from an annual figure; approval through workflows; revisions that supersede the approved budget; budget against posted actuals per account and period; and controls that flag over-budget requisitions to approvers or refuse them, counting approved requisitions and open purchase orders as commitments.
- Budget screens: list, budget against actual (totals or by period), submit and revise, and a new-budget form.
- Expenses module (`/expenses`): categories mapped to expense accounts with a reclaimable tax code, receipt rule and per-line limit; employee claims entered tax-inclusive with the tax split out; receipts attached as files and required before submitting where the category needs them; approval through workflows; posting on approval (expense and input tax against the employee on payables); and reimbursement from the bank. Event `ExpenseClaimApproved`.
- Expenses screens: claims (submit, reimburse, receipts on the Files tab), new claim, and categories.
- Assets module (`/assets`): categories with cost, accumulated depreciation and expense accounts, straight-line or declining-balance methods and useful lives; an asset register with serial numbers, location, custodian and a full history; capitalisation (posted, or already posted from a supplier bill); depreciation schedules; a monthly depreciation run that catches up missed months, posts one journal per category and never runs twice for the same month; impairment; transfers; and disposal that clears cost and accumulated depreciation and books the gain or loss.
- Assets screens: register (capitalise, impair, transfer, dispose, history, schedule), depreciation run and categories.
- Finance extras: recurring journals (monthly, quarterly, yearly, with end dates) posted on demand and catching up missed runs; a tax return by tax code (output tax on sales and credit notes, input tax on bills, debit notes and expense claims) with CSV export; a direct-method cash flow statement; financial ratios (current, quick, gross and net margin, debt to equity); and revaluation of open foreign-currency invoices and bills at a period-end rate, reversed automatically on the first day of the next month.
- Finance screens: tax return with CSV download, cash flow, ratios, recurring journals and a revaluation action on the finance overview.
- Large lists run as indexed Firestore queries with text search through the search index, so customers and leads scale beyond what fits in memory.
- My Work (`/me/work`): approvals waiting for me and my open requests.
- Module activation per tenant (`/platform/modules`) with dependency checks, and a code-defined permission catalogue synced to Firestore.
- Firestore composite indexes generated from a registry (`npm run indexes`), checked by a test.
- API test suite on the Firestore emulator (`npm test` in `api/`), run in CI.

### Changed

- The old module screens, which called API modules that are switched off, moved to `web/legacy/` as reference until each module is rebuilt.
- API upgraded to NestJS 12 (ES modules), firebase-admin 14 and TypeScript 6. `web` and `admin` upgraded to Next.js 16, zod 4 and the flat ESLint config of `eslint-config-next` 16. All three apps report no known vulnerabilities.
- The unported Prisma modules moved to `api/legacy/` as reference code; Prisma is no longer installed.
- Dependabot removed; dependencies are now updated directly by maintainers.

### Fixed

- Records built from validated request bodies (for example approval workflow conditions) could not be saved, because Firestore rejects class instances; documents are now stored as plain objects.
- The API closes its Firestore connections on shutdown.

### Security

- Every API route now requires a signed-in user unless marked public, and permissions are checked against a verified company membership. Previously the permission guard ran before authentication and rejected every protected route.
- Refresh tokens are stored only as SHA-256 hashes, so a database read no longer exposes usable sessions. Existing sessions end with this release; users sign in again.
- Five failed sign-ins lock the email for 15 minutes, and unknown emails take as long to reject as wrong passwords.
- Passwords need 10 or more characters with a letter and a digit. Changing a password or having it reset signs out other devices.
- MFA secrets are encrypted at rest (AES-256-GCM) and TOTP codes cannot be replayed.
- User and company updates accept only their editable fields. Previously any signed-in user could set privilege flags such as `isSuperAdmin` or `isPlatformAdmin` on any user of their tenant.
- User management, company creation and company settings now require the matching permission or tenant administrator rights.
- Password hashes and MFA secrets are stripped from every API response.
- The seed script no longer creates accounts with fixed passwords; it reads them from the environment or generates random ones.
- The API refuses to start without a `JWT_SECRET` of at least 32 characters instead of falling back to a built-in default.
- The staff login form no longer pre-fills demo credentials.

## [0.4.1] - 2026-11-18

### Changed

- Dependency updates in web and admin: Next.js and PostCSS, sonner 2, @types/node, follow-redirects and postcss-selector-parser.

## [0.4.0] - 2026-11-17

### Added

- ESLint in `api`, `web` and `admin` (TypeScript rules, plus Next.js core web vitals for the two front ends), with a `lint` script in each app and a lint step in CI. `any` types are warnings while modules are ported.
- Cloudflare hosting: `web` and `admin` on Workers through OpenNext, and `api` in a Cloudflare Container behind a Worker, with production and development environments. Production deploys switch on with the `CLOUDFLARE_ENABLED` variable.
- One Deploy workflow that deploys only the apps that changed, in order: api, web, admin.

## [0.3.0] - 2026-11-17

### Removed

- Unused imports and variables flagged by the new lint setup.
- Unused dependencies in `web` (13) and `admin` (11), including ESLint, which was installed but never configured, and the `lint` scripts that could not run.
- Shared-hosting deployment: the SSH deploy workflow, Passenger start files for `web` and `admin`, the server-side deploy script, Next.js standalone output and the `dotenv` dependency it needed. Hosting moves to Cloudflare.

## [0.2.3] - 2026-11-17

### Changed

- Contributing, Security Policy, Code of Conduct, License and Changelog redesigned with branded headers, navigation, tables, diagrams and callouts; the licence is now LICENSE.md.

## [0.2.2] - 2026-11-17

### Changed

- README shows the development environment as awaiting host setup until development deploys are enabled.

## [0.2.1] - 2026-11-17

### Changed

- Redesigned README with a brand banner, live release, CI and deployment badges, action buttons, feature grid, diagrams and collapsible panels.
- Navigation bars and callouts across the contributing, security, conduct and documentation pages.

## [0.2.0] - 2026-11-17

### Added

- Development and production environments: `develop` deploys to development and `main` to production, through one Deploy workflow and GitHub Environments with per-environment settings.

## [0.1.0] - 2026-11-16

First pre-production release. The platform and identity layer is complete; domain modules are being ported to Firestore.

### Added

- **api:** NestJS API with JWT authentication, multi-tenancy, companies, users, roles and permissions, and admin endpoints on Cloud Firestore; Swagger documentation; Firestore seeding script.
- **web:** staff application with dashboard and screens for finance, inventory, procurement, sales and CRM, manufacturing, HR, EAM, FSM, quality, EHS, projects, analytics and settings.
- **admin:** platform admin console for tenants, companies, users and roles.
- Firestore security rules and composite indexes.
- Independent deploy pipelines per app, building on GitHub Actions and shipping standalone artefacts to Passenger.
- Continuous integration on every push and pull request: type check and production build for every app.
- Product, technical, flow, schema, design and implementation documentation under `docs/`.
- Project governance: proprietary licence, security policy, contribution guidelines, code of conduct, issue forms, pull request template, CODEOWNERS and Dependabot.
- Standard documentation layout shared by every STTPS repository: architecture, configuration, deployment, decision records (ADRs) and release and rollback runbooks, indexed in `docs/README.md`.

### Changed

- API persistence migrated from Prisma and PostgreSQL to Cloud Firestore to suit the hosting platform.

### Security

- Next.js upgraded from 15.1.4 to 15.5.29 in `web` and `admin`, closing critical advisories, and semver-compatible dependency fixes applied across all apps.
- Server access details removed from the deployment guide.

[Unreleased]: https://github.com/saadmaz/STTPS-ERP/compare/v0.4.1...HEAD
[0.4.1]: https://github.com/saadmaz/STTPS-ERP/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/saadmaz/STTPS-ERP/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/saadmaz/STTPS-ERP/compare/v0.2.3...v0.3.0
[0.2.3]: https://github.com/saadmaz/STTPS-ERP/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/saadmaz/STTPS-ERP/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/saadmaz/STTPS-ERP/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/saadmaz/STTPS-ERP/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/saadmaz/STTPS-ERP/releases/tag/v0.1.0
