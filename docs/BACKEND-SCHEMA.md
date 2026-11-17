# Backend Schema — STTPS ERP

<!-- nav -->
<sub><a href="../README.md">Project README</a> · <a href="README.md">Documentation index</a></sub>

> Source of truth for the database schema, all DTO shapes, and every REST endpoint.
> Base path: `/api/v1` · Auth: `Authorization: Bearer <access_token>` + `x-company-id: <companyId>` header (all protected routes).

---

## Table of Contents

1. [Global Conventions](#1-global-conventions)
2. [Database Schema](#2-database-schema)
   - 2.1 [Platform — Tenant](#21-tenant)
   - 2.2 [Identity & Access](#22-identity--access)
   - 2.3 [Finance — General Ledger](#23-finance--general-ledger)
   - 2.4 [Finance — Accounts Payable](#24-finance--accounts-payable)
   - 2.5 [Finance — Accounts Receivable](#25-finance--accounts-receivable)
3. [DTOs](#3-dtos)
   - 3.1 [Common / Pagination](#31-common--pagination)
   - 3.2 [Auth](#32-auth)
   - 3.3 [Company & User](#33-company--user)
   - 3.4 [Finance — GL](#34-finance--gl)
   - 3.5 [Finance — AP](#35-finance--ap)
   - 3.6 [Finance — AR](#36-finance--ar)
   - 3.7 [Finance — Bank](#37-finance--bank)
   - 3.8 [Finance — Fixed Assets](#38-finance--fixed-assets)
   - 3.9 [Finance — Budgets](#39-finance--budgets)
   - 3.10 [Inventory](#310-inventory)
   - 3.11 [Procurement](#311-procurement)
   - 3.12 [CRM](#312-crm)
   - 3.13 [Sales](#313-sales)
   - 3.14 [Manufacturing](#314-manufacturing)
   - 3.15 [Human Resources](#315-human-resources)
   - 3.16 [EAM — Enterprise Asset Management](#316-eam--enterprise-asset-management)
   - 3.17 [FSM — Field Service Management](#317-fsm--field-service-management)
   - 3.18 [Quality](#318-quality)
   - 3.19 [EHS — Environment, Health & Safety](#319-ehs--environment-health--safety)
   - 3.20 [Projects](#320-projects)
4. [API Endpoints](#4-api-endpoints)
   - 4.1 [Auth](#41-auth)
   - 4.2 [Companies](#42-companies)
   - 4.3 [Users](#43-users)
   - 4.4 [Finance — GL](#44-finance--gl)
   - 4.5 [Finance — AP](#45-finance--ap)
   - 4.6 [Finance — AR](#46-finance--ar)
   - 4.7 [Finance — Bank](#47-finance--bank)
   - 4.8 [Finance — Fixed Assets](#48-finance--fixed-assets)
   - 4.9 [Finance — Budgets](#49-finance--budgets)
   - 4.10 [Finance — Reports](#410-finance--reports)
   - 4.11 [Inventory](#411-inventory)
   - 4.12 [Procurement](#412-procurement)
   - 4.13 [CRM](#413-crm)
   - 4.14 [Sales](#414-sales)
   - 4.15 [Manufacturing](#415-manufacturing)
   - 4.16 [Human Resources](#416-human-resources)
   - 4.17 [EAM](#417-eam)
   - 4.18 [FSM](#418-fsm)
   - 4.19 [Quality](#419-quality)
   - 4.20 [EHS](#420-ehs)
   - 4.21 [Projects](#421-projects)
5. [Status Enumerations](#5-status-enumerations)
6. [Common Response Envelopes](#6-common-response-envelopes)

---

## 1. Global Conventions

### Field Types
| Prisma type | PostgreSQL column | Notes |
|---|---|---|
| `String @id @default(uuid())` | `VARCHAR` PK | All primary keys are UUIDs |
| `Decimal @db.Decimal(19,4)` | `NUMERIC(19,4)` | All monetary amounts |
| `Decimal @db.Decimal(19,6)` | `NUMERIC(19,6)` | Exchange rates |
| `Json` | `JSONB` | Address, bankDetails, settings |
| `Boolean @default(true/false)` | `BOOLEAN` | isActive, isSystem, etc. |
| `DateTime @default(now())` | `TIMESTAMPTZ` | createdAt |
| `DateTime @updatedAt` | `TIMESTAMPTZ` | updatedAt, auto-managed by Prisma |

### Multi-Tenancy
Every domain table carries `tenantId` (String) for row-level tenant isolation. The `companyId` provides sub-tenant scope within a tenant. Both are extracted server-side from the JWT and the `x-company-id` header respectively — clients never pass `tenantId` in request bodies.

### Naming
- Prisma models: `PascalCase`
- PostgreSQL tables: `snake_case` (set via `@@map`)
- DTO fields: `camelCase`
- API paths: `kebab-case`

### Validation Pipeline
Global `ValidationPipe` with `whitelist: true`, `transform: true`, `forbidNonWhitelisted: true`. All DTOs use `class-validator` decorators. `@Type(() => Number)` handles string→number coercion from query params.

### Pagination Query
All list endpoints accept `?page=1&limit=25&search=...` via `PaginationDto`.

---

## 2. Database Schema

> Full source: `packages/prisma/schema.prisma`

---

### 2.1 Tenant

**Table:** `tenants`

| Field | Type | Constraints | Default | Notes |
|---|---|---|---|---|
| `id` | `String` | PK, UUID | `uuid()` | |
| `name` | `String` | | | Organization display name |
| `slug` | `String` | UNIQUE | | URL-safe identifier |
| `plan` | `String` | | `"starter"` | Subscription plan |
| `status` | `String` | | `"active"` | |
| `settings` | `Json` | | `{}` | Arbitrary tenant config |
| `createdAt` | `DateTime` | | `now()` | |
| `updatedAt` | `DateTime` | `@updatedAt` | | |

---

### 2.2 Identity & Access

#### Company

**Table:** `companies` · **Indexes:** `[tenantId]` · **Unique:** `[tenantId, code]`

| Field | Type | Constraints | Default | Notes |
|---|---|---|---|---|
| `id` | `String` | PK | `uuid()` | |
| `tenantId` | `String` | INDEX | | |
| `name` | `String` | | | |
| `code` | `String` | UNIQUE w/ tenantId | | Short code e.g. `"MAIN"` |
| `legalName` | `String?` | | | |
| `taxId` | `String?` | | | |
| `currency` | `String` | | `"USD"` | ISO-4217 |
| `timezone` | `String` | | `"UTC"` | IANA timezone |
| `fiscalYearStart` | `Int` | | `1` | Month 1–12 |
| `address` | `Json?` | | | `{ street, city, state, country, zip }` |
| `logoUrl` | `String?` | | | |
| `parentId` | `String?` | FK → Company | | Self-referential hierarchy |
| `isActive` | `Boolean` | | `true` | |
| `createdAt` | `DateTime` | | `now()` | |
| `updatedAt` | `DateTime` | `@updatedAt` | | |

**Relations:** `parent` (Company?), `children` (Company[]), `companyUsers` (CompanyUser[]), `roles` (Role[]), `glAccounts` (GlAccount[]), `glPeriods` (GlPeriod[]), `glJournals` (GlJournal[]), `vendors` (Vendor[]), `customers` (Customer[])

---

#### User

**Table:** `users` · **Indexes:** `[tenantId]` · **Unique:** `[tenantId, email]`

| Field | Type | Constraints | Default | Notes |
|---|---|---|---|---|
| `id` | `String` | PK | `uuid()` | |
| `tenantId` | `String` | INDEX | | |
| `email` | `String` | UNIQUE w/ tenantId | | |
| `firstName` | `String` | | | |
| `lastName` | `String` | | | |
| `passwordHash` | `String` | | | bcrypt, 12 rounds |
| `phone` | `String?` | | | |
| `avatar` | `String?` | | | URL |
| `isActive` | `Boolean` | | `true` | |
| `isSuperAdmin` | `Boolean` | | `false` | Org-level super admin |
| `mfaEnabled` | `Boolean` | | `false` | |
| `mfaSecret` | `String?` | | | TOTP secret |
| `lastLoginAt` | `DateTime?` | | | Updated on each login |
| `createdAt` | `DateTime` | | `now()` | |
| `updatedAt` | `DateTime` | `@updatedAt` | | |

**Relations:** `companyUsers` (CompanyUser[]), `sessions` (Session[]), `auditLogs` (AuditLog[])

---

#### CompanyUser

**Table:** `company_users` · **Unique:** `[userId, companyId]`

| Field | Type | Constraints | Default |
|---|---|---|---|
| `id` | `String` | PK | `uuid()` |
| `userId` | `String` | FK → User, CASCADE | |
| `companyId` | `String` | FK → Company, CASCADE | |
| `isDefault` | `Boolean` | | `false` |

**Relations:** `user`, `company`, `userRoles` (UserRole[])

---

#### Role

**Table:** `roles` · **Indexes:** `[tenantId]`

| Field | Type | Constraints | Default |
|---|---|---|---|
| `id` | `String` | PK | `uuid()` |
| `tenantId` | `String` | INDEX | |
| `companyId` | `String?` | FK → Company | |
| `name` | `String` | | |
| `description` | `String?` | | |
| `isSystem` | `Boolean` | | `false` |
| `createdAt` | `DateTime` | | `now()` |
| `updatedAt` | `DateTime` | `@updatedAt` | |

**Relations:** `company` (Company?), `userRoles` (UserRole[]), `rolePermissions` (RolePermission[])

---

#### UserRole

**Table:** `user_roles` · **Unique:** `[companyUserId, roleId]`

| Field | Type | Constraints |
|---|---|---|
| `id` | `String` | PK |
| `companyUserId` | `String` | FK → CompanyUser, CASCADE |
| `roleId` | `String` | FK → Role, CASCADE |
| `grantedAt` | `DateTime` | `now()` |
| `grantedBy` | `String?` | userId who granted |

---

#### Permission

**Table:** `permissions` · **Unique:** `code`

| Field | Type | Constraints |
|---|---|---|
| `id` | `String` | PK |
| `code` | `String` | UNIQUE — e.g. `finance.journal.post` |
| `name` | `String` | Human-readable label |
| `module` | `String` | e.g. `finance` |
| `action` | `String` | e.g. `journal.post` |

---

#### RolePermission

**Table:** `role_permissions` · **Unique:** `[roleId, permissionId]`

| Field | Type | Constraints |
|---|---|---|
| `id` | `String` | PK |
| `roleId` | `String` | FK → Role, CASCADE |
| `permissionId` | `String` | FK → Permission, CASCADE |

---

#### Session

**Table:** `sessions` · **Indexes:** `[userId]`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `String` | PK | |
| `userId` | `String` | FK → User, CASCADE | |
| `refreshToken` | `String` | UNIQUE | 128-char hex (`crypto.randomBytes(64)`) |
| `expiresAt` | `DateTime` | | 30 days from creation |
| `ipAddress` | `String?` | | |
| `userAgent` | `String?` | | |
| `createdAt` | `DateTime` | | `now()` |

---

#### AuditLog

**Table:** `audit_logs` · **Indexes:** `[tenantId, createdAt]`, `[entity, entityId]`

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | PK |
| `tenantId` | `String` | |
| `companyId` | `String?` | |
| `userId` | `String?` | FK → User |
| `module` | `String` | e.g. `finance` |
| `action` | `String` | e.g. `CREATE`, `POST`, `VOID` |
| `entity` | `String` | Table name |
| `entityId` | `String?` | |
| `before` | `Json?` | Snapshot before change |
| `after` | `Json?` | Snapshot after change |
| `ipAddress` | `String?` | |
| `createdAt` | `DateTime` | |

---

### 2.3 Finance — General Ledger

#### GlAccount

**Table:** `gl_accounts` · **Indexes:** `[tenantId, companyId]` · **Unique:** `[tenantId, companyId, code]`

| Field | Type | Constraints | Default | Notes |
|---|---|---|---|---|
| `id` | `String` | PK | `uuid()` | |
| `tenantId` | `String` | INDEX | | |
| `companyId` | `String` | FK → Company | | |
| `code` | `String` | UNIQUE w/ tenant+company | | e.g. `"1000"` |
| `name` | `String` | | | |
| `type` | `String` | | | `ASSET` \| `LIABILITY` \| `EQUITY` \| `REVENUE` \| `EXPENSE` |
| `subtype` | `String?` | | | e.g. `CURRENT_ASSET` |
| `currency` | `String` | | `"USD"` | |
| `parentId` | `String?` | FK → GlAccount | | Self-referential tree |
| `isActive` | `Boolean` | | `true` | |
| `isPosting` | `Boolean` | | `true` | `false` = header/group account |
| `description` | `String?` | | | |
| `createdAt` | `DateTime` | | `now()` | |
| `updatedAt` | `DateTime` | `@updatedAt` | | |

**Relations:** `parent` (GlAccount?), `children` (GlAccount[]), `journalLines` (GlJournalLine[]), `apLines` (ApInvoiceLine[]), `arLines` (ArInvoiceLine[])

---

#### GlPeriod

**Table:** `gl_periods` · **Indexes:** `[tenantId, companyId]` · **Unique:** `[tenantId, companyId, fiscalYear, period]`

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | `String` | `uuid()` | |
| `tenantId` | `String` | | |
| `companyId` | `String` | FK → Company | |
| `fiscalYear` | `Int` | | e.g. `2025` |
| `period` | `Int` | | 1–12 |
| `name` | `String` | | e.g. `"Jan 2025"` |
| `startDate` | `DateTime` | | |
| `endDate` | `DateTime` | | |
| `status` | `String` | `"OPEN"` | `OPEN` \| `CLOSED` |

**Relations:** `company` (Company), `journals` (GlJournal[])

---

#### GlJournal

**Table:** `gl_journals` · **Indexes:** `[tenantId, companyId, date]` · **Unique:** `[tenantId, companyId, number]`

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | `String` | `uuid()` | |
| `tenantId` | `String` | | |
| `companyId` | `String` | FK → Company | |
| `periodId` | `String` | FK → GlPeriod | Resolved by entry date |
| `number` | `String` | | Auto-generated: `JE-000001` |
| `date` | `DateTime` | | |
| `description` | `String?` | | |
| `reference` | `String?` | | |
| `type` | `String` | `"MANUAL"` | `MANUAL` \| `AP` \| `AR` \| `ASSET` \| `PAYROLL` |
| `status` | `String` | `"DRAFT"` | `DRAFT` \| `POSTED` \| `VOID` |
| `currency` | `String` | `"USD"` | |
| `totalDebit` | `Decimal(19,4)` | `0` | |
| `totalCredit` | `Decimal(19,4)` | `0` | Must equal `totalDebit` |
| `createdBy` | `String` | | userId |
| `postedBy` | `String?` | | userId |
| `postedAt` | `DateTime?` | | |
| `createdAt` | `DateTime` | `now()` | |
| `updatedAt` | `DateTime` | | |

**Relations:** `company`, `period`, `lines` (GlJournalLine[])

---

#### GlJournalLine

**Table:** `gl_journal_lines`

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | `String` | `uuid()` | |
| `journalId` | `String` | FK → GlJournal, CASCADE | |
| `accountId` | `String` | FK → GlAccount | |
| `lineNumber` | `Int` | | 1-based sequence |
| `description` | `String?` | | |
| `debit` | `Decimal(19,4)` | `0` | |
| `credit` | `Decimal(19,4)` | `0` | |
| `currency` | `String` | `"USD"` | |
| `exchangeRate` | `Decimal(19,6)` | `1` | To company base currency |

---

### 2.4 Finance — Accounts Payable

#### Vendor

**Table:** `vendors` · **Indexes:** `[tenantId, companyId]` · **Unique:** `[tenantId, companyId, code]`

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | `String` | `uuid()` | |
| `tenantId` | `String` | | |
| `companyId` | `String` | FK → Company | |
| `code` | `String` | | |
| `name` | `String` | | |
| `legalName` | `String?` | | |
| `taxId` | `String?` | | |
| `email` | `String?` | | |
| `phone` | `String?` | | |
| `currency` | `String` | `"USD"` | |
| `paymentTerms` | `Int` | `30` | Days net |
| `address` | `Json?` | | |
| `bankDetails` | `Json?` | | `{ bankName, accountNumber, routingNumber, iban, swift }` |
| `isActive` | `Boolean` | `true` | |
| `createdAt` | `DateTime` | `now()` | |
| `updatedAt` | `DateTime` | | |

---

#### ApInvoice

**Table:** `ap_invoices` · **Indexes:** `[tenantId, companyId]` · **Unique:** `[tenantId, companyId, number]`

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | `String` | `uuid()` | |
| `tenantId` | `String` | | |
| `companyId` | `String` | | |
| `vendorId` | `String` | FK → Vendor | |
| `number` | `String` | | Auto-generated if not provided |
| `vendorRef` | `String?` | | Supplier's own invoice number |
| `date` | `DateTime` | | Invoice date |
| `dueDate` | `DateTime` | | Payment due date |
| `currency` | `String` | `"USD"` | |
| `exchangeRate` | `Decimal(19,6)` | `1` | |
| `subtotal` | `Decimal(19,4)` | `0` | Sum of line amounts |
| `taxAmount` | `Decimal(19,4)` | `0` | |
| `total` | `Decimal(19,4)` | `0` | `subtotal + taxAmount` |
| `paid` | `Decimal(19,4)` | `0` | Payments applied |
| `balance` | `Decimal(19,4)` | `0` | `total - paid` |
| `status` | `String` | `"DRAFT"` | `DRAFT` \| `APPROVED` \| `POSTED` \| `PAID` \| `VOID` |
| `notes` | `String?` | | |
| `createdBy` | `String` | | userId |
| `approvedBy` | `String?` | | userId |
| `approvedAt` | `DateTime?` | | |
| `postedBy` | `String?` | | userId |
| `postedAt` | `DateTime?` | | |
| `createdAt` | `DateTime` | `now()` | |
| `updatedAt` | `DateTime` | | |

---

#### ApInvoiceLine

**Table:** `ap_invoice_lines`

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | `String` | `uuid()` | |
| `invoiceId` | `String` | FK → ApInvoice, CASCADE | |
| `accountId` | `String` | FK → GlAccount | Expense account |
| `lineNumber` | `Int` | | |
| `description` | `String` | | Required |
| `quantity` | `Decimal(19,4)` | `1` | |
| `unitPrice` | `Decimal(19,4)` | `0` | |
| `amount` | `Decimal(19,4)` | `0` | `quantity × unitPrice` |
| `taxCode` | `String?` | | |
| `taxAmount` | `Decimal(19,4)` | `0` | |

---

### 2.5 Finance — Accounts Receivable

#### Customer

**Table:** `customers` · **Indexes:** `[tenantId, companyId]` · **Unique:** `[tenantId, companyId, code]`

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | `String` | `uuid()` | |
| `tenantId` | `String` | | |
| `companyId` | `String` | FK → Company | |
| `code` | `String` | | |
| `name` | `String` | | |
| `legalName` | `String?` | | |
| `taxId` | `String?` | | |
| `email` | `String?` | | |
| `phone` | `String?` | | |
| `currency` | `String` | `"USD"` | |
| `paymentTerms` | `Int` | `30` | Days |
| `creditLimit` | `Decimal(19,4)` | `0` | |
| `address` | `Json?` | | |
| `isActive` | `Boolean` | `true` | |
| `createdAt` | `DateTime` | `now()` | |
| `updatedAt` | `DateTime` | | |

---

#### ArInvoice

**Table:** `ar_invoices` · **Indexes:** `[tenantId, companyId]` · **Unique:** `[tenantId, companyId, number]`

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | `String` | `uuid()` | |
| `tenantId` | `String` | | |
| `companyId` | `String` | | |
| `customerId` | `String` | FK → Customer | |
| `number` | `String` | | |
| `date` | `DateTime` | | |
| `dueDate` | `DateTime` | | |
| `currency` | `String` | `"USD"` | |
| `exchangeRate` | `Decimal(19,6)` | `1` | |
| `subtotal` | `Decimal(19,4)` | `0` | |
| `taxAmount` | `Decimal(19,4)` | `0` | |
| `total` | `Decimal(19,4)` | `0` | |
| `paid` | `Decimal(19,4)` | `0` | |
| `balance` | `Decimal(19,4)` | `0` | |
| `status` | `String` | `"DRAFT"` | `DRAFT` \| `POSTED` \| `PAID` \| `VOID` |
| `notes` | `String?` | | |
| `createdBy` | `String` | | userId |
| `postedBy` | `String?` | | userId |
| `postedAt` | `DateTime?` | | |
| `createdAt` | `DateTime` | `now()` | |
| `updatedAt` | `DateTime` | | |

---

#### ArInvoiceLine

**Table:** `ar_invoice_lines`

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | `String` | `uuid()` | |
| `invoiceId` | `String` | FK → ArInvoice, CASCADE | |
| `accountId` | `String` | FK → GlAccount | Revenue account |
| `lineNumber` | `Int` | | |
| `description` | `String` | | Required |
| `quantity` | `Decimal(19,4)` | `1` | |
| `unitPrice` | `Decimal(19,4)` | `0` | |
| `amount` | `Decimal(19,4)` | `0` | |
| `taxCode` | `String?` | | |
| `taxAmount` | `Decimal(19,4)` | `0` | |

> **Note:** The remaining domain models (Inventory, Procurement, Sales, Manufacturing, HR, EAM, FSM, Quality, EHS, Projects) are implemented as service-layer entities managed directly by their respective NestJS services via Prisma. Their schemas follow the same conventions documented above. Refer to `packages/prisma/schema.prisma` for the complete model list once those migrations are added.

---

## 3. DTOs

> All DTOs use `class-validator` for runtime validation and `@nestjs/swagger` for OpenAPI generation.
> `R` = Required · `O` = Optional · `D` = has default

---

### 3.1 Common / Pagination

**`PaginationDto`** — appended as `?page=&limit=&search=` to all list endpoints

| Field | Type | Validators | Default |
|---|---|---|---|
| `page` | `number` | `@IsInt @Min(1)` | `1` |
| `limit` | `number` | `@IsInt @Min(1) @Max(100)` | `25` |
| `search` | `string` | `@IsString` | — |

---

### 3.2 Auth

**`LoginDto`**

| Field | Type | Validators | R/O |
|---|---|---|---|
| `email` | `string` | `@IsEmail` | R |
| `password` | `string` | `@IsString @MinLength(6)` | R |

**`RegisterDto`**

| Field | Type | Validators | R/O |
|---|---|---|---|
| `organizationName` | `string` | `@IsString` | R |
| `organizationSlug` | `string` | `@IsString` | R |
| `firstName` | `string` | `@IsString` | R |
| `lastName` | `string` | `@IsString` | R |
| `email` | `string` | `@IsEmail` | R |
| `password` | `string` | `@IsString @MinLength(8)` | R |
| `companyName` | `string` | `@IsString` | O |

---

### 3.3 Company & User

**`CreateCompanyDto`**

| Field | Type | Validators | Default | R/O |
|---|---|---|---|---|
| `name` | `string` | `@IsString` | | R |
| `code` | `string` | `@IsString` | | R |
| `legalName` | `string` | `@IsString` | | O |
| `taxId` | `string` | `@IsString` | | O |
| `currency` | `string` | `@IsString` | `"USD"` | O |
| `timezone` | `string` | `@IsString` | `"UTC"` | O |
| `fiscalYearStart` | `number` | `@IsInt @Min(1) @Max(12)` | `1` | O |
| `parentId` | `string` | `@IsString` | | O |

**`CreateUserDto`**

| Field | Type | Validators | R/O |
|---|---|---|---|
| `email` | `string` | `@IsEmail` | R |
| `firstName` | `string` | `@IsString` | R |
| `lastName` | `string` | `@IsString` | R |
| `password` | `string` | `@IsString @MinLength(8)` | R |
| `phone` | `string` | `@IsString` | O |

---

### 3.4 Finance — GL

**`CreateAccountDto`**

| Field | Type | Validators | R/O |
|---|---|---|---|
| `code` | `string` | `@IsString` | R |
| `name` | `string` | `@IsString` | R |
| `type` | `string` | `@IsIn(["ASSET","LIABILITY","EQUITY","REVENUE","EXPENSE"])` | R |
| `subtype` | `string` | `@IsString` | O |
| `description` | `string` | `@IsString` | O |
| `currency` | `string` | `@IsString` | O/D `"USD"` |
| `parentId` | `string` | `@IsString` | O |
| `isPosting` | `boolean` | `@IsBoolean` | O/D `true` |

**`CreateJournalDto`**

| Field | Type | Validators | R/O |
|---|---|---|---|
| `date` | `string` | `@IsDateString` | R |
| `description` | `string` | `@IsString` | O |
| `reference` | `string` | `@IsString` | O |
| `type` | `string` | `@IsString` | O/D `"MANUAL"` |
| `currency` | `string` | `@IsString` | O/D `"USD"` |
| `lines` | `JournalLineDto[]` | `@IsArray @ValidateNested` | R |

**`JournalLineDto`** (nested)

| Field | Type | Validators | R/O |
|---|---|---|---|
| `accountId` | `string` | `@IsString` | R |
| `description` | `string` | `@IsString` | O |
| `debit` | `number` | `@IsNumber @Min(0)` | O/D `0` |
| `credit` | `number` | `@IsNumber @Min(0)` | O/D `0` |
| `currency` | `string` | `@IsString` | O/D `"USD"` |
| `exchangeRate` | `number` | `@IsNumber` | O/D `1` |

> **Balance rule (server-side):** `Math.abs(totalDebit - totalCredit) > 0.001` throws `BadRequestException`.

---

### 3.5 Finance — AP

**`CreateVendorDto`**

| Field | Type | Validators | R/O |
|---|---|---|---|
| `code` | `string` | `@IsString` | R |
| `name` | `string` | `@IsString` | R |
| `legalName` | `string` | `@IsString` | O |
| `taxId` | `string` | `@IsString` | O |
| `email` | `string` | `@IsEmail` | O |
| `phone` | `string` | `@IsString` | O |
| `currency` | `string` | `@IsString` | O |
| `paymentTerms` | `number` | `@IsInt @Min(0)` | O |

**`CreateApInvoiceDto`**

| Field | Type | Validators | R/O |
|---|---|---|---|
| `vendorId` | `string` | `@IsString` | R |
| `number` | `string` | `@IsString` | O (auto-generated) |
| `vendorRef` | `string` | `@IsString` | O |
| `date` | `string` | `@IsDateString` | R |
| `dueDate` | `string` | `@IsDateString` | R |
| `currency` | `string` | `@IsString` | O |
| `notes` | `string` | `@IsString` | O |
| `lines` | `ApInvoiceLineDto[]` | `@IsArray @ValidateNested` | R |

**`ApInvoiceLineDto`** (nested)

| Field | Type | Validators | R/O |
|---|---|---|---|
| `accountId` | `string` | `@IsString` | R |
| `description` | `string` | `@IsString` | R |
| `quantity` | `number` | `@IsNumber` | O |
| `unitPrice` | `number` | `@IsNumber @Min(0)` | R |
| `amount` | `number` | `@IsNumber @Min(0)` | R |
| `taxCode` | `string` | `@IsString` | O |
| `taxAmount` | `number` | `@IsNumber @Min(0)` | O |

---

### 3.6 Finance — AR

**`CreateCustomerDto`**

| Field | Type | Validators | R/O |
|---|---|---|---|
| `code` | `string` | `@IsString` | R |
| `name` | `string` | `@IsString` | R |
| `legalName` | `string` | `@IsString` | O |
| `taxId` | `string` | `@IsString` | O |
| `email` | `string` | `@IsEmail` | O |
| `phone` | `string` | `@IsString` | O |
| `currency` | `string` | `@IsString` | O |
| `paymentTerms` | `number` | `@IsNumber @Min(0)` | O |
| `creditLimit` | `number` | `@IsNumber @Min(0)` | O |

**`CreateArInvoiceDto`**

| Field | Type | Validators | R/O |
|---|---|---|---|
| `customerId` | `string` | `@IsString` | R |
| `number` | `string` | `@IsString` | O |
| `date` | `string` | `@IsDateString` | R |
| `dueDate` | `string` | `@IsDateString` | R |
| `currency` | `string` | `@IsString` | O |
| `notes` | `string` | `@IsString` | O |
| `lines` | `ArInvoiceLineDto[]` | `@IsArray @ValidateNested` | R |

**`ArInvoiceLineDto`** — same shape as `ApInvoiceLineDto`

---

### 3.7 Finance — Bank

**`CreateBankAccountDto`**

| Field | Type | Validators | R/O |
|---|---|---|---|
| `code` | `string` | `@IsString` | R |
| `name` | `string` | `@IsString` | R |
| `bankName` | `string` | `@IsString` | O |
| `accountNumber` | `string` | `@IsString` | O |
| `currency` | `string` | `@IsString` | O |
| `glAccountId` | `string` | `@IsString` | O |

**`CreateBankTransactionDto`**

| Field | Type | Validators | R/O |
|---|---|---|---|
| `bankAccountId` | `string` | `@IsString` | R |
| `date` | `string` | `@IsDateString` | R |
| `description` | `string` | `@IsString` | R |
| `debit` | `number` | `@IsNumber` | R |
| `credit` | `number` | `@IsNumber` | R |
| `balance` | `number` | `@IsNumber` | R |
| `reference` | `string` | `@IsString` | O |
| `isReconciled` | `boolean` | `@IsBoolean` | O |

---

### 3.8 Finance — Fixed Assets

**`CreateAssetDto`** *(Finance module)*

| Field | Type | Validators | R/O |
|---|---|---|---|
| `code` | `string` | `@IsString` | R |
| `name` | `string` | `@IsString` | R |
| `category` | `string` | `@IsString` | R |
| `acquisitionDate` | `string` | `@IsDateString` | R |
| `acquisitionCost` | `number` | `@IsNumber @Min(0)` | R |
| `depreciationMethod` | `string` | `@IsString` | O |
| `usefulLifeMonths` | `number` | `@IsInt @Min(1)` | O |
| `salvageValue` | `number` | `@IsNumber @Min(0)` | O |
| `assetAccountId` | `string` | `@IsString` | O |
| `depreciationAcctId` | `string` | `@IsString` | O |
| `accumDeprAcctId` | `string` | `@IsString` | O |
| `notes` | `string` | `@IsString` | O |

**`DisposeAssetDto`**

| Field | Type | Validators | R/O |
|---|---|---|---|
| `disposalDate` | `string` | `@IsDateString` | R |
| `disposalAmount` | `number` | `@IsNumber` | R |

---

### 3.9 Finance — Budgets

**`CreateBudgetDto`**

| Field | Type | Validators | R/O |
|---|---|---|---|
| `name` | `string` | `@IsString` | R |
| `fiscalYear` | `number` | `@IsInt` | R |
| `description` | `string` | `@IsString` | O |
| `lines` | `BudgetLineDto[]` | `@IsArray @ValidateNested` | R |

**`BudgetLineDto`** (nested)

| Field | Type | Validators | R/O |
|---|---|---|---|
| `accountId` | `string` | `@IsString` | R |
| `period` | `number` | `@IsInt @Min(1) @Max(12)` | R |
| `amount` | `number` | `@IsNumber @Min(0)` | R |
| `notes` | `string` | `@IsString` | O |

---

### 3.10 Inventory

**`CreateItemDto`**

| Field | Type | Validators | R/O |
|---|---|---|---|
| `code` | `string` | `@IsString` | R |
| `name` | `string` | `@IsString` | R |
| `description` | `string` | `@IsString` | O |
| `uom` | `string` | `@IsString` | O |
| `itemType` | `string` | `@IsString` | O |
| `categoryId` | `string` | `@IsUUID` | O |
| `trackInventory` | `boolean` | `@IsBoolean` | O |
| `reorderPoint` | `number` | `@IsNumber` | O |
| `reorderQty` | `number` | `@IsNumber` | O |
| `standardCost` | `number` | `@IsNumber` | O |
| `listPrice` | `number` | `@IsNumber` | O |
| `inventoryAccountId` | `string` | `@IsUUID` | O |
| `cogsAccountId` | `string` | `@IsUUID` | O |
| `salesAccountId` | `string` | `@IsUUID` | O |

**`CreateItemCategoryDto`**

| Field | Type | R/O |
|---|---|---|
| `code` | `string` | R |
| `name` | `string` | R |
| `description` | `string` | O |
| `parentId` | `string` | O |

**`CreateWarehouseDto`**

| Field | Type | R/O |
|---|---|---|
| `code` | `string` | R |
| `name` | `string` | R |
| `address` | `any` | O |

**`CreateStorageLocationDto`**

| Field | Type | R/O |
|---|---|---|
| `warehouseId` | `string` | R |
| `code` | `string` | R |
| `name` | `string` | R |
| `zone` | `string` | O |
| `aisle` | `string` | O |
| `bin` | `string` | O |

**`CreateStockMovementDto`**

| Field | Type | Validators | R/O |
|---|---|---|---|
| `itemId` | `string` | `@IsUUID` | R |
| `warehouseId` | `string` | `@IsUUID` | R |
| `movementType` | `string` | `@IsString` | R |
| `reference` | `string` | `@IsString` | O |
| `qty` | `number` | `@IsNumber` | R |
| `unitCost` | `number` | `@IsNumber` | O |
| `notes` | `string` | `@IsString` | O |

> Movement types: `RECEIPT`, `ISSUE`, `TRANSFER`, `ADJUSTMENT`, `RETURN`

**`CreateStockCountDto`**

| Field | Type | R/O |
|---|---|---|
| `warehouseId` | `string` | R |
| `reference` | `string` | R |
| `countDate` | `string` | R |
| `notes` | `string` | O |
| `lines` | `{ itemId, countedQty, notes? }[]` | R |

---

### 3.11 Procurement

**`CreatePRDto`** — Purchase Requisition

| Field | Type | Validators | R/O |
|---|---|---|---|
| `number` | `string` | `@IsString` | R |
| `requestDate` | `string` | `@IsString` | R |
| `requiredDate` | `string` | `@IsString` | O |
| `notes` | `string` | `@IsString` | O |
| `lines` | `PRLineDto[]` | `@IsArray @ValidateNested` | R |

**`PRLineDto`** (nested)

| Field | Type | R/O |
|---|---|---|
| `itemId` | `string` (UUID) | R |
| `description` | `string` | O |
| `qty` | `number` | R |
| `uom` | `string` | O |
| `estUnitCost` | `number` | O |
| `lineNumber` | `number` | R |

**`CreatePODto`** — Purchase Order

| Field | Type | R/O |
|---|---|---|
| `vendorId` | `string` (UUID) | R |
| `prId` | `string` (UUID) | O |
| `number` | `string` | R |
| `orderDate` | `string` | R |
| `expectedDate` | `string` | O |
| `currency` | `string` | O |
| `notes` | `string` | O |
| `lines` | `POLineDto[]` | R |

**`POLineDto`** (nested) — adds `unitPrice`, `taxCode` to `PRLineDto`

**`CreateGRNDto`** — Goods Receipt Note

| Field | Type | R/O |
|---|---|---|
| `poId` | `string` (UUID) | R |
| `warehouseId` | `string` (UUID) | R |
| `number` | `string` | R |
| `receiptDate` | `string` | R |
| `notes` | `string` | O |
| `lines` | `GRNLineDto[]` | R |

**`GRNLineDto`** (nested)

| Field | Type | R/O |
|---|---|---|
| `itemId` | `string` (UUID) | R |
| `poLineId` | `string` (UUID) | O |
| `qty` | `number` | R |
| `unitCost` | `number` | O |
| `locationId` | `string` (UUID) | O |
| `lineNumber` | `number` | R |

---

### 3.12 CRM

**`CreateLeadDto`**

| Field | Type | R/O |
|---|---|---|
| `firstName` | `string` | R |
| `lastName` | `string` | R |
| `email` | `string` | O |
| `phone` | `string` | O |
| `company` | `string` | O |
| `title` | `string` | O |
| `source` | `string` | O |
| `status` | `string` | O |
| `score` | `number` | O |
| `notes` | `string` | O |

**`CreateCrmAccountDto`**

| Field | Type | R/O |
|---|---|---|
| `name` | `string` | R |
| `industry` | `string` | O |
| `website` | `string` | O |
| `phone` | `string` | O |
| `email` | `string` | O |
| `address` | `any` | O |
| `notes` | `string` | O |

**`CreateCrmContactDto`**

| Field | Type | R/O |
|---|---|---|
| `accountId` | `string` (UUID) | O |
| `firstName` | `string` | R |
| `lastName` | `string` | R |
| `email` | `string` | O |
| `phone` | `string` | O |
| `title` | `string` | O |
| `notes` | `string` | O |

**`CreateOpportunityDto`**

| Field | Type | R/O |
|---|---|---|
| `accountId` | `string` (UUID) | O |
| `contactId` | `string` (UUID) | O |
| `name` | `string` | R |
| `stage` | `string` | O |
| `amount` | `number` | O |
| `probability` | `number` | O |
| `closeDate` | `string` | O |
| `source` | `string` | O |
| `notes` | `string` | O |

**`CreateActivityDto`**

| Field | Type | R/O |
|---|---|---|
| `type` | `string` | R |
| `subject` | `string` | R |
| `description` | `string` | O |
| `status` | `string` | O |
| `dueDate` | `string` | O |
| `leadId` | `string` (UUID) | O |
| `accountId` | `string` (UUID) | O |
| `contactId` | `string` (UUID) | O |
| `opportunityId` | `string` (UUID) | O |

---

### 3.13 Sales

**`CreatePriceListDto`**

| Field | Type | R/O |
|---|---|---|
| `code` | `string` | R |
| `name` | `string` | R |
| `currency` | `string` | O |
| `isDefault` | `boolean` | O |
| `validFrom` | `string` | O |
| `validTo` | `string` | O |
| `items` | `PriceListItemDto[]` | R |

**`PriceListItemDto`** (nested)

| Field | Type | R/O |
|---|---|---|
| `itemId` | `string` (UUID) | R |
| `unitPrice` | `number` | R |
| `minQty` | `number` | O |
| `uom` | `string` | O |

**`CreateQuoteDto`**

| Field | Type | R/O |
|---|---|---|
| `customerId` | `string` (UUID) | R |
| `opportunityId` | `string` (UUID) | O |
| `number` | `string` | R |
| `quoteDate` | `string` | R |
| `validUntil` | `string` | O |
| `currency` | `string` | O |
| `notes` | `string` | O |
| `lines` | `QuoteLineDto[]` | R |

**`QuoteLineDto`** (nested)

| Field | Type | R/O |
|---|---|---|
| `itemId` | `string` (UUID) | R |
| `description` | `string` | O |
| `qty` | `number` | R |
| `uom` | `string` | O |
| `unitPrice` | `number` | R |
| `discount` | `number` | O |
| `taxCode` | `string` | O |
| `lineNumber` | `number` | R |

**`CreateSalesOrderDto`**

| Field | Type | R/O |
|---|---|---|
| `customerId` | `string` (UUID) | R |
| `quoteId` | `string` (UUID) | O |
| `number` | `string` | R |
| `orderDate` | `string` | R |
| `requestedDate` | `string` | O |
| `currency` | `string` | O |
| `notes` | `string` | O |
| `lines` | `SOLineDto[]` | R |

**`SOLineDto`** — same shape as `QuoteLineDto`

**`CreateDeliveryDto`**

| Field | Type | R/O |
|---|---|---|
| `soId` | `string` (UUID) | R |
| `warehouseId` | `string` (UUID) | R |
| `number` | `string` | R |
| `deliveryDate` | `string` | R |
| `notes` | `string` | O |
| `lines` | `DeliveryLineDto[]` | R |

**`DeliveryLineDto`** (nested)

| Field | Type | R/O |
|---|---|---|
| `itemId` | `string` (UUID) | R |
| `soLineId` | `string` (UUID) | O |
| `qty` | `number` | R |
| `uom` | `string` | O |
| `locationId` | `string` (UUID) | O |
| `lineNumber` | `number` | R |

---

### 3.14 Manufacturing

**`CreateBOMDto`** — Bill of Materials

| Field | Type | R/O |
|---|---|---|
| `itemId` | `string` (UUID) | R |
| `code` | `string` | R |
| `version` | `string` | O |
| `description` | `string` | O |
| `baseQty` | `number` | O |
| `uom` | `string` | O |
| `validFrom` | `string` | O |
| `validTo` | `string` | O |
| `lines` | `BOMLineDto[]` | R |

**`BOMLineDto`** (nested)

| Field | Type | R/O |
|---|---|---|
| `itemId` | `string` (UUID) | R |
| `description` | `string` | O |
| `qty` | `number` | R |
| `uom` | `string` | O |
| `scrapPct` | `number` | O |
| `isPhantom` | `boolean` | O |
| `lineNumber` | `number` | R |

**`CreateWorkCenterDto`**

| Field | Type | R/O |
|---|---|---|
| `code` | `string` | R |
| `name` | `string` | R |
| `description` | `string` | O |
| `type` | `string` | O |
| `capacity` | `number` | O |
| `efficiency` | `number` | O |
| `costRate` | `number` | O |

**`CreateRoutingDto`**

| Field | Type | R/O |
|---|---|---|
| `code` | `string` | R |
| `name` | `string` | R |
| `description` | `string` | O |
| `operations` | `RoutingOperationDto[]` | R |

**`RoutingOperationDto`** (nested)

| Field | Type | R/O |
|---|---|---|
| `workCenterId` | `string` (UUID) | O |
| `sequence` | `number` | R |
| `code` | `string` | R |
| `description` | `string` | O |
| `setupTime` | `number` | O |
| `runTime` | `number` | O |
| `queueTime` | `number` | O |
| `uom` | `string` | O |

**`CreateProductionOrderDto`**

| Field | Type | R/O |
|---|---|---|
| `itemId` | `string` (UUID) | R |
| `bomId` | `string` (UUID) | O |
| `number` | `string` | R |
| `description` | `string` | O |
| `plannedQty` | `number` | R |
| `uom` | `string` | O |
| `priority` | `number` | O |
| `plannedStart` | `string` | O |
| `plannedEnd` | `string` | O |
| `notes` | `string` | O |
| `components` | `ProductionComponentDto[]` | R |

**`ProductionComponentDto`** (nested)

| Field | Type | R/O |
|---|---|---|
| `itemId` | `string` (UUID) | R |
| `description` | `string` | O |
| `requiredQty` | `number` | R |
| `uom` | `string` | O |
| `lineNumber` | `number` | R |

**`RecordProductionDto`**

| Field | Type | R/O |
|---|---|---|
| `producedQty` | `number` | R |
| `scrapQty` | `number` | O |
| `warehouseId` | `string` (UUID) | O |
| `notes` | `string` | O |

**`RunMRPDto`**

| Field | Type | R/O |
|---|---|---|
| `reference` | `string` | R |
| `planType` | `string` | O |
| `notes` | `string` | O |

---

### 3.15 Human Resources

**`CreateDepartmentDto`**

| Field | Type | R/O |
|---|---|---|
| `code` | `string` | R |
| `name` | `string` | R |
| `description` | `string` | O |
| `parentId` | `string` | O |
| `managerId` | `string` | O |

**`CreatePositionDto`**

| Field | Type | R/O |
|---|---|---|
| `departmentId` | `string` | R |
| `code` | `string` | R |
| `title` | `string` | R |
| `description` | `string` | O |
| `minSalary` | `number` | O |
| `maxSalary` | `number` | O |

**`CreateEmployeeDto`**

| Field | Type | Validators | R/O |
|---|---|---|---|
| `employeeNumber` | `string` | `@IsString` | R |
| `firstName` | `string` | `@IsString` | R |
| `lastName` | `string` | `@IsString` | R |
| `email` | `string` | `@IsEmail` | R |
| `phone` | `string` | | O |
| `departmentId` | `string` | | O |
| `positionId` | `string` | | O |
| `managerId` | `string` | | O |
| `employmentType` | `string` | | O |
| `hireDate` | `string` | `@IsDateString` | R |
| `salary` | `number` | | O |
| `payFrequency` | `string` | | O |
| `bankAccount` | `string` | | O |
| `taxId` | `string` | | O |
| `nationality` | `string` | | O |
| `dateOfBirth` | `string` | `@IsDateString` | O |

**`UpdateEmployeeDto`** — all fields from `CreateEmployeeDto` are optional, plus `status` and `terminationDate`

**`CreateLeaveTypeDto`**

| Field | Type | R/O |
|---|---|---|
| `code` | `string` | R |
| `name` | `string` | R |
| `daysPerYear` | `number` | O |
| `isPaid` | `boolean` | O |
| `carryForward` | `boolean` | O |
| `maxCarryDays` | `number` | O |

**`CreateLeaveRequestDto`**

| Field | Type | R/O |
|---|---|---|
| `employeeId` | `string` | R |
| `leaveTypeId` | `string` | R |
| `startDate` | `string` | R |
| `endDate` | `string` | R |
| `days` | `number` | R |
| `reason` | `string` | O |

**`ApproveLeaveDto`**

| Field | Type | Notes |
|---|---|---|
| `action` | `string` | `"APPROVE"` or `"REJECT"` |
| `notes` | `string` | O |

**`CreatePayrollRunDto`**

| Field | Type | R/O |
|---|---|---|
| `reference` | `string` | R |
| `periodStart` | `string` | R |
| `periodEnd` | `string` | R |
| `payDate` | `string` | R |
| `notes` | `string` | O |

**`CreateJobPostingDto`**

| Field | Type | R/O |
|---|---|---|
| `title` | `string` | R |
| `positionId` | `string` | O |
| `departmentId` | `string` | O |
| `description` | `string` | O |
| `requirements` | `string` | O |
| `location` | `string` | O |
| `jobType` | `string` | O |
| `salaryMin` | `number` | O |
| `salaryMax` | `number` | O |
| `closingDate` | `string` | O |

**`CreateJobApplicationDto`**

| Field | Type | R/O |
|---|---|---|
| `jobPostingId` | `string` | R |
| `firstName` | `string` | R |
| `lastName` | `string` | R |
| `email` | `string` | R |
| `phone` | `string` | O |
| `resumeUrl` | `string` | O |
| `notes` | `string` | O |

**`UpdateApplicationStageDto`**

| Field | Type | R/O |
|---|---|---|
| `stage` | `string` | R |
| `rating` | `number` | O (1–5) |
| `notes` | `string` | O |

---

### 3.16 EAM — Enterprise Asset Management

**`CreateAssetCategoryDto`**

| Field | Type | R/O |
|---|---|---|
| `code` | `string` | R |
| `name` | `string` | R |
| `description` | `string` | O |

**`CreateAssetDto`** *(EAM module)*

| Field | Type | R/O |
|---|---|---|
| `code` | `string` | R |
| `name` | `string` | R |
| `categoryId` | `string` | O |
| `parentId` | `string` | O |
| `description` | `string` | O |
| `serialNumber` | `string` | O |
| `model` | `string` | O |
| `manufacturer` | `string` | O |
| `location` | `string` | O |
| `purchaseDate` | `string` | O |
| `purchaseCost` | `number` | O |
| `warrantyExpiry` | `string` | O |

**`CreateMaintenancePlanDto`**

| Field | Type | R/O |
|---|---|---|
| `assetId` | `string` | R |
| `code` | `string` | R |
| `name` | `string` | R |
| `description` | `string` | O |
| `planType` | `string` | O |
| `frequency` | `string` | O |
| `frequencyDays` | `number` | O |
| `nextDueAt` | `string` | R |
| `estimatedHours` | `number` | O |
| `tasks` | `MaintenancePlanTaskDto[]` | O |

**`MaintenancePlanTaskDto`** (nested)

| Field | Type | R/O |
|---|---|---|
| `sequence` | `number` | R |
| `description` | `string` | R |
| `estimatedMins` | `number` | O |

**`CreateWorkOrderDto`**

| Field | Type | R/O |
|---|---|---|
| `assetId` | `string` | R |
| `number` | `string` | R |
| `maintenancePlanId` | `string` | O |
| `type` | `string` | O |
| `priority` | `string` | O |
| `description` | `string` | R |
| `failureCode` | `string` | O |
| `assignedTo` | `string` | O |
| `scheduledStart` | `string` | O |
| `scheduledEnd` | `string` | O |
| `estimatedHours` | `number` | O |

**`CompleteWorkOrderDto`**

| Field | Type | R/O |
|---|---|---|
| `resolution` | `string` | O |
| `actualHours` | `number` | O |
| `costs` | `WorkOrderCostDto[]` | O |

**`WorkOrderCostDto`** (nested)

| Field | Type | R/O |
|---|---|---|
| `type` | `string` | R |
| `description` | `string` | R |
| `quantity` | `number` | O |
| `unitCost` | `number` | R |

**`RegisterIoTDeviceDto`**

| Field | Type | R/O |
|---|---|---|
| `deviceId` | `string` | R |
| `name` | `string` | R |
| `assetId` | `string` | O |
| `type` | `string` | O |
| `protocol` | `string` | O |

**`RecordIoTReadingDto`**

| Field | Type | R/O |
|---|---|---|
| `metric` | `string` | R |
| `value` | `number` | R |
| `unit` | `string` | O |
| `isAlert` | `boolean` | O |

---

### 3.17 FSM — Field Service Management

**`CreateTechnicianDto`**

| Field | Type | R/O |
|---|---|---|
| `code` | `string` | R |
| `name` | `string` | R |
| `email` | `string` | R |
| `phone` | `string` | O |
| `employeeId` | `string` | O |
| `skills` | `string[]` | O |

**`CreateServiceContractDto`**

| Field | Type | R/O |
|---|---|---|
| `customerId` | `string` | R |
| `number` | `string` | R |
| `name` | `string` | R |
| `description` | `string` | O |
| `contractType` | `string` | O |
| `startDate` | `string` | R |
| `endDate` | `string` | R |
| `value` | `number` | O |
| `slaHours` | `number` | O |
| `notes` | `string` | O |

**`CreateServiceOrderDto`**

| Field | Type | R/O |
|---|---|---|
| `number` | `string` | R |
| `title` | `string` | R |
| `description` | `string` | R |
| `contractId` | `string` | O |
| `customerId` | `string` | O |
| `technicianId` | `string` | O |
| `type` | `string` | O |
| `priority` | `string` | O |
| `location` | `string` | O |
| `contactName` | `string` | O |
| `contactPhone` | `string` | O |
| `scheduledAt` | `string` | O |
| `slaDeadline` | `string` | O |

**`AssignServiceOrderDto`**

| Field | Type | R/O |
|---|---|---|
| `technicianId` | `string` | R |
| `scheduledAt` | `string` | O |

**`CompleteServiceOrderDto`**

| Field | Type | R/O |
|---|---|---|
| `resolution` | `string` | O |
| `customerRating` | `number` | O |

**`AddServiceOrderNoteDto`**

| Field | Type | R/O |
|---|---|---|
| `content` | `string` | R |
| `authorId` | `string` | O |
| `isInternal` | `boolean` | O |

---

### 3.18 Quality

**`CreateInspectionTemplateDto`**

| Field | Type | R/O |
|---|---|---|
| `code` | `string` | R |
| `name` | `string` | R |
| `category` | `string` | O |
| `description` | `string` | O |
| `items` | `CreateTemplateItemDto[]` | O |

**`CreateTemplateItemDto`** (nested)

| Field | Type | R/O |
|---|---|---|
| `sequence` | `number` | R |
| `question` | `string` | R |
| `itemType` | `string` | O |
| `options` | `any` | O |
| `isRequired` | `boolean` | O |

**`CreateInspectionDto`**

| Field | Type | R/O |
|---|---|---|
| `templateId` | `string` | R |
| `number` | `string` | R |
| `title` | `string` | R |
| `referenceType` | `string` | O |
| `referenceId` | `string` | O |
| `scheduledAt` | `string` | O |

**`CompleteInspectionDto`**

| Field | Type | R/O |
|---|---|---|
| `conductedBy` | `string` | R |
| `findings` | `string` | O |
| `overallResult` | `string` | O |
| `responses` | `InspectionResponseDto[]` | O |

**`InspectionResponseDto`** (nested)

| Field | Type | R/O |
|---|---|---|
| `itemId` | `string` | R |
| `result` | `string` | O |
| `numericValue` | `number` | O |
| `textValue` | `string` | O |
| `notes` | `string` | O |
| `hasDefect` | `boolean` | O |

**`CreateNCRDto`** — Non-Conformance Report

| Field | Type | R/O |
|---|---|---|
| `number` | `string` | R |
| `title` | `string` | R |
| `description` | `string` | R |
| `source` | `string` | O |
| `severity` | `string` | O |
| `raisedBy` | `string` | R |
| `dueDate` | `string` | O |
| `inspectionId` | `string` | O |

**`CreateNCRActionDto`**

| Field | Type | R/O |
|---|---|---|
| `actionType` | `string` | R |
| `description` | `string` | R |
| `assignedTo` | `string` | R |
| `dueDate` | `string` | O |

**`CloseNCRDto`**

| Field | Type | R/O |
|---|---|---|
| `resolution` | `string` | O |

**`CreateAuditDto`**

| Field | Type | R/O |
|---|---|---|
| `number` | `string` | R |
| `title` | `string` | R |
| `auditType` | `string` | O |
| `standard` | `string` | O |
| `scope` | `string` | O |
| `leadAuditor` | `string` | R |
| `scheduledStart` | `string` | R |
| `scheduledEnd` | `string` | R |

**`CompleteAuditDto`**

| Field | Type | R/O |
|---|---|---|
| `findings` | `string` | O |
| `result` | `string` | O |
| `findings_` | `CreateAuditFindingDto[]` | O |

**`CreateAuditFindingDto`** (nested)

| Field | Type | R/O |
|---|---|---|
| `findingType` | `string` | R |
| `description` | `string` | R |
| `clause` | `string` | O |
| `requiresAction` | `boolean` | O |

---

### 3.19 EHS — Environment, Health & Safety

**`CreateIncidentDto`**

| Field | Type | R/O |
|---|---|---|
| `number` | `string` | R |
| `title` | `string` | R |
| `incidentType` | `string` | O |
| `severity` | `string` | O |
| `reportedBy` | `string` | R |
| `occurredAt` | `string` | R |
| `location` | `string` | O |
| `description` | `string` | R |
| `injuries` | `string` | O |
| `witnesses` | `string` | O |

**`InvestigateIncidentDto`**

| Field | Type | R/O |
|---|---|---|
| `rootCause` | `string` | O |
| `preventiveActions` | `string` | O |

**`CreateRiskAssessmentDto`**

| Field | Type | R/O |
|---|---|---|
| `number` | `string` | R |
| `title` | `string` | R |
| `assessedBy` | `string` | R |
| `reviewDue` | `string` | R |
| `hazards` | `RiskHazardDto[]` | O |

**`RiskHazardDto`** (nested)

| Field | Type | Validators | R/O |
|---|---|---|---|
| `hazard` | `string` | `@IsString` | R |
| `category` | `string` | | O |
| `likelihood` | `number` | `@IsInt @Min(1) @Max(5)` | R |
| `severity` | `number` | `@IsInt @Min(1) @Max(5)` | R |
| `controls` | `string` | | O |
| `residualLikelihood` | `number` | `@IsInt` | O |
| `residualSeverity` | `number` | `@IsInt` | O |

**`CreatePermitDto`** — Permit to Work

| Field | Type | R/O |
|---|---|---|
| `number` | `string` | R |
| `permitType` | `string` | O |
| `title` | `string` | R |
| `location` | `string` | O |
| `requestedBy` | `string` | R |
| `validFrom` | `string` | R |
| `validTo` | `string` | R |
| `conditions` | `string` | O |

**`ApprovePermitDto`**

| Field | Type | R/O |
|---|---|---|
| `approvedBy` | `string` | R |

---

### 3.20 Projects

**`CreateProjectDto`**

| Field | Type | R/O |
|---|---|---|
| `code` | `string` | R |
| `name` | `string` | R |
| `description` | `string` | O |
| `status` | `string` | O |
| `priority` | `string` | O |
| `managerId` | `string` | R |
| `customerId` | `string` | O |
| `budget` | `number` | O |
| `startDate` | `string` | R |
| `endDate` | `string` | O |

**`UpdateProjectStatusDto`**

| Field | Type | R/O |
|---|---|---|
| `status` | `string` | R |

**`CreateTaskDto`**

| Field | Type | R/O |
|---|---|---|
| `projectId` | `string` | R |
| `code` | `string` | R |
| `title` | `string` | R |
| `description` | `string` | O |
| `parentId` | `string` | O |
| `status` | `string` | O |
| `priority` | `string` | O |
| `assigneeId` | `string` | O |
| `estimatedHours` | `number` | O |
| `plannedStart` | `string` | O |
| `plannedEnd` | `string` | O |

**`UpdateTaskDto`**

| Field | Type | R/O |
|---|---|---|
| `status` | `string` | O |
| `progress` | `number` | O |
| `actualHours` | `number` | O |
| `assigneeId` | `string` | O |

**`CreateTimesheetDto`**

| Field | Type | R/O |
|---|---|---|
| `projectId` | `string` | R |
| `taskId` | `string` | O |
| `employeeId` | `string` | O |
| `date` | `string` | R |
| `hours` | `number` | R |
| `description` | `string` | O |
| `billable` | `boolean` | O |

**`ApproveTimesheetDto`**

| Field | Type | R/O |
|---|---|---|
| `approvedBy` | `string` | R |

**`CreateBillingDto`**

| Field | Type | R/O |
|---|---|---|
| `projectId` | `string` | R |
| `number` | `string` | R |
| `billType` | `string` | O |
| `amount` | `number` | R |
| `notes` | `string` | O |

---

## 4. API Endpoints

> All endpoints are prefixed with `/api/v1`.
> Protected routes require `Authorization: Bearer <token>` and `x-company-id: <uuid>`.

---

### 4.1 Auth

Base: `/api/v1/auth`

| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| `POST` | `/register` | Public | `RegisterDto` | Create tenant + company + super-admin user |
| `POST` | `/login` | Public | `LoginDto` | Returns `{ accessToken, user }`, sets `refresh_token` httpOnly cookie |
| `POST` | `/refresh` | Cookie | — | Reads `refresh_token` cookie, returns new `{ accessToken }`, rotates cookie |
| `POST` | `/logout` | Cookie | — | Deletes session, clears cookie |
| `GET` | `/me` | JWT | — | Returns current user profile + companies |

**Login response shape:**
```json
{
  "accessToken": "<JWT>",
  "user": {
    "id": "...",
    "email": "...",
    "firstName": "...",
    "lastName": "...",
    "isSuperAdmin": false,
    "companies": [{ "id": "...", "name": "...", "code": "..." }]
  }
}
```

**Cookie:** `refresh_token` — httpOnly, Secure (prod), SameSite=Lax, maxAge=30d, path=`/api/v1/auth`

**JWT payload:** `{ sub: userId, email, tenantId, isSuperAdmin }`  
**JWT TTL:** 15 minutes

---

### 4.2 Companies

Base: `/api/v1/companies` · Requires JWT

| Method | Path | Body | Description |
|---|---|---|---|
| `GET` | `/` | — | List all companies in tenant |
| `GET` | `/:id` | — | Get company by ID |
| `POST` | `/` | `CreateCompanyDto` | Create new company |
| `PUT` | `/:id` | `Partial<CreateCompanyDto>` | Update company |
| `GET` | `/:id/users` | — | List users with access to company |

---

### 4.3 Users

Base: `/api/v1/users` · Requires JWT

| Method | Path | Body | Description |
|---|---|---|---|
| `GET` | `/` | — | List users in tenant |
| `GET` | `/:id` | — | Get user by ID |
| `POST` | `/` | `CreateUserDto` | Create user |
| `PUT` | `/:id` | `Partial<CreateUserDto>` | Update user |

---

### 4.4 Finance — GL

Base: `/api/v1/finance/gl` · Requires JWT + x-company-id

| Method | Path | Query | Body | Description |
|---|---|---|---|---|
| `GET` | `/dashboard` | — | — | Dashboard KPI stats |
| `GET` | `/accounts` | — | — | List all GL accounts (full CoA) |
| `GET` | `/accounts/:id` | — | — | Get account by ID |
| `POST` | `/accounts` | — | `CreateAccountDto` | Create GL account |
| `PUT` | `/accounts/:id` | — | `Partial<CreateAccountDto>` | Update GL account |
| `GET` | `/periods` | `fiscalYear?` | — | List fiscal periods |
| `GET` | `/journals` | `page, limit, search` | — | List journals (paginated) |
| `GET` | `/journals/:id` | — | — | Get journal with lines |
| `POST` | `/journals` | — | `CreateJournalDto` | Create journal (validates balance) |
| `PATCH` | `/journals/:id/post` | — | — | Post DRAFT → POSTED |
| `PATCH` | `/journals/:id/void` | — | — | Void POSTED → VOID |
| `GET` | `/trial-balance` | `fiscalYear*, period?` | — | Trial balance report |

---

### 4.5 Finance — AP

Base: `/api/v1/finance/ap` · Requires JWT + x-company-id

| Method | Path | Query | Body | Description |
|---|---|---|---|---|
| `GET` | `/vendors` | `page, limit, search` | — | List vendors |
| `GET` | `/vendors/:id` | — | — | Get vendor |
| `POST` | `/vendors` | — | `CreateVendorDto` | Create vendor |
| `PUT` | `/vendors/:id` | — | `Partial<CreateVendorDto>` | Update vendor |
| `GET` | `/invoices` | `page, limit, search, status?` | — | List AP invoices |
| `GET` | `/invoices/:id` | — | — | Get AP invoice with lines |
| `POST` | `/invoices` | — | `CreateApInvoiceDto` | Create AP invoice |
| `PATCH` | `/invoices/:id/approve` | — | — | DRAFT → APPROVED |
| `PATCH` | `/invoices/:id/post` | — | — | APPROVED → POSTED (creates GL entry) |
| `GET` | `/aging` | — | — | AP aging report (30/60/90/90+ days) |

---

### 4.6 Finance — AR

Base: `/api/v1/finance/ar` · Requires JWT + x-company-id

| Method | Path | Query | Body | Description |
|---|---|---|---|---|
| `GET` | `/customers` | `page, limit, search` | — | List customers |
| `GET` | `/customers/:id` | — | — | Get customer |
| `POST` | `/customers` | — | `CreateCustomerDto` | Create customer |
| `PUT` | `/customers/:id` | — | `Partial<CreateCustomerDto>` | Update customer |
| `GET` | `/invoices` | `page, limit, search, status?` | — | List AR invoices |
| `GET` | `/invoices/:id` | — | — | Get AR invoice with lines |
| `POST` | `/invoices` | — | `CreateArInvoiceDto` | Create AR invoice |
| `PATCH` | `/invoices/:id/post` | — | — | DRAFT → POSTED (creates GL entry) |
| `GET` | `/aging` | — | — | AR aging report |

---

### 4.7 Finance — Bank

Base: `/api/v1/finance/bank` · Requires JWT + x-company-id

| Method | Path | Query | Body | Description |
|---|---|---|---|---|
| `GET` | `/summary` | — | — | Bank portfolio summary |
| `GET` | `/accounts` | `PaginationDto` | — | List bank accounts |
| `GET` | `/accounts/:id` | — | — | Get bank account |
| `POST` | `/accounts` | — | `CreateBankAccountDto` | Create bank account |
| `PUT` | `/accounts/:id` | — | `Partial<CreateBankAccountDto>` | Update bank account |
| `GET` | `/accounts/:id/transactions` | `PaginationDto` | — | List transactions for account |
| `POST` | `/transactions` | — | `CreateBankTransactionDto` | Record bank transaction |

---

### 4.8 Finance — Fixed Assets

Base: `/api/v1/finance/assets` · Requires JWT + x-company-id

| Method | Path | Query | Body | Description |
|---|---|---|---|---|
| `GET` | `/summary` | — | — | Asset summary stats |
| `GET` | `/` | `page, limit, status?, category?` | — | List assets |
| `GET` | `/:id` | — | — | Get asset with depreciation schedule |
| `POST` | `/` | — | `CreateAssetDto` | Create asset |
| `PUT` | `/:id` | — | `Partial<CreateAssetDto>` | Update asset |
| `PATCH` | `/:id/dispose` | — | `DisposeAssetDto` | Dispose asset |
| `POST` | `/depreciation/run` | `asOfDate*` | — | Run depreciation to date |

---

### 4.9 Finance — Budgets

Base: `/api/v1/finance/budgets` · Requires JWT + x-company-id

| Method | Path | Query | Body | Description |
|---|---|---|---|---|
| `GET` | `/` | `page, limit, fiscalYear?` | — | List budgets |
| `GET` | `/:id` | — | — | Get budget with lines |
| `POST` | `/` | — | `CreateBudgetDto` | Create budget |
| `PATCH` | `/:id/approve` | — | — | Approve budget |
| `GET` | `/:id/vs-actual` | — | — | Budget vs actual comparison |

---

### 4.10 Finance — Reports

Base: `/api/v1/finance/reports` · Requires JWT + x-company-id

| Method | Path | Query | Description |
|---|---|---|---|
| `GET` | `/pl` | `fiscalYear*, fromPeriod?, toPeriod?` | Profit & Loss statement |
| `GET` | `/balance-sheet` | `fiscalYear*, asOfPeriod?` | Balance sheet |

---

### 4.11 Inventory

Base: `/api/v1/inventory` · Requires JWT + x-company-id

| Method | Path | Query | Body | Description |
|---|---|---|---|---|
| `GET` | `/summary` | — | — | Inventory summary stats |
| `GET` | `/categories` | — | — | List item categories |
| `POST` | `/categories` | — | `CreateItemCategoryDto` | Create category |
| `GET` | `/items` | `page, limit, search, categoryId?` | — | List items with stock levels |
| `GET` | `/items/:id` | — | — | Get item detail |
| `POST` | `/items` | — | `CreateItemDto` | Create item |
| `PUT` | `/items/:id` | — | `Partial<CreateItemDto>` | Update item |
| `GET` | `/warehouses` | — | — | List warehouses |
| `POST` | `/warehouses` | — | `CreateWarehouseDto` | Create warehouse |
| `POST` | `/warehouses/locations` | — | `CreateStorageLocationDto` | Create storage location |
| `GET` | `/stock-levels` | `warehouseId?, itemId?` | — | Query stock levels |
| `GET` | `/movements` | `itemId?, warehouseId?, page, limit` | — | List stock movements |
| `POST` | `/movements` | — | `CreateStockMovementDto` | Create stock movement |
| `GET` | `/counts` | — | — | List stock counts |
| `GET` | `/counts/:id` | — | — | Get stock count |
| `POST` | `/counts` | — | `CreateStockCountDto` | Create stock count |
| `POST` | `/counts/:id/post` | — | — | Post stock count (adjusts levels) |

---

### 4.12 Procurement

Base: `/api/v1/procurement` · Requires JWT + x-company-id

| Method | Path | Query | Body | Description |
|---|---|---|---|---|
| `GET` | `/dashboard` | — | — | Procurement stats |
| `GET` | `/vendors` | `search, page, limit` | — | List vendors |
| `GET` | `/requisitions` | `status?, page, limit` | — | List purchase requisitions |
| `GET` | `/requisitions/:id` | — | — | Get PR with lines |
| `POST` | `/requisitions` | — | `CreatePRDto` | Create PR |
| `POST` | `/requisitions/:id/approve` | — | — | Approve PR |
| `GET` | `/orders` | `status?, vendorId?, page, limit` | — | List purchase orders |
| `GET` | `/orders/:id` | — | — | Get PO with lines |
| `POST` | `/orders` | — | `CreatePODto` | Create PO |
| `POST` | `/orders/:id/approve` | — | — | Approve PO |
| `GET` | `/receipts` | `poId?, status?, page, limit` | — | List GRNs |
| `GET` | `/receipts/:id` | — | — | Get GRN |
| `POST` | `/receipts` | — | `CreateGRNDto` | Create GRN |
| `POST` | `/receipts/:id/post` | — | — | Post GRN (moves stock into warehouse) |

---

### 4.13 CRM

Base: `/api/v1/crm` · Requires JWT + x-company-id

| Method | Path | Query | Body | Description |
|---|---|---|---|---|
| `GET` | `/dashboard` | — | — | CRM stats |
| `GET` | `/leads` | `status?, search, page, limit` | — | List leads |
| `GET` | `/leads/:id` | — | — | Get lead |
| `POST` | `/leads` | — | `CreateLeadDto` | Create lead |
| `PUT` | `/leads/:id` | — | `CreateLeadDto` | Update lead |
| `GET` | `/accounts` | `search, page, limit` | — | List CRM accounts |
| `GET` | `/accounts/:id` | — | — | Get CRM account |
| `POST` | `/accounts` | — | `CreateCrmAccountDto` | Create CRM account |
| `PUT` | `/accounts/:id` | — | `CreateCrmAccountDto` | Update account |
| `GET` | `/contacts` | `accountId?, search, page, limit` | — | List contacts |
| `GET` | `/contacts/:id` | — | — | Get contact |
| `POST` | `/contacts` | — | `CreateCrmContactDto` | Create contact |
| `PUT` | `/contacts/:id` | — | `CreateCrmContactDto` | Update contact |
| `GET` | `/opportunities` | `stage?, status?, accountId?, page, limit` | — | List opportunities |
| `GET` | `/opportunities/:id` | — | — | Get opportunity |
| `POST` | `/opportunities` | — | `CreateOpportunityDto` | Create opportunity |
| `PUT` | `/opportunities/:id` | — | `CreateOpportunityDto` | Update opportunity |
| `GET` | `/activities` | `status?, type?, page, limit` | — | List activities |
| `POST` | `/activities` | — | `CreateActivityDto` | Create activity |
| `POST` | `/activities/:id/complete` | — | — | Mark activity complete |

---

### 4.14 Sales

Base: `/api/v1/sales` · Requires JWT + x-company-id

| Method | Path | Query | Body | Description |
|---|---|---|---|---|
| `GET` | `/dashboard` | — | — | Sales stats |
| `GET` | `/price-lists` | — | — | List price lists |
| `GET` | `/price-lists/:id` | — | — | Get price list |
| `POST` | `/price-lists` | — | `CreatePriceListDto` | Create price list |
| `GET` | `/quotes` | `status?, customerId?, page, limit` | — | List quotations |
| `GET` | `/quotes/:id` | — | — | Get quote with lines |
| `POST` | `/quotes` | — | `CreateQuoteDto` | Create quote |
| `POST` | `/quotes/:id/approve` | — | — | DRAFT → APPROVED |
| `POST` | `/quotes/:id/convert` | — | `{ orderNumber: string }` | APPROVED → CONVERTED + creates SO |
| `GET` | `/orders` | `status?, customerId?, page, limit` | — | List sales orders |
| `GET` | `/orders/:id` | — | — | Get SO with lines |
| `POST` | `/orders` | — | `CreateSalesOrderDto` | Create SO |
| `POST` | `/orders/:id/approve` | — | — | Approve SO |
| `GET` | `/deliveries` | `soId?, status?, page, limit` | — | List deliveries |
| `GET` | `/deliveries/:id` | — | — | Get delivery with lines |
| `POST` | `/deliveries` | — | `CreateDeliveryDto` | Create delivery |
| `POST` | `/deliveries/:id/post` | — | — | Post delivery (reduces stock) |

---

### 4.15 Manufacturing

Base: `/api/v1/manufacturing` · Requires JWT + x-company-id

| Method | Path | Query | Body | Description |
|---|---|---|---|---|
| `GET` | `/dashboard` | — | — | Manufacturing stats |
| `GET` | `/bom` | `itemId?, status?, page, limit` | — | List BOMs |
| `GET` | `/bom/:id` | — | — | Get BOM with lines |
| `POST` | `/bom` | — | `CreateBOMDto` | Create BOM |
| `POST` | `/bom/:id/activate` | — | — | Activate BOM |
| `GET` | `/work-centers` | — | — | List work centers |
| `POST` | `/work-centers` | — | `CreateWorkCenterDto` | Create work center |
| `GET` | `/routings` | — | — | List routings |
| `GET` | `/routings/:id` | — | — | Get routing with operations |
| `POST` | `/routings` | — | `CreateRoutingDto` | Create routing |
| `GET` | `/orders` | `status?, itemId?, page, limit` | — | List production orders |
| `GET` | `/orders/:id` | — | — | Get production order |
| `POST` | `/orders` | — | `CreateProductionOrderDto` | Create production order |
| `POST` | `/orders/:id/release` | — | — | DRAFT → RELEASED |
| `POST` | `/orders/:id/produce` | — | `RecordProductionDto` | Record production output |
| `GET` | `/mrp` | — | — | List MRP plans |
| `GET` | `/mrp/:id` | — | — | Get MRP plan |
| `POST` | `/mrp/run` | — | `RunMRPDto` | Execute MRP calculation |

---

### 4.16 Human Resources

Base: `/api/v1/hr` · Requires JWT + x-company-id

| Method | Path | Query | Body | Description |
|---|---|---|---|---|
| `GET` | `/dashboard` | — | — | HR stats |
| `GET` | `/departments` | — | — | List departments |
| `POST` | `/departments` | — | `CreateDepartmentDto` | Create department |
| `GET` | `/positions` | — | — | List positions |
| `POST` | `/positions` | — | `CreatePositionDto` | Create position |
| `GET` | `/employees` | `status?, departmentId?, page, limit` | — | List employees |
| `GET` | `/employees/:id` | — | — | Get employee |
| `POST` | `/employees` | — | `CreateEmployeeDto` | Create employee |
| `PUT` | `/employees/:id` | — | `UpdateEmployeeDto` | Update employee |
| `GET` | `/leave-types` | — | — | List leave types |
| `POST` | `/leave-types` | — | `CreateLeaveTypeDto` | Create leave type |
| `GET` | `/leave` | `status?, employeeId?, page, limit` | — | List leave requests |
| `POST` | `/leave` | — | `CreateLeaveRequestDto` | Submit leave request |
| `POST` | `/leave/:id/process` | — | `ApproveLeaveDto` | Approve or reject leave |
| `GET` | `/payroll` | — | — | List payroll runs |
| `GET` | `/payroll/:id` | — | — | Get payroll run |
| `POST` | `/payroll` | — | `CreatePayrollRunDto` | Create payroll run |
| `POST` | `/payroll/:id/approve` | — | — | Approve payroll run |
| `GET` | `/recruitment/postings` | `status?, page, limit` | — | List job postings |
| `POST` | `/recruitment/postings` | — | `CreateJobPostingDto` | Create job posting |
| `POST` | `/recruitment/postings/:id/publish` | — | — | Publish job posting |
| `GET` | `/recruitment/applications` | `jobPostingId?, stage?, page, limit` | — | List applications |
| `POST` | `/recruitment/applications` | — | `CreateJobApplicationDto` | Submit application |
| `PUT` | `/recruitment/applications/:id/stage` | — | `UpdateApplicationStageDto` | Update application stage |

---

### 4.17 EAM

Base: `/api/v1/eam` · Requires JWT + x-company-id

| Method | Path | Query | Body | Description |
|---|---|---|---|---|
| `GET` | `/dashboard` | — | — | EAM stats |
| `GET` | `/categories` | — | — | List asset categories |
| `POST` | `/categories` | — | `CreateAssetCategoryDto` | Create category |
| `GET` | `/assets` | `status?, categoryId?, page, limit` | — | List assets |
| `GET` | `/assets/:id` | — | — | Get asset |
| `POST` | `/assets` | — | `CreateAssetDto` | Create asset |
| `GET` | `/plans` | `assetId?, page, limit` | — | List maintenance plans |
| `POST` | `/plans` | — | `CreateMaintenancePlanDto` | Create maintenance plan |
| `POST` | `/plans/:id/trigger` | — | — | Manually trigger plan → creates work order |
| `GET` | `/work-orders` | `status?, assetId?, type?, page, limit` | — | List work orders |
| `POST` | `/work-orders` | — | `CreateWorkOrderDto` | Create work order |
| `POST` | `/work-orders/:id/start` | — | — | Start work order |
| `POST` | `/work-orders/:id/complete` | — | `CompleteWorkOrderDto` | Complete work order |
| `GET` | `/iot/devices` | — | — | List IoT devices |
| `POST` | `/iot/devices` | — | `RegisterIoTDeviceDto` | Register IoT device |
| `POST` | `/iot/devices/:id/readings` | — | `RecordIoTReadingDto` | Push sensor reading |
| `GET` | `/iot/devices/:id/readings` | `metric?, limit?` | — | Get device readings |

---

### 4.18 FSM

Base: `/api/v1/fsm` · Requires JWT + x-company-id

| Method | Path | Query | Body | Description |
|---|---|---|---|---|
| `GET` | `/dashboard` | — | — | FSM stats |
| `GET` | `/technicians` | — | — | List technicians |
| `POST` | `/technicians` | — | `CreateTechnicianDto` | Create technician |
| `POST` | `/technicians/:id/status` | — | `{ status: string }` | Update technician status |
| `GET` | `/contracts` | `status?, customerId?, page, limit` | — | List service contracts |
| `POST` | `/contracts` | — | `CreateServiceContractDto` | Create contract |
| `GET` | `/orders` | `status?, technicianId?, type?, page, limit` | — | List service orders |
| `GET` | `/orders/:id` | — | — | Get service order |
| `POST` | `/orders` | — | `CreateServiceOrderDto` | Create service order |
| `POST` | `/orders/:id/assign` | — | `AssignServiceOrderDto` | Assign technician |
| `POST` | `/orders/:id/start` | — | — | Start service order |
| `POST` | `/orders/:id/complete` | — | `CompleteServiceOrderDto` | Complete service order |
| `POST` | `/orders/:id/notes` | — | `AddServiceOrderNoteDto` | Add note to service order |

---

### 4.19 Quality

Base: `/api/v1/quality` · Requires JWT + x-company-id

| Method | Path | Query | Body | Description |
|---|---|---|---|---|
| `GET` | `/dashboard` | — | — | Quality stats |
| `GET` | `/templates` | — | — | List inspection templates |
| `POST` | `/templates` | — | `CreateInspectionTemplateDto` | Create template |
| `GET` | `/inspections` | `status?, page, limit` | — | List inspections |
| `GET` | `/inspections/:id` | — | — | Get inspection |
| `POST` | `/inspections` | — | `CreateInspectionDto` | Create inspection |
| `POST` | `/inspections/:id/complete` | — | `CompleteInspectionDto` | Complete inspection |
| `GET` | `/ncr` | `status?, severity?, page, limit` | — | List NCRs |
| `POST` | `/ncr` | — | `CreateNCRDto` | Create NCR |
| `POST` | `/ncr/:id/actions` | — | `CreateNCRActionDto` | Add corrective action |
| `POST` | `/ncr/:id/close` | — | `CloseNCRDto` | Close NCR |
| `GET` | `/audits` | `status?, page, limit` | — | List audits |
| `POST` | `/audits` | — | `CreateAuditDto` | Create audit |
| `POST` | `/audits/:id/start` | — | — | Start audit |
| `POST` | `/audits/:id/complete` | — | `CompleteAuditDto` | Complete audit with findings |

---

### 4.20 EHS

Base: `/api/v1/ehs` · Requires JWT + x-company-id

| Method | Path | Query | Body | Description |
|---|---|---|---|---|
| `GET` | `/dashboard` | — | — | EHS stats |
| `GET` | `/incidents` | `status?, type?, page, limit` | — | List incidents |
| `POST` | `/incidents` | — | `CreateIncidentDto` | Report incident |
| `POST` | `/incidents/:id/investigate` | — | `InvestigateIncidentDto` | Add investigation data |
| `POST` | `/incidents/:id/close` | — | — | Close incident |
| `GET` | `/risks` | `status?, page, limit` | — | List risk assessments |
| `POST` | `/risks` | — | `CreateRiskAssessmentDto` | Create risk assessment |
| `POST` | `/risks/:id/activate` | — | — | Activate risk assessment |
| `GET` | `/permits` | `status?, page, limit` | — | List permits to work |
| `POST` | `/permits` | — | `CreatePermitDto` | Create permit |
| `POST` | `/permits/:id/approve` | — | `ApprovePermitDto` | Approve permit |
| `POST` | `/permits/:id/close` | — | — | Close permit |

---

### 4.21 Projects

Base: `/api/v1/projects` · Requires JWT + x-company-id

| Method | Path | Query | Body | Description |
|---|---|---|---|---|
| `GET` | `/dashboard` | — | — | Project stats |
| `GET` | `/` | `status?, page, limit` | — | List projects |
| `GET` | `/:id` | — | — | Get project |
| `POST` | `/` | — | `CreateProjectDto` | Create project |
| `POST` | `/:id/status` | — | `UpdateProjectStatusDto` | Update project status |
| `GET` | `/tasks/list` | `projectId?, status?, assigneeId?, page, limit` | — | List tasks |
| `POST` | `/tasks` | — | `CreateTaskDto` | Create task |
| `PUT` | `/tasks/:id` | — | `UpdateTaskDto` | Update task |
| `GET` | `/timesheets/list` | `projectId?, employeeId?, status?, page, limit` | — | List timesheets |
| `POST` | `/timesheets` | — | `CreateTimesheetDto` | Log timesheet |
| `POST` | `/timesheets/:id/approve` | — | `ApproveTimesheetDto` | Approve timesheet |
| `GET` | `/billing/list` | `projectId?` | — | List billing records |
| `POST` | `/billing` | — | `CreateBillingDto` | Create billing record |
| `POST` | `/billing/:id/invoice` | — | — | Mark billing as invoiced |

---

## 5. Status Enumerations

| Domain | Entity | Statuses |
|---|---|---|
| Finance | `GlJournal.status` | `DRAFT` → `POSTED` → `VOID` |
| Finance | `GlPeriod.status` | `OPEN` → `CLOSED` |
| Finance | `ApInvoice.status` | `DRAFT` → `APPROVED` → `POSTED` → `PAID` \| `VOID` |
| Finance | `ArInvoice.status` | `DRAFT` → `POSTED` → `PAID` \| `VOID` |
| Finance | `Budget.status` | `DRAFT` → `APPROVED` |
| Finance | `FixedAsset.status` | `ACTIVE` → `DISPOSED` |
| Inventory | `StockCount.status` | `DRAFT` → `POSTED` |
| Procurement | `PurchaseRequisition.status` | `DRAFT` → `APPROVED` → `CONVERTED` |
| Procurement | `PurchaseOrder.status` | `DRAFT` → `APPROVED` → `RECEIVED` \| `CLOSED` |
| Procurement | `GoodsReceipt.status` | `DRAFT` → `POSTED` |
| CRM | `Lead.status` | `NEW` \| `CONTACTED` \| `QUALIFIED` \| `CONVERTED` \| `LOST` |
| CRM | `Opportunity.status` | `OPEN` \| `WON` \| `LOST` |
| Sales | `Quote.status` | `DRAFT` → `APPROVED` → `CONVERTED` \| `REJECTED` |
| Sales | `SalesOrder.status` | `DRAFT` → `APPROVED` → `SHIPPED` \| `CLOSED` |
| Sales | `Delivery.status` | `DRAFT` → `POSTED` |
| Manufacturing | `BOM.status` | `DRAFT` → `ACTIVE` \| `INACTIVE` |
| Manufacturing | `ProductionOrder.status` | `DRAFT` → `RELEASED` → `IN_PROGRESS` → `CLOSED` |
| HR | `LeaveRequest.status` | `PENDING` → `APPROVED` \| `REJECTED` |
| HR | `PayrollRun.status` | `DRAFT` → `APPROVED` → `PAID` |
| HR | `JobPosting.status` | `DRAFT` → `PUBLISHED` → `CLOSED` |
| EAM | `WorkOrder.status` | `OPEN` → `IN_PROGRESS` → `COMPLETED` |
| FSM | `ServiceOrder.status` | `NEW` → `ASSIGNED` → `IN_PROGRESS` → `COMPLETED` |
| FSM | `Technician.status` | `AVAILABLE` \| `BUSY` \| `OFFLINE` |
| Quality | `Inspection.status` | `SCHEDULED` → `IN_PROGRESS` → `COMPLETED` |
| Quality | `NCR.status` | `OPEN` → `IN_PROGRESS` → `CLOSED` |
| Quality | `Audit.status` | `SCHEDULED` → `IN_PROGRESS` → `COMPLETED` |
| EHS | `Incident.status` | `OPEN` → `INVESTIGATING` → `CLOSED` |
| EHS | `RiskAssessment.status` | `DRAFT` → `ACTIVE` \| `REVIEWED` |
| EHS | `PermitToWork.status` | `PENDING` → `APPROVED` → `ACTIVE` → `CLOSED` |
| Projects | `Project.status` | `PLANNING` \| `ACTIVE` \| `ON_HOLD` \| `COMPLETED` \| `CANCELLED` |
| Projects | `Task.status` | `TODO` \| `IN_PROGRESS` \| `REVIEW` \| `DONE` |
| Projects | `Timesheet.status` | `DRAFT` → `APPROVED` |

---

## 6. Common Response Envelopes

### Paginated list
```json
{
  "data": [...],
  "total": 142,
  "page": 1,
  "limit": 25,
  "pages": 6
}
```

### Single record
```json
{ ...fields, "createdAt": "ISO8601", "updatedAt": "ISO8601" }
```

### Error
```json
{
  "statusCode": 400,
  "message": "Debits must equal credits",
  "error": "Bad Request"
}
```

### Validation error (422 / 400)
```json
{
  "statusCode": 400,
  "message": ["date must be a valid ISO 8601 date string", "lines should not be empty"],
  "error": "Bad Request"
}
```

### Auth error (401)
```json
{ "statusCode": 401, "message": "Unauthorized" }
```

### HTTP status codes used
| Code | When |
|---|---|
| `200` | Successful GET, PATCH, POST actions (login, logout, refresh) |
| `201` | Successful POST creating a resource |
| `400` | Validation error, business rule violation (unbalanced journal, etc.) |
| `401` | Missing or invalid JWT, expired token |
| `403` | Insufficient permissions |
| `404` | Record not found |
| `409` | Unique constraint violation (duplicate code, number, etc.) |
| `500` | Unexpected server error |
