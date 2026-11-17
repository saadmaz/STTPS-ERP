# Application Flow Document

<!-- nav -->
<sub><a href="../README.md">Project README</a> · <a href="README.md">Documentation index</a></sub>
## STTPS ERP Platform

**Version**: 1.0  
**Date**: 2026-05-24  
**Companion Documents**: PRD.md · TRD.md

---

## Table of Contents

1. [Application Shell & Layout](#1-application-shell--layout)
2. [Authentication Flows](#2-authentication-flows)
3. [Dashboard](#3-dashboard)
4. [Finance — General Ledger](#4-finance--general-ledger)
5. [Finance — Accounts Payable](#5-finance--accounts-payable)
6. [Finance — Accounts Receivable](#6-finance--accounts-receivable)
7. [Finance — Fixed Assets, Bank & Budgets](#7-finance--fixed-assets-bank--budgets)
8. [Inventory](#8-inventory)
9. [Procurement](#9-procurement)
10. [Sales](#10-sales)
11. [Manufacturing](#11-manufacturing)
12. [CRM](#12-crm)
13. [Human Resources](#13-human-resources)
14. [Asset Management (EAM)](#14-asset-management-eam)
15. [Field Service Management (FSM)](#15-field-service-management-fsm)
16. [Quality Management](#16-quality-management)
17. [Environment, Health & Safety (EHS)](#17-environment-health--safety-ehs)
18. [Projects](#18-projects)
19. [Cross-Module Data Flows](#19-cross-module-data-flows)
20. [Common UI Patterns](#20-common-ui-patterns)
21. [Navigation Map](#21-navigation-map)

---

## 1. Application Shell & Layout

### 1.1 Shell Structure

Every protected page is wrapped in a two-panel layout:

```
┌─────────────────────────────────────────────────────────┐
│  TOPBAR (h-16, white, border-b)                         │
│  [Page Title]      [Company Switcher] [Bell] [User Menu]│
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│ SIDEBAR  │  PAGE CONTENT                               │
│ (w-60,   │  (flex-1, overflow-y-auto, p-6)             │
│ slate-   │                                              │
│ 900 bg)  │                                              │
│          │                                              │
│ v0.7.0   │                                              │
└──────────┴──────────────────────────────────────────────┘
```

### 1.2 Sidebar Navigation

The sidebar (`Sidebar.tsx`) is a dark (`bg-slate-900`) fixed-width (`w-60`) panel containing:

- **Logo area** — "S" icon in blue + "STTPS / Enterprise ERP" wordmark
- **Navigation tree** — collapsible module groups, each with child links
- **Version footer** — `v0.7.0 — Phase 7`

**Collapse behaviour**: Each top-level module item (Finance, Procurement, etc.) is a toggle button. When clicked, it expands or collapses its children. The group auto-expands on load if any child URL matches the current pathname.

**Active state**:
- Parent group active: `text-white bg-blue-600/20`
- Leaf page active: `text-white bg-blue-600 font-medium`
- Inactive: `text-slate-400 hover:text-white hover:bg-slate-800`

**Full navigation tree** (in sidebar order):

```
Dashboard                              /dashboard
Finance
  ├── Overview                         /finance
  ├── Chart of Accounts                /finance/accounts
  ├── Journal Entries                  /finance/journals
  ├── Trial Balance                    /finance/trial-balance
  ├── Accounts Payable                 /finance/ap
  ├── Accounts Receivable              /finance/ar
  ├── Cash & Bank                      /finance/bank
  ├── Fixed Assets                     /finance/assets
  ├── Budgets                          /finance/budgets
  ├── P&L Report                       /finance/reports/pl
  ├── Balance Sheet                    /finance/reports/balance-sheet
  └── Fiscal Periods                   /finance/periods
Procurement
  ├── Overview                         /procurement
  ├── Requisitions                     /procurement/requisitions
  ├── Purchase Orders                  /procurement/orders
  ├── Goods Receipts                   /procurement/receipts
  └── Suppliers                        /procurement/suppliers
Inventory
  ├── Overview                         /inventory
  ├── Items                            /inventory/items
  ├── Warehouses                       /inventory/warehouses
  ├── Stock Levels                     /inventory/stock-levels
  ├── Stock Movements                  /inventory/movements
  └── Stock Count                      /inventory/count
Manufacturing
  ├── Overview                         /manufacturing
  ├── Production Orders                /manufacturing/orders
  ├── Bill of Materials                /manufacturing/bom
  ├── Work Centers                     /manufacturing/work-centers
  ├── Routings                         /manufacturing/routings
  └── MRP                              /manufacturing/mrp
CRM
  ├── Overview                         /crm
  ├── Leads                            /crm/leads
  ├── Opportunities                    /crm/opportunities
  ├── Accounts                         /crm/accounts
  ├── Contacts                         /crm/contacts
  └── Activities                       /crm/activities
Sales
  ├── Overview                         /sales
  ├── Quotations                       /sales/quotes
  ├── Sales Orders                     /sales/orders
  ├── Deliveries                       /sales/deliveries
  └── Price Lists                      /sales/price-lists
Human Resources
  ├── Overview                         /hr
  ├── Employees                        /hr/employees
  ├── Leave                            /hr/leave
  ├── Payroll                          /hr/payroll
  └── Recruitment                      /hr/recruitment
Asset Management
  ├── Overview                         /eam
  ├── Assets                           /eam/assets
  ├── Work Orders                      /eam/work-orders
  └── Maintenance Plans                /eam/plans
Field Service
  ├── Overview                         /fsm
  ├── Service Orders                   /fsm/orders
  ├── Technicians                      /fsm/technicians
  └── Contracts                        /fsm/contracts
Projects
  ├── Overview                         /projects
  ├── Tasks                            /projects/tasks
  └── Timesheets                       /projects/timesheets
Quality
  ├── Overview                         /quality
  ├── Inspections                      /quality/inspections
  ├── Non-Conformances                 /quality/ncr
  └── Audits                           /quality/audits
EHS
  ├── Overview                         /ehs
  ├── Incidents                        /ehs/incidents
  ├── Risk Assessments                 /ehs/risks
  └── Permits to Work                  /ehs/permits
Analytics
  ├── Dashboards                       /analytics
  └── Reports                          /analytics/reports
Settings
  ├── Companies                        /settings/companies
  ├── Users & Roles                    /settings/users
  └── System                           /settings/system
```

### 1.3 Topbar

The topbar (`Topbar.tsx`) is a white `h-16` header fixed at the top, containing:

#### Company Switcher (left of right cluster)
- Displays active company name + building icon + chevron
- Click → dropdown with a "Switch Company" header and a list of all companies the user belongs to
- Active company shows a blue dot indicator and blue text
- Selecting a different company → calls `switchCompany(id)` → updates `sessionStorage["company_id"]` → all subsequent API calls use the new company → React Query cache is scoped by company ID so data refreshes automatically

#### Notifications Bell
- Static bell icon with a red dot badge (notifications not yet implemented)

#### User Menu (rightmost)
- Shows user avatar (blue circle with initials), full name, and email
- Click → dropdown with:
  - User info header (name + email)
  - "My Profile" (not yet linked)
  - "Settings" (not yet linked)
  - Separator
  - "Sign out" in red → calls `logout()` → clears sessionStorage + cookie → redirects to `/login`

---

## 2. Authentication Flows

### 2.1 Registration Flow

**URL**: `/register`  
**Access**: Public (no authentication required)

```
User arrives at /register
        │
        ▼
┌─────────────────────────────────────┐
│         Create your account         │
│  "Start your free STTPS workspace"  │
│                                     │
│  [First name*]    [Last name*]       │
│  [Work email*]                      │
│  [Organization name*]               │  ← auto-generates slug as user types
│  [sttps.live/ | org-slug*]          │  ← slug: lowercase, hyphens only
│  [Company name (optional)]          │
│  [Password* (min 8 chars)] [👁]     │
│                                     │
│  [Create account]  (full-width btn) │
│                                     │
│  Already have an account? Sign in   │
└─────────────────────────────────────┘
        │
        │ Submit
        ▼
   POST /auth/register
        │
   ┌────┴─────┐
   │ Success  │ → toast "Account created! Please sign in."
   │          │ → router.push("/login")
   └──────────┘
   ┌────┴─────┐
   │ Error    │ → toast.error(message)
   │ 409 slug │   "Organization slug is already taken"
   │ 409 email│   "Email is already registered"
   └──────────┘
```

**Slug auto-generation**: As the user types the organization name, the slug field is auto-populated by converting to lowercase, replacing spaces with hyphens, stripping special characters, and capping at 32 characters. The user can manually edit the slug.

**What happens server-side**: A single transaction creates Tenant + Company (code: "MAIN") + User (isSuperAdmin: true) + CompanyUser (isDefault: true) + Administrator Role + UserRole assignment.

---

### 2.2 Login Flow

**URL**: `/login`  
**Access**: Public  
**Demo credentials**: Pre-filled — `admin@demo.sttps.live` / `Admin@123`

```
User arrives at /login  (or redirected here by middleware with ?next=/some/path)
        │
        ▼
┌─────────────────────────────────────┐
│              Sign in                │
│   "Access your ERP workspace"       │
│                                     │
│  [Email address]                    │
│  [Password] [👁 toggle]             │
│                                     │
│  [Sign in]  ← shows spinner while  │
│               submitting            │
│                                     │
│  Demo credentials are pre-filled    │
│  New to STTPS? Create account       │
└─────────────────────────────────────┘
        │
        │ Submit
        ▼
  authApi.login(email, password)
  POST /auth/login
        │
   ┌────┴────────────────────────────┐
   │ Success                         │
   │ → sessionStorage["access_token"]│
   │ → sessionStorage["company_id"]  │
   │ → document.cookie sttps_session │
   │ → loadUser() (GET /auth/me)     │
   │ → router.push(next || /dashboard│
   │ → toast "Welcome back!"         │
   └─────────────────────────────────┘
   ┌────┴────────────────────────────┐
   │ Error (401)                     │
   │ → toast.error("Invalid email   │
   │   or password")                 │
   └─────────────────────────────────┘
```

**Post-login state**:
- Access token stored in `sessionStorage["access_token"]`
- Default company ID stored in `sessionStorage["company_id"]`
- `sttps_session=1` cookie set (used by Next.js middleware to gate protected routes)
- AuthContext populated: `user`, `companies[]`, `activeCompany`

---

### 2.3 Protected Route Enforcement

```
Browser navigates to /dashboard (or any protected route)
        │
        ▼
Next.js middleware runs (middleware.ts)
        │
  Is pathname in [/login, /register, /api]?
        │
       Yes → next() (allow through)
        │
        No
        │
  Does request cookie contain "sttps_session"?
        │
       Yes → next() (allow, API validates JWT)
        │
        No → redirect to /login?next=/dashboard
```

---

### 2.4 Token Refresh Flow (Transparent)

This happens automatically in the axios response interceptor whenever any API call returns 401:

```
API call returns 401
        │
  Is a refresh already in progress?
        │
       Yes → queue this request, wait for refresh to complete
        │
        No → set isRefreshing = true
             POST /auth/refresh (uses httpOnly cookie)
                │
           ┌────┴──────────────────────────┐
           │ Success                        │
           │ → new accessToken returned     │
           │ → sessionStorage updated       │
           │ → all queued requests replayed │
           └────────────────────────────────┘
           ┌────┴──────────────────────────┐
           │ Failure                        │
           │ → sessionStorage.clear()       │
           │ → window.location = /login     │
           └────────────────────────────────┘
```

---

### 2.5 Logout Flow

```
User clicks "Sign out" in user menu
        │
        ▼
logout() in AuthContext
        │
  POST /auth/logout  (server invalidates session record)
        │
  sessionStorage.clear()
  cookie "sttps_session" cleared (max-age=0)
  setUser(null), setCompanies([]), setActiveCompany(null)
        │
  window.location.href = "/login"
```

---

## 3. Dashboard

**URL**: `/dashboard`  
**API**: `GET /finance/gl/dashboard`

```
┌──────────────────────────────────────────────────────────────┐
│ Dashboard                        Monday, 24 May 2026         │
│ Acme Corporation                                             │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────┐ │
│  │ AR          │ │ AP          │ │ Posted      │ │ Total │ │
│  │ Outstanding │ │ Outstanding │ │ Journals    │ │Journals│ │
│  │  $1.2M      │ │  $890K      │ │    142      │ │  156  │ │
│  │ $3.5M total │ │ $2.1M total │ │ 14 drafts   │ │       │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └───────┘ │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────┐ │
│  │ Active      │ │ Active      │ │ Draft       │ │ Net   │ │
│  │ Vendors     │ │ Customers   │ │ Journals    │ │Position│ │
│  │    24       │ │    38       │ │    14       │ │ $310K │ │
│  │             │ │             │ │ Require post│ │AR-AP  │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └───────┘ │
│                                                              │
│  ┌────────────────────────────────────┐ ┌────────────────┐  │
│  │ Quick Actions                      │ │ System Status  │  │
│  │  [New Journal] [Chart of Accounts] │ │ GL       Active│  │
│  │  [AP Invoices] [AR Invoices]       │ │ AP       Active│  │
│  │  [Trial Balance] [Vendors]         │ │ AR       Active│  │
│  └────────────────────────────────────┘ │ Inventory Soon │  │
│                                         │ Mfg      Soon  │  │
│                                         │ HR       Soon  │  │
│                                         └────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**Loading state**: 8 skeleton `stat-card` placeholders animate while data fetches.

**No company selected state**: Full-width card with alert icon — "No company selected. Use the company switcher in the top bar."

**Quick Action tiles**: Each tile links directly to its module. Color-coded (blue for journals, green for CoA, red for AP, emerald for AR, purple for trial balance, orange for vendors).

---

## 4. Finance — General Ledger

### 4.1 Chart of Accounts

**URL**: `/finance/accounts`  
**API**: `GET /finance/gl/accounts`

```
┌────────────────────────────────────────────────────────────┐
│ Chart of Accounts                [+ New Account]           │
│ 47 accounts in Acme Corporation                            │
├────────────────────────────────────────────────────────────┤
│ Code     Name              Type        Parent    Posting   │
│ ─────────────────────────────────────────────────────────  │
│ 1000     Current Assets    ASSET       —         ○         │
│ 1100     Cash              ASSET       1000      ●         │
│ 1200     Accounts Recv.    ASSET       1000      ●         │
│ 2000     Current Liab.     LIABILITY   —         ○         │
│ 2100     Accounts Pay.     LIABILITY   2000      ●         │
│ ...                                                        │
└────────────────────────────────────────────────────────────┘
```

**Accounts are sorted by code ascending**. Parent accounts show `○` (not posting); leaf accounts show `●` (posting = can receive journal lines).

**New Account modal**:
```
New GL Account
  [Code *]         [Name *]
  [Type *]         (ASSET / LIABILITY / EQUITY / REVENUE / EXPENSE)
  [Subtype]        [Currency]     [Parent account]
  [Description]
  [☑ Is Posting Account]
  [Cancel]  [Create Account]
```

---

### 4.2 Fiscal Periods

**URL**: `/finance/periods`  
**API**: `GET /finance/gl/periods?fiscalYear=2026`

Displays a table of 12 periods for the selected fiscal year. Each period shows: period number, name, start date, end date, and status badge (OPEN/CLOSED).

**Status badge colours**:
- `OPEN` → green
- `CLOSED` → slate

---

### 4.3 Journal Entries

**URL**: `/finance/journals`  
**APIs**: List, Create, Post, Void

#### List View
```
┌────────────────────────────────────────────────────────────────┐
│ Journal Entries                              [+ New Journal]   │
│ 156 entries in Acme Corporation                                │
├────────────────────────────────────────────────────────────────┤
│ [🔍 Search by number, description or reference...]            │
├────────────────────────────────────────────────────────────────┤
│ Number     Date        Description  Ref   Debit    Credit  Status  │
│ JE-000001  24 May 2026 Rent expense ...   5,000.00 5,000.00 DRAFT  │
│ JE-000002  23 May 2026 Payroll      ...  50,000.00 ...      POSTED │
├────────────────────────────────────────────────────────────────┤
│ Showing 1–25 of 156     [Previous]  Page 1 of 7  [Next]        │
└────────────────────────────────────────────────────────────────┘
```

**Row actions**:
- `👁 Eye` → opens View Journal modal
- `✓ CheckCircle` (DRAFT only) → immediately posts journal (`PATCH .../post`)

**Status badge colours**:
- `DRAFT` → yellow
- `POSTED` → green
- `REVERSED` → slate
- `VOID` → red

#### Create Journal Modal (`showCreate = true`)

```
New Journal Entry                                          [X]
  [Date *]     [Reference]     [Currency USD▾]
  [Description]

  Journal Lines                    Dr: 5,000.00 | Cr: 5,000.00 ✓ Balanced
  ┌────────────────────┬──────────────┬─────────┬─────────┬───┐
  │ Account            │ Description  │   Debit │  Credit │   │
  ├────────────────────┼──────────────┼─────────┼─────────┼───┤
  │ [1100 — Cash    ▾] │ [Rent pymnt] │ [  0.00]│[5000.00]│   │
  │ [6100 — Rent    ▾] │ [May rent]   │[5000.00]│[   0.00]│ 🗑│
  └────────────────────┴──────────────┴─────────┴─────────┴───┘
  [+ Add Line]

  [Cancel]                              [Save as Draft]
```

**Live balance indicator**: Updates as user types. Shows `✓ Balanced` in green when `|totalDebits - totalCredits| < 0.001`, otherwise `✗ Unbalanced` in red.

**Submit button disabled** when journal is unbalanced.

**Min 2 lines** required. Lines can be added with `+ Add Line`. Lines ≥ 3 show a trash icon.

Account dropdown only shows `isPosting = true` and `isActive = true` accounts.

**On success**: query cache for `["gl-journals"]` and `["finance-dashboard"]` are invalidated → list auto-refreshes.

#### View Journal Modal (`selectedJournal != null`)

```
JE-000002                                        [Post Journal]  DRAFT  [X]
24 May 2026

  Account             Description      Debit       Credit
  1100 — Cash         Rent payment     —           5,000.00
  6100 — Rent Exp.    May 2026 rent    5,000.00    —
  ─────────────────────────────────────────────────────
  Total                                5,000.00    5,000.00
```

If status is DRAFT: "Post Journal" primary button shown. Clicking it calls `PATCH .../post`.

---

### 4.4 Trial Balance

**URL**: `/finance/trial-balance`  
**API**: `GET /finance/gl/trial-balance?fiscalYear=2026&period=5`

User selects fiscal year and optionally a period. The table shows all active accounts with non-zero activity:

```
Trial Balance — FY 2026, Period 5 (May)

Account Code  Name                 Type       Debit        Credit
1100          Cash                 ASSET      125,000.00   80,000.00
2100          Accounts Payable     LIABILITY  10,000.00    45,000.00
4000          Revenue              REVENUE    0.00         200,000.00
6100          Rent Expense         EXPENSE    5,000.00     0.00
──────────────────────────────────────────────────────────────────
              Total                           140,000.00   325,000.00
```

---

### 4.5 Financial Reports

#### P&L Report — `/finance/reports/pl`
**API**: `GET /finance/reports/pl?fiscalYear=2026&fromPeriod=1&toPeriod=5`

User selects fiscal year and period range. Output: Revenue accounts (credit-normal), Expense accounts (debit-normal), Net Income = Revenue − Expenses.

#### Balance Sheet — `/finance/reports/balance-sheet`
**API**: `GET /finance/reports/balance-sheet?fiscalYear=2026&asOfPeriod=5`

User selects fiscal year and as-of period. Output: Assets section, Liabilities section, Equity section. Bottom line: Assets = Liabilities + Equity.

---

## 5. Finance — Accounts Payable

### 5.1 AP Invoice List

**URL**: `/finance/ap`  
**APIs**: List invoices, Create, Approve, Post

```
┌──────────────────────────────────────────────────────────────────┐
│ Accounts Payable             [Vendors] [⏱ Aging Report] [+ New] │
│ 38 invoices in Acme Corporation                                  │
├──────────────────────────────────────────────────────────────────┤
│ [🔍 Search invoices...]                  [All statuses ▾]       │
├──────────────────────────────────────────────────────────────────┤
│ Invoice #  Vendor       Date       Due Date   Total    Balance  Status   │
│ AP-000001  Acme Supply  24 May     23 Jun    5,000.00 5,000.00  DRAFT    │
│ AP-000002  Office World 20 May     19 Jun    1,200.00    0.00   POSTED   │
├──────────────────────────────────────────────────────────────────┤
│ Showing 1–25 of 38      [Previous]  Page 1 of 2  [Next]          │
└──────────────────────────────────────────────────────────────────┘
```

**Status filter** dropdown: All statuses / DRAFT / PENDING_APPROVAL / APPROVED / POSTED / PAID / CANCELLED

**Row actions**:
- `👁 Eye` → View Invoice modal
- `✓` (DRAFT) → Approve invoice inline
- `✓` (APPROVED) → Post invoice inline (green colour)

**Status badge colours**:
- `DRAFT` → yellow
- `APPROVED` → purple
- `POSTED` → green
- `PAID` → slate
- `CANCELLED` → red

### 5.2 AP Invoice Lifecycle (Status Flow)

```
[Create] → DRAFT → [Approve] → APPROVED → [Post] → POSTED
                                                        │
                                                  GL journal auto-created
                                                  (Dr: Expense/Asset accounts)
                                                  (Cr: Accounts Payable)
```

### 5.3 Create AP Invoice Modal

```
New AP Invoice                                             [X]
  Vendor *    [Select vendor...▾]
  [Invoice Date *]   [Due Date *]   [Vendor Ref]
  [Notes]

  Lines                              Total: 5,000.00
  ┌────────────────────┬───────────────────┬──────────┬───┐
  │ Account (Expense)  │ Description       │  Amount  │   │
  ├────────────────────┼───────────────────┼──────────┼───┤
  │ [6100 — Rent ▾]    │ [May 2026 rent]   │[5,000.00]│   │
  │ [6200 — Utilities▾]│ [Electricity]     │[  350.00]│ 🗑│
  └────────────────────┴───────────────────┴──────────┴───┘
  [+ Add Line]

  [Cancel]                          [Create Invoice]
```

Account dropdown filtered to **EXPENSE type, isPosting, isActive** accounts only.

Due date defaults to **today + 30 days** (vendor's default paymentTerms).

### 5.4 View AP Invoice Modal

Shows invoice header (vendor name, date, due date, vendor ref, currency) + line table (description, amount, tax) + totals row + action buttons (Approve / Post based on current status).

### 5.5 AP Vendors

**URL**: `/finance/ap/vendors`

Standard list page with search. Columns: Code, Name, Email, Phone, Currency, Payment Terms, Status. New Vendor modal with fields: code, name, legal name, tax ID, email, phone, currency, payment terms (days), address, bank details.

### 5.6 AP Aging Report

**URL**: `/finance/ap/aging`  
**API**: `GET /finance/ap/aging`

Groups unpaid/outstanding vendor invoices by aging buckets:

| Vendor | Current (0–30) | 31–60 | 61–90 | 90+ | Total |
|---|---|---|---|---|---|
| Acme Supply | 5,000 | 0 | 0 | 0 | 5,000 |
| Office Depot | 0 | 1,200 | 0 | 800 | 2,000 |

---

## 6. Finance — Accounts Receivable

### 6.1 AR Invoice List

**URL**: `/finance/ar`  
**APIs**: List, Create, Post

Mirrors AP structure with customer context:

```
┌──────────────────────────────────────────────────────────────┐
│ Accounts Receivable       [Customers] [⏱ Aging] [+ New]     │
│ 52 invoices in Acme Corporation                              │
├──────────────────────────────────────────────────────────────┤
│ [🔍 Search...]                          [All statuses ▾]    │
├──────────────────────────────────────────────────────────────┤
│ Invoice #  Customer     Date       Due Date  Total   Status  │
│ AR-000001  BigCo Ltd    24 May     23 Jun    12,000  DRAFT   │
│ AR-000002  MediumCorp   20 May     19 Jun     8,500  POSTED  │
└──────────────────────────────────────────────────────────────┘
```

**AR Invoice Lifecycle**:
```
[Create] → DRAFT → [Post] → POSTED
                                │
                          GL journal auto-created
                          (Dr: Accounts Receivable)
                          (Cr: Revenue accounts)
```

Note: AR has no Approve step — goes directly from DRAFT to POSTED.

### 6.2 AR Customers

**URL**: `/finance/ar/customers`

Standard list with search. New Customer modal: code, name, legal name, tax ID, email, phone, currency, payment terms, credit limit, address.

### 6.3 AR Aging Report

**URL**: `/finance/ar/aging`

Same bucket structure as AP aging but for outstanding customer invoices.

---

## 7. Finance — Fixed Assets, Bank & Budgets

### 7.1 Fixed Assets

**URL**: `/finance/assets`  
**APIs**: `GET /finance/assets/summary`, list, get, create, update, dispose, runDepreciation

**Dashboard** shows total asset count, total cost, accumulated depreciation, net book value.

**Asset list** columns: Code, Name, Category, Purchase Date, Cost, Accumulated Depreciation, Net Book Value, Status.

**Dispose flow**: Select asset → click Dispose → modal asks for disposal date and disposal amount → `PATCH /finance/assets/:id/dispose` → asset status changes to DISPOSED, GL journal records gain/loss on disposal.

**Run Depreciation**: Button on assets page → selects as-of date → `POST /finance/assets/depreciation/run?asOfDate=` → creates depreciation GL journals for all active depreciable assets.

### 7.2 Bank & Cash

**URL**: `/finance/bank`  
**APIs**: Summary, list accounts, transactions

**Summary dashboard**: Total cash balance across all bank accounts.

**Bank account list**: Account name, bank name, account number, currency, current balance.

**Transaction list per account**: Date, description, reference, debit, credit, running balance.

**New Transaction modal**: Type (DEPOSIT / WITHDRAWAL / TRANSFER), date, description, amount, GL account to debit/credit.

### 7.3 Budgets

**URL**: `/finance/budgets`  
**APIs**: List, get, create, approve, vs-actual

**Budget list** columns: Name, Fiscal Year, Status, Total Amount.

**Budget detail**: Shows period-by-period breakdown per GL account.

**Budget vs. Actual** (`GET /finance/budgets/:id/vs-actual`): Side-by-side table — Budget Amount, Actual Amount, Variance, Variance %.

**Approve flow**: `PATCH /finance/budgets/:id/approve` → status changes from DRAFT to APPROVED, locks the budget for editing.

---

## 8. Inventory

### 8.1 Inventory Dashboard

**URL**: `/inventory`  
**API**: `GET /inventory/summary`

KPI cards: Total SKUs, Total Stock Value, Low Stock Items (below reorder point), Warehouses.

### 8.2 Items (Item Master)

**URL**: `/inventory/items`  
**APIs**: List (paginated + search), Create, Update

```
┌─────────────────────────────────────────────────────────────┐
│ Items                                       [+ New Item]    │
│ 124 items                                                   │
├─────────────────────────────────────────────────────────────┤
│ [🔍 Search items...]                                        │
├─────────────────────────────────────────────────────────────┤
│ Code    Name            Cat.   Type   UOM  Std Cost  Price  On Hand │
│ ITM-001 Office Chair    Furn.  PROD   EA    120.00   250.00  48.00  │
│ ITM-002 Paper A4        Office CONS   BOX     8.00    15.00   0.00  ← Red (below reorder) │
└─────────────────────────────────────────────────────────────┘
```

**On Hand quantity** turns **red** when it is at or below the item's `reorderPoint` (and reorderPoint > 0).

**New Item modal**:
```
New Item                                                   [X]
  [Code *]        [Name *]
  [Description]
  [Type ▾]        [UOM ▾]       [Category ▾]
  [Standard Cost] [List Price]
  [Reorder Point] [Reorder Qty]
  [Cancel]                         [Create Item]
```

Item Types: `PRODUCT`, `SERVICE`, `CONSUMABLE`, `RAW_MATERIAL`  
UOMs: `EA`, `KG`, `LT`, `M`, `M2`, `M3`, `BOX`, `PALLET`, `SET`

### 8.3 Warehouses

**URL**: `/inventory/warehouses`  
**APIs**: List, Create warehouse, Create storage location

Warehouse list shows: Code, Name, Address, Location count.

Expand a warehouse → view its storage locations (zone, aisle, bin structure).

**New Warehouse modal**: code, name, address.

**New Storage Location modal**: warehouse, code, name, zone, aisle, bin.

### 8.4 Stock Levels

**URL**: `/inventory/stock-levels`  
**API**: `GET /inventory/stock-levels?warehouseId=&itemId=`

Filter by warehouse and/or item. Table columns: Item Code, Item Name, Warehouse, Quantity on Hand, Last Movement Date. Rows below reorder point highlighted.

### 8.5 Stock Movements

**URL**: `/inventory/movements`  
**APIs**: List (paginated, filter by item/warehouse), Create

Movement types: `RECEIPT`, `ISSUE`, `TRANSFER`, `ADJUSTMENT`, `COUNT`

**New Movement modal**:
```
New Stock Movement                                         [X]
  [Item *]          [Warehouse *]
  [Movement Type ▾] [Reference]
  [Quantity *]      [Unit Cost]
  [Notes]
  [Cancel]           [Create Movement]
```

### 8.6 Stock Count (Physical Inventory)

**URL**: `/inventory/count`  
**APIs**: List, Create, Get detail, Post

**Stock Count lifecycle**:
```
[Create Count] → (add items + counted quantities) → [Post Count]
                                                          │
                                            System computes variance
                                            Creates ADJUSTMENT movements
                                            Updates stock levels
```

**Create Count modal**: warehouse, reference, count date, notes.

**Count detail**: Table of items with columns: Item, System Quantity, Counted Quantity, Variance. User fills in counted quantities.

**Post button** finalises the count — creates adjustment movements for all variances and locks the count from further editing.

---

## 9. Procurement

### 9.1 Procurement Dashboard

**URL**: `/procurement`  
**API**: `GET /procurement/dashboard`

KPIs: Open PRs, Open POs, Pending Receipts, Total PO Value (month).

### 9.2 Purchase Requisitions (PR)

**URL**: `/procurement/requisitions`  
**APIs**: List, Create, Get, Approve

```
PR Lifecycle:
DRAFT → SUBMITTED → APPROVED
```

**List columns**: PR Number, Requested By, Date, Line Count, Status.

**New PR modal**:
```
New Purchase Requisition                                   [X]
  Lines:
  ┌──────────────────┬────────┬──────────────┬────────────┐
  │ Item             │ Qty    │ Requested Date│ Notes      │
  ├──────────────────┼────────┼──────────────┼────────────┤
  │ [Item ▾]         │ [1.00] │ [2026-06-01]  │ []         │
  └──────────────────┴────────┴──────────────┴────────────┘
  [+ Add Line]
  [Cancel]                      [Submit Requisition]
```

**Approve action**: `POST /procurement/requisitions/:id/approve` → status changes to APPROVED. Approved PRs can be converted to Purchase Orders.

### 9.3 Purchase Orders (PO)

**URL**: `/procurement/orders`  
**APIs**: List, Create, Get, Approve

```
PO Lifecycle:
DRAFT → APPROVED → (PARTIAL) → RECEIVED
                                    │
                               GRN created
```

**List columns**: PO Number, Vendor, Order Date, Expected Date, Total, Status.

**Status filter**: All / DRAFT / APPROVED / PARTIAL / RECEIVED / CANCELLED

**New PO** (uses local state, not react-hook-form):
```
New Purchase Order                                         [X]
  [PO Number]        [Vendor *]
  [Order Date]       [Expected Date]
  [Currency]         [Notes]

  Lines:
  ┌──────────┬──────┬─────┬─────────────┬─────────┐
  │ Item     │ Qty  │ UOM │  Unit Price │  Total  │
  ├──────────┼──────┼─────┼─────────────┼─────────┤
  │ [Item ▾] │ [1]  │ [EA]│ [   0.00]   │ [0.00]  │
  └──────────┴──────┴─────┴─────────────┴─────────┘
  [+ Add Line]

  Grand Total: 0.00
  [Cancel]                        [Create PO]
```

PO number auto-generated: `PO-{year}-{last 4 digits of timestamp}`.

**Approve action**: Row button → `POST /procurement/orders/:id/approve`.

**View PO detail**: Modal shows full header + line items with quantities, unit prices, received quantities.

### 9.4 Goods Receipts (GRN)

**URL**: `/procurement/receipts`  
**APIs**: List, Create, Get, Post

```
GRN Lifecycle:
DRAFT → POSTED
           │
     Stock movements (RECEIPT type) created
     GL journal created (Dr: Inventory, Cr: GR/IR)
```

**Create GRN modal**:
```
New Goods Receipt                                          [X]
  [Purchase Order *]     [GRN Number]     [Receipt Date]

  Lines (auto-populated from PO):
  ┌──────────┬──────────────┬──────────────┬──────────────────┐
  │ Item     │ PO Qty       │ Received Qty │ Storage Location │
  ├──────────┼──────────────┼──────────────┼──────────────────┤
  │ Item A   │ 100          │ [100]        │ [WH1-A01-B01 ▾]  │
  └──────────┴──────────────┴──────────────┴──────────────────┘
  [Cancel]                          [Create GRN]
```

**Post GRN**: `POST /procurement/receipts/:id/post` → creates stock movements and GL journal in a transaction.

### 9.5 Suppliers

**URL**: `/procurement/suppliers`

Same vendor master as AP vendors. Search by name. Columns: Code, Name, Email, Currency, Payment Terms, Status. Link to "New Vendor" opens vendor creation modal.

---

## 10. Sales

### 10.1 Sales Dashboard

**URL**: `/sales`  
**API**: `GET /sales/dashboard`

KPIs: Open Quotes, Open Orders, Pending Deliveries, Revenue this month.

### 10.2 Quotations

**URL**: `/sales/quotes`  
**APIs**: List, Create, Approve, Convert to Order

```
Quote Lifecycle:
DRAFT → APPROVED → CONVERTED (to Sales Order)
                       │
                  Sales Order created automatically
```

**Status badge colours**:
- `DRAFT` → slate-100 / slate-600
- `APPROVED` → emerald-100 / emerald-700
- `CONVERTED` → violet-100 / violet-700
- `REJECTED` → red-100 / red-700

**List filters**: status filter dropdown.

**New Quote modal**:
```
New Quotation                                              [X]
  [Customer *]      [Quote Number *]
  [Quote Date *]    [Valid Until]    [Currency USD]
  [Notes]

  Lines:
  ┌──────────┬─────────────┬──────┬───────────┬──────────┬──────────┐
  │ Item     │ Description │ Qty  │ Unit Price │ Discount │ Tax Code │
  ├──────────┼─────────────┼──────┼───────────┼──────────┼──────────┤
  │ [Item ▾] │ [           ]│[1.00]│[    0.00] │[  0%]    │[        ]│
  └──────────┴─────────────┴──────┴───────────┴──────────┴──────────┘
  [+ Add Line]
  [Cancel]                             [Create Quote]
```

**Approve**: Row action → `POST /sales/quotes/:id/approve` → status APPROVED.

**Convert to Order**: `POST /sales/quotes/:id/convert { orderNumber }` → creates Sales Order pre-populated with quote lines → quote status becomes CONVERTED.

### 10.3 Sales Orders

**URL**: `/sales/orders`  
**APIs**: List, Create, Approve

```
Sales Order Lifecycle:
DRAFT → APPROVED → PICKING → SHIPPED → INVOICED
                                          │
                                    AR Invoice raised
```

**List columns**: Order Number, Customer, Date, Requested Date, Total, Status.

**New Sales Order modal**: Same fields as Quote (customer, lines with item/qty/price/discount) plus `requestedDate` field. Can be created independently or from a converted quote.

**Approve**: `POST /sales/orders/:id/approve`.

### 10.4 Deliveries

**URL**: `/sales/deliveries`  
**APIs**: List, Create, Get, Post

```
Delivery Lifecycle:
DRAFT → POSTED
           │
     Stock ISSUE movements created
     GL journal: Dr COGS / Cr Inventory
```

**Create Delivery modal**:
```
New Delivery                                               [X]
  [Sales Order *]      [Warehouse *]
  [Delivery Number]    [Delivery Date]
  [Notes]

  Lines (from Sales Order):
  ┌──────────┬────────────┬──────────┬───────────────────────┐
  │ Item     │ Ordered Qty│ Ship Qty │ Storage Location      │
  ├──────────┼────────────┼──────────┼───────────────────────┤
  │ Item A   │ 50         │ [50]     │ [WH1-A01-B01 ▾]       │
  └──────────┴────────────┴──────────┴───────────────────────┘
  [Cancel]                          [Create Delivery]
```

### 10.5 Price Lists

**URL**: `/sales/price-lists`  
**APIs**: List, Get, Create

Price list table: Code, Name, Currency, Default, Valid From, Valid To.

**Price list detail**: Shows per-item pricing (Item, UOM, Min Qty, Unit Price).

**New Price List modal**: code, name, currency, isDefault, validFrom, validTo, then add item pricing rows.

---

## 11. Manufacturing

### 11.1 Manufacturing Dashboard

**URL**: `/manufacturing`  
**API**: `GET /manufacturing/dashboard`

KPIs: Open MOs, Released MOs, BOM Count, Work Center Utilisation.

### 11.2 Bill of Materials (BOM)

**URL**: `/manufacturing/bom`  
**APIs**: List (filter by itemId, status), Create, Activate

**BOM list**: Finished Good, Version, Status (DRAFT / ACTIVE), Component Count.

**New BOM modal**: select finished good item → add component lines (component item, qty, UOM, scrap %).

**Activate**: `POST /manufacturing/bom/:id/activate` → sets the BOM as the default for that item. Only one BOM can be active per item at a time.

### 11.3 Work Centers

**URL**: `/manufacturing/work-centers`  
**APIs**: List, Create

List: Code, Name, Type (MACHINE / LABOR / TOOL), Capacity, Cost/Hour.

### 11.4 Routings

**URL**: `/manufacturing/routings`  
**APIs**: List, Get, Create

Routing defines the sequence of operations for a product. Each operation references a work center and specifies setup time + run time.

### 11.5 Production Orders (MOs)

**URL**: `/manufacturing/orders`  
**APIs**: List, Create, Release, Produce

```
MO Lifecycle:
DRAFT → RELEASED → IN_PROGRESS → COMPLETED
                                     │
                               Stock movements:
                               ISSUE components
                               RECEIPT finished good
```

**New MO modal**: select item, BOM, routing, planned qty, planned start/end dates.

**Release**: `POST /manufacturing/orders/:id/release` → components reserved, MO status RELEASED.

**Produce**: `POST /manufacturing/orders/:id/produce { completedQty, completedDate }` → records actual output, creates stock movements.

### 11.6 MRP

**URL**: `/manufacturing/mrp`  
**APIs**: List MRP runs, Get run results, Run MRP

**Run MRP**: `POST /manufacturing/mrp/run { planningHorizon, considerSafetyStock }` → asynchronous calculation that produces:
- Planned Purchase Orders (for raw material shortfalls)
- Planned Manufacturing Orders (for sub-assembly needs)
- Exception messages (overdue supply, excess stock)

**MRP results page**: Tab between Planned POs and Planned MOs. Each can be "firmed" to create an actual PO or MO.

---

## 12. CRM

### 12.1 CRM Dashboard

**URL**: `/crm`  
**API**: `GET /crm/dashboard`

Pipeline KPIs: New Leads, Open Opportunities, Total Pipeline Value, Won/Lost this month.

### 12.2 Leads

**URL**: `/crm/leads`  
**APIs**: List (filter status, search), Create, Update

```
Lead Lifecycle:
NEW → CONTACTED → QUALIFIED → CONVERTED (to Opportunity)
```

**List columns**: Name, Company, Email, Source, Status, Created.

**New Lead modal**: firstName, lastName, company, email, phone, source (WEBSITE / REFERRAL / COLD_CALL / EVENT / OTHER), notes.

### 12.3 Opportunities

**URL**: `/crm/opportunities`  
**APIs**: List (filter stage, status, accountId), Create, Update

```
Opportunity Pipeline Stages:
PROSPECTING → QUALIFICATION → PROPOSAL → NEGOTIATION → CLOSED_WON
                                                       → CLOSED_LOST
```

**List columns**: Title, Account, Contact, Stage, Expected Revenue, Close Date, Probability %.

**New Opportunity modal**: title, accountId, contactId, stage, expectedRevenue, closeDate, probability, currency, notes. Can optionally link to a Sales Quote.

### 12.4 Accounts & Contacts

**Accounts** (`/crm/accounts`): Company-level CRM records (separate from finance Customer master). Columns: Name, Industry, Website, Phone, Country.

**Contacts** (`/crm/contacts`): Individual people. Filter by accountId. Columns: Name, Account, Email, Phone, Title.

### 12.5 Activities

**URL**: `/crm/activities`  
**APIs**: List (filter status, type), Create, Complete

Activity types: `CALL`, `EMAIL`, `MEETING`, `TASK`

**New Activity**: type, subject, dueDate, relatedTo (account / contact / lead / opportunity), notes.

**Complete**: `POST /crm/activities/:id/complete` → marks as done, sets completedAt timestamp.

---

## 13. Human Resources

### 13.1 HR Dashboard

**URL**: `/hr`  
**API**: `GET /hr/dashboard`

KPIs: Total Employees, Active Leave Requests, Open Job Postings, Payroll This Period.

### 13.2 Employees

**URL**: `/hr/employees`  
**APIs**: List (filter status, departmentId), Create, Update

**List columns**: Employee Code, Name, Department, Position, Employment Type, Hire Date, Status.

**New Employee modal**: employeeCode, firstName, lastName, nationalId, dateOfBirth, email, phone, hireDate, departmentId, positionId, employmentType (FULL_TIME / PART_TIME / CONTRACT), salary, managerId, bankDetails.

### 13.3 Departments & Positions

Separate list/create modals accessible from the HR overview or employee creation form.

**Departments**: code, name, description, parentDepartmentId (for hierarchy).

**Positions**: code, name, departmentId, description.

### 13.4 Leave Management

**URL**: `/hr/leave`  
**APIs**: List (filter status, employeeId), Create, Process

```
Leave Lifecycle:
DRAFT → SUBMITTED → APPROVED
                 → REJECTED
```

**Leave Request modal**: employeeId, leaveTypeId, startDate, endDate, notes.

**Process** (`POST /hr/leave/:id/process { action: "APPROVE" | "REJECT", notes }`): Manager action to approve or reject.

**Leave Types** (`/hr/leave-types`): Configurable list — Annual, Sick, Maternity, Paternity, Unpaid, etc.

### 13.5 Payroll

**URL**: `/hr/payroll`  
**APIs**: List, Get, Create, Approve

```
Payroll Lifecycle:
DRAFT → APPROVED
           │
     GL journal created (Dr: Salary Expense, Cr: Payables/Bank)
```

**Create Payroll Run**: select period, confirm included employees → system calculates gross pay, deductions, net pay.

**Payroll detail**: Per-employee breakdown — Gross Pay, Deductions, Net Pay, Bank Account.

**Approve**: `POST /hr/payroll/:id/approve` → locks payroll, creates GL journal, marks as APPROVED.

### 13.6 Recruitment

**URL**: `/hr/recruitment`

**Job Postings** (`/hr/recruitment/postings`): title, department, position, description, requirements, status (DRAFT / PUBLISHED / CLOSED).

**Publish**: `POST /hr/recruitment/postings/:id/publish` → status becomes PUBLISHED.

**Applications** (`/hr/recruitment/applications`): filter by jobPostingId, stage.

```
Application Pipeline Stages:
APPLIED → SCREENING → INTERVIEW → OFFER → HIRED
                                        → REJECTED
```

**Update Stage**: `PUT /hr/recruitment/applications/:id/stage { stage }`.

---

## 14. Asset Management (EAM)

### 14.1 EAM Dashboard

**URL**: `/eam`  
**API**: `GET /eam/dashboard`

KPIs: Total Assets, In Maintenance, Open Work Orders, Overdue Maintenance.

### 14.2 Assets

**URL**: `/eam/assets`  
**APIs**: List (filter status, categoryId), Create

**List columns**: Asset Code, Name, Category, Serial Number, Location, Status (ACTIVE / IN_MAINTENANCE / DISPOSED).

**New Asset modal**: assetCode, name, categoryId, serialNumber, manufacturer, model, purchaseDate, purchaseCost, location, assignedTo.

### 14.3 Maintenance Plans

**URL**: `/eam/plans`  
**APIs**: List (filter assetId), Create, Trigger

**Plan types**: `CALENDAR` (every N days) or `METER` (every N hours/units).

**Trigger**: `POST /eam/plans/:id/trigger` → manually generates a Work Order from the plan.

### 14.4 Work Orders

**URL**: `/eam/work-orders`  
**APIs**: List (filter status, assetId, type), Create, Start, Complete

```
WO Lifecycle:
OPEN → IN_PROGRESS → COMPLETED
                         │
                   Labor, parts, costs recorded
```

**Work Order types**: `PREVENTIVE`, `CORRECTIVE`, `EMERGENCY`

**Start**: `POST /eam/work-orders/:id/start` → status IN_PROGRESS.

**Complete**: `POST /eam/work-orders/:id/complete { completedDate, laborHours, parts[], totalCost }`.

### 14.5 IoT Devices

**APIs**: List devices, Register device, Get readings, Record reading

IoT devices are linked to assets and stream telemetry (temperature, pressure, vibration, etc.) that can trigger automated Work Orders when thresholds are breached.

---

## 15. Field Service Management (FSM)

### 15.1 FSM Dashboard

**URL**: `/fsm`  
**API**: `GET /fsm/dashboard`

KPIs: Open Service Orders, Assigned to Technicians, Overdue Orders, Contracts Expiring Soon.

### 15.2 Service Orders

**URL**: `/fsm/orders`  
**APIs**: List (filter status, technicianId, type), Create, Assign, Start, Complete, Add Note

```
Service Order Lifecycle:
OPEN → ASSIGNED → IN_PROGRESS → COMPLETED → INVOICED
                                               │
                                        AR Invoice raised
```

**Priority levels**: LOW, MEDIUM, HIGH, CRITICAL

**Assign**: `POST /fsm/orders/:id/assign { technicianId, scheduledDate }`.

**Start**: `POST /fsm/orders/:id/start` → status IN_PROGRESS, records actualStart.

**Complete**: `POST /fsm/orders/:id/complete { completedDate, laborHours, travelTime, parts[], notes }`.

**Add Note**: `POST /fsm/orders/:id/notes { note }` → appends to order history.

### 15.3 Technicians

**URL**: `/fsm/technicians`  
**APIs**: List, Create, Update Status

**Technician statuses**: AVAILABLE, ON_SITE, UNAVAILABLE

**New Technician**: links to a platform User + defines skills[], certifications[].

**Update Status**: `POST /fsm/technicians/:id/status { status }` → dispatcher can mark technician available/unavailable.

### 15.4 Service Contracts

**URL**: `/fsm/contracts`  
**APIs**: List (filter status, customerId), Create

**Contract types**: SLA, TIME_MATERIALS, FIXED_PRICE

Contract detail shows: customer, response time SLA, covered assets, contract value, start/end dates.

---

## 16. Quality Management

### 16.1 Quality Dashboard

**URL**: `/quality`  
**API**: `GET /quality/dashboard`

KPIs: Inspections This Month, Pass Rate %, Open NCRs, Overdue Audits.

### 16.2 Inspection Templates

**URL**: (accessible from quality overview)  
**APIs**: List, Create

Templates define the checkpoints for a type of inspection (e.g., Incoming Inspection, Final Inspection).

**New Template**: name, applicableTo (RECEIVING / IN_PROCESS / FINAL), checkpoints[] (name, type: PASS_FAIL / NUMERIC / TEXT, specification, tolerance).

### 16.3 Inspections

**URL**: `/quality/inspections`  
**APIs**: List (filter status), Create, Get, Complete

```
Inspection Lifecycle:
PENDING → IN_PROGRESS → PASSED
                      → FAILED (triggers NCR creation)
```

**New Inspection**: templateId, reference (PO# or MO# or SO#), inspectedBy, inspectionDate.

**Complete**: `POST /quality/inspections/:id/complete { results[] }` — results include one entry per checkpoint with result (PASS/FAIL) and measured value.

### 16.4 Non-Conformances (NCR)

**URL**: `/quality/ncr`  
**APIs**: List (filter status, severity), Create, Add Action, Close

```
NCR Lifecycle:
OPEN → IN_PROGRESS → CLOSED
```

**Severity levels**: MINOR, MEDIUM, MAJOR, CRITICAL

**Add Corrective Action**: `POST /quality/ncr/:id/actions { description, assignedTo, dueDate }`.

**Close**: `POST /quality/ncr/:id/close { closureNotes }`.

### 16.5 Audits

**URL**: `/quality/audits`  
**APIs**: List (filter status), Create, Start, Complete

**Audit types**: INTERNAL, EXTERNAL, SUPPLIER

```
Audit Lifecycle:
PLANNED → IN_PROGRESS → COMPLETED
```

**Start**: `POST /quality/audits/:id/start`.

**Complete**: `POST /quality/audits/:id/complete { findings[], conclusion }`.

---

## 17. Environment, Health & Safety (EHS)

### 17.1 EHS Dashboard

**URL**: `/ehs`  
**API**: `GET /ehs/dashboard`

KPIs: Incidents This Month, Open Investigations, Active Permits, Risk Assessments Due for Review.

### 17.2 Incidents

**URL**: `/ehs/incidents`  
**APIs**: List (filter status, type), Create, Investigate, Close

```
Incident Lifecycle:
OPEN → INVESTIGATING → CLOSED
```

**Incident types**: INJURY, NEAR_MISS, PROPERTY_DAMAGE, ENVIRONMENTAL, SECURITY

**Severity**: LOW, MEDIUM, HIGH, CRITICAL

**New Incident modal**:
```
Report Incident                                            [X]
  [Date & Time *]     [Location *]
  [Type ▾]            [Severity ▾]
  [Description *]
  [Injured Party]     (if applicable)
  [Immediate Actions Taken]
  [Cancel]                      [Submit Incident Report]
```

**Investigate**: `POST /ehs/incidents/:id/investigate { rootCause, correctiveActions, investigationNotes }`.

**Close**: `POST /ehs/incidents/:id/close` → sets status CLOSED, records closedAt.

### 17.3 Risk Assessments

**URL**: `/ehs/risks`  
**APIs**: List (filter status), Create, Activate

**Risk Assessment** evaluates hazards for a specific work activity.

**New Risk Assessment**: activity description, hazards[] (description, likelihood 1-5, severity 1-5 → riskScore computed), controls[], residualRisk, reviewer, nextReviewDate.

**Activate**: `POST /ehs/risks/:id/activate` → status APPROVED, becomes the live risk assessment for that activity.

### 17.4 Permits to Work

**URL**: `/ehs/permits`  
**APIs**: List (filter status), Create, Approve, Close

```
Permit Lifecycle:
DRAFT → SUBMITTED → APPROVED → ACTIVE → COMPLETED
                                       → CANCELLED
```

**Permit types**: HOT_WORK, CONFINED_SPACE, ELECTRICAL_ISOLATION, WORKING_AT_HEIGHT, EXCAVATION

**New Permit modal**:
```
New Permit to Work                                         [X]
  [Permit Type ▾]     [Work Description *]
  [Location *]
  [Start Date/Time]   [End Date/Time]
  [Applicant]         [Work Supervisor]
  Precautions / Safety Measures:
  [+ Add precaution]
  [Cancel]                      [Submit for Approval]
```

**Approve**: `POST /ehs/permits/:id/approve { approvedBy, conditions }` → status APPROVED → ACTIVE when work begins.

**Close**: `POST /ehs/permits/:id/close` → work completed, permit closed.

---

## 18. Projects

### 18.1 Projects Dashboard

**URL**: `/projects`  
**API**: `GET /projects/dashboard`

KPIs: Active Projects, Overdue Tasks, Unbilled Hours, Revenue This Month.

### 18.2 Projects List

**APIs**: List (filter status), Create, Get, Update Status

```
Project Lifecycle:
PLANNING → ACTIVE → ON_HOLD → COMPLETED
                             → CANCELLED
```

**List columns**: Code, Name, Customer, Manager, Start Date, End Date, Budget, Status.

**New Project modal**: code, name, customerId, projectManager, startDate, endDate, budget, billingType (FIXED / TIME_MATERIALS / MILESTONE), billable (yes/no).

**Update Status**: `POST /projects/:id/status { status }`.

### 18.3 Tasks

**URL**: `/projects/tasks`  
**APIs**: List (filter projectId, status, assigneeId), Create, Update

```
Task Status:
TODO → IN_PROGRESS → DONE
       BLOCKED
```

**New Task**: projectId, name, assignedTo, startDate, dueDate, estimatedHours, parentTaskId (for subtasks).

**Update Task**: change status, log actual hours, update assignee.

### 18.4 Timesheets

**URL**: `/projects/timesheets`  
**APIs**: List (filter projectId, employeeId, status), Create, Approve

```
Timesheet Lifecycle:
DRAFT → SUBMITTED → APPROVED
                      │
                 Can be billed via billing module
```

**New Timesheet**: userId, date, entries[] — each entry has projectId, taskId, hours, description, billable (yes/no).

**Approve**: `POST /projects/timesheets/:id/approve { approved: true | false, notes }`.

### 18.5 Billing

**APIs**: List (filter projectId), Create billing record, Generate AR Invoice

**Billing types**: TIME_MATERIALS (from approved timesheet hours), MILESTONE (fixed amount at project stage), EXPENSE.

**Generate Invoice**: `POST /projects/billing/:id/invoice` → creates AR Invoice in the AR module pre-populated with billable hours/milestones.

---

## 19. Cross-Module Data Flows

### 19.1 Procure-to-Pay (P2P)

```
Purchase Requisition (Procurement)
        │ approve
        ▼
Purchase Order (Procurement)
        │ receive goods
        ▼
Goods Receipt (Procurement)
        │ post GRN
        ├──────────────────────────────────────────┐
        ▼                                          ▼
Stock Movement RECEIPT (Inventory)         GL Journal auto-created
Stock Levels updated                       Dr: Inventory / Asset account
                                           Cr: GR/IR Clearing account
        │
        ▼ (Three-way match)
AP Invoice (Finance AP)
        │ approve
        │ post
        ├──────────────────────────────────────────┐
        ▼                                          ▼
AP Invoice POSTED                          GL Journal auto-created
Balance recorded                           Dr: Expense/Asset accounts
                                           Cr: Accounts Payable
        │
        ▼ (payment)
Payment recorded → GL Journal (Dr: AP, Cr: Bank)
```

### 19.2 Order-to-Cash (O2C)

```
Sales Quote (Sales)
        │ approve + convert
        ▼
Sales Order (Sales)
        │ approve
        ▼
Delivery (Sales)
        │ post delivery
        ├──────────────────────────────────────────┐
        ▼                                          ▼
Stock Movement ISSUE (Inventory)           GL Journal auto-created
Stock Levels updated                       Dr: Cost of Goods Sold
                                           Cr: Inventory
        │
        ▼
AR Invoice (Finance AR)
        │ post
        ├──────────────────────────────────────────┐
        ▼                                          ▼
AR Invoice POSTED                          GL Journal auto-created
Balance recorded                           Dr: Accounts Receivable
                                           Cr: Revenue accounts
        │
        ▼ (payment received)
Payment recorded → GL Journal (Dr: Bank, Cr: AR)
```

### 19.3 Make-to-Stock (Manufacturing)

```
MRP Run → Planned MO (Manufacturing)
              │ firm + release
              ▼
Manufacturing Order
              │ produce
              ├────────────────────────────────────────┐
              ▼                                        ▼
Stock ISSUE (components consumed)           Stock RECEIPT (finished good)
Stock Levels updated                        Stock Levels updated
              │
              ▼
GL Journal: Dr: WIP / Dr: Finished Goods / Cr: Raw Materials
```

### 19.4 CRM to Sales Pipeline

```
Lead (CRM)
   │ qualify
   ▼
Opportunity (CRM)  ←──── linked to Sales Quote
   │ win
   ▼
Customer (Finance AR) ← created when opportunity won
   │
Sales Quote → Sales Order → Delivery → AR Invoice
```

### 19.5 Project Billing to AR

```
Timesheet (Projects)
   │ approve
   ▼
Billing Record (Projects)
   │ generate invoice
   ▼
AR Invoice (Finance AR)  ← auto-created with project details
   │ post
   ▼
AR balance updated / GL journals created
```

### 19.6 Field Service to AR

```
Service Order (FSM)
   │ complete
   ▼
Service Order COMPLETED  ← parts, labor, travel recorded
   │
AR Invoice raised (manually or auto)
   │ post
   ▼
AR balance updated / GL journals created
```

### 19.7 EAM Maintenance Cost to GL

```
Work Order (EAM) COMPLETED
   │ parts + labor costs recorded
   ▼
GL Journal created (Dr: Maintenance Expense, Cr: Inventory/Accruals)
Asset maintenance history updated
```

---

## 20. Common UI Patterns

### 20.1 Page Structure

Every module page follows an identical structure:

```
┌─────────────────────────────────────────────────────────┐
│ PAGE HEADER                                             │
│  [Page Title]                    [Secondary Actions]    │
│  [Subtitle: count + company]     [Primary Action btn]   │
├─────────────────────────────────────────────────────────┤
│ FILTER BAR (card)                                       │
│  [🔍 Search input]               [Status filter ▾]     │
├─────────────────────────────────────────────────────────┤
│ DATA TABLE (card)                                       │
│  thead: column headers                                  │
│  tbody: data rows with hover highlight                  │
│  tfoot: pagination controls (if pages > 1)              │
└─────────────────────────────────────────────────────────┘
```

**Loading state**: Full-width spinner `<Loader2 className="animate-spin" />` centred in the table area.

**Empty state**: Centred message "No [items] found." spanning all columns.

### 20.2 Modal Pattern

All create/view operations use **inline modals** (not page navigations):

```
┌─── Fixed overlay (bg-black/50, inset-0, z-50) ──────────────┐
│                                                              │
│  ┌─── Modal panel (bg-white, rounded-2xl, shadow-2xl) ────┐ │
│  │ Header                                          [X]    │ │
│  │  [Title]                       [Status badge]  [Close] │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ Body (overflow-y-auto)                                  │ │
│  │  [form fields or data display]                         │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ Footer                                                  │ │
│  │  [Cancel]                    [Primary Action]          │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**Max width**: `max-w-lg` (simple forms), `max-w-2xl` (view modals), `max-w-3xl` (complex create forms with line tables).

**Max height**: `max-h-[90vh]` with `overflow-y-auto` on the body section.

**Close behaviour**: X button, Cancel button, or clicking the overlay backdrop all dismiss the modal and reset the form.

### 20.3 Line-Item Table Pattern (Create Forms)

For documents with dynamic line items (journals, invoices, POs, quotes):

```
Lines section label           [running total display]
┌────────────────────┬──────────────┬─────────┬─────────┬───┐
│ Column 1           │ Column 2     │ Debit   │ Credit  │   │
├────────────────────┼──────────────┼─────────┼─────────┼───┤
│ [input/select]     │ [input]      │ [num]   │ [num]   │   │
│ [input/select]     │ [input]      │ [num]   │ [num]   │ 🗑 │
└────────────────────┴──────────────┴─────────┴─────────┴───┘
[+ Add Line]   ← ghost/secondary button, appends a new empty row
```

- Delete icon hidden when only minimum required lines exist (e.g., 2 for journals, 1 for invoices)
- `useFieldArray` (react-hook-form) manages dynamic rows
- Running totals update in real-time via `watch("lines")`

### 20.4 Pagination Controls

```
Showing 26–50 of 247     [Previous]  Page 2 of 10  [Next]
```

- "Previous" disabled on page 1
- "Next" disabled on last page
- Pagination only renders when `pages > 1`
- Changing search resets `page` to 1

### 20.5 Status Badge System

Badges are small pill-shaped labels. Colour mapping by module:

**Finance (journals)**:
| Status | Class |
|---|---|
| DRAFT | `badge-yellow` |
| POSTED | `badge-green` |
| REVERSED | `badge-slate` |
| VOID | `badge-red` |

**Finance (AP invoices)**:
| Status | Class |
|---|---|
| DRAFT | `badge-yellow` |
| APPROVED | `badge-purple` |
| POSTED | `badge-green` |
| PAID | `badge-slate` |
| CANCELLED | `badge-red` |

**Procurement (POs/GRNs)**:
| Status | Class |
|---|---|
| DRAFT | `badge-yellow` |
| APPROVED / RECEIVED | `badge-green` |
| PARTIAL | `badge-blue` |
| CANCELLED | `badge-slate` |

**Sales (quotes)**:
| Status | CSS classes |
|---|---|
| DRAFT | `bg-slate-100 text-slate-600` |
| APPROVED | `bg-emerald-100 text-emerald-700` |
| CONVERTED | `bg-violet-100 text-violet-700` |
| REJECTED | `bg-red-100 text-red-700` |

### 20.6 Toast Notifications

All user-facing feedback uses `sonner` toast:
- **Success** (`toast.success(msg)`) → green, top-right, auto-dismiss
- **Error** (`toast.error(msg)`) → red, top-right, auto-dismiss
- Error message sourced from `error.response?.data?.message` — handles both string and array formats from the API

### 20.7 Form Validation Feedback

Inline per-field error messages appear below the input in red (`form-error` class), sourced from Zod schema messages via `react-hook-form`.

### 20.8 Company Context Guard

Every page that fetches company-scoped data includes:
```typescript
enabled: !!activeCompany   // React Query does not fetch if no company selected
```

If `activeCompany` is null, the page shows an "AlertCircle + No company selected" empty state instead of attempting an API call.

### 20.9 React Query Cache Invalidation

After every successful mutation, the relevant query keys are invalidated:
- Create/Update on a list → invalidate the list query key
- Status transition (post/approve) → invalidate both list and detail query keys
- Finance operations → additionally invalidate `["finance-dashboard"]`
- Inventory operations → additionally invalidate `["inventory-summary"]`

---

## 21. Navigation Map

### 21.1 URL to Page Title Map

| URL | Page Title | Primary API |
|---|---|---|
| `/dashboard` | Dashboard | `/finance/gl/dashboard` |
| `/finance` | Finance Overview | `/finance/gl/dashboard` |
| `/finance/accounts` | Chart of Accounts | `/finance/gl/accounts` |
| `/finance/journals` | Journal Entries | `/finance/gl/journals` |
| `/finance/periods` | Fiscal Periods | `/finance/gl/periods` |
| `/finance/trial-balance` | Trial Balance | `/finance/gl/trial-balance` |
| `/finance/ap` | Accounts Payable | `/finance/ap/invoices` |
| `/finance/ap/vendors` | AP Vendors | `/finance/ap/vendors` |
| `/finance/ap/aging` | AP Aging Report | `/finance/ap/aging` |
| `/finance/ar` | Accounts Receivable | `/finance/ar/invoices` |
| `/finance/ar/customers` | AR Customers | `/finance/ar/customers` |
| `/finance/ar/aging` | AR Aging Report | `/finance/ar/aging` |
| `/finance/assets` | Fixed Assets | `/finance/assets` |
| `/finance/bank` | Cash & Bank | `/finance/bank/accounts` |
| `/finance/budgets` | Budgets | `/finance/budgets` |
| `/finance/reports/pl` | P&L Report | `/finance/reports/pl` |
| `/finance/reports/balance-sheet` | Balance Sheet | `/finance/reports/balance-sheet` |
| `/inventory` | Inventory Overview | `/inventory/summary` |
| `/inventory/items` | Items | `/inventory/items` |
| `/inventory/warehouses` | Warehouses | `/inventory/warehouses` |
| `/inventory/stock-levels` | Stock Levels | `/inventory/stock-levels` |
| `/inventory/movements` | Stock Movements | `/inventory/movements` |
| `/inventory/count` | Stock Count | `/inventory/counts` |
| `/procurement` | Procurement Overview | `/procurement/dashboard` |
| `/procurement/requisitions` | Purchase Requisitions | `/procurement/requisitions` |
| `/procurement/orders` | Purchase Orders | `/procurement/orders` |
| `/procurement/receipts` | Goods Receipts | `/procurement/receipts` |
| `/procurement/suppliers` | Suppliers | `/procurement/vendors` |
| `/sales` | Sales Overview | `/sales/dashboard` |
| `/sales/quotes` | Quotations | `/sales/quotes` |
| `/sales/orders` | Sales Orders | `/sales/orders` |
| `/sales/deliveries` | Deliveries | `/sales/deliveries` |
| `/sales/price-lists` | Price Lists | `/sales/price-lists` |
| `/manufacturing` | Manufacturing Overview | `/manufacturing/dashboard` |
| `/manufacturing/bom` | Bill of Materials | `/manufacturing/bom` |
| `/manufacturing/work-centers` | Work Centers | `/manufacturing/work-centers` |
| `/manufacturing/routings` | Routings | `/manufacturing/routings` |
| `/manufacturing/orders` | Production Orders | `/manufacturing/orders` |
| `/manufacturing/mrp` | MRP | `/manufacturing/mrp` |
| `/crm` | CRM Overview | `/crm/dashboard` |
| `/crm/leads` | Leads | `/crm/leads` |
| `/crm/opportunities` | Opportunities | `/crm/opportunities` |
| `/crm/accounts` | CRM Accounts | `/crm/accounts` |
| `/crm/contacts` | Contacts | `/crm/contacts` |
| `/crm/activities` | Activities | `/crm/activities` |
| `/hr` | HR Overview | `/hr/dashboard` |
| `/hr/employees` | Employees | `/hr/employees` |
| `/hr/leave` | Leave | `/hr/leave` |
| `/hr/payroll` | Payroll | `/hr/payroll` |
| `/hr/recruitment` | Recruitment | `/hr/recruitment/postings` |
| `/eam` | Asset Management | `/eam/dashboard` |
| `/eam/assets` | Assets | `/eam/assets` |
| `/eam/plans` | Maintenance Plans | `/eam/plans` |
| `/eam/work-orders` | Work Orders | `/eam/work-orders` |
| `/fsm` | Field Service | `/fsm/dashboard` |
| `/fsm/orders` | Service Orders | `/fsm/orders` |
| `/fsm/technicians` | Technicians | `/fsm/technicians` |
| `/fsm/contracts` | Service Contracts | `/fsm/contracts` |
| `/quality` | Quality Overview | `/quality/dashboard` |
| `/quality/inspections` | Inspections | `/quality/inspections` |
| `/quality/ncr` | Non-Conformances | `/quality/ncr` |
| `/quality/audits` | Audits | `/quality/audits` |
| `/ehs` | EHS Overview | `/ehs/dashboard` |
| `/ehs/incidents` | Incidents | `/ehs/incidents` |
| `/ehs/risks` | Risk Assessments | `/ehs/risks` |
| `/ehs/permits` | Permits to Work | `/ehs/permits` |
| `/projects` | Projects Overview | `/projects/dashboard` |
| `/projects/tasks` | Tasks | `/projects/tasks/list` |
| `/projects/timesheets` | Timesheets | `/projects/timesheets/list` |

### 21.2 Quick Entry Points (Dashboard Quick Actions)

From the dashboard, 6 direct action tiles link to the most common operations:
1. **New Journal Entry** → `/finance/journals` (opens create modal)
2. **Chart of Accounts** → `/finance/accounts`
3. **AP Invoices** → `/finance/ap`
4. **AR Invoices** → `/finance/ar`
5. **Trial Balance** → `/finance/trial-balance`
6. **Vendors** → `/procurement/suppliers`

### 21.3 Cross-Module Link Pattern

Module pages that reference other modules link directly:

- AP page has secondary buttons: **[Vendors]** → `/finance/ap/vendors` · **[Aging Report]** → `/finance/ap/aging`
- AR page has secondary buttons: **[Customers]** → `/finance/ar/customers` · **[Aging]** → `/finance/ar/aging`
- Procurement Orders reference Vendors (dropdown populated from `/procurement/vendors`)
- Sales Quotes reference Customers (dropdown from `/finance/ar/customers`)
- Journal lines reference GL Accounts (dropdown from `/finance/gl/accounts` — posting accounts only)
- Stock movements reference Items (from `/inventory/items`) and Warehouses (from `/inventory/warehouses`)

---

*End of Application Flow Document*

*STTPS ERP Platform — App-Flow v1.0 — Generated 2026-05-24*
