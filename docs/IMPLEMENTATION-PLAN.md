# Implementation Plan — STTPS ERP

<!-- nav -->
<sub><a href="../README.md">Project README</a> · <a href="README.md">Documentation index</a></sub>

> How the full [product blueprint](BLUEPRINT.md) gets built, phase by phase, starting from the code as it stands.
> This plan replaces the earlier Prisma/PostgreSQL plan, which [ADR-0002](adr/0002-cloud-firestore-instead-of-postgresql.md) made obsolete.

| | |
| --- | --- |
| **Baseline** | v0.4.1 (November 2026) |
| **Scope** | Every section of [BLUEPRINT.md](BLUEPRINT.md) |
| **Stack** | NestJS 10 API on Cloud Firestore · Next.js 15 `web` and `admin` · Cloudflare Workers and Containers |
| **Target** | v1.0.0 once Phase 7 is complete |

---

## Contents

1. [Where we start](#1-where-we-start)
2. [How work flows](#2-how-work-flows)
3. [Engineering rules for every phase](#3-engineering-rules-for-every-phase)
4. [Phase overview](#4-phase-overview)
5. [Phase 0 — Platform foundation](#phase-0--platform-foundation)
6. [Phase 1 — Core operations](#phase-1--core-operations)
7. [Phase 2 — Financial core](#phase-2--financial-core)
8. [Phase 3 — Workforce](#phase-3--workforce)
9. [Phase 4 — Operations](#phase-4--operations)
10. [Phase 5 — Advanced operations](#phase-5--advanced-operations)
11. [Phase 6 — Intelligence and integrations](#phase-6--intelligence-and-integrations)
12. [Phase 7 — Hardening and 1.0](#phase-7--hardening-and-10)
13. [Blueprint coverage map](#13-blueprint-coverage-map)
14. [Risks](#14-risks)

---

## 1. Where we start

| Area | State at v0.4.1 |
| --- | --- |
| Identity, tenants, companies, users, roles, permissions | **Live on Firestore.** JWT plus refresh sessions, `RequirePermissionGuard` on every route, admin console. |
| Finance (GL, AR, AP, bank, fixed assets, budgets, reports), inventory, procurement, CRM, sales, manufacturing/MRP, HR/payroll, EAM, field service, quality, EHS, projects | **Written but switched off.** About 4,300 lines of services and 269 endpoints still call Prisma, so `app.module.ts` does not load them. `api/prisma/schema.prisma` (100 models) is the reference data model. `web` has screens for all of them, but the screens have no live API behind them. |
| Workflow/approval engine, automation, notifications, documents, search, custom fields, saved views, support desk, customer portal, POS, logistics/fleet, marketing, calendar, BI builders, AI, API platform | **Not started.** |
| Tests | None. CI runs lint, type check and build for each app. |

Two pieces of work therefore run side by side: **porting** the existing modules to Firestore and **extending** them to the blueprint's scope. Every port is done once, directly to the blueprint version, never to a straight copy that is then rewritten.

## 2. How work flows

```mermaid
flowchart LR
  W["Work on develop"] -- "push (CI + dev deploy)" --> D["develop"]
  D -- "one release PR when the plan is done" --> M["main"]
  M -- "tag + GitHub release" --> R(["vX.Y.Z"])
```

- Commits go straight to `develop` with conventional messages (`feat(crm): …`, `fix(gl): …`). CI runs on every push. Development deploys once `DEVELOPMENT_ENABLED` is on.
- `CHANGELOG.md` collects every user-facing change under `Unreleased` as it lands.
- **No release per commit or per phase.** When the plan is complete, one pull request from `develop` into `main` is merged and released following [runbooks/release.md](runbooks/release.md). Any phase boundary can still be cut as an intermediate release if production needs it earlier; the phase table suggests the version each one would take.
- Each phase ends with a short status update in this file (the checkboxes below) rather than a release.

## 3. Engineering rules for every phase

These come from blueprint §3, §33, §39 and §40 and apply to every module.

**Data on Firestore**

- One top-level collection per entity, named in `COLLECTIONS`, with `tenantId` and `companyId` on every document. All reads go through the shared repository (Phase 0), which applies tenant/company scope, so no query can leave it out.
- Money is stored as integer minor units (cents) plus a currency code, never floats. Quantities use a fixed scale (thousandths).
- Postings are append-only: journal lines, stock movements, payments and payslips are new documents written in a Firestore transaction. Balances are maintained projections, recomputable from the ledger. Corrections are reversals, never edits (§10 finance controls).
- Document numbers (`INV-2026-000123`) come from transactional per-company counters.
- Firestore limits shape the design. Transactions are capped at 500 writes, so large jobs such as payroll runs and MRP are chunked through background jobs. Cross-entity reports read pre-aggregated summary documents. Heavy analytics go to a BigQuery export (Phase 6).
- Indexes live in `firestore.indexes.json`. Rules stay deny-all for clients, because only the API touches Firestore.

**Modules**

- Modular monolith (§40): one NestJS module per domain, each owning its collections. Other modules read through its exported service, never its collections.
- Cross-module effects go through domain events (`SalesOrderConfirmed`, `GoodsReceived`, `InvoicePosted` …) on an in-process event bus with an outbox. Handlers are idempotent.
- Every state-changing endpoint has `@RequirePermission("<module>.<entity>.<action>")`, writes an audit entry, and is gated by the tenant's module activation.
- Statuses are configurable per tenant where the blueprint asks for it, with a fixed internal lifecycle underneath.

**Quality bar for "done"**

- Lint, type check and build pass for all three apps.
- Service tests against the Firestore emulator for every posting, transaction and status machine.
- The web screens for the feature work against the live API, including empty, loading and error states.
- Swagger is accurate, the CHANGELOG has an entry, and this plan's checkbox is ticked.

## 4. Phase overview

| Phase | Theme | Blueprint sections | Would ship as |
| --- | --- | --- | --- |
| 0 | Platform foundation | 2, 3, 4, 22, 24, 30, 34–36, 39, 40 | 0.5.0 |
| 1 | Core operations: CRM, products, sales, inventory, procurement | 5, 6, 7, 8, 9 | 0.6.0 |
| 2 | Financial core | 10 | 0.7.0 |
| 3 | Workforce: HR and payroll | 11, 12 | 0.8.0 |
| 4 | Operations: projects, tasks, assets, maintenance, support, portal, documents, calendar | 13, 14, 15, 16, 21, 25, 26 | 0.9.0 |
| 5 | Advanced operations: manufacturing, quality, warehouse, POS, logistics, marketing | 17, 18, 19, 20 | 0.10.0 |
| 6 | Intelligence and integrations | 23, 27, 28, 29, 37 | 0.11.0 |
| 7 | Hardening and launch | 30, 38, 39 | 1.0.0 |

The order follows blueprint §41/§42. Tier 1 (core plus finance) comes first, because a small company can run on CRM + Sales + Inventory + Finance alone (§45.5).

---

## Phase 0 — Platform foundation

**Goal:** the shared services every module depends on, so ports in later phases are mostly domain logic.

### 0.1 Data layer
- [x] `TenantRepository<T>` base: scoped `get/list/create/update`, cursor pagination, filters and sorting matched to declared indexes, optimistic concurrency (`version` field), soft archive.
- [x] Money and quantity value types plus helpers. Transactional document-number sequences per company and document type.
- [x] Domain event bus with a Firestore outbox and idempotent handler registry.
- [x] Background jobs: a Firestore-backed queue with a worker loop in the API container (retries, backoff, dead-letter) for email, PDFs, imports and chunked postings.
- [x] Firestore emulator test harness wired into CI (`npm test` in `api`).

### 0.2 Organisation structure (§3)
- [x] Branches/locations, departments, teams, cost centres, business units, reporting hierarchy.
- [x] Fiscal years and periods (open, soft-closed, locked) and currencies with exchange rates. Company time zone and locale are already on `CompanyDoc`.
- [ ] Group-of-companies view (parent company, already modelled as `parentId`).

### 0.3 Access and administration (§3, §30)
- [x] Module activation per tenant and company. The API rejects calls into disabled modules, and `web` navigation hides them (§2).
- [ ] Record-level scope on roles (own / team / branch / company / all) and field-level masking for sensitive fields such as salary and bank details.
- [x] Delegation, user suspension, session and device list with revoke, password policy.
- [x] MFA (TOTP; `mfaEnabled` and `mfaSecret` already exist on `UserDoc`).
- [ ] Audit trail writes from every mutating service: user, action, entity, id, before/after, reason, IP and device. Includes a viewer in `admin` and on each record.

### 0.4 Shared services (§3, §22, §24, §34)
- [x] Workflow and approval engine: definitions with trigger, conditions (amount, branch, department, category …), sequential and parallel levels, minimum approval count, delegation and substitutes, time limits, escalation, and approve, reject, request changes, reassign. Modules call `approvals.request(entity)` instead of hard-coding approvals.
- [x] Notifications: in-app centre (read/unread, mark all, categories, preferences, digests) and email through a provider adapter. SMS, WhatsApp and push adapters come in Phase 6.
- [x] Comments, tags, activity timeline, related-record links: one generic implementation keyed by `entityType` and `entityId`.
- [x] Documents and file storage on Cloudflare R2 (presigned upload/download, versioning, metadata, permission-checked access), attachable to any record.
- [x] Custom fields per entity type, with validation, list columns and filters.
- [x] Saved views (filters, columns, sort, shared or private).
- [x] Global search: a per-tenant search index collection maintained by events, with ranked prefix search across modules.
- [ ] Import/export framework (CSV/XLSX in, CSV/XLSX/PDF out), run as background jobs.

### 0.5 UI system in `web` (§34–§36)
- [x] Design-system components: `DataTable` (sorting, multi-filter, saved views, column chooser, bulk actions, inline edit, totals, density), `RecordPage` layout (header, tabs for overview, details, related, documents, activity, history), forms, empty/loading/error states, confirmations and undo toasts.
- [x] Command palette (⌘K) with quick-create and record search, keyboard shortcuts, breadcrumbs, dark/light theme.
- [x] Permission-aware and module-aware sidebar following the §2 navigation.
- [ ] Home dashboard framework: widget registry (KPI, chart, table, list, tasks, approvals, alerts), per-user layouts, role default dashboards (§4).
- [x] My Work: tasks, approvals waiting on me, requests and notifications (§25, foundation part).

**Exit:** a new module can be built using only the shared repository, events, approvals, audit, documents, custom fields and UI components, with no bespoke plumbing.

---

## Phase 1 — Core operations

**Goal:** Lead to Cash up to delivery, and Procure to Pay up to goods receipt (§32), on live data.

### 1.1 CRM (§5): port and extend
- [x] Leads with capture (manual, import, web-form endpoint), source and campaign attribution, rule-based scoring, assignment and routing rules, duplicate detection, conversion to contact, customer and opportunity.
- [x] Contacts (multiple per organisation, roles, communication preferences), and customers with segments, hierarchy, billing and delivery addresses, payment terms, credit limit, tax details, owner and status.
- [x] Opportunity pipeline (Kanban), stages with history, probability, forecast category, competitors, win/loss reasons.
- [x] Activities (call, email, meeting, visit, note, task, follow-up) on the shared timeline.
- [x] CRM analytics: sources, conversion, pipeline value, cycle time, win/loss, rep performance.

### 1.2 Products and services (§7)
- [x] Product master on the existing `Item` model, extended with types (stock, non-stock, service, bundle/kit, manufactured, digital), variants and attributes, units of measure with conversions, barcodes, images, tax category, costing method (FIFO, weighted average, standard), warranty, and lot/serial flags.
- [x] Pricing: price lists, customer-specific prices, quantity tiers, promotions and discount rules, currency, effective dates, price approval.

### 1.3 Sales (§6)
- [x] Quotes with versions and revisions, approval through the engine, PDF generation, email delivery, a customer accept/reject link, and conversion to order.
- [x] Sales orders: credit-limit check, stock availability, reservation, backorders, partial fulfilment, cancellation.
- [x] Fulfilment: pick, pack, dispatch, delivery, proof of delivery, delivery exceptions, returns/RMA.
- [ ] Sales analytics: revenue, AOV, margin, by product/customer/branch/rep, quote conversion.

### 1.4 Inventory and warehouse (§8)
- [x] Immutable stock ledger with on-hand, available, reserved, in-transit and on-order projections, and valuation.
- [x] Adjustments with reasons and approval, transfers between warehouses, counts and cycle counts with stock locks, negative-stock policy.
- [x] Lot/batch, serial and expiry tracking with traceability, plus reorder points and safety stock with a low-stock event.
- [x] Reports: on hand, valuation, movement, ageing, slow/fast moving, expiry, reorder, variance.

### 1.5 Procurement (§9)
- [x] Suppliers: categories, bank details, certifications, documents, status, performance score.
- [x] Requisitions (department, cost centre, project, budget validation) going through approval thresholds, then RFQ / competitive quotations, then PO. _Budget validation plugs in with Phase 2 budgeting._
- [x] Purchase orders with amendments, cancellation, supplier confirmation and partial receipts.
- [x] Goods receipts: accepted/rejected quantities, inspection hook, lot/serial capture, put-away, discrepancies, supplier returns.
- [x] Procurement analytics: spend by supplier/category/department, price variance, lead time, delivery performance.

**Exit:** a salesperson can take a lead to a delivered order, and a buyer can take a requisition to received stock, with approvals, audit and stock correct throughout.

---

## Phase 2 — Financial core

**Goal:** finance becomes the financial source of truth, fed automatically by Phase 1 events (§10).

- [x] Chart of accounts: hierarchy, groups, restrictions, opening balances, and posting rules mapping each event type to accounts.
- [x] General ledger: manual, automatic and recurring journals, approval, posting, reversal, period locking, trial balance. _Recurring journals run on demand (“Run due now”); a scheduled trigger comes with the Phase 7 scheduler._
- [x] Automatic postings from domain events: delivery → COGS, invoice → AR/revenue/tax, GRN → inventory/GRNI, supplier invoice → AP, payments. _Stock value, customer invoices, credit notes, receipts, write-offs, supplier bills, debit notes and payments all post automatically._
- [x] AR: invoices from order or delivery, deposit, milestone and recurring invoices, credit and debit notes, payments and allocation, statements, write-offs, ageing, dunning/collections, overdue alerts. _Dunning is a configurable days-overdue threshold (not yet a tenant setting); collections beyond the reminder email (disputes, promises to pay) is not modelled._
- [x] AP: supplier invoices, three-way match (PO/GRN/invoice), duplicate-invoice prevention, payment scheduling, batches and approvals, supplier statements, ageing. _Payment batches run without a separate approval step; approvals can be added through a workflow on `finance.payment`._
- [x] Banking and cash: accounts, petty cash, transfers, statement import (CSV/OFX), automatic and manual matching, reconciliation with history.
- [x] Expenses: categories, employee claims with receipt upload, approval, reimbursement, tax treatment.
- [x] Budgeting: annual/monthly budgets by department, branch, project and cost centre, revisions, approval, budget vs actual, alerts and hard/soft controls used by procurement. _Over-budget requisitions are flagged to approvers (`overBudget` fact) or refused; threshold notifications come with Phase 6 alerts._
- [x] Tax engine: codes, effective-dated rates, inclusive/exclusive pricing, exemptions, registration details, return reports and filing exports, configurable for Sri Lankan VAT/SSCL.
- [x] Fixed assets: register, depreciation methods and schedules, monthly depreciation posting, transfers, impairment, disposal.
- [x] Multi-currency transactions with realised and unrealised FX gain/loss.
- [x] Reports: P&L, balance sheet, cash flow, trial balance, GL and account ledgers, AR/AP ageing, statements, tax, budget vs actual, ratios, with drill-down to source documents.

**Exit:** the Finance day-in-the-life (§44) runs end to end, and the trial balance always balances.

---

## Phase 3 — Workforce

**Goal:** Hire to Retire (§32) and a compliant Sri Lankan payroll (§11, §12).

- [x] Employees: full record and the profile tabs from §11, positions, job grades, org chart, employment history, documents and certifications. Sensitive fields are masked by field-level permissions. _The §11 profile tabs map onto the shared record page: personal, employment, compensation, qualifications, certifications and employment history sit on the Details tab, with Documents and Activity from the Phase 0 platform. Attendance, Leave, Payroll, Performance, Assets and Training are later Phase 3 items with nothing to show yet. Record-level scope (Phase 0 open item) is still not done: any `hr.employee.view` holder sees every employee._
- [x] Recruitment/ATS: job requisitions with hiring approval, postings, public career page, candidate database, CV upload, the pipeline from §11 (Applied → … → Hired/Rejected), interviews, scorecards, offers. _CV upload is a link the candidate provides on the public apply form (Drive, Dropbox, LinkedIn …) rather than a direct upload: staff attach copies through the record's own Files tab. Hiring a candidate creates the employee record directly (department, position and manager from the requisition) and fills the requisition. Job descriptions/advertisements, candidate scoring and the pipeline are done; CV parsing, two-way communication sequences and verification (background checks) are not modelled, and analytics is left to the existing candidate list and filters rather than a dedicated report._
- [x] Onboarding and offboarding checklists that create tasks, user accounts, asset assignments and access provisioning (automation hooks). _The checklist itself starts automatically — on hire (onboarding) and on termination (offboarding) — with a standard set of items; that is the "automation hook" at this stage of the platform. There is no Tasks/My Work module yet (Phase 4) for items to turn into, and account/access/equipment items are reminders pointing at Settings → Users and the Assets register rather than one-click automated provisioning, since real user creation needs a password/invite flow and `AssetDoc.custodianId` has no enforced link to an employee yet. Both will become real hooks once Phase 4 Tasks and a clearer asset-custodian model exist._
- [x] Attendance: web/mobile/QR/PIN clock-in, breaks, timesheets, correction requests, late/early/absence, overtime, approval, a device-integration endpoint. _Device integration is a kiosk credential of its own: a bearer key shown once and stored as a SHA-256 hash, distinct from a normal user session, with QR (employee number only) and PIN as the two kiosk-side methods and web/mobile clock-in going through the signed-in self-service controller instead. Late/early/overtime are computed against one company-wide standard shift (§9 settings) rather than per-shift schedules, since Shifts has not been built yet; it is UTC-naive like the rest of the codebase, not per-company-timezone-aware. Correction requests are a single pending request per record with an HR approve/reject decision, not a full workflow. Attendance records get their own `large` list (one composite index pair) rather than the small in-memory list most HR entities use, since the collection grows one row per employee per day._
- [x] Shifts: templates, rotating shifts, assignments, swaps, holiday/night shifts, shift calendar. _An assignment snapshots its template's start/end time at creation (like an order line's price), so editing or retiring a template never changes a shift already assigned. "Rotating shifts" is served by assigning employees to different templates on different dates rather than a separate recurrence engine — there is no rule-based roster generator yet. A swap is between two specific assignments (one employee's shift for another's on possibly different dates), requested by the employee and decided by HR, which exchanges the two employees' `employeeId` in one transaction; there is no "offer to anyone" open marketplace. Attendance still computes late/early/overtime from the one company-wide standard shift (`AttendanceSettingsService`), not from each employee's actual assigned shift — wiring that up is left for later, now that both exist. This is the second `large` list in HR after Attendance._
- [x] Leave: all types, entitlements, accrual, carry-forward, requests and cancellation, approval, balances, holiday calendars, policy rules. _A balance is current state (one doc per employee per policy, like a stock balance), not a transaction log, so it stays bounded regardless of how many years pass; `rollover` resets it into a new year, carrying forward up to the policy's cap, run by hand (no scheduler, same "explicit run" convention as the depreciation run). Only "annual" accrual is automated — a full year's entitlement granted by `rollover`; a "monthly" policy needs a manual balance adjustment for now, since no incremental accrual run was built. Leave requests are whole days only (no half-day), counted as business days excluding weekends and `HolidayDoc` dates. Approval reuses the simple HR-decide pattern from Attendance's corrections and Shifts' swaps rather than the generic workflow engine, so there is no multi-level manager approval; a policy's `requiresApproval: false` auto-approves instead. The leave calendar shows approved leave by its start date in range, so a multi-day request that began earlier but continues into the range won't appear at its later dates — the same simplification Shifts' calendar makes. Leave requests get their own `large` list: unlike the Shifts-era guess that this wouldn't be needed, a few hundred employees requesting leave a dozen times a year clears the small-list bound in little over a year, so it needed the same treatment as Attendance and Shifts (see CLAUDE.md §5, now at 182/200 — Firestore's real ceiling, not the 180 this project had mistakenly assumed)._
- [x] Performance: cycles, goals/KPIs/OKRs, self, manager and peer reviews, ratings, development plans. _One `GoalDoc` type covers goals, KPIs and OKRs (a `type` field distinguishes them); goals and reviews are each their own `large` list (186/200 composite indexes now), since both grow at roughly the same per-employee-per-cycle rate that made Leave requests need one. A self-review is upserted by the employee (resubmitting while still a draft updates it; it's locked once submitted) rather than ever risking duplicates; a manager or peer review is a separate record created and filled in by whoever is doing it (no assigned-reviewer workflow) and only becomes visible to the employee once submitted — a manager's unfinished draft stays hidden. Promotion recommendation is a field on a manager review, not its own entity. There is no aggregated/weighted overall score, no multi-level approval on reviews (same simple HR-decide pattern as Attendance's corrections and Shifts' swaps), and "History" is the existing generic audit/activity timeline, nothing new. Goals and development plans are not linked to anything else yet (no automatic rating roll-up, no reminder when a goal's due date passes)._
- [ ] Employee self-service (§11): profile updates, payslips, leave, attendance, expenses, equipment and HR requests, announcements.
- [ ] Payroll: salary structures and components, the processing pipeline from §12 (attendance import → … → payslips), preview, validation, approval, locking, reruns, loans and advances, bank files, posting to the GL.
- [ ] Sri Lanka statutory pack: effective-dated EPF (employee/employer), ETF and APIT tables held as configuration, never hard-coded, with statutory returns.

**Exit:** a month's payroll runs from attendance to bank file and GL posting, and a past month re-run reproduces identical payslips.

---

## Phase 4 — Operations

**Goal:** Project to Profit (§32), the service side of the business, and collaboration tools.

- [ ] Projects: setup (customer, manager, team, budget, billing method), phases, milestones, WBS tasks and subtasks, dependencies, deliverables, resources.
- [ ] Project views: list, Kanban, calendar, timeline/Gantt, workload, milestones.
- [ ] Time tracking: timer, manual entries, weekly timesheets, billable flag, approval.
- [ ] Project financials: budget vs actual from labour, material, expense and contractor costs, billing (fixed, T&M, milestone, retainer, recurring) into AR, profitability and forecast.
- [ ] Tasks and My Work (§25): personal and assigned tasks, collaborators, checklists, recurrence, reminders, status flow To Do → In Progress → Blocked → Review → Completed.
- [ ] Calendar (§26): personal, team, leave, shift, project and delivery calendars, events and meetings with invitations, Google and Microsoft calendar sync.
- [ ] Asset management (§15): the EAM port plus IT assets, QR labels, check-in/check-out, assignment to employees, transfers, audits and missing assets, linked to fixed-asset depreciation.
- [ ] Maintenance (§16): preventive, corrective and emergency work orders, plans and schedules, inspections and checklists, parts reservation from inventory, labour, downtime, costs to asset history. Absorbs the field-service module (technicians, service contracts, service orders).
- [ ] Support desk (§14): tickets from portal, email and internal channels, the status flow from §14, assignment, SLA policies (tier, priority, business hours, holidays), escalation, merge, reopen, satisfaction surveys.
- [ ] Customer portal (§14): a separate login scope for customer users showing quotes (accept online), orders, deliveries, invoices and payments, projects, tickets, documents and contracts.
- [ ] Document management (§21): folders, categories, version history, expiry, approval, templates, e-signature through a provider adapter.

**Exit:** a customer can raise a ticket in the portal, and a project can be quoted, delivered, time-tracked, billed and shown as profitable.

---

## Phase 5 — Advanced operations

**Goal:** the Tier 3 specialised modules (§42).

- [ ] Manufacturing (§17): BOM versions with effective dates and alternates, scrap allowances, routings, work centres and machines, production orders, material reservation and issue, operation tracking, output, scrap/rework, WIP valuation, downtime, posting to the GL.
- [ ] MRP: demand from orders and forecasts, net requirements, planned production orders and planned purchases that convert into requisitions, capacity view.
- [ ] Quality (§17): inspection plans, incoming, in-process and finished inspections, sampling, defects, non-conformance and CAPA, linked to GRNs and production. Port of the quality module.
- [ ] EHS: port of incidents, risk assessments and permits to work (kept from the current codebase).
- [ ] Warehouse management (§8): zones, bins and racks, put-away rules, picking strategies (FIFO, FEFO, zone, wave), warehouse task queue, and a mobile barcode/QR scanning flow.
- [ ] POS (§20): terminals, cashier shifts with opening/closing cash, barcode cart, promotions, loyalty, split tender (cash, card, QR), refunds and exchanges, receipts, offline queue, inventory and GL posting.
- [ ] Logistics and fleet (§18): delivery orders, route planning (stops, sequence, ETA, capacity), driver app flow with proof of delivery, failed deliveries, vehicles, fuel logs, insurance and licence expiry, fleet costs.
- [ ] Marketing (§19): campaigns with budget, audience, channels and assets, segments from CRM, automated sequences (welcome, nurture, renewal, re-engagement), and campaign ROI and cost per lead.

**Exit:** a manufactured product can be planned, built, inspected, stocked, sold at the POS and delivered by route, with the cost flowing into finance.

---

## Phase 6 — Intelligence and integrations

**Goal:** the Tier 4 capabilities (§42), built on data the earlier phases made reliable.

- [ ] Automation engine (§23): a no-code builder of trigger → conditions → actions using the event bus and job queue, including the example automations in §23 as templates.
- [ ] Report builder (§27): data source, columns, filters, grouping, aggregation, calculated fields, pivot, exports to PDF, Excel and CSV, scheduled email delivery.
- [ ] Dashboard builder: add, resize and arrange widgets on any report or KPI, share by role. KPI definitions with targets and thresholds, and drill-down from KPI to the source ledger.
- [ ] Analytics store: a Firestore → BigQuery export for heavy cross-module reporting and forecasting.
- [ ] AI assistant (§28): natural-language questions answered with Claude through tools that call the existing permission-checked services, so it can only see what the user can see.
- [ ] AI document processing: extraction from invoices, receipts, POs, CVs and bank statements, then validation, then user review, then a **draft** record. Extraction never posts directly.
- [ ] AI insights and forecasting: sales, demand, cash flow, churn, supplier and project risk, expense anomalies.
- [ ] AI agents per domain with the permission tiers from §28 (read-only, draft, recommend, low-risk execute, approval-required execute). Every agent action is audited and routed through the approval engine.
- [ ] API platform (§29): API keys and OAuth clients with scoped permissions, versioned public REST API, rate limits, request logs, usage dashboard, outbound webhooks for the events listed in §29, integration health.
- [ ] Integrations: payment gateways, bank feeds, SMS/WhatsApp/push notification channels, Google Workspace and Microsoft 365, e-commerce order import, courier tracking.
- [ ] Mobile (§37): an installable PWA with focused flows for employees, sales reps, warehouse scanning, managers' approvals and drivers.

**Exit:** a user can ask "which invoices are overdue for branch X", get a correct permission-scoped answer, and turn the result into an automation or dashboard widget.

---

## Phase 7 — Hardening and 1.0

- [ ] Security (§30): SSO (SAML/OIDC), IP restrictions, login alerts, suspicious-activity detection, access reviews, encryption of sensitive fields at rest, retention policies.
- [ ] Reliability: scheduled Firestore exports and R2 backups with a tested restore runbook, structured logging, tracing, error monitoring, uptime alerts.
- [ ] Performance: load tests on posting paths, plus index and query review.
- [ ] Accessibility audit (WCAG 2.2 AA) and responsive pass across all screens.
- [ ] Industry templates (§38): module and configuration presets for retail, services, construction, manufacturing, distribution, hospitality and professional services, applied at tenant creation.
- [ ] Data migration tooling for onboarding a company from spreadsheets or another system.
- [ ] Documentation pass: ARCHITECTURE, BACKEND-SCHEMA, APP-FLOW and CONFIGURATION brought up to date.
- [ ] Release 1.0.0 through the release pull request into `main`.

---

## 13. Blueprint coverage map

| Blueprint section | Phase |
| --- | --- |
| 1 Vision · 2 Navigation | 0 |
| 3 Platform foundation | 0 (SSO and observability in 7) |
| 4 Dashboards | 0 framework, 6 builder |
| 5 CRM · 6 Sales · 7 Products · 9 Procurement | 1 |
| 8 Inventory and warehouse | 1 inventory, 5 warehouse management |
| 10 Finance | 2 |
| 11 HR · 12 Payroll | 3 |
| 13 Projects · 14 Support · 15 Assets · 16 Maintenance | 4 |
| 17 Manufacturing · 18 Logistics · 19 Marketing · 20 POS | 5 |
| 21 Documents | 0 storage, 4 management |
| 22 Workflow and approvals | 0 |
| 23 Automation | 0 event bus, 6 builder |
| 24 Notifications | 0 in-app and email, 6 other channels |
| 25 My Work · 26 Calendar | 0 and 4 |
| 27 BI and reporting | 6 (module reports ship with each module) |
| 28 AI | 6 |
| 29 Integrations and API | 6 |
| 30 Administration and security | 0 and 7 |
| 31 Integration matrix · 32 End-to-end workflows | Exit criteria of phases 1–5 |
| 33 Shared data · 34 Records · 35 Lists · 36 UI/UX | 0 |
| 37 Mobile | 5 (warehouse, driver) and 6 (PWA) |
| 38 Industry extensions | 7 |
| 39 Non-negotiable foundation · 40 Architecture | 0, enforced in every phase |
| 41–46 Roadmap, priorities, catalogue | This document |

## 14. Risks

| Risk | Mitigation |
| --- | --- |
| Firestore lacks joins and ad hoc aggregation for ERP reporting | Summary projections maintained by events, BigQuery export for heavy analytics, report queries designed with their indexes. |
| Transaction limits (500 writes) on payroll, MRP and bulk posting | Chunked background jobs with idempotent, resumable steps, and a per-run status document. |
| Scope: about 48 modules | Strict phase order. Each phase's exit criteria must pass before the next starts, and module activation keeps unfinished modules hidden. |
| No tests today | The emulator harness is built in Phase 0, and posting logic cannot merge without tests. |
| Statutory rules (tax, EPF/ETF/APIT) change | Effective-dated configuration tables, never constants in code. |
| One release at the end means a long gap before production | Any phase boundary can be cut as an intermediate release if needed. |
