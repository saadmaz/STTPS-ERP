# Product Requirements Document (PRD)

<!-- nav -->
<sub><a href="../README.md">Project README</a> · <a href="README.md">Documentation index</a></sub>
## STTPS ERP Platform

**Version**: 1.0  
**Date**: 2026-05-24  
**Status**: In Development  
**Classification**: Internal

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Goals & Success Metrics](#2-goals--success-metrics)
3. [User Personas](#3-user-personas)
4. [System Architecture](#4-system-architecture)
5. [Authentication & Multi-Tenancy](#5-authentication--multi-tenancy)
6. [Finance Module](#6-finance-module)
7. [Inventory Module](#7-inventory-module)
8. [Procurement Module](#8-procurement-module)
9. [Sales Module](#9-sales-module)
10. [Manufacturing Module](#10-manufacturing-module)
11. [CRM Module](#11-crm-module)
12. [Human Resources Module](#12-human-resources-module)
13. [Enterprise Asset Management Module](#13-enterprise-asset-management-eam-module)
14. [Field Service Management Module](#14-field-service-management-fsm-module)
15. [Quality Management Module](#15-quality-management-module)
16. [Environment, Health & Safety Module](#16-environment-health--safety-ehs-module)
17. [Project Management Module](#17-project-management-module)
18. [Non-Functional Requirements](#18-non-functional-requirements)
19. [Security Requirements](#19-security-requirements)
20. [Infrastructure & Deployment](#20-infrastructure--deployment)
21. [API Design Standards](#21-api-design-standards)
22. [Implementation Phases & Roadmap](#22-implementation-phases--roadmap)

---

## 1. Product Overview

### 1.1 Product Name
**STTPS ERP** — A cloud-native, multi-tenant Enterprise Resource Planning platform.

### 1.2 Product Summary
STTPS ERP is a full-stack, modular enterprise resource planning system built to serve mid-market to enterprise organizations. It provides an integrated suite of business applications covering financial accounting, inventory, procurement, sales, manufacturing, CRM, HR, asset management, field service, quality, safety, and project management — all within a single, multi-tenant SaaS platform.

Organizations register as **tenants**, each with their own isolated data environment. Within a tenant, multiple **companies** (legal entities) can be managed. Users belong to one or more companies with role-based permissions.

### 1.3 Target Market
- Mid-market businesses (50–5,000 employees)
- Multi-entity organizations requiring inter-company management
- Industries: Manufacturing, Field Services, Distribution, Professional Services, Construction

### 1.4 Technology Stack

| Layer | Technology |
|---|---|
| Monorepo tooling | pnpm + Turborepo |
| API Framework | NestJS 10 (Node.js, TypeScript) |
| Frontend Framework | Next.js 15 (React 19, App Router) |
| Database ORM | Prisma (PostgreSQL 16) |
| Cache / Queue | Redis 7 |
| Auth | JWT + Refresh Token (httpOnly cookie) |
| UI Components | Radix UI + Tailwind CSS |
| State Management | React Query (server state) + Zustand (client state) |
| Form Handling | react-hook-form + Zod |
| File Storage | Google Cloud Storage |
| Email | SendGrid |
| API Documentation | Swagger / OpenAPI |

### 1.5 Key Architectural Decisions
- **Multi-tenant SaaS**: Each organization is a `Tenant`. Data is partitioned at the `tenantId` + `companyId` level for complete isolation.
- **Monorepo**: Code is organized as `apps/api` (backend), `apps/web` (frontend), `packages/prisma` (shared DB schema), and `packages/types` (shared TypeScript definitions).
- **API-first**: All functionality is exposed via a RESTful API (`/api/v1`) with OpenAPI/Swagger documentation. The frontend is a separate consumer.
- **Module-based architecture**: Each business domain is a standalone NestJS module with its own controller, service, DTOs, and Prisma models.
- **Decimal precision**: All monetary amounts use `Decimal(19,4)`. Exchange rates use `Decimal(19,6)`.

---

## 2. Goals & Success Metrics

### 2.1 Business Goals
1. Provide a unified platform to replace disconnected point solutions (accounting software, spreadsheets, standalone CRM, etc.)
2. Enable organizations to go live on a core ERP (Finance + Inventory + Procurement + Sales) within days, not months.
3. Support multi-entity organizations with shared charts of accounts, vendor/customer masters, and user pools.
4. Offer SaaS scalability: new tenants self-onboard without engineering intervention.

### 2.2 Success Metrics

| Metric | Target |
|---|---|
| Time-to-first-transaction (new tenant) | < 30 minutes from registration |
| API response time (p95) | < 300 ms for all read endpoints |
| API response time (p95) | < 800 ms for all write endpoints |
| System uptime | 99.9% monthly SLA |
| Data isolation correctness | 0 cross-tenant data leaks |
| Full GL trial balance accuracy | Debit = Credit at all times |
| User session token TTL | 15 minutes (JWT) / 30 days (refresh) |

### 2.3 Non-Goals (Out of Scope for v1)
- Native mobile applications (iOS/Android)
- Offline/disconnected mode
- Built-in BI / data warehouse (reporting exports via Excel/PDF only in v1)
- Custom scripting / workflow engine
- Marketplace / extensions framework

---

## 3. User Personas

### 3.1 Organization Administrator (Tenant Admin)
- **Role**: IT admin or business owner setting up the organization
- **Goals**: Register organization, create companies, onboard users, configure roles and permissions
- **Pain Points**: Complex multi-entity setup, duplicate user management across systems

### 3.2 Finance Manager / Controller
- **Role**: Oversees accounting, reporting, period close
- **Goals**: Accurate trial balance, manage journal entries, reconcile AP/AR, run period-end close
- **Pain Points**: Disconnected GL and sub-ledgers, manual journal entry errors, lack of audit trail

### 3.3 Procurement Officer
- **Role**: Manages vendor relationships and purchasing
- **Goals**: Create PRs, issue POs, receive goods, match invoices
- **Pain Points**: Paper-based purchase approvals, no visibility into open POs

### 3.4 Sales Representative
- **Role**: Manages customer quotes and orders
- **Goals**: Create quotes quickly, convert to orders, track deliveries
- **Pain Points**: Pricing inconsistencies, manual order confirmation

### 3.5 Warehouse / Inventory Manager
- **Role**: Controls physical inventory
- **Goals**: Accurate stock levels, manage warehouses and locations, count inventory
- **Pain Points**: No real-time stock visibility, manual reorder tracking

### 3.6 HR Manager
- **Role**: Manages employee records, leave, payroll
- **Goals**: Centralize employee data, automate leave approvals, run payroll
- **Pain Points**: Spreadsheet-based HR, no self-service leave portal

### 3.7 Field Service Technician / Dispatcher
- **Role**: Manages service orders and technician assignments
- **Goals**: Receive work orders, record site activities, manage contracts
- **Pain Points**: Phone-based dispatch, no digital work order tracking

### 3.8 Safety & Compliance Officer
- **Role**: Manages EHS incidents, permits, risk assessments
- **Goals**: Report and track incidents, manage work permits, document risk assessments
- **Pain Points**: Paper-based safety forms, no incident trend analysis

---

## 4. System Architecture

### 4.1 Monorepo Layout

```
ERP/
├── apps/
│   ├── api/                   # NestJS API server (port 3001)
│   │   └── src/
│   │       ├── auth/
│   │       ├── tenant/
│   │       ├── company/
│   │       ├── user/
│   │       ├── finance/
│   │       │   ├── gl/
│   │       │   ├── ap/
│   │       │   ├── ar/
│   │       │   ├── assets/
│   │       │   ├── bank/
│   │       │   └── budget/
│   │       ├── inventory/
│   │       ├── procurement/
│   │       ├── sales/
│   │       ├── manufacturing/
│   │       ├── crm/
│   │       ├── hr/
│   │       ├── projects/
│   │       ├── eam/
│   │       ├── fsm/
│   │       ├── quality/
│   │       ├── ehs/
│   │       ├── common/
│   │       └── prisma/
│   └── web/                   # Next.js frontend (port 3000)
│       └── src/
│           ├── app/
│           │   ├── (auth)/
│           │   └── (platform)/
│           ├── components/
│           └── lib/
├── packages/
│   ├── prisma/                # Shared Prisma schema + client
│   └── types/                 # Shared TypeScript types
├── docker-compose.yml
├── turbo.json
└── pnpm-workspace.yaml
```

### 4.2 Request Flow

```
Browser
  → Next.js Middleware (cookie check → redirect if unauthenticated)
  → Next.js Page (React Query fetch)
  → axios (attaches Bearer JWT + x-company-id header)
  → NestJS API (JWT Guard → extract user + company)
  → Service (Prisma query with tenantId + companyId filter)
  → PostgreSQL
```

### 4.3 Data Isolation Model

Every major data entity carries both `tenantId` and `companyId`. All service-layer queries **must** filter by both. The `x-company-id` request header selects which company is active for a given API call. A user can belong to multiple companies; the active company is stored in `sessionStorage` on the client.

### 4.4 Token Management

| Token | Storage | TTL | Purpose |
|---|---|---|---|
| Access Token (JWT) | sessionStorage (client) | 15 minutes | Authenticate API calls |
| Refresh Token | httpOnly cookie | 30 days | Obtain new access tokens |
| Session record | PostgreSQL `Session` table | 30 days | Track active sessions for revocation |

---

## 5. Authentication & Multi-Tenancy

### 5.1 Registration Flow

1. User submits: `organizationName`, `organizationSlug`, `firstName`, `lastName`, `email`, `password`, optional `companyName`.
2. API executes a **single database transaction**:
   - Creates `Tenant` record (name, slug, plan=starter)
   - Creates `Company` record linked to the tenant
   - Creates `User` record (password hashed with bcryptjs, 12 rounds)
   - Creates an **Admin** `Role` (isSystem=true)
   - Links the user to the company via `CompanyUser`
   - Assigns the Admin role to the user via `UserRole`
3. Returns JWT access token + sets refresh token cookie.

### 5.2 Login Flow

1. Validate email + password against `User.passwordHash` (bcrypt compare).
2. Create a `Session` record with `refreshToken` (UUID), `expiresAt`, `ipAddress`, `userAgent`.
3. Return JWT access token (15 min) in response body.
4. Set `refreshToken` in httpOnly cookie (30 days).

### 5.3 Token Refresh Flow

1. Client POSTs to `/api/v1/auth/refresh` with the httpOnly cookie.
2. API validates the refresh token against the `Session` table.
3. Returns a new JWT access token.
4. The frontend maintains a request queue to replay failed requests after token refresh.

### 5.4 Company Switching

- The API reads `x-company-id` from every request header.
- The `@CompanyId()` decorator extracts this into controller methods.
- The frontend stores the active `companyId` in `sessionStorage` and automatically appends the header via axios interceptor.
- Users can switch companies from the UI; the active company is persisted per browser session.

### 5.5 Role-Based Access Control

**Models involved**: `Role`, `Permission`, `UserRole`, `RolePermission`, `CompanyUser`

- Permissions are granular: `{ module, action }` (e.g., `finance.gl.journal.post`)
- Roles aggregate permissions
- Users are assigned roles per company (via `CompanyUser → UserRole`)
- Tenant-level roles have `companyId = null`
- System roles (`isSystem=true`) are not editable by users

### 5.6 API Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/api/v1/auth/register` | Register organization | Public |
| POST | `/api/v1/auth/login` | Login | Public |
| POST | `/api/v1/auth/refresh` | Refresh access token | Cookie |
| POST | `/api/v1/auth/logout` | Logout | JWT |
| GET | `/api/v1/auth/me` | Get current user | JWT |
| GET | `/api/v1/tenant/me` | Get tenant details | JWT |
| GET | `/api/v1/tenant/me/stats` | Get tenant statistics | JWT |

### 5.7 User Management API

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/users` | List all users in tenant |
| GET | `/api/v1/users/:id` | Get user details |
| POST | `/api/v1/users` | Create user |
| PUT | `/api/v1/users/:id` | Update user |

### 5.8 Company Management API

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/companies` | List companies in tenant |
| GET | `/api/v1/companies/:id` | Get company |
| POST | `/api/v1/companies` | Create company |
| PUT | `/api/v1/companies/:id` | Update company |
| GET | `/api/v1/companies/:id/users` | List users in company |

---

## 6. Finance Module

The Finance module is the accounting backbone of the platform, implementing double-entry bookkeeping through five sub-modules: General Ledger, Accounts Payable, Accounts Receivable, Fixed Assets, Bank & Cash, and Budget.

### 6.1 General Ledger (GL)

#### 6.1.1 Chart of Accounts

The Chart of Accounts (COA) is a hierarchical tree of GL accounts organized by account type.

**Account Types**: `ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, `EXPENSE`

**Data Model — GlAccount**

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| tenantId | UUID | Tenant reference |
| companyId | UUID | Company reference |
| code | String | Unique account code (per company) |
| name | String | Account name |
| type | Enum | ASSET \| LIABILITY \| EQUITY \| REVENUE \| EXPENSE |
| subtype | String | Optional sub-classification |
| currency | String | Default currency (default: USD) |
| parentId | UUID? | Parent account (tree structure) |
| isActive | Boolean | Active flag |
| isPosting | Boolean | True = can receive journal lines |
| description | String? | Optional description |

**Business Rules**:
- Account codes must be unique per `(tenantId, companyId)`.
- Only `isPosting=true` accounts can be referenced by journal lines.
- Parent accounts (`isPosting=false`) aggregate balances of children.
- The COA tree may have unlimited depth.
- Accounts cannot be deleted if they have journal lines; only deactivated.

#### 6.1.2 Fiscal Periods

Fiscal periods organize the accounting calendar. Each company defines its own `fiscalYearStart` month.

**Data Model — GlPeriod**

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| tenantId | UUID | Tenant reference |
| companyId | UUID | Company reference |
| fiscalYear | Int | e.g., 2025 |
| period | Int | 1–12 (month within fiscal year) |
| name | String | Period name (e.g., "January 2025") |
| startDate | Date | Period start |
| endDate | Date | Period end |
| status | Enum | OPEN \| CLOSED |

**Business Rules**:
- Journals cannot be posted to a CLOSED period.
- Period closure is one-way; once closed, only an admin can reopen.
- The system auto-generates 12 periods for each fiscal year on demand.

#### 6.1.3 Journal Entries

Journals implement double-entry bookkeeping. Every transaction must balance (totalDebit = totalCredit).

**Data Model — GlJournal**

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| tenantId, companyId | UUID | Isolation keys |
| periodId | UUID | Fiscal period |
| number | String | Sequential journal number (unique per company) |
| date | Date | Transaction date |
| description | String | Journal description |
| reference | String? | External reference |
| type | Enum | MANUAL \| AUTO |
| status | Enum | DRAFT \| POSTED \| VOIDED |
| currency | String | Journal currency |
| totalDebit | Decimal(19,4) | Sum of all debit lines |
| totalCredit | Decimal(19,4) | Sum of all credit lines |
| createdBy | UUID | Creating user |
| postedBy | UUID? | Posting user |
| postedAt | DateTime? | Posted timestamp |

**Data Model — GlJournalLine**

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| journalId | UUID | Parent journal |
| accountId | UUID | GL account (must be isPosting=true) |
| lineNumber | Int | Line ordering |
| description | String | Line description |
| debit | Decimal(19,4) | Debit amount (0 if credit) |
| credit | Decimal(19,4) | Credit amount (0 if debit) |
| currency | String | Line currency |
| exchangeRate | Decimal(19,6) | Exchange rate to functional currency |

**Status Workflow**:
```
DRAFT → POSTED → VOIDED
```

**Business Rules**:
- DRAFT journals can be edited freely.
- Posting a journal requires `sum(debit) == sum(credit)`.
- Posting locks the journal and updates GL account balances.
- Posted journals can only be VOIDED (auto-creates a reversing journal); they cannot be deleted or edited.
- VOIDED journals create a mirror-image reversal journal in the same period.
- Auto journals (`type=AUTO`) are system-generated from sub-ledgers (AP/AR posting).

#### 6.1.4 Trial Balance

A standard accounting report showing debit and credit totals per account for a given fiscal year and period.

**API**: `GET /api/v1/finance/gl/trial-balance?fiscalYear=YYYY&period=N`

#### 6.1.5 Financial Reports

- **Balance Sheet**: Assets = Liabilities + Equity as of a given date
- **Profit & Loss (P&L)**: Revenue minus Expenses for a given period range
- **Finance Dashboard**: KPIs including total revenue, total expenses, cash balance, outstanding receivables/payables

#### 6.1.6 GL API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/finance/gl/dashboard` | Finance KPI dashboard |
| GET | `/api/v1/finance/gl/accounts` | List GL accounts |
| GET | `/api/v1/finance/gl/accounts/:id` | Get GL account |
| POST | `/api/v1/finance/gl/accounts` | Create GL account |
| PUT | `/api/v1/finance/gl/accounts/:id` | Update GL account |
| GET | `/api/v1/finance/gl/periods?fiscalYear=YYYY` | List fiscal periods |
| GET | `/api/v1/finance/gl/journals` | List journals (paginated) |
| GET | `/api/v1/finance/gl/journals/:id` | Get journal |
| POST | `/api/v1/finance/gl/journals` | Create journal (DRAFT) |
| PATCH | `/api/v1/finance/gl/journals/:id/post` | Post journal |
| PATCH | `/api/v1/finance/gl/journals/:id/void` | Void journal |
| GET | `/api/v1/finance/gl/trial-balance` | Get trial balance |

---

### 6.2 Accounts Payable (AP)

Manages the full vendor invoice-to-pay lifecycle.

#### 6.2.1 Vendor Master

**Data Model — Vendor**

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| tenantId, companyId | UUID | Isolation keys |
| code | String | Unique vendor code |
| name | String | Vendor display name |
| legalName | String? | Legal business name |
| taxId | String? | Tax identification number |
| email | String? | Vendor contact email |
| phone | String? | Phone number |
| currency | String | Default invoice currency |
| paymentTerms | Int | Net days (e.g., 30 = Net 30) |
| address | JSON | Structured address |
| bankDetails | JSON | Banking information for payment |
| isActive | Boolean | Active status |

#### 6.2.2 AP Invoices

**Data Model — ApInvoice**

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| vendorId | UUID | Vendor reference |
| number | String | Invoice number (unique per company) |
| vendorRef | String? | Vendor's own invoice number |
| date | Date | Invoice date |
| dueDate | Date | Payment due date |
| currency | String | Invoice currency |
| exchangeRate | Decimal(19,6) | Exchange rate to functional currency |
| subtotal | Decimal(19,4) | Lines total before tax |
| taxAmount | Decimal(19,4) | Total tax |
| total | Decimal(19,4) | Grand total |
| paid | Decimal(19,4) | Amount paid |
| balance | Decimal(19,4) | Outstanding balance |
| status | Enum | DRAFT \| APPROVED \| POSTED |

**Status Workflow**:
```
DRAFT → APPROVED → POSTED
```

**Business Rules**:
- Posting an AP invoice creates an automatic GL journal (debit Expense/Asset accounts, credit AP Payable account).
- Approval is a separate step from posting, enabling a two-level authorization workflow.
- Payment recording reduces the `paid` amount and updates `balance`.
- The AP Aging report shows outstanding invoices grouped by days overdue (0–30, 31–60, 61–90, 90+).

#### 6.2.3 AP API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/finance/ap/vendors` | List vendors (paginated) |
| GET | `/api/v1/finance/ap/vendors/:id` | Get vendor |
| POST | `/api/v1/finance/ap/vendors` | Create vendor |
| PUT | `/api/v1/finance/ap/vendors/:id` | Update vendor |
| GET | `/api/v1/finance/ap/invoices` | List invoices |
| GET | `/api/v1/finance/ap/invoices/:id` | Get invoice |
| POST | `/api/v1/finance/ap/invoices` | Create invoice |
| PATCH | `/api/v1/finance/ap/invoices/:id/approve` | Approve invoice |
| PATCH | `/api/v1/finance/ap/invoices/:id/post` | Post invoice |
| GET | `/api/v1/finance/ap/aging` | AP aging report |

---

### 6.3 Accounts Receivable (AR)

Mirrors AP for the customer invoice-to-collect lifecycle.

#### 6.3.1 Customer Master

**Data Model — Customer**

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| tenantId, companyId | UUID | Isolation keys |
| code | String | Unique customer code |
| name | String | Customer name |
| legalName | String? | Legal business name |
| taxId | String? | Tax identification |
| email, phone | String? | Contact details |
| currency | String | Default invoice currency |
| paymentTerms | Int | Net days |
| creditLimit | Decimal(19,4) | Maximum allowed outstanding balance |
| address | JSON | Structured address |
| isActive | Boolean | Active status |

**Business Rules**:
- When creating a new AR invoice, validate that the customer's `balance` + new invoice `total` does not exceed `creditLimit`.
- Posting an AR invoice creates an automatic GL journal (debit AR Receivable account, credit Revenue accounts).

#### 6.3.2 AR API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/finance/ar/customers` | List customers |
| GET | `/api/v1/finance/ar/customers/:id` | Get customer |
| POST | `/api/v1/finance/ar/customers` | Create customer |
| PUT | `/api/v1/finance/ar/customers/:id` | Update customer |
| GET | `/api/v1/finance/ar/invoices` | List invoices |
| GET | `/api/v1/finance/ar/invoices/:id` | Get invoice |
| POST | `/api/v1/finance/ar/invoices` | Create invoice |
| PATCH | `/api/v1/finance/ar/invoices/:id/post` | Post invoice |
| GET | `/api/v1/finance/ar/aging` | AR aging report |

---

### 6.4 Fixed Assets

Manages the full asset lifecycle from acquisition to disposal.

**Key Features**:
- Asset register with asset categories, useful life, and depreciation methods
- Depreciation calculations: Straight-Line, Declining Balance
- GL integration for depreciation journal entries
- Asset disposal recording
- Asset location tracking

**Data Model — Asset (Planned)**:
- assetCode, name, category, purchaseDate, purchaseCost
- usefulLife (months), depreciationMethod, salvageValue
- accumulatedDepreciation, netBookValue
- locationId, status (ACTIVE | DISPOSED)

---

### 6.5 Bank & Cash

Manages bank accounts and reconciliation.

**Key Features**:
- Bank account master (account number, bank name, currency)
- Bank statement import and line recording
- Bank reconciliation against GL transactions
- Petty cash management

---

### 6.6 Budget

**Key Features**:
- Annual and period budgets per GL account
- Budget vs. Actual variance reporting
- Budget revision tracking

---

## 7. Inventory Module

### 7.1 Item Master

**Data Model — Item**

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| tenantId, companyId | UUID | Isolation keys |
| code | String | Unique item code |
| name | String | Item name |
| description | String? | Description |
| uom | String | Unit of Measure (e.g., EA, KG, LTR) |
| itemType | Enum | STOCKED \| NON_STOCKED \| SERVICE |
| categoryId | UUID? | Item category |
| trackInventory | Boolean | Whether to track stock levels |
| reorderPoint | Decimal | Minimum stock level for reorder alert |
| reorderQty | Decimal | Quantity to reorder |
| standardCost | Decimal(19,4) | Standard costing value |
| listPrice | Decimal(19,4) | Default selling price |
| inventoryAccountId | UUID? | GL account for inventory valuation |
| cogsAccountId | UUID? | GL account for cost of goods sold |
| salesAccountId | UUID? | GL account for sales revenue |

**Item Categories**:
- Hierarchical category tree (parentId)
- Items can be assigned to any level of the category tree

### 7.2 Warehouse Management

**Data Model — Warehouse**

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| companyId | UUID | Company reference |
| code | String | Unique warehouse code |
| name | String | Warehouse name |
| address | JSON | Physical address |

**Data Model — StorageLocation**

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| warehouseId | UUID | Warehouse reference |
| code | String | Location code |
| name | String | Location name |
| zone | String? | Zone (e.g., "Cold Storage") |
| aisle | String? | Aisle identifier |
| bin | String? | Bin identifier |

### 7.3 Stock Levels

- Stock level is tracked per `(item, warehouse)` pair.
- Updated in real-time as stock movements are posted.
- Displays quantity on hand, quantity reserved, and available quantity.

### 7.4 Stock Movements

**Movement Types**: `RECEIPT`, `ISSUE`, `TRANSFER`, `ADJUSTMENT`, `COUNT`

**Data Model — StockMovement**

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| itemId | UUID | Item reference |
| warehouseId | UUID | Warehouse reference |
| movementType | Enum | Movement type |
| reference | String | Source document (PO#, SO#, etc.) |
| qty | Decimal | Quantity (positive = in, negative = out) |
| unitCost | Decimal(19,4) | Unit cost at time of movement |
| notes | String? | Optional notes |

### 7.5 Physical Inventory Count

**Process**:
1. Create a count document for a warehouse with a reference and count date.
2. Add count lines (item + counted quantity per item).
3. Post the count: system compares counted qty vs. book qty, creates `ADJUSTMENT` movements, updates stock levels.

**Business Rules**:
- Only one open count per warehouse at a time.
- Posting a count creates audit-trail movements.
- Variances are posted to a configurable variance GL account.

### 7.6 Inventory API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/inventory/summary` | Inventory dashboard |
| GET | `/api/v1/inventory/categories` | List categories |
| POST | `/api/v1/inventory/categories` | Create category |
| GET | `/api/v1/inventory/items` | List items (paginated, searchable) |
| GET | `/api/v1/inventory/items/:id` | Get item |
| POST | `/api/v1/inventory/items` | Create item |
| PUT | `/api/v1/inventory/items/:id` | Update item |
| GET | `/api/v1/inventory/warehouses` | List warehouses |
| POST | `/api/v1/inventory/warehouses` | Create warehouse |
| POST | `/api/v1/inventory/warehouses/locations` | Create storage location |
| GET | `/api/v1/inventory/stock-levels` | Get stock levels |
| GET | `/api/v1/inventory/movements` | List movements |
| POST | `/api/v1/inventory/movements` | Create movement |
| GET | `/api/v1/inventory/counts` | List counts |
| GET | `/api/v1/inventory/counts/:id` | Get count details |
| POST | `/api/v1/inventory/counts` | Create count |
| POST | `/api/v1/inventory/counts/:id/post` | Post count |

---

## 8. Procurement Module

Manages the end-to-end purchasing lifecycle: Requisition → Purchase Order → Goods Receipt.

### 8.1 Purchase Requisition (PR)

An internal request to purchase items, initiated by any authorized user.

**Data Model — PurchaseRequisition**

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| companyId | UUID | Company reference |
| number | String | PR number (auto-generated) |
| createdBy | UUID | Requesting user |
| status | Enum | DRAFT \| SUBMITTED \| APPROVED \| REJECTED |
| date | Date | Request date |
| notes | String? | Notes |
| lines[] | Array | Line items (itemId, qty, requestedDate, notes) |

**Workflow**: `DRAFT → SUBMITTED → APPROVED`

### 8.2 Purchase Order (PO)

A formal order to a vendor, created from an approved PR or directly.

**Data Model — PurchaseOrder**

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| vendorId | UUID | Vendor reference |
| companyId | UUID | Company reference |
| number | String | PO number |
| orderDate | Date | Order date |
| currency | String | Order currency |
| status | Enum | DRAFT \| APPROVED \| SENT \| RECEIVED \| CANCELLED |
| total | Decimal(19,4) | Total order value |
| lines[] | Array | Line items (itemId, qty, unitPrice) |

### 8.3 Goods Receipt (GRN)

Records physical receipt of items against a PO.

**Data Model — GoodsReceipt (GRN)**

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| poId | UUID | Purchase Order reference |
| companyId | UUID | Company reference |
| number | String | GRN number |
| receiptDate | Date | Date of physical receipt |
| status | Enum | DRAFT \| POSTED |
| lines[] | Array | Line items (itemId, qty, locationId) |

**Business Rules**:
- Posting a GRN creates `RECEIPT` stock movements in inventory.
- Posting a GRN creates an auto GL journal (debit Inventory/Asset, credit GR/IR clearing account).
- Three-way match: AP invoice must match PO + GRN quantities and prices before payment approval.

### 8.4 Procurement API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/procurement/dashboard` | Procurement dashboard |
| GET | `/api/v1/procurement/vendors` | List vendors |
| GET | `/api/v1/procurement/requisitions` | List PRs |
| GET | `/api/v1/procurement/requisitions/:id` | Get PR |
| POST | `/api/v1/procurement/requisitions` | Create PR |
| POST | `/api/v1/procurement/requisitions/:id/approve` | Approve PR |
| GET | `/api/v1/procurement/orders` | List POs |
| GET | `/api/v1/procurement/orders/:id` | Get PO |
| POST | `/api/v1/procurement/orders` | Create PO |
| POST | `/api/v1/procurement/orders/:id/approve` | Approve PO |
| GET | `/api/v1/procurement/receipts` | List GRNs |
| GET | `/api/v1/procurement/receipts/:id` | Get GRN |
| POST | `/api/v1/procurement/receipts` | Create GRN |
| POST | `/api/v1/procurement/receipts/:id/post` | Post GRN |

---

## 9. Sales Module

Manages the full order-to-cash sales cycle: Quote → Order → Delivery → Invoice.

### 9.1 Price Lists

Configurable price lists per currency, with item-level pricing overrides.

**Data Model — PriceList**

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| companyId | UUID | Company reference |
| code | String | Price list code |
| name | String | Name |
| currency | String | Currency |
| isDefault | Boolean | Default for the currency |
| validFrom | Date? | Validity start |
| validTo | Date? | Validity end |
| items[] | Array | Per-item prices (itemId, unitPrice, minQty, uom) |

### 9.2 Sales Quote

**Data Model — SalesQuote**

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| customerId | UUID | Customer reference |
| opportunityId | UUID? | CRM opportunity link |
| number | String | Quote number |
| quoteDate | Date | Quote date |
| validUntil | Date | Expiry date |
| currency | String | Quote currency |
| status | Enum | DRAFT \| SUBMITTED \| APPROVED \| CONVERTED \| EXPIRED |
| notes | String? | Notes |
| lines[] | Array | Line items (itemId, description, qty, uom, unitPrice, discount, taxCode) |

**Workflow**: `DRAFT → SUBMITTED → APPROVED → CONVERTED (to Sales Order)`

### 9.3 Sales Order

**Data Model — SalesOrder**

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| customerId | UUID | Customer reference |
| quoteId | UUID? | Source quote |
| number | String | Order number |
| orderDate | Date | Order date |
| requestedDate | Date? | Requested delivery date |
| currency | String | Order currency |
| status | Enum | DRAFT \| APPROVED \| PICKING \| SHIPPED \| INVOICED \| CANCELLED |
| lines[] | Array | Line items (itemId, qty, uom, unitPrice, discount, taxCode) |

### 9.4 Delivery / Shipment

Records the physical dispatch of goods against a Sales Order.

**Data Model — Delivery**

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| soId | UUID | Sales Order reference |
| warehouseId | UUID | Dispatching warehouse |
| number | String | Delivery number |
| deliveryDate | Date | Dispatch date |
| status | Enum | DRAFT \| POSTED |
| lines[] | Array | Line items (itemId, soLineId, qty, uom, locationId) |

**Business Rules**:
- Posting a delivery creates `ISSUE` stock movements.
- Posting a delivery creates an auto GL journal (debit COGS, credit Inventory).
- After delivery, an AR invoice can be raised for the delivered quantities.

### 9.5 Sales API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/sales/dashboard` | Sales dashboard |
| GET | `/api/v1/sales/price-lists` | List price lists |
| GET | `/api/v1/sales/price-lists/:id` | Get price list |
| POST | `/api/v1/sales/price-lists` | Create price list |
| GET | `/api/v1/sales/quotes` | List quotes |
| GET | `/api/v1/sales/quotes/:id` | Get quote |
| POST | `/api/v1/sales/quotes` | Create quote |
| POST | `/api/v1/sales/quotes/:id/approve` | Approve quote |
| POST | `/api/v1/sales/quotes/:id/convert` | Convert quote to order |
| GET | `/api/v1/sales/orders` | List orders |
| GET | `/api/v1/sales/orders/:id` | Get order |
| POST | `/api/v1/sales/orders` | Create order |
| POST | `/api/v1/sales/orders/:id/approve` | Approve order |
| GET | `/api/v1/sales/deliveries` | List deliveries |
| GET | `/api/v1/sales/deliveries/:id` | Get delivery |
| POST | `/api/v1/sales/deliveries` | Create delivery |
| POST | `/api/v1/sales/deliveries/:id/post` | Post delivery |

---

## 10. Manufacturing Module

### 10.1 Overview

Manages the production lifecycle: define products (BOM + Routing), plan production (MRP), execute (Manufacturing Orders), and record output.

### 10.2 Bill of Materials (BOM)

Defines the components and quantities needed to produce one unit of a finished good.

**Key Fields**: finishedGoodItemId, version, isDefault, lines[] (componentItemId, qty, uom, scrapFactor)

### 10.3 Routings

Defines the sequence of operations (work centers) and times to manufacture a product.

**Key Fields**: itemId, operations[] (workCenterId, operationName, setupTime, runTime, uom)

### 10.4 Work Centers

Physical or logical production resources (machines, cells, labor stations).

**Key Fields**: code, name, type (MACHINE | LABOR | TOOL), capacity, capacityUom, costPerHour

### 10.5 Manufacturing Orders (MO)

Production work orders authorizing manufacture of a specific quantity of a product.

**Status Workflow**: `DRAFT → RELEASED → IN_PROGRESS → COMPLETED → CANCELLED`

**Key Fields**: itemId, bomId, routingId, plannedQty, completedQty, plannedStart, plannedEnd, actualStart, actualEnd

### 10.6 Material Requirements Planning (MRP)

MRP calculates material and capacity requirements based on open sales orders, inventory levels, and BOMs.

**Key Outputs**:
- Planned Purchase Orders (supply for raw materials)
- Planned Manufacturing Orders (supply for sub-assemblies)
- Exception messages (late supply, excess stock)

### 10.7 Manufacturing Frontend Pages

| Page | Path | Description |
|---|---|---|
| Manufacturing Hub | `/manufacturing` | Summary dashboard |
| Bill of Materials | `/manufacturing/bom` | BOM management |
| Routings | `/manufacturing/routings` | Routing management |
| Work Centers | `/manufacturing/work-centers` | Work center setup |
| Manufacturing Orders | `/manufacturing/orders` | MO management |
| MRP | `/manufacturing/mrp` | MRP run & results |

---

## 11. CRM Module

### 11.1 Overview

Manages the customer relationship pipeline from lead to opportunity to closed deal.

### 11.2 Accounts & Contacts

- **Accounts**: Company-level records for prospects and customers
- **Contacts**: Individual people at accounts

### 11.3 Leads & Opportunities

**Lead**: An unqualified potential business interest. Can be converted to an Opportunity.

**Opportunity**:
- Associated with Account and primary Contact
- Pipeline stages: `PROSPECTING → QUALIFICATION → PROPOSAL → NEGOTIATION → CLOSED_WON | CLOSED_LOST`
- Expected revenue, close date, probability %
- Links to Quotes (Sales module)

### 11.4 Activities

Tracks all interactions: calls, emails, meetings, tasks.

**Key Fields**: type (CALL | EMAIL | MEETING | TASK), subject, dueDate, completedAt, notes, relatedTo (account | contact | lead | opportunity)

### 11.5 CRM Frontend Pages

| Page | Path | Description |
|---|---|---|
| CRM Hub | `/crm` | Pipeline overview |
| Accounts | `/crm/accounts` | Account management |
| Contacts | `/crm/contacts` | Contact management |
| Leads | `/crm/leads` | Lead management |
| Opportunities | `/crm/opportunities` | Opportunity pipeline |
| Activities | `/crm/activities` | Activity log |

---

## 12. Human Resources Module

### 12.1 Overview

Centralizes employee data, leave management, payroll, and recruitment.

### 12.2 Employee Management

**Key Fields**: employeeCode, firstName, lastName, nationalId, dateOfBirth, hireDate, department, position, employmentType (FULL_TIME | PART_TIME | CONTRACT), managerId, salary, bankDetails

### 12.3 Leave Management

**Leave Types**: Annual, Sick, Maternity, Paternity, Unpaid, Other (configurable)

**Leave Request Workflow**: `DRAFT → SUBMITTED → APPROVED | REJECTED`

**Business Rules**:
- Validate leave balance before approval
- Manager approval workflow
- Integration with payroll for unpaid leave deduction

### 12.4 Payroll

**Process**:
1. Define pay periods and payroll rules (deductions, allowances, taxes)
2. Run payroll for a period: calculates gross pay, deductions, net pay per employee
3. Review payroll register
4. Approve and finalize (creates GL journals for salary expense)
5. Generate payslips

### 12.5 Recruitment

- Job postings with requirements
- Applicant tracking: `APPLIED → SCREENING → INTERVIEW → OFFER → HIRED | REJECTED`
- Link hired applicants to new Employee records

### 12.6 HR Frontend Pages

| Page | Path | Description |
|---|---|---|
| HR Hub | `/hr` | HR dashboard |
| Employees | `/hr/employees` | Employee directory |
| Leave | `/hr/leave` | Leave requests and balances |
| Payroll | `/hr/payroll` | Payroll processing |
| Recruitment | `/hr/recruitment` | Job postings & applicants |

---

## 13. Enterprise Asset Management (EAM) Module

### 13.1 Overview

Manages physical assets throughout their lifecycle, with preventive and corrective maintenance planning.

### 13.2 Asset Register

**Key Fields**: assetCode, name, category, serialNumber, purchaseDate, purchaseCost, location, assignedTo, status (ACTIVE | IN_MAINTENANCE | DISPOSED)

### 13.3 Maintenance Plans

Define scheduled, recurring maintenance tasks for assets.

**Key Fields**: assetId, planType (CALENDAR | METER), frequency, frequencyUnit, taskDescription, estimatedDuration

### 13.4 Work Orders

Maintenance work orders, generated from maintenance plans or ad-hoc.

**Status Workflow**: `OPEN → IN_PROGRESS → COMPLETED → CANCELLED`

**Key Fields**: assetId, type (PREVENTIVE | CORRECTIVE | EMERGENCY), description, assignedTo, scheduledDate, completedDate, parts[], laborHours, totalCost

### 13.5 EAM Frontend Pages

| Page | Path | Description |
|---|---|---|
| EAM Hub | `/eam` | Asset dashboard |
| Assets | `/eam/assets` | Asset register |
| Maintenance Plans | `/eam/plans` | Maintenance schedule |
| Work Orders | `/eam/work-orders` | WO management |

---

## 14. Field Service Management (FSM) Module

### 14.1 Overview

Manages the end-to-end delivery of field service: customer contracts, service orders, technician dispatch, and billing.

### 14.2 Service Contracts

Define the service level agreement and scope for a customer.

**Key Fields**: customerId, contractNumber, startDate, endDate, type (SLA | TIME_MATERIALS | FIXED_PRICE), responseTime, slaHours, value

### 14.3 Service Orders

Field service work orders raised against contracts or ad-hoc.

**Status Workflow**: `OPEN → ASSIGNED → IN_PROGRESS → COMPLETED → INVOICED`

**Key Fields**: contractId, customerId, type (INSTALLATION | REPAIR | INSPECTION | PM), description, priority (LOW | MEDIUM | HIGH | CRITICAL), assignedTo (technician), scheduledDate, completedDate, parts[], laborHours, travelTime

### 14.4 Technician Management

**Key Fields**: userId (linked to platform user), skills[], availability, currentLocation (GPS), certifications[]

### 14.5 FSM Frontend Pages

| Page | Path | Description |
|---|---|---|
| FSM Hub | `/fsm` | Service dashboard & dispatch board |
| Service Orders | `/fsm/orders` | Service order management |
| Technicians | `/fsm/technicians` | Technician directory and scheduling |
| Contracts | `/fsm/contracts` | Service contract management |

---

## 15. Quality Management Module

### 15.1 Overview

Manages quality inspections, non-conformances, and continuous improvement.

### 15.2 Inspection Templates

Define the checkpoints and criteria for a type of inspection.

**Key Fields**: code, name, applicableTo (RECEIVING | IN_PROCESS | FINAL), checkpoints[] (name, type: PASS_FAIL | NUMERIC | TEXT, specification, tolerance)

### 15.3 Quality Inspections

An actual inspection event against a template.

**Status Workflow**: `PENDING → IN_PROGRESS → PASSED | FAILED`

**Key Fields**: templateId, reference (PO# / SO# / MO#), inspectedBy, inspectionDate, results[] (checkpointId, result, value, notes)

### 15.4 Non-Conformances (NCR)

Records of quality failures requiring corrective action.

**Key Fields**: inspectionId, severity (MINOR | MAJOR | CRITICAL), description, rootCause, correctiveAction, dueDate, closedAt, status (OPEN | IN_PROGRESS | CLOSED)

### 15.5 Audits

**Key Fields**: auditType (INTERNAL | EXTERNAL | SUPPLIER), scope, auditDate, auditor, findings[], status (PLANNED | IN_PROGRESS | COMPLETED)

### 15.6 Quality Frontend Pages

| Page | Path | Description |
|---|---|---|
| Quality Hub | `/quality` | Quality dashboard |
| Inspection Templates | `/quality/templates` | Template management |
| Inspections | `/quality/inspections` | Inspection records |
| Non-Conformances | `/quality/ncr` | NCR management |
| Audits | `/quality/audits` | Audit management |

---

## 16. Environment, Health & Safety (EHS) Module

### 16.1 Overview

Manages workplace safety compliance: incident reporting, work permits, and risk assessments.

### 16.2 Incident Reporting

**Data Model — Incident**

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| incidentDate | DateTime | When it occurred |
| location | String | Where it occurred |
| type | Enum | INJURY \| NEAR_MISS \| PROPERTY_DAMAGE \| ENVIRONMENTAL \| SECURITY |
| severity | Enum | LOW \| MEDIUM \| HIGH \| CRITICAL |
| description | String | Detailed description |
| injuredParty | String? | Person affected (if any) |
| rootCause | String? | Root cause analysis |
| correctiveActions | String? | Actions taken |
| reportedBy | UUID | Reporting user |
| status | Enum | OPEN \| INVESTIGATING \| CLOSED |

**Frontend Pages**: `/ehs/incidents`

### 16.3 Work Permits

Controls authorization for hazardous work activities.

**Permit Types**: Hot Work, Confined Space, Electrical Isolation, Working at Height, Excavation

**Status Workflow**: `DRAFT → SUBMITTED → APPROVED → ACTIVE → COMPLETED | CANCELLED`

**Key Fields**: permitType, workDescription, location, startDateTime, endDateTime, approvedBy, precautions[], attachments[]

**Frontend Pages**: `/ehs/permits`

### 16.4 Risk Assessments

**Key Fields**: activity, hazards[] (description, likelihood, severity, riskScore), controls[], residualRisk, reviewer, reviewDate, nextReviewDate, status (DRAFT | APPROVED | EXPIRED)

**Frontend Pages**: `/ehs/risks`

---

## 17. Project Management Module

### 17.1 Overview

Provides project tracking with tasks, timesheets, and billing.

### 17.2 Projects

**Key Fields**: code, name, customerId, projectManager, startDate, endDate, budget, status (PLANNING | ACTIVE | ON_HOLD | COMPLETED | CANCELLED), billable, billingType (FIXED | TIME_MATERIALS | MILESTONE)

### 17.3 Tasks

**Key Fields**: projectId, name, assignedTo, startDate, dueDate, estimatedHours, status (TODO | IN_PROGRESS | DONE | BLOCKED), parentTaskId (for subtasks)

### 17.4 Timesheets

**Key Fields**: userId, date, entries[] (projectId, taskId, hours, description, billable)

**Status Workflow**: `DRAFT → SUBMITTED → APPROVED`

### 17.5 Billing

Generate invoices from approved timesheets and milestones.

**Key Features**:
- Bill approved timesheet hours at configured rates
- Milestone billing at defined project stages
- Expense billing
- Integration with AR module to generate AR invoices

**Frontend Pages**: `/projects`

---

## 18. Non-Functional Requirements

### 18.1 Performance

| Requirement | Target |
|---|---|
| API read response time (p95) | < 300 ms |
| API write response time (p95) | < 800 ms |
| Page initial load (LCP) | < 2.5 s |
| List pages (pagination) | Max 25 items per page by default |
| Concurrent users per tenant | Support up to 500 concurrent users |

### 18.2 Scalability

- **Horizontal scaling**: NestJS API is stateless; can be scaled behind a load balancer. Session data lives in PostgreSQL, not in-memory.
- **Database**: PostgreSQL with connection pooling (PgBouncer recommended for production).
- **Caching**: Redis for session management and future query caching.
- **Multi-tenancy**: All queries are filtered by `tenantId` — tenants are logically isolated within the same database. Schema-based isolation can be adopted in a future version for enterprise tier.

### 18.3 Availability

- **Target SLA**: 99.9% uptime (maximum ~8.7 hours downtime per year)
- **Health checks**: All Docker services have health checks configured (PostgreSQL: `pg_isready`, Redis: `redis-cli ping`)
- **Graceful shutdown**: NestJS app handles SIGTERM for zero-downtime deployments

### 18.4 Data Integrity

- All financial amounts use `Decimal(19,4)` precision — no floating point arithmetic.
- Exchange rates use `Decimal(19,6)`.
- All status transitions are enforced at the service layer (e.g., a POSTED journal cannot be edited).
- Multi-table transactions (e.g., registration flow, journal posting with GL balance update) are wrapped in Prisma transactions.
- `totalDebit === totalCredit` is enforced before any journal is posted.

### 18.5 Audit Trail

- The `AuditLog` table records every state-changing operation with:
  - `userId` who performed the action
  - `module`, `action`, `entity`, `entityId`
  - `before` (JSON snapshot of previous state)
  - `after` (JSON snapshot of new state)
  - `ipAddress`, `createdAt`

### 18.6 Accessibility

- All UI components use semantic HTML.
- Radix UI components are ARIA-compliant by default.
- Color contrast ratios meet WCAG 2.1 AA requirements.
- Keyboard navigation supported throughout the application.

### 18.7 Internationalization (i18n)

- Phase 1: English only.
- Phase 2: UI string externalization to support additional languages.
- Date/time formatting respects the company's configured `timezone`.
- Currency formatting respects the document's configured `currency`.
- Fiscal year start is configurable per company (1–12).

---

## 19. Security Requirements

### 19.1 Authentication Security

- Passwords hashed with **bcryptjs** (12 salt rounds) — never stored in plaintext.
- JWT signed with a minimum 32-character secret.
- Access tokens expire in 15 minutes.
- Refresh tokens expire in 30 days and are stored as httpOnly cookies (not accessible to JavaScript).
- All sessions are tracked in the `Session` table with IP address and user agent.
- Logout invalidates the session record server-side.
- MFA support: `mfaEnabled` and `mfaSecret` fields provisioned on the User model (implementation pending).

### 19.2 Transport Security

- HTTPS enforced in all non-development environments.
- **helmet** middleware applied on NestJS for security headers: `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
- CORS configured to allow only the `FRONTEND_URL` origin.

### 19.3 Data Isolation

- Every database query in every service **must** include both `tenantId` and `companyId` as filter conditions.
- The `tenantId` is always derived from the authenticated JWT — never accepted from client input.
- The `companyId` comes from the `x-company-id` request header, validated against the user's authorized companies.
- No cross-tenant data access is possible through the API layer.

### 19.4 Authorization

- Role-Based Access Control (RBAC) enforced at the service layer.
- Permission codes follow the pattern: `{module}.{entity}.{action}` (e.g., `finance.journal.post`)
- System roles cannot be deleted or modified by users.
- Privileged operations (post/void journals, approve invoices) require explicit permissions.

### 19.5 Input Validation

- All API inputs validated using `class-validator` decorators on DTOs.
- Validation pipe globally enabled on the NestJS application.
- SQL injection is prevented by Prisma's parameterized queries.
- XSS prevention: API returns JSON (no HTML rendering). Frontend uses React's default XSS protection.

### 19.6 Secrets Management

- All secrets (`JWT_SECRET`, `DATABASE_URL`, `SENDGRID_API_KEY`, etc.) are environment variables — never hardcoded.
- Production secrets managed via **Google Secret Manager** with Workload Identity binding on GKE.
- `.env` files are excluded from version control via `.gitignore`.

---

## 20. Infrastructure & Deployment

### 20.1 Local Development

**Prerequisites**: Docker Desktop, Node.js ≥ 22, pnpm ≥ 11.2.2

**Setup**:
1. `docker compose up -d` — Start PostgreSQL (port 5432) + Redis (port 6379)
2. Copy `.env.example` to `.env` and configure
3. `pnpm install` — Install all workspace dependencies
4. `pnpm --filter @sttps/prisma db:migrate` — Run Prisma migrations
5. `pnpm dev` — Start API (port 3001) + Frontend (port 3000) via Turborepo

**Swagger**: Available at `http://localhost:3001/api/docs` in development mode.

### 20.2 Docker Services

| Service | Image | Port | Health Check |
|---|---|---|---|
| PostgreSQL | postgres:16-alpine | 5432 | `pg_isready -U sttps` |
| Redis | redis:7-alpine | 6379 | `redis-cli ping` |

### 20.3 Production Architecture (Cloud GCP)

| Component | GCP Service |
|---|---|
| API (NestJS) | Google Kubernetes Engine (GKE) |
| Frontend (Next.js) | GKE or Cloud Run |
| Database | Cloud SQL (PostgreSQL 16) via Cloud SQL Auth Proxy |
| Cache | Memorystore (Redis) |
| File Storage | Google Cloud Storage |
| Email | SendGrid |
| Secrets | Google Secret Manager |
| Identity | Workload Identity (for pod → GCP auth) |
| Ingress | Cloud Load Balancer / Nginx Ingress |

### 20.4 CI/CD

**Turborepo pipeline tasks**:
- `build` — TypeScript compile + Next.js build (depends on `^build` for shared packages)
- `dev` — Development servers (persistent, no cache)
- `lint` — ESLint
- `typecheck` — TypeScript type checking

### 20.5 Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | — |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | — |
| `JWT_REFRESH_SECRET` | Refresh token signing secret | — |
| `JWT_EXPIRES_IN` | Access token TTL | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token TTL | `30d` |
| `PORT` | API server port | `3001` |
| `NODE_ENV` | Environment | `development` |
| `FRONTEND_URL` | Allowed CORS origin | `http://localhost:3000` |
| `NEXT_PUBLIC_API_URL` | API base URL for frontend | `http://localhost:3001` |
| `GCS_BUCKET_NAME` | GCS bucket for file uploads | — |
| `GCS_PROJECT_ID` | GCP project ID | — |
| `SENDGRID_API_KEY` | SendGrid API key | — |
| `EMAIL_FROM` | Sender email address | — |
| `EMAIL_FROM_NAME` | Sender display name | — |

---

## 21. API Design Standards

### 21.1 Base URL
All API endpoints are prefixed with `/api/v1`.

### 21.2 Authentication
All protected endpoints require:
- `Authorization: Bearer <access_token>` header
- `x-company-id: <company_uuid>` header (active company context)

### 21.3 Response Format

**Success (list)**:
```json
{
  "data": [...],
  "total": 100,
  "page": 1,
  "limit": 25
}
```

**Success (single)**:
```json
{
  "id": "...",
  "...fields": "..."
}
```

**Error**:
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    { "field": "email", "message": "must be a valid email" }
  ]
}
```

### 21.4 Pagination

All list endpoints accept:
- `page` (default: 1)
- `limit` (default: 25, max: 100)
- `search` (optional, string search across key fields)

### 21.5 HTTP Status Codes

| Code | Usage |
|---|---|
| 200 | Successful GET or PATCH |
| 201 | Successful POST (resource created) |
| 400 | Validation error or bad request |
| 401 | Not authenticated |
| 403 | Authenticated but not authorized |
| 404 | Resource not found |
| 409 | Conflict (e.g., duplicate code) |
| 500 | Internal server error |

### 21.6 Swagger / OpenAPI

API documentation auto-generated via `@nestjs/swagger`. Accessible at `/api/docs` in development. All DTOs include JSDoc descriptions and example values.

---

## 22. Implementation Phases & Roadmap

### Phase 1 — Foundation (Complete)
- Multi-tenant registration and authentication
- Company and user management
- Role-based access control
- Finance: GL (Chart of Accounts, Journals, Fiscal Periods, Trial Balance)
- Finance: AP (Vendors, Invoices, Aging)
- Finance: AR (Customers, Invoices, Aging)
- Inventory: Items, Categories, Warehouses, Stock Levels, Movements, Counts
- Procurement: PRs, POs, GRNs
- Sales: Price Lists, Quotes, Orders, Deliveries
- Core frontend for all above modules

### Phase 2 — Extended Finance (Planned)
- Fixed Assets with depreciation engine
- Bank & Cash with reconciliation workflow
- Budget management and variance reporting
- Comprehensive financial reports (Balance Sheet, P&L, Cash Flow)
- Multi-currency revaluation journals

### Phase 3 — Operations (Planned)
- Manufacturing: BOM, Routings, Work Centers, Manufacturing Orders
- Manufacturing: MRP planning run
- CRM: Accounts, Contacts, Leads, Opportunities, Activities

### Phase 4 — People & Safety (Planned)
- HR: Employees, Departments, Leave management
- HR: Payroll processing and GL integration
- HR: Recruitment pipeline
- EHS: Incident reporting, Work permits, Risk assessments

### Phase 5 — Services & Assets (Planned)
- EAM: Asset register, Maintenance plans, Work orders
- FSM: Service contracts, Service orders, Technician dispatch
- Quality: Inspection templates, Inspections, NCRs, Audits

### Phase 6 — Projects & Intelligence (Planned)
- Project management: Projects, Tasks, Timesheets, Billing
- Advanced reporting dashboard
- Data export (Excel, PDF)
- Email notifications (SendGrid integration)
- MFA (TOTP-based)
- Audit log viewer in UI

### Phase 7 — Enterprise (Future)
- API webhooks for external integrations
- Schema-per-tenant isolation option (enterprise tier)
- Native mobile app (React Native)
- Workflow engine (configurable approval rules)
- Custom fields per entity
- Third-party integrations (Stripe, payment gateways, shipping APIs)

---

## Appendix A: Database Entity Relationship Summary

```
Tenant
  └── Company (many, with parent/child hierarchy)
        ├── User (via CompanyUser)
        │     └── Role (via UserRole)
        │           └── Permission (via RolePermission)
        ├── GlAccount (Chart of Accounts, hierarchical)
        ├── GlPeriod (Fiscal periods)
        ├── GlJournal → GlJournalLine → GlAccount
        ├── Vendor → ApInvoice → ApInvoiceLine → GlAccount
        ├── Customer → ArInvoice → ArInvoiceLine → GlAccount
        ├── Item → ItemCategory (hierarchical)
        ├── Warehouse → StorageLocation
        ├── StockLevel (item × warehouse)
        ├── StockMovement (item × warehouse × type)
        ├── StockCount → StockCountLine
        ├── PurchaseRequisition → PurchaseRequisitionLine
        ├── PurchaseOrder → PurchaseOrderLine
        ├── GoodsReceipt → GoodsReceiptLine
        ├── PriceList → PriceListItem
        ├── SalesQuote → SalesQuoteLine
        ├── SalesOrder → SalesOrderLine
        └── Delivery → DeliveryLine
```

---

## Appendix B: Glossary

| Term | Definition |
|---|---|
| Tenant | A registered organization on the STTPS ERP platform |
| Company | A legal entity within a tenant (e.g., a subsidiary) |
| GL | General Ledger — the master accounting record |
| AP | Accounts Payable — money owed to vendors |
| AR | Accounts Receivable — money owed by customers |
| BOM | Bill of Materials — component list for a manufactured item |
| MRP | Material Requirements Planning — calculates procurement/production needs |
| GRN | Goods Receipt Note — records physical receipt of purchased goods |
| PR | Purchase Requisition — internal request to purchase |
| PO | Purchase Order — formal order placed with a vendor |
| NCR | Non-Conformance Report — quality failure record |
| EAM | Enterprise Asset Management |
| FSM | Field Service Management |
| EHS | Environment, Health & Safety |
| COA | Chart of Accounts |
| RBAC | Role-Based Access Control |
| JWT | JSON Web Token — stateless authentication token |
| SLA | Service Level Agreement |
| MO | Manufacturing Order |
| UOM | Unit of Measure |
| COGS | Cost of Goods Sold |
| FIFO | First In, First Out — inventory costing method |
| GKE | Google Kubernetes Engine |
| GCS | Google Cloud Storage |

---

*End of Product Requirements Document*

*STTPS ERP Platform — PRD v1.0 — Generated 2026-05-24*
