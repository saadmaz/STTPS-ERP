# Technical Requirements Document (TRD)

<!-- nav -->
<sub><a href="../README.md">Project README</a> · <a href="README.md">Documentation index</a></sub>
## STTPS ERP Platform

**Version**: 1.0  
**Date**: 2026-05-24  
**Status**: In Development  
**Classification**: Internal Engineering  
**Companion**: See PRD.md for product/functional requirements

---

## Table of Contents

1. [Technology Stack & Versions](#1-technology-stack--versions)
2. [Repository & Monorepo Structure](#2-repository--monorepo-structure)
3. [Backend — NestJS Application](#3-backend--nestjs-application)
4. [Database Design & Prisma Schema](#4-database-design--prisma-schema)
5. [Authentication & Session Management](#5-authentication--session-management)
6. [API Design Specification](#6-api-design-specification)
7. [Frontend — Next.js Application](#7-frontend--nextjs-application)
8. [Data Validation & DTO Contracts](#8-data-validation--dto-contracts)
9. [Error Handling](#9-error-handling)
10. [Multi-Tenancy Implementation](#10-multi-tenancy-implementation)
11. [Finance Engine — Technical Details](#11-finance-engine--technical-details)
12. [Shared Infrastructure & Utilities](#12-shared-infrastructure--utilities)
13. [Security Implementation](#13-security-implementation)
14. [Performance & Scalability](#14-performance--scalability)
15. [Deployment & Infrastructure](#15-deployment--infrastructure)
16. [Testing Requirements](#16-testing-requirements)
17. [Code Conventions & Standards](#17-code-conventions--standards)
18. [Module API Reference](#18-module-api-reference)

---

## 1. Technology Stack & Versions

### 1.1 Runtime & Language

| Component | Technology | Version |
|---|---|---|
| Runtime | Node.js | ≥ 22.x |
| Language | TypeScript | ≥ 5.x (strict mode) |
| Package Manager | pnpm | 11.2.2 |
| Monorepo Orchestrator | Turborepo | Latest |

### 1.2 Backend (API Server)

| Package | Version | Purpose |
|---|---|---|
| @nestjs/core | 10.4.15 | Core NestJS framework |
| @nestjs/common | 10.4.15 | Common utilities (guards, pipes, decorators) |
| @nestjs/config | — | Environment config module |
| @nestjs/jwt | — | JWT signing/verification |
| @nestjs/passport | — | Passport.js integration |
| @nestjs/swagger | — | OpenAPI document generation |
| @prisma/client | — | Database ORM |
| prisma | — | Schema migration & codegen |
| bcryptjs | — | Password hashing |
| class-validator | — | Decorator-based DTO validation |
| class-transformer | — | DTO transformation (type coercion) |
| helmet | — | HTTP security headers |
| cookie-parser | — | Parse httpOnly cookies |
| passport-jwt | — | JWT strategy for Passport |

### 1.3 Frontend (Web Application)

| Package | Version | Purpose |
|---|---|---|
| next | 15.1.4 | App framework (App Router) |
| react | 19.x | UI library |
| react-dom | 19.x | DOM renderer |
| axios | — | HTTP client |
| @tanstack/react-query | — | Server state management & caching |
| react-hook-form | — | Form state management |
| zod | — | Schema validation |
| @hookform/resolvers | — | Zod integration for react-hook-form |
| zustand | — | Client-side global state |
| sonner | — | Toast notifications |
| lucide-react | — | SVG icon library |
| date-fns | — | Date utilities |
| tailwindcss | — | Utility-first CSS framework |
| autoprefixer | — | CSS vendor prefixing |
| @radix-ui/react-dialog | — | Accessible dialog/modal |
| @radix-ui/react-dropdown-menu | — | Accessible dropdown menus |
| @radix-ui/react-select | — | Accessible select component |
| @radix-ui/react-tooltip | — | Accessible tooltips |
| @radix-ui/react-label | — | Accessible form labels |
| @radix-ui/react-separator | — | Visual separator |
| @radix-ui/react-avatar | — | User avatar |
| @radix-ui/react-scroll-area | — | Custom scrollable containers |
| @radix-ui/react-tabs | — | Accessible tabbed interface |

### 1.4 Infrastructure

| Component | Technology | Version |
|---|---|---|
| Primary database | PostgreSQL | 16-alpine |
| Cache / session store | Redis | 7-alpine |
| File storage | Google Cloud Storage | — |
| Email delivery | SendGrid | — |
| Secret management | Google Secret Manager | — |
| Container orchestration | Google Kubernetes Engine | — |
| API documentation | Swagger / OpenAPI 3.0 | — |

---

## 2. Repository & Monorepo Structure

### 2.1 Workspace Layout

```
ERP/                               ← git root
├── apps/
│   ├── api/                       ← NestJS API (port 3001)
│   │   ├── src/
│   │   │   ├── main.ts            ← Bootstrap & global config
│   │   │   ├── app.module.ts      ← Root NestJS module
│   │   │   ├── prisma/            ← PrismaService singleton
│   │   │   ├── auth/
│   │   │   ├── tenant/
│   │   │   ├── company/
│   │   │   ├── user/
│   │   │   ├── finance/
│   │   │   │   ├── finance.module.ts
│   │   │   │   ├── gl/
│   │   │   │   ├── ap/
│   │   │   │   ├── ar/
│   │   │   │   ├── assets/
│   │   │   │   ├── bank/
│   │   │   │   └── budget/
│   │   │   ├── inventory/
│   │   │   ├── procurement/
│   │   │   ├── sales/
│   │   │   ├── manufacturing/
│   │   │   ├── crm/
│   │   │   ├── hr/
│   │   │   ├── projects/
│   │   │   ├── eam/
│   │   │   ├── fsm/
│   │   │   ├── quality/
│   │   │   ├── ehs/
│   │   │   └── common/
│   │   │       ├── decorators/
│   │   │       │   ├── current-user.decorator.ts
│   │   │       │   └── company.decorator.ts
│   │   │       ├── guards/
│   │   │       │   └── jwt-auth.guard.ts
│   │   │       └── dto/
│   │   │           └── pagination.dto.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                       ← Next.js frontend (port 3000)
│       ├── src/
│       │   ├── app/
│       │   │   ├── (auth)/        ← Public auth pages
│       │   │   │   ├── login/
│       │   │   │   └── register/
│       │   │   └── (platform)/    ← Protected pages (all modules)
│       │   ├── components/
│       │   │   └── layout/
│       │   ├── lib/
│       │   │   ├── api.ts         ← Axios instance + all API functions
│       │   │   └── auth.tsx       ← AuthContext + AuthProvider
│       │   └── middleware.ts      ← Cookie-based route protection
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── prisma/                    ← Shared Prisma schema + client
│   │   └── schema.prisma
│   └── types/                     ← Shared TypeScript type definitions
├── docker-compose.yml
├── turbo.json
├── pnpm-workspace.yaml
└── package.json                   ← Root scripts (dev, build, lint)
```

### 2.2 pnpm Workspace Configuration

**File**: `pnpm-workspace.yaml`
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**Root `package.json` scripts**:
```json
{
  "scripts": {
    "dev":        "turbo run dev",
    "build":      "turbo run build",
    "lint":       "turbo run lint",
    "type-check": "turbo run type-check"
  }
}
```

### 2.3 Turborepo Pipeline

**File**: `turbo.json`

```json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "type-check": {
      "dependsOn": ["^build"]
    }
  }
}
```

**Dependency order**: `packages/*` build first (Prisma client codegen, shared types) → `apps/*` build second.

### 2.4 Prisma Client Output

The Prisma client is generated directly into `node_modules/.prisma/client` (shared across the workspace via the `generator client` output path). This means all apps import from `@prisma/client`, not from a package-local path.

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../../node_modules/.prisma/client"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

---

## 3. Backend — NestJS Application

### 3.1 Application Bootstrap (`main.ts`)

The application is bootstrapped with the following global configuration applied in order:

```typescript
// 1. Security headers
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

// 2. Cookie parsing
app.use(cookieParser());

// 3. CORS — only allows the configured FRONTEND_URL origin, with credentials
app.enableCors({
  origin: config.get("FRONTEND_URL", "http://localhost:3000"),
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
});

// 4. Global validation pipe
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,               // Strip properties not in DTO
  transform: true,               // Auto-transform types (string → number, etc.)
  forbidNonWhitelisted: true,    // Throw on extra properties
  transformOptions: { enableImplicitConversion: true },
}));

// 5. Global API prefix
app.setGlobalPrefix("api/v1");

// 6. Swagger (non-production only)
// Available at: /api/docs
```

### 3.2 Module Architecture

Every business domain follows an identical NestJS module structure:

```
{module}/
├── {module}.module.ts       ← Declares controller, service, imports PrismaModule
├── {module}.controller.ts   ← HTTP routes, guards, param extraction
├── {module}.service.ts      ← Business logic, Prisma queries
└── dto/
    ├── create-{entity}.dto.ts
    ├── update-{entity}.dto.ts
    └── ...
```

**Module template**:
```typescript
@Module({
  imports: [PrismaModule],
  controllers: [FooController],
  providers: [FooService],
})
export class FooModule {}
```

**Root module** (`app.module.ts`) imports all domain modules:
- `ConfigModule.forRoot({ isGlobal: true })` — Makes env config available everywhere
- `PrismaModule` — Singleton PrismaClient
- 16 domain modules: Auth, Tenant, Company, User, Finance, Inventory, Procurement, CRM, Sales, Manufacturing, HR, EAM, FSM, Quality, EHS, Projects

### 3.3 PrismaService

`PrismaService` extends `PrismaClient` and is exported from `PrismaModule` as a singleton. All service classes receive it via constructor injection.

```typescript
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

### 3.4 Common Decorators

#### `@CurrentUser(field?)`

Extracts user data from the `request.user` object (populated by the JWT strategy):

```typescript
// Full user object
@CurrentUser() user: JwtPayload

// Single field
@CurrentUser('id') userId: string
@CurrentUser('tenantId') tenantId: string
@CurrentUser('isSuperAdmin') isAdmin: boolean
```

**JWT Payload shape**:
```typescript
interface JwtPayload {
  sub: string        // user.id
  email: string
  tenantId: string
  isSuperAdmin: boolean
}
```

#### `@CompanyId()`

Extracts the `x-company-id` header value from the request:

```typescript
@CompanyId() companyId: string
```

This is used by every protected endpoint that operates on company-level data.

### 3.5 JWT Authentication Guard

All protected endpoints use `@UseGuards(JwtAuthGuard)`. The guard validates the Bearer token from the `Authorization` header, verifies the signature against `JWT_SECRET`, and populates `request.user` with the JWT payload.

```typescript
// Usage in controller
@UseGuards(JwtAuthGuard)
@Get('items')
async getItems(
  @CurrentUser('tenantId') tenantId: string,
  @CompanyId() companyId: string,
) {
  return this.service.getItems(tenantId, companyId);
}
```

### 3.6 Controller Pattern

The canonical controller pattern for a module endpoint:

```typescript
@Controller('finance/gl')
@UseGuards(JwtAuthGuard)
export class GlController {
  constructor(private readonly glService: GlService) {}

  @Get('accounts')
  async getAccounts(
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
  ) {
    return this.glService.getAccounts(tenantId, companyId);
  }

  @Post('accounts')
  @HttpCode(HttpStatus.CREATED)
  async createAccount(
    @Body() dto: CreateAccountDto,
    @CurrentUser('tenantId') tenantId: string,
    @CompanyId() companyId: string,
  ) {
    return this.glService.createAccount(dto, tenantId, companyId);
  }

  @Patch('journals/:id/post')
  async postJournal(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.glService.postJournal(id, tenantId, userId);
  }
}
```

### 3.7 Service Pattern

All database access is through `PrismaService`. Services enforce business rules before delegating to Prisma:

```typescript
@Injectable()
export class GlService {
  constructor(private prisma: PrismaService) {}

  async createAccount(dto: CreateAccountDto, tenantId: string, companyId: string) {
    // 1. Check uniqueness
    const existing = await this.prisma.glAccount.findUnique({
      where: { tenantId_companyId_code: { tenantId, companyId, code: dto.code } },
    });
    if (existing) throw new ConflictException(`Account code ${dto.code} already exists`);

    // 2. Persist
    return this.prisma.glAccount.create({
      data: { ...dto, tenantId, companyId },
    });
  }
}
```

**Rule**: Every service method that reads data **must** filter by at least `tenantId`. Write operations must filter by both `tenantId` and `companyId`.

---

## 4. Database Design & Prisma Schema

### 4.1 Naming Conventions

| Convention | Rule |
|---|---|
| Table names | `snake_case` (defined via `@@map("table_name")`) |
| Column names | `camelCase` in Prisma, auto-mapped to `snake_case` by provider |
| Primary keys | UUID, `@id @default(uuid())` |
| Foreign keys | `entityId` convention (e.g., `tenantId`, `companyId`, `userId`) |
| Timestamps | `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt` |
| Soft deletes | `isActive Boolean @default(true)` (no hard deletes on master records) |

### 4.2 Decimal Precision Strategy

All monetary amounts and financial figures use `@db.Decimal(precision, scale)` — **never** JavaScript floats:

| Field Type | Precision | Scale | Example Values |
|---|---|---|---|
| Amounts (money) | 19 | 4 | `9,999,999,999,999.9999` |
| Exchange rates | 19 | 6 | `1.234567` |
| Quantities | 19 | 4 | `99,999.9999` |
| Prices / costs | 19 | 4 | `9,999.9999` |

**In service code**, convert `Decimal` to `Number` only for display purposes (aggregations, totals in dashboard responses). Never perform arithmetic on Prisma `Decimal` objects directly in application code — use `Number()` conversions with explicit rounding to 4 decimal places.

### 4.3 Index Strategy

All tenant-scoped tables include:
```prisma
@@index([tenantId])
@@index([tenantId, companyId])
```

High-query-volume tables include composite indexes on common filter patterns:
```prisma
// GlJournal — filtered by date ranges
@@index([tenantId, companyId, date])

// AuditLog — filtered by time range and entity
@@index([tenantId, createdAt])
@@index([entity, entityId])

// Session — looked up by userId for session management
@@index([userId])
```

### 4.4 Complete Schema Reference

#### PLATFORM LAYER

```prisma
model Tenant {
  id        String   @id @default(uuid())
  name      String
  slug      String   @unique
  plan      String   @default("starter")   // starter | pro | enterprise
  status    String   @default("active")    // active | suspended | deleted
  settings  Json     @default("{}")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@map("tenants")
}
```

#### IDENTITY & ACCESS

```prisma
model Company {
  id              String    @id @default(uuid())
  tenantId        String
  name            String
  code            String                         // Unique per (tenantId, code)
  legalName       String?
  taxId           String?
  currency        String    @default("USD")
  timezone        String    @default("UTC")
  fiscalYearStart Int       @default(1)          // 1–12, month of fiscal year start
  address         Json?
  logoUrl         String?
  parentId        String?                         // Self-reference for hierarchy
  parent          Company?  @relation("CompanyHierarchy", ...)
  children        Company[] @relation("CompanyHierarchy")
  isActive        Boolean   @default(true)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  @@unique([tenantId, code])
  @@index([tenantId])
  @@map("companies")
}

model User {
  id           String    @id @default(uuid())
  tenantId     String
  email        String                             // Unique per (tenantId, email)
  firstName    String
  lastName     String
  passwordHash String                             // bcrypt, 12 rounds
  phone        String?
  avatar       String?
  isActive     Boolean   @default(true)
  isSuperAdmin Boolean   @default(false)
  mfaEnabled   Boolean   @default(false)
  mfaSecret    String?                            // TOTP secret (future)
  lastLoginAt  DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  @@unique([tenantId, email])
  @@index([tenantId])
  @@map("users")
}

model CompanyUser {
  id        String  @id @default(uuid())
  userId    String
  companyId String
  isDefault Boolean @default(false)    // One default company per user
  user      User    @relation(..., onDelete: Cascade)
  company   Company @relation(..., onDelete: Cascade)
  userRoles UserRole[]
  @@unique([userId, companyId])
  @@map("company_users")
}

model Role {
  id          String   @id @default(uuid())
  tenantId    String
  companyId   String?                             // null = tenant-level role
  name        String
  description String?
  isSystem    Boolean  @default(false)            // System roles cannot be modified
  @@index([tenantId])
  @@map("roles")
}

model UserRole {
  id            String @id @default(uuid())
  companyUserId String
  roleId        String
  grantedAt     DateTime @default(now())
  grantedBy     String?
  @@unique([companyUserId, roleId])
  @@map("user_roles")
}

model Permission {
  id     String @id @default(uuid())
  code   String @unique                           // e.g., "finance.journal.post"
  name   String
  module String
  action String
  @@map("permissions")
}

model RolePermission {
  id           String @id @default(uuid())
  roleId       String
  permissionId String
  @@unique([roleId, permissionId])
  @@map("role_permissions")
}

model Session {
  id           String   @id @default(uuid())
  userId       String
  refreshToken String   @unique                   // 128-char hex (crypto.randomBytes(64))
  expiresAt    DateTime
  ipAddress    String?
  userAgent    String?
  createdAt    DateTime @default(now())
  user User @relation(..., onDelete: Cascade)
  @@index([userId])
  @@map("sessions")
}

model AuditLog {
  id        String   @id @default(uuid())
  tenantId  String
  companyId String?
  userId    String?
  module    String
  action    String
  entity    String
  entityId  String?
  before    Json?                                 // Previous state snapshot
  after     Json?                                 // New state snapshot
  ipAddress String?
  createdAt DateTime @default(now())
  @@index([tenantId, createdAt])
  @@index([entity, entityId])
  @@map("audit_logs")
}
```

#### FINANCE — GL

```prisma
model GlAccount {
  id          String  @id @default(uuid())
  tenantId    String
  companyId   String
  code        String
  name        String
  type        String   // ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE
  subtype     String?
  currency    String   @default("USD")
  parentId    String?
  isActive    Boolean  @default(true)
  isPosting   Boolean  @default(true)  // false = header/group account
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  // Relations: parent, children (GlAccountTree), journalLines, apLines, arLines
  @@unique([tenantId, companyId, code])
  @@index([tenantId, companyId])
  @@map("gl_accounts")
}

model GlPeriod {
  id         String   @id @default(uuid())
  tenantId   String
  companyId  String
  fiscalYear Int
  period     Int      // 1–12
  name       String
  startDate  DateTime
  endDate    DateTime
  status     String   @default("OPEN")  // OPEN | CLOSED
  @@unique([tenantId, companyId, fiscalYear, period])
  @@index([tenantId, companyId])
  @@map("gl_periods")
}

model GlJournal {
  id          String    @id @default(uuid())
  tenantId    String
  companyId   String
  periodId    String
  number      String                          // JE-000001 (sequential per company)
  date        DateTime
  description String?
  reference   String?
  type        String    @default("MANUAL")    // MANUAL | AUTO
  status      String    @default("DRAFT")     // DRAFT | POSTED | VOIDED
  currency    String    @default("USD")
  totalDebit  Decimal   @default(0) @db.Decimal(19, 4)
  totalCredit Decimal   @default(0) @db.Decimal(19, 4)
  createdBy   String    // user.id
  postedBy    String?
  postedAt    DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  @@unique([tenantId, companyId, number])
  @@index([tenantId, companyId, date])
  @@map("gl_journals")
}

model GlJournalLine {
  id           String  @id @default(uuid())
  journalId    String
  accountId    String
  lineNumber   Int
  description  String?
  debit        Decimal @default(0) @db.Decimal(19, 4)
  credit       Decimal @default(0) @db.Decimal(19, 4)
  currency     String  @default("USD")
  exchangeRate Decimal @default(1) @db.Decimal(19, 6)
  // journal: onDelete: Cascade (lines removed when journal removed)
  @@map("gl_journal_lines")
}
```

#### AP, AR, VENDOR, CUSTOMER

```prisma
model Vendor {
  id           String   @id @default(uuid())
  tenantId     String
  companyId    String
  code         String
  name         String
  legalName    String?
  taxId        String?
  email        String?
  phone        String?
  currency     String   @default("USD")
  paymentTerms Int      @default(30)         // Net N days
  address      Json?
  bankDetails  Json?
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  @@unique([tenantId, companyId, code])
  @@index([tenantId, companyId])
  @@map("vendors")
}

model ApInvoice {
  id           String    @id @default(uuid())
  tenantId     String
  companyId    String
  vendorId     String
  number       String
  vendorRef    String?
  date         DateTime
  dueDate      DateTime
  currency     String    @default("USD")
  exchangeRate Decimal   @default(1)  @db.Decimal(19, 6)
  subtotal     Decimal   @default(0)  @db.Decimal(19, 4)
  taxAmount    Decimal   @default(0)  @db.Decimal(19, 4)
  total        Decimal   @default(0)  @db.Decimal(19, 4)
  paid         Decimal   @default(0)  @db.Decimal(19, 4)
  balance      Decimal   @default(0)  @db.Decimal(19, 4)
  status       String    @default("DRAFT")   // DRAFT | APPROVED | POSTED
  notes        String?
  createdBy    String
  approvedBy   String?
  approvedAt   DateTime?
  postedBy     String?
  postedAt     DateTime?
  @@unique([tenantId, companyId, number])
  @@index([tenantId, companyId])
  @@map("ap_invoices")
}

model ApInvoiceLine {
  id          String  @id @default(uuid())
  invoiceId   String
  accountId   String                           // GL account (expense/asset)
  lineNumber  Int
  description String
  quantity    Decimal @default(1)  @db.Decimal(19, 4)
  unitPrice   Decimal @default(0)  @db.Decimal(19, 4)
  amount      Decimal @default(0)  @db.Decimal(19, 4)
  taxCode     String?
  taxAmount   Decimal @default(0)  @db.Decimal(19, 4)
  // invoice: onDelete: Cascade
  @@map("ap_invoice_lines")
}

// Customer and ArInvoice/ArInvoiceLine mirrors AP exactly,
// with creditLimit added to Customer and no approvedBy on ArInvoice.
```

### 4.5 Database Constraints Summary

| Entity | Unique Constraint |
|---|---|
| Tenant | `slug` |
| Company | `(tenantId, code)` |
| User | `(tenantId, email)` |
| CompanyUser | `(userId, companyId)` |
| UserRole | `(companyUserId, roleId)` |
| Permission | `code` |
| RolePermission | `(roleId, permissionId)` |
| Session | `refreshToken` |
| GlAccount | `(tenantId, companyId, code)` |
| GlPeriod | `(tenantId, companyId, fiscalYear, period)` |
| GlJournal | `(tenantId, companyId, number)` |
| Vendor | `(tenantId, companyId, code)` |
| ApInvoice | `(tenantId, companyId, number)` |
| Customer | `(tenantId, companyId, code)` |
| ArInvoice | `(tenantId, companyId, number)` |

### 4.6 Cascade Delete Rules

| Relation | On Parent Delete |
|---|---|
| `CompanyUser` (User deleted) | Cascade — removes company memberships |
| `CompanyUser` (Company deleted) | Cascade |
| `UserRole` (CompanyUser deleted) | Cascade |
| `UserRole` (Role deleted) | Cascade |
| `RolePermission` (Role deleted) | Cascade |
| `RolePermission` (Permission deleted) | Cascade |
| `Session` (User deleted) | Cascade — removes all sessions |
| `GlJournalLine` (Journal deleted) | Cascade |
| `ApInvoiceLine` (Invoice deleted) | Cascade |
| `ArInvoiceLine` (Invoice deleted) | Cascade |

---

## 5. Authentication & Session Management

### 5.1 Password Hashing

Passwords are hashed using **bcryptjs** with a salt rounds value of **12**:
```typescript
const passwordHash = await bcrypt.hash(dto.password, 12);
// Verification
const valid = await bcrypt.compare(dto.password, user.passwordHash);
```

The `passwordHash` field is never returned in any API response. The `getProfile` service method uses an explicit `select` that excludes `passwordHash`.

### 5.2 JWT Token Generation

The access token is a signed JWT. The refresh token is a 128-character hex string generated with `crypto.randomBytes(64)`, stored in the database (not in the JWT itself):

```typescript
private async generateTokens(user: { id, email, tenantId, isSuperAdmin }) {
  const payload = {
    sub: user.id,
    email: user.email,
    tenantId: user.tenantId,
    isSuperAdmin: user.isSuperAdmin,
  };

  const [accessToken, refreshToken] = await Promise.all([
    this.jwtService.signAsync(payload, {
      secret: this.configService.get("JWT_SECRET"),
      expiresIn: this.configService.get("JWT_EXPIRES_IN", "15m"),
    }),
    Promise.resolve(crypto.randomBytes(64).toString("hex")),
  ]);

  return { accessToken, refreshToken };
}
```

**JWT Payload fields**:
- `sub` — user UUID
- `email` — user email
- `tenantId` — tenant UUID (injected into every service call)
- `isSuperAdmin` — boolean flag
- `iat`, `exp` — standard JWT claims

### 5.3 Login Flow — Complete

```
1. Client POST /api/v1/auth/login { email, password }
2. AuthService.login():
   a. Find user by email where isActive=true (includes default company)
   b. bcrypt.compare(password, passwordHash) — throws 401 on failure
   c. Update user.lastLoginAt = now()
   d. generateTokens(user) — creates accessToken + refreshToken
   e. Create Session { userId, refreshToken, expiresAt: now+30d, ipAddress, userAgent }
3. Response:
   Body: { accessToken, user: { id, email, firstName, lastName, tenantId, ... } }
   Cookie: Set-Cookie: refresh_token=<hex>; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000
```

### 5.4 Token Refresh Flow — Complete

```
1. Client POST /api/v1/auth/refresh (cookie: refresh_token=<hex>)
2. AuthService.refreshTokens():
   a. Find Session by refreshToken (must exist and not expired)
   b. Verify session.user.isActive=true
   c. generateTokens(user) → new accessToken + new refreshToken
   d. Update Session: rotate refreshToken, extend expiresAt by 30 days
3. Response:
   Body: { accessToken }
   Cookie: Updated refresh_token (rotated)
```

**Refresh token rotation**: Every refresh call generates a new refresh token and invalidates the old one. This prevents replay attacks.

### 5.5 Logout Flow

```
1. Client POST /api/v1/auth/logout (cookie: refresh_token=<hex>)
2. AuthService.logout():
   a. Session.deleteMany({ where: { refreshToken } })
3. Client clears sessionStorage (access_token, company_id)
4. Client deletes sttps_session cookie
5. Client redirects to /login
```

### 5.6 Frontend Token Storage

| Token | Storage | Accessible To |
|---|---|---|
| Access Token | `sessionStorage["access_token"]` | JavaScript (same tab only) |
| Refresh Token | `httpOnly` cookie | Browser only (no JS access) |
| Active Company | `sessionStorage["company_id"]` | JavaScript (same tab only) |
| Session indicator | `sttps_session` cookie | Next.js middleware |

**Security note**: The access token in `sessionStorage` is tab-isolated (not shared across browser tabs). Each tab maintains its own session state.

### 5.7 Frontend Axios Interceptors

**Request interceptor** — attaches auth headers automatically:
```typescript
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const companyId = sessionStorage.getItem("company_id");
  if (companyId) config.headers["x-company-id"] = companyId;
  return config;
});
```

**Response interceptor** — handles 401 with token refresh and request queuing:
```typescript
// On 401:
// 1. If already refreshing: queue the failed request
// 2. If not refreshing: call /auth/refresh, update token, replay queue
// 3. If refresh fails: clear session, redirect to /login
```

This pattern ensures that concurrent requests that all 401 will correctly queue and replay — only one refresh call is made.

### 5.8 Next.js Middleware Route Protection

`src/middleware.ts` protects all routes except `/login`, `/register`, and `/api`:

```typescript
const PUBLIC_PATHS = ["/login", "/register", "/api"];

export function middleware(request: NextRequest) {
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const hasSession = request.cookies.get("sttps_session");
  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}
```

**Architecture note**: The `sttps_session` cookie is a lightweight indicator set on login. The actual JWT validation happens on the API server. The middleware only prevents the browser from rendering protected pages without any session indicator — the full security check is API-side.

**Matcher**: `["/((?!_next/static|_next/image|favicon.ico).*)"]` — excludes Next.js static assets.

### 5.9 AuthContext

`src/lib/auth.tsx` implements a React Context that wraps the entire application:

```typescript
interface AuthContextType {
  user: AuthUser | null
  companies: Company[]
  activeCompany: Company | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  switchCompany: (companyId: string) => void
}
```

**Initialization**: On mount, if `sessionStorage["access_token"]` exists, calls `GET /auth/me` to hydrate user state. Sets `isLoading=true` during this check to prevent flash of unauthenticated content.

**Company switching**: Updating `sessionStorage["company_id"]` + calling `setActiveCompany()` is sufficient — all subsequent API calls will include the new `x-company-id` header via the request interceptor.

---

## 6. API Design Specification

### 6.1 Base URL & Versioning

```
Base: http://localhost:3001/api/v1      (development)
      https://api.sttps.app/api/v1     (production)
```

All routes are prefixed with `/api/v1` via `app.setGlobalPrefix("api/v1")`.

### 6.2 Required Headers (Protected Endpoints)

```http
Authorization: Bearer <access_token>
x-company-id: <company_uuid>
Content-Type: application/json
```

### 6.3 Standard Response Envelopes

**Paginated list**:
```json
{
  "data": [...],
  "total": 247,
  "page": 2,
  "limit": 25,
  "pages": 10
}
```

**Single resource**:
```json
{
  "id": "uuid",
  "tenantId": "uuid",
  "companyId": "uuid",
  ...fields
}
```

**Action response** (post, approve, void):
```json
{
  "id": "uuid",
  "status": "POSTED",
  "postedAt": "2026-05-24T10:30:00Z",
  "postedBy": "uuid"
}
```

**Creation response**: HTTP 201 with full created resource.

**Error response**:
```json
{
  "statusCode": 400,
  "message": "Journal is not balanced. Debits: 1000.00, Credits: 900.00",
  "error": "Bad Request"
}
```

**Validation error response**:
```json
{
  "statusCode": 400,
  "message": ["email must be an email", "password must be longer than or equal to 8 characters"],
  "error": "Bad Request"
}
```

### 6.4 Pagination Query Parameters

All list endpoints accept these query parameters:

| Param | Type | Default | Max | Description |
|---|---|---|---|---|
| `page` | number | 1 | — | Page number (1-indexed) |
| `limit` | number | 25 | 100 | Items per page |
| `search` | string | — | — | Full-text search across key fields |

**Implementation pattern** in services:
```typescript
const { page = 1, limit = 25, search } = query;
const skip = (page - 1) * limit;
const [data, total] = await Promise.all([
  this.prisma.entity.findMany({ where, skip, take: limit, orderBy }),
  this.prisma.entity.count({ where }),
]);
return { data, total, page, limit, pages: Math.ceil(total / limit) };
```

### 6.5 Search Implementation

Search is implemented as case-insensitive `contains` across key text fields using Prisma's `OR` clause:

```typescript
if (search) {
  where.OR = [
    { number: { contains: search, mode: "insensitive" } },
    { description: { contains: search, mode: "insensitive" } },
    { reference: { contains: search, mode: "insensitive" } },
  ];
}
```

### 6.6 HTTP Method Usage

| Method | Usage | Idempotent |
|---|---|---|
| `GET` | Read-only fetches | Yes |
| `POST` | Create new resource | No |
| `PUT` | Full resource replacement | Yes |
| `PATCH` | Partial update / state transition | Yes |
| `DELETE` | Hard delete (rare — prefer isActive=false) | Yes |

**State transitions** use `PATCH` with a named sub-path:
- `PATCH /journals/:id/post`
- `PATCH /journals/:id/void`
- `PATCH /invoices/:id/approve`

### 6.7 HTTP Status Codes

| Code | Meaning | When Used |
|---|---|---|
| `200` | OK | Successful GET, PUT, PATCH |
| `201` | Created | Successful POST |
| `204` | No Content | Successful DELETE with no body |
| `400` | Bad Request | Validation failure, business rule violation |
| `401` | Unauthorized | Missing/invalid/expired JWT |
| `403` | Forbidden | JWT valid but insufficient permissions |
| `404` | Not Found | Resource does not exist (or not in tenant) |
| `409` | Conflict | Duplicate unique constraint (code, number, slug) |
| `500` | Internal Server Error | Unhandled exceptions |

### 6.8 Swagger Documentation

Swagger UI available at `/api/docs` when `NODE_ENV !== "production"`.

Configuration:
```typescript
const swaggerConfig = new DocumentBuilder()
  .setTitle("STTPS ERP API")
  .setDescription("Enterprise Resource Planning Platform API")
  .setVersion("1.0")
  .addBearerAuth()
  .addCookieAuth("refresh_token")
  .build();
```

All DTOs are decorated with `@ApiProperty()` descriptors. Controllers use `@ApiTags()` for grouping.

---

## 7. Frontend — Next.js Application

### 7.1 App Router Structure

The frontend uses the Next.js 15 App Router with two route groups:

```
src/app/
├── (auth)/                      ← Public — no authentication required
│   ├── login/
│   │   └── page.tsx
│   └── register/
│       └── page.tsx
└── (platform)/                  ← Protected — requires sttps_session cookie
    ├── layout.tsx               ← Platform layout (sidebar, header, AuthProvider)
    ├── dashboard/page.tsx
    ├── finance/
    │   ├── page.tsx
    │   ├── accounts/page.tsx
    │   ├── journals/page.tsx
    │   ├── periods/page.tsx
    │   ├── trial-balance/page.tsx
    │   ├── ap/
    │   │   ├── page.tsx
    │   │   ├── vendors/page.tsx
    │   │   └── aging/page.tsx
    │   ├── ar/
    │   │   ├── page.tsx
    │   │   ├── customers/page.tsx
    │   │   └── aging/page.tsx
    │   ├── assets/page.tsx
    │   ├── bank/page.tsx
    │   ├── budgets/page.tsx
    │   └── reports/
    │       ├── balance-sheet/page.tsx
    │       └── pl/page.tsx
    ├── inventory/...
    ├── procurement/...
    ├── sales/...
    ├── manufacturing/...
    ├── crm/...
    ├── hr/...
    ├── eam/...
    ├── fsm/...
    ├── quality/...
    ├── ehs/...
    └── projects/...
```

### 7.2 Data Fetching — React Query

All server data fetching uses `@tanstack/react-query` with `useQuery` and `useMutation`:

```typescript
// Reading data
const { data, isLoading, error } = useQuery({
  queryKey: ["gl", "journals", companyId, page, search],
  queryFn: () => glApi.journals.list({ page, limit: 25, search }),
});

// Writing data
const mutation = useMutation({
  mutationFn: (data) => glApi.journals.create(data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["gl", "journals"] });
    toast.success("Journal created");
    setOpen(false);
  },
  onError: (err) => toast.error(err.response?.data?.message || "Failed"),
});
```

**Query key convention**: `[module, entity, companyId?, ...filters]`

All mutations invalidate the relevant query key on success to trigger a refetch.

### 7.3 Form Handling — react-hook-form + Zod

All forms use `react-hook-form` with `@hookform/resolvers/zod` for schema-based validation:

```typescript
const schema = z.object({
  code: z.string().min(1, "Required").max(20),
  name: z.string().min(1, "Required"),
  type: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]),
  currency: z.string().length(3).default("USD"),
});

type FormValues = z.infer<typeof schema>;

const form = useForm<FormValues>({
  resolver: zodResolver(schema),
  defaultValues: { currency: "USD" },
});
```

Errors are displayed inline per field, sourced from the Zod schema messages.

### 7.4 State Management

| Concern | Tool | Scope |
|---|---|---|
| Server state (API data) | React Query | Global, cached, auto-invalidated |
| Auth state | React Context (AuthContext) | App-wide |
| Active company | React Context + sessionStorage | App-wide + persisted |
| Form state | react-hook-form | Component-local |
| Complex UI state | Zustand (optional) | Module-local |

### 7.5 API Client Organization (`lib/api.ts`)

The `api.ts` file exports:
1. A pre-configured `axios` instance with request/response interceptors
2. Grouped API function namespaces: `authApi`, `glApi`, `apApi`, `arApi`, `reportsApi`, `bankApi`, `assetsApi`, `budgetApi`, `inventoryApi`, `procurementApi`, `crmApi`, `manufacturingApi`, `eamApi`, `fsmApi`, `hrApi`, `salesApi`, `qualityApi`, `ehsApi`, `projectsApi`

All API functions return the `response.data` directly (`.then((r) => r.data)`), so callers receive unwrapped data.

### 7.6 UI Component Stack

**Layout**: Tailwind CSS utility classes. No CSS Modules or styled-components.

**Interactive components**: Radix UI primitives (unstyled, ARIA-compliant). Styled with Tailwind via `className`.

**Patterns**:
- Dialog forms: Radix `Dialog` wrapping a react-hook-form
- Data tables: Custom table with React Query pagination
- Dropdowns: Radix `DropdownMenu` or `Select`
- Notifications: `sonner` toast (top-right, auto-dismiss)
- Icons: `lucide-react` (consistent SVG set)

### 7.7 TypeScript Configuration

Both `apps/api` and `apps/web` use strict TypeScript. Key settings:
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

---

## 8. Data Validation & DTO Contracts

### 8.1 NestJS Validation Pipe

The global `ValidationPipe` configuration:

```typescript
new ValidationPipe({
  whitelist: true,              // Strips unknown properties — prevents mass assignment
  transform: true,              // Auto-converts query strings to proper types
  forbidNonWhitelisted: true,   // Returns 400 if unknown properties are present
  transformOptions: {
    enableImplicitConversion: true,  // Converts "25" to 25 for @IsNumber() fields
  },
})
```

### 8.2 DTO Validation Rules

All DTOs use `class-validator` decorators. Key validation contracts:

#### Auth DTOs

**LoginDto**:
```typescript
class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}
```

**RegisterDto**:
```typescript
class RegisterDto {
  @IsString() @MinLength(2) organizationName: string;
  @IsString() @Matches(/^[a-z0-9-]+$/) organizationSlug: string;  // kebab-case
  @IsString() @MinLength(1) firstName: string;
  @IsString() @MinLength(1) lastName: string;
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
  @IsOptional() @IsString() companyName?: string;
}
```

#### Finance DTOs

**CreateAccountDto**:
```typescript
class CreateAccountDto {
  @IsString() @MaxLength(20) code: string;
  @IsString() @MaxLength(100) name: string;
  @IsEnum(["ASSET","LIABILITY","EQUITY","REVENUE","EXPENSE"]) type: string;
  @IsOptional() @IsString() subtype?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsOptional() @IsUUID() parentId?: string;
  @IsOptional() @IsBoolean() isPosting?: boolean;
}
```

**CreateJournalDto**:
```typescript
class JournalLineDto {
  @IsUUID() accountId: string;
  @IsOptional() @IsString() description?: string;
  @IsNumber() @Min(0) debit: number;
  @IsNumber() @Min(0) credit: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsNumber() @Min(0) exchangeRate?: number;
}

class CreateJournalDto {
  @IsDateString() date: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsEnum(["MANUAL","AUTO"]) type?: string;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => JournalLineDto)
  lines: JournalLineDto[];
}
```

#### Pagination DTO

```typescript
class PaginationDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 25;
  @IsOptional() @IsString() search?: string;
}
```

### 8.3 Business Rule Validation (Service Layer)

Beyond DTO validation, the service layer enforces business invariants:

| Rule | Where Enforced | Error Type |
|---|---|---|
| Journal must balance (debit = credit ± 0.001) | `GlService.createJournal` | `BadRequestException` |
| Journal date must fall in an OPEN period | `GlService.createJournal` | `BadRequestException` |
| Only DRAFT journals can be posted | `GlService.postJournal` | `BadRequestException` |
| Only POSTED journals can be voided | `GlService.voidJournal` | `BadRequestException` |
| Account code must be unique per company | `GlService.createAccount` | `ConflictException` |
| Only `isPosting=true` accounts can receive journal lines | Service-level check | `BadRequestException` |
| Vendor/Customer code must be unique per company | AP/AR service | `ConflictException` |
| Organization slug must be globally unique | `AuthService.register` | `ConflictException` |
| Email must be unique per tenant | `AuthService.register` | `ConflictException` |

---

## 9. Error Handling

### 9.1 NestJS Exception Hierarchy

NestJS's built-in exceptions map directly to HTTP status codes:

| Exception Class | HTTP Code | Usage |
|---|---|---|
| `BadRequestException` | 400 | Validation or business rule failure |
| `UnauthorizedException` | 401 | Invalid credentials or expired token |
| `ForbiddenException` | 403 | Authenticated but not authorized |
| `NotFoundException` | 404 | Resource not found or not in tenant scope |
| `ConflictException` | 409 | Duplicate unique constraint |
| `InternalServerErrorException` | 500 | Unhandled errors (fallback) |

All exceptions thrown in services bubble up through the controller to NestJS's global exception filter, which formats them into the standard error response body.

### 9.2 Service Error Pattern

```typescript
// Resource not found
const entity = await this.prisma.entity.findFirst({ where: { id, tenantId } });
if (!entity) throw new NotFoundException("Entity not found");

// Duplicate code
const existing = await this.prisma.entity.findUnique({ where: { code } });
if (existing) throw new ConflictException(`Code ${code} already exists`);

// State machine violation
if (journal.status !== "DRAFT") {
  throw new BadRequestException(`Journal is already ${journal.status}`);
}
```

### 9.3 Frontend Error Handling

API errors are caught in React Query's `onError` callback:

```typescript
const mutation = useMutation({
  mutationFn: createJournal,
  onError: (error: AxiosError<ApiError>) => {
    const message = error.response?.data?.message;
    toast.error(Array.isArray(message) ? message.join(", ") : message || "An error occurred");
  },
});
```

Network-level errors (timeout, DNS failure) are caught by the axios interceptor and redirect to `/login` only if the failure is a 401.

### 9.4 Not-Found vs. Forbidden

Resources outside the tenant's scope return `404 Not Found` (not `403 Forbidden`). This prevents information leakage — an attacker cannot determine whether a UUID belongs to another tenant by the different error codes.

```typescript
// Always scope by tenantId, return 404 if not found
const entity = await this.prisma.entity.findFirst({
  where: { id, tenantId },  // ← tenantId scope is the security boundary
});
if (!entity) throw new NotFoundException("Entity not found");
```

---

## 10. Multi-Tenancy Implementation

### 10.1 Isolation Model

STTPS ERP uses **logical multi-tenancy** — all tenants share the same PostgreSQL database and schema. Isolation is enforced at the application layer through mandatory `tenantId` filters on every query.

This is the most common SaaS approach, providing cost efficiency while accepting a shared database risk model.

### 10.2 tenantId Propagation

The `tenantId` is extracted from the validated JWT payload — it is **never** accepted as user input:

```typescript
// In JwtStrategy.validate():
async validate(payload: JwtPayload) {
  return {
    id: payload.sub,
    email: payload.email,
    tenantId: payload.tenantId,
    isSuperAdmin: payload.isSuperAdmin,
  };
}

// In controllers:
@CurrentUser('tenantId') tenantId: string  // From JWT, not from request body
```

### 10.3 companyId Propagation

The active company is determined by the `x-company-id` request header, injected by the frontend axios interceptor. The header value is validated against the user's authorized companies either in a middleware or at the service layer.

```typescript
@CompanyId() companyId: string  // From x-company-id header
```

### 10.4 Query Isolation Requirement

**Every Prisma query that reads business data must include `tenantId` in the `where` clause.** Write operations must include both `tenantId` and `companyId`. This is a hard architectural requirement — violations are security bugs.

```typescript
// ✅ Correct
await this.prisma.glAccount.findMany({ where: { tenantId, companyId } });

// ❌ Wrong — missing tenantId filter
await this.prisma.glAccount.findMany({ where: { companyId } });

// ❌ Wrong — could expose cross-tenant data
await this.prisma.glAccount.findUnique({ where: { id } });
```

### 10.5 Registration Transaction

Organization registration is an atomic transaction creating five records:

```typescript
const result = await this.prisma.$transaction(async (tx) => {
  const tenant = await tx.tenant.create({ data: { name, slug, plan: "starter" } });
  const company = await tx.company.create({ data: { tenantId: tenant.id, name, code: "MAIN", ... } });
  const user = await tx.user.create({ data: { tenantId: tenant.id, email, passwordHash, isSuperAdmin: true } });
  const companyUser = await tx.companyUser.create({ data: { userId: user.id, companyId: company.id, isDefault: true } });
  const adminRole = await tx.role.create({ data: { tenantId: tenant.id, companyId: company.id, name: "Administrator", isSystem: true } });
  await tx.userRole.create({ data: { companyUserId: companyUser.id, roleId: adminRole.id } });
  return { tenant, company, user };
});
```

If any step fails, all changes are rolled back automatically.

---

## 11. Finance Engine — Technical Details

### 11.1 Journal Number Generation

Journal numbers are generated sequentially using a count-based approach:
```typescript
const count = await this.prisma.glJournal.count({ where: { tenantId, companyId } });
const number = `JE-${String(count + 1).padStart(6, "0")}`;
// Results in: JE-000001, JE-000002, ..., JE-999999
```

**Limitation**: This approach can produce duplicates under concurrent writes. Production hardening requires a `SERIAL` sequence or an advisory lock pattern. The unique constraint on `(tenantId, companyId, number)` provides a safety net — a duplicate insert will throw a `ConflictException`.

**Alternative** (recommended for v2): Use PostgreSQL sequences via a stored procedure or a dedicated `NumberSequence` table with row-level locking.

### 11.2 Balance Validation

```typescript
const totalDebit = dto.lines.reduce((sum, l) => sum + (l.debit || 0), 0);
const totalCredit = dto.lines.reduce((sum, l) => sum + (l.credit || 0), 0);

if (Math.abs(totalDebit - totalCredit) > 0.001) {
  throw new BadRequestException(
    `Journal is not balanced. Debits: ${totalDebit.toFixed(2)}, Credits: ${totalCredit.toFixed(2)}`
  );
}
```

**Tolerance**: `0.001` — allows for floating-point rounding in the DTO layer. The stored values use `Decimal(19,4)` precision.

### 11.3 Period Lookup for Journal Date

Before creating a journal, the system finds an OPEN period whose date range covers the journal date:
```typescript
const period = await this.prisma.glPeriod.findFirst({
  where: {
    tenantId,
    companyId,
    status: { in: ["OPEN"] },
    startDate: { lte: journalDate },
    endDate: { gte: journalDate },
  },
});
if (!period) throw new BadRequestException("No open period found for the journal date");
```

### 11.4 Trial Balance Computation

The trial balance is computed in-application (not in SQL) by:
1. Loading all active GL accounts
2. Loading all POSTED journals with their lines
3. Aggregating debit/credit per `accountId` in a JavaScript `Record<string, {debit, credit}>`
4. Joining accounts with their balances
5. Filtering to accounts with non-zero activity

This approach works well for moderate data volumes. For large tenants, migrate to a PostgreSQL view or materialized view.

### 11.5 Dashboard Aggregation

The GL dashboard uses `Promise.all` to run 7 parallel Prisma queries:
```typescript
const [totalJournals, postedJournals, draftJournals, vendors, customers, apInvoices, arInvoices] =
  await Promise.all([
    prisma.glJournal.count({ where: { tenantId, companyId } }),
    prisma.glJournal.count({ where: { tenantId, companyId, status: "POSTED" } }),
    prisma.glJournal.count({ where: { tenantId, companyId, status: "DRAFT" } }),
    prisma.vendor.count({ where: { tenantId, companyId, isActive: true } }),
    prisma.customer.count({ where: { tenantId, companyId, isActive: true } }),
    prisma.apInvoice.aggregate({ where: { tenantId, companyId, status: { not: "VOID" } }, _sum: { total: true, balance: true } }),
    prisma.arInvoice.aggregate({ where: { tenantId, companyId, status: { not: "VOID" } }, _sum: { total: true, balance: true } }),
  ]);
```

### 11.6 AP Invoice Posting (GL Integration)

When an AP invoice is posted, the service must auto-create a GL journal with:
- **Debit**: Each invoice line's GL account (expense or asset account) for the line amount
- **Credit**: Accounts Payable control account for the invoice total

This automatic journal must be atomic with the status update (use `prisma.$transaction`).

### 11.7 AR Invoice Posting (GL Integration)

When an AR invoice is posted:
- **Debit**: Accounts Receivable control account for the invoice total
- **Credit**: Each invoice line's GL account (revenue account) for the line amount

### 11.8 Financial Report Computations

**Trial Balance**: Sum of posted journal lines grouped by account.

**Profit & Loss**: 
- Revenue = sum of credits minus debits on REVENUE accounts for the period range
- Expenses = sum of debits minus credits on EXPENSE accounts for the period range
- Net Income = Revenue − Expenses

**Balance Sheet** (as-of date):
- Assets = sum of ASSET account balances (debit-normal)
- Liabilities = sum of LIABILITY account balances (credit-normal)
- Equity = sum of EQUITY account balances (credit-normal) + retained earnings
- Must satisfy: Assets = Liabilities + Equity

---

## 12. Shared Infrastructure & Utilities

### 12.1 Environment Configuration

`ConfigModule.forRoot({ isGlobal: true })` in `AppModule` makes the `ConfigService` available everywhere. All config access uses `config.get("VAR_NAME", defaultValue)`.

**Required variables** (no default, application will fail to start without them):
- `DATABASE_URL`
- `JWT_SECRET` (min 32 characters)
- `JWT_REFRESH_SECRET` (min 32 characters)

**Variables with defaults**:
- `PORT` → `3001`
- `JWT_EXPIRES_IN` → `"15m"`
- `JWT_REFRESH_EXPIRES_IN` → `"30d"`
- `FRONTEND_URL` → `"http://localhost:3000"`
- `REDIS_URL` → `"redis://localhost:6379"`

### 12.2 Docker Local Development

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_USER: sttps
      POSTGRES_PASSWORD: sttps_dev_password
      POSTGRES_DB: sttps
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sttps"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
```

### 12.3 Prisma Migrations

```bash
# Generate migration from schema changes
pnpm --filter @sttps/prisma prisma migrate dev --name "migration_name"

# Apply migrations in production
pnpm --filter @sttps/prisma prisma migrate deploy

# Generate Prisma client after schema change
pnpm --filter @sttps/prisma prisma generate

# Reset database (development only)
pnpm --filter @sttps/prisma prisma migrate reset
```

All migration files are committed to version control under `packages/prisma/migrations/`.

### 12.4 Redis Usage

Redis is configured and available but not yet wired for active use in v1. Planned uses:
- Session token caching (reduce DB lookups on refresh)
- Rate limiting (express-rate-limit with Redis store)
- Job queue for async operations (email sending, depreciation runs, MRP calculations)
- Response caching for expensive reports

### 12.5 Google Cloud Storage (File Uploads)

Configured via `GCS_BUCKET_NAME`, `GCS_PROJECT_ID`, and either `GOOGLE_APPLICATION_CREDENTIALS` (local dev) or Workload Identity (production). Used for:
- Company logo uploads (`Company.logoUrl`)
- Attachment storage (future: AP invoice PDF, asset photos)

---

## 13. Security Implementation

### 13.1 HTTP Security Headers (helmet)

```typescript
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
```

Helmet sets these headers by default:
- `Content-Security-Policy` — restricts resource loading
- `X-Content-Type-Options: nosniff` — prevents MIME sniffing
- `X-Frame-Options: SAMEORIGIN` — prevents clickjacking
- `Referrer-Policy: no-referrer` — controls referrer info
- `Strict-Transport-Security` — enforces HTTPS
- `X-XSS-Protection` — legacy XSS filter

The `crossOriginResourcePolicy: cross-origin` exception is needed for serving images from different origins (logos from GCS).

### 13.2 CORS Policy

```typescript
app.enableCors({
  origin: process.env.FRONTEND_URL,  // Exact origin match
  credentials: true,                  // Allow cookies (refresh_token)
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
});
```

Only the explicitly configured `FRONTEND_URL` can make cross-origin requests with credentials.

### 13.3 SQL Injection Prevention

All database queries go through Prisma's type-safe API with parameterized queries. Raw SQL (`$queryRaw`, `$executeRaw`) is avoided. Prisma's parameterization makes SQL injection structurally impossible through its API.

### 13.4 Mass Assignment Prevention

`whitelist: true` in the `ValidationPipe` strips any properties not declared in the DTO. `forbidNonWhitelisted: true` returns a 400 if extra properties are sent. Combined, these prevent mass-assignment attacks.

### 13.5 Input Sanitization

No HTML is rendered from user input — the API returns JSON and the React frontend uses React's safe text rendering. XSS is structurally prevented by this architecture.

### 13.6 Rate Limiting (Planned)

Production deployments should add rate limiting on:
- `POST /auth/login` — 5 attempts per 15 minutes per IP
- `POST /auth/register` — 3 attempts per hour per IP
- All authenticated endpoints — 1000 requests per minute per user

Implement with `@nestjs/throttler` or `express-rate-limit` + Redis store.

### 13.7 Secret Rotation Policy

| Secret | Rotation Frequency |
|---|---|
| `JWT_SECRET` | Every 90 days |
| `JWT_REFRESH_SECRET` | Every 90 days |
| `SENDGRID_API_KEY` | On compromise or annually |
| Database passwords | Every 90 days |
| Redis AUTH password | Every 90 days |

When `JWT_SECRET` is rotated, all existing access tokens are invalidated. Users must refresh (which uses the httpOnly cookie refresh token). Stagger rotation so refresh tokens remain valid during the cutover window.

### 13.8 Audit Logging

The `AuditLog` model records all state-changing operations. Implementation pattern in services:
```typescript
await this.prisma.auditLog.create({
  data: {
    tenantId,
    companyId,
    userId,
    module: "finance",
    action: "post",
    entity: "GlJournal",
    entityId: journal.id,
    before: { status: "DRAFT" },
    after: { status: "POSTED", postedAt: new Date() },
    ipAddress,
  },
});
```

The audit log is append-only — records are never updated or deleted.

---

## 14. Performance & Scalability

### 14.1 API Performance Targets

| Endpoint Category | p50 Target | p95 Target |
|---|---|---|
| Simple reads (single record) | < 50 ms | < 150 ms |
| Paginated list (25 items) | < 100 ms | < 300 ms |
| Complex aggregations (dashboard, aging) | < 200 ms | < 600 ms |
| Write operations (create, update) | < 100 ms | < 400 ms |
| State transitions (post, approve) | < 200 ms | < 800 ms |

### 14.2 Database Query Optimization

**Current indexes** (from schema):
- All `tenantId` and `(tenantId, companyId)` composite indexes
- `(tenantId, companyId, date)` on `gl_journals` for date-range queries
- `(tenantId, createdAt)` and `(entity, entityId)` on `audit_logs`
- `userId` on `sessions`

**Planned indexes for high-traffic patterns**:
```prisma
// AP/AR invoices — filtered by status and date
@@index([tenantId, companyId, status])
@@index([tenantId, companyId, dueDate])

// Items — searched by name
@@index([tenantId, companyId, name])

// Stock movements — filtered by item + warehouse
@@index([itemId, warehouseId, createdAt])
```

### 14.3 N+1 Query Prevention

All list endpoints that return related data use Prisma `include` to eager-load:
```typescript
// ✅ Single query with JOIN
this.prisma.glJournal.findMany({
  include: {
    period: { select: { name: true, fiscalYear: true, period: true } },
    lines: { include: { account: { select: { code: true, name: true } } } },
  },
});

// ❌ N+1 pattern — never do this
const journals = await this.prisma.glJournal.findMany({ where });
for (const j of journals) {
  j.period = await this.prisma.glPeriod.findUnique({ where: { id: j.periodId } });
}
```

### 14.4 Parallel Query Execution

Dashboard and aggregation endpoints run independent queries in parallel:
```typescript
const [count1, count2, aggregate1] = await Promise.all([
  this.prisma.model1.count({ where }),
  this.prisma.model2.count({ where }),
  this.prisma.model3.aggregate({ where, _sum: { field: true } }),
]);
```

### 14.5 Connection Pooling

For production deployments, configure PgBouncer in **transaction pooling** mode between the application and PostgreSQL. This is critical for NestJS (Node.js) workloads where many concurrent async operations open database connections.

Recommended `DATABASE_URL` with Prisma + PgBouncer:
```
DATABASE_URL="postgresql://user:pass@pgbouncer:5432/db?pgbouncer=true&connection_limit=10"
```

### 14.6 Caching Strategy

**Phase 1** (current): No application-level caching. Rely on PostgreSQL buffer cache and query optimization.

**Phase 2** (planned):
- Cache `GET /auth/me` results in Redis for 60 seconds (high-frequency endpoint)
- Cache Chart of Accounts (rarely changes) with 5-minute TTL
- Cache fiscal periods for the current year with 1-hour TTL
- Use React Query's built-in `staleTime` on the frontend to reduce redundant API calls

### 14.7 Stateless API Design

The NestJS API is fully stateless — no session state is held in application memory. This enables:
- Horizontal scaling (multiple API pod replicas behind a load balancer)
- Zero-downtime deployments (drain connections, restart)
- Simple health checks (`GET /health` returning 200)

---

## 15. Deployment & Infrastructure

### 15.1 Local Development Setup

```bash
# Prerequisites: Docker Desktop, Node.js 22+, pnpm 11+

# 1. Start infrastructure
docker compose up -d

# 2. Install dependencies
pnpm install

# 3. Copy and configure environment
cp .env.example .env
# Edit .env with local values

# 4. Run database migrations
pnpm --filter @sttps/prisma prisma migrate dev

# 5. Start all apps (parallel via Turborepo)
pnpm dev
# → API:      http://localhost:3001
# → Swagger:  http://localhost:3001/api/docs
# → Frontend: http://localhost:3000
```

### 15.2 Build Pipeline

```bash
# Full production build
pnpm build

# Per app
pnpm --filter api build    # → apps/api/dist/
pnpm --filter web build    # → apps/web/.next/
```

Turborepo caches build outputs. A rebuild is only triggered if source files change.

### 15.3 Production Architecture (GCP)

```
Internet
  ↓
Cloud Load Balancer (HTTPS, SSL termination)
  ↓ /api/*              ↓ /*
  NestJS Pod (GKE)      Next.js Pod (GKE)
  ↓                     ↓
  Cloud SQL Auth Proxy  (no direct DB access)
  ↓
  Cloud SQL (PostgreSQL 16)

  NestJS Pod also connects to:
  ↓ Cache               ↓ Files           ↓ Email
  Memorystore (Redis)   Cloud Storage     SendGrid
```

**GKE Workload Identity** is used instead of service account keys. Each pod's Kubernetes ServiceAccount is bound to a GCP ServiceAccount with minimal IAM permissions:
- `roles/cloudsql.client` — Cloud SQL Auth Proxy access
- `roles/storage.objectCreator` — GCS uploads
- `roles/secretmanager.secretAccessor` — Secret Manager access

### 15.4 Environment Variables (Production)

All production secrets are stored in **Google Secret Manager** and mounted as environment variables by GKE via the Secrets Store CSI driver. No secrets appear in Docker images or Kubernetes manifests.

```yaml
# kubernetes/deployment.yaml (excerpt)
env:
  - name: DATABASE_URL
    valueFrom:
      secretKeyRef:
        name: sttps-secrets
        key: DATABASE_URL
  - name: JWT_SECRET
    valueFrom:
      secretKeyRef:
        name: sttps-secrets
        key: JWT_SECRET
```

### 15.5 Health Checks

```typescript
// api/src/health/health.controller.ts (to be implemented)
@Get('health')
health() {
  return { status: 'ok', timestamp: new Date().toISOString() };
}

@Get('health/db')
async dbHealth() {
  await this.prisma.$queryRaw`SELECT 1`;
  return { status: 'ok', database: 'connected' };
}
```

### 15.6 Prisma Migration in Production

Before deploying a new API version with schema changes:
```bash
# Run as a pre-deploy job in the CI/CD pipeline
pnpm --filter @sttps/prisma prisma migrate deploy
```

This applies all pending migrations in order. It is idempotent — already-applied migrations are skipped.

---

## 16. Testing Requirements

### 16.1 Testing Layers

| Layer | Scope | Tool | Coverage Target |
|---|---|---|---|
| Unit tests | Services (business logic, no DB) | Jest | 80% of service methods |
| Integration tests | API endpoints + real PostgreSQL | Jest + Supertest | All CRUD + status transitions |
| E2E tests | Full user flow in browser | Playwright | Critical paths (login, journal, invoice) |
| Type checking | TypeScript compilation | tsc | 100% (no type errors) |
| Lint | Code style | ESLint | 100% (no lint errors) |

### 16.2 Unit Test Pattern (Services)

Services are unit-tested with a mocked `PrismaService`:

```typescript
describe("GlService", () => {
  let service: GlService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [GlService, { provide: PrismaService, useValue: mockDeep<PrismaService>() }],
    }).compile();

    service = module.get(GlService);
    prisma = module.get(PrismaService);
  });

  it("should reject an unbalanced journal", async () => {
    const dto: CreateJournalDto = {
      date: "2026-01-15",
      lines: [
        { accountId: "uuid-1", debit: 1000, credit: 0 },
        { accountId: "uuid-2", debit: 0, credit: 900 },  // Doesn't balance!
      ],
    };
    await expect(service.createJournal(dto, "tenant-id", "company-id", "user-id"))
      .rejects.toThrow(BadRequestException);
  });
});
```

### 16.3 Integration Test Pattern

Integration tests use a dedicated test database and Supertest:

```typescript
describe("POST /api/v1/finance/gl/journals (integration)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    // Apply same global config as main.ts
    applyGlobalConfig(app);
    await app.init();
  });

  it("should create a balanced journal", async () => {
    const token = await getAuthToken(app, testUser);
    const response = await request(app.getHttpServer())
      .post("/api/v1/finance/gl/journals")
      .set("Authorization", `Bearer ${token}`)
      .set("x-company-id", testCompanyId)
      .send(validJournalDto)
      .expect(201);

    expect(response.body.status).toBe("DRAFT");
    expect(response.body.totalDebit).toBe("1000.0000");
  });
});
```

### 16.4 Test Database Strategy

- Use a separate `TEST_DATABASE_URL` environment variable
- Run `prisma migrate deploy` on the test database before the test suite
- Wrap each test or test suite in a transaction that is rolled back after the test
- Alternatively: truncate all tables in `afterEach`

### 16.5 Critical Test Cases

**Auth**:
- Register with duplicate slug → 409
- Register with duplicate email → 409
- Login with wrong password → 401
- Access protected endpoint without token → 401
- Refresh with expired token → 401

**GL**:
- Create balanced journal → 201 with DRAFT status
- Create unbalanced journal → 400
- Post DRAFT journal → status becomes POSTED
- Post already-POSTED journal → 400
- Void POSTED journal → status becomes VOIDED
- Void DRAFT journal → 400
- Account code duplicate → 409
- Create journal with no open period → 400

**AP**:
- Create invoice with duplicate number → 409
- Approve DRAFT invoice → APPROVED
- Post APPROVED invoice → POSTED + GL journal created
- Approve already-POSTED invoice → 400

---

## 17. Code Conventions & Standards

### 17.1 File Naming

| File Type | Convention | Example |
|---|---|---|
| NestJS module | `kebab-case.module.ts` | `gl.module.ts` |
| NestJS controller | `kebab-case.controller.ts` | `gl.controller.ts` |
| NestJS service | `kebab-case.service.ts` | `gl.service.ts` |
| NestJS DTO | `verb-noun.dto.ts` | `create-account.dto.ts` |
| NestJS guard | `kebab-case.guard.ts` | `jwt-auth.guard.ts` |
| NestJS decorator | `kebab-case.decorator.ts` | `current-user.decorator.ts` |
| Next.js page | `page.tsx` (required by App Router) | `page.tsx` |
| Next.js layout | `layout.tsx` | `layout.tsx` |
| React component | `PascalCase.tsx` | `VendorDialog.tsx` |
| Utility / lib | `camelCase.ts` | `api.ts`, `auth.tsx` |

### 17.2 TypeScript Style

- **Strict mode**: All `tsconfig.json` files must have `"strict": true`
- **No `any`**: Use `unknown` + type guards instead
- **Explicit return types**: Required on all service methods and API handler functions
- **Interface over type alias**: Prefer `interface` for object shapes (allows extension); use `type` for unions/intersections
- **Enum vs string literals**: Use string literal union types for Prisma status fields in application code. Reserve TypeScript `enum` for values that are iterated over.

### 17.3 NestJS Patterns

- **One module per domain**: Never add a controller or service from module A into module B's providers. If module B needs module A's service, export it from A and import A into B.
- **Services are the only Prisma consumers**: Controllers never call Prisma directly.
- **DTOs are validated**: Every request body goes through a class-validator DTO. No raw `any` request bodies.
- **Guards first**: `@UseGuards(JwtAuthGuard)` is applied at the controller class level (not per method) unless specific methods are intentionally public.

### 17.4 Prisma Conventions

- Use `findFirst` with `tenantId` scope (not `findUnique` by `id` alone) to ensure tenant isolation
- Use `findUnique` only when using a unique constraint that already includes `tenantId` (like `tenantId_companyId_code`)
- Cascade operations (post invoice + create GL journal) must be wrapped in `this.prisma.$transaction(async (tx) => {...})`
- Never use `deleteMany` on financial records — use `isActive=false` instead

### 17.5 Frontend Conventions

- **Query keys must include companyId**: Query results are company-scoped. Including `companyId` in the query key ensures cache invalidation on company switch.
- **Form schemas are colocated**: Define the Zod schema in the same file as the form component.
- **No direct `fetch` calls**: All API calls go through `lib/api.ts` functions. This ensures the auth interceptors are always applied.
- **Error messages from API**: Always use `error.response?.data?.message` (which may be a string or array) for user-facing error messages.

### 17.6 Git Commit Conventions

Follow Conventional Commits:
```
feat(finance): add journal void endpoint
fix(auth): refresh token not rotating on each refresh
chore(deps): bump @nestjs/core to 10.4.15
refactor(inventory): extract stock level calculation to service
test(gl): add integration tests for journal posting
docs: update TRD with multi-tenancy section
```

---

## 18. Module API Reference

Complete API surface reference for all implemented modules.

### 18.1 Auth API

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Register new organization |
| POST | `/auth/login` | Public | Login (returns JWT + sets cookie) |
| POST | `/auth/refresh` | Cookie | Refresh access token (rotates refresh token) |
| POST | `/auth/logout` | JWT | Invalidate session |
| GET | `/auth/me` | JWT | Get current user + company memberships |

### 18.2 Tenant API

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/tenant/me` | JWT | Get tenant details |
| GET | `/tenant/me/stats` | JWT | Get tenant statistics |

### 18.3 Company API

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/companies` | JWT | List companies in tenant |
| GET | `/companies/:id` | JWT | Get company |
| POST | `/companies` | JWT | Create company |
| PUT | `/companies/:id` | JWT | Update company |
| GET | `/companies/:id/users` | JWT | List company users |

### 18.4 User API

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/users` | JWT | List users in tenant |
| GET | `/users/:id` | JWT | Get user |
| POST | `/users` | JWT | Create user |
| PUT | `/users/:id` | JWT | Update user |

### 18.5 Finance — GL API

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/finance/gl/dashboard` | JWT+Company | Finance KPIs |
| GET | `/finance/gl/accounts` | JWT+Company | List GL accounts |
| GET | `/finance/gl/accounts/:id` | JWT+Company | Get account |
| POST | `/finance/gl/accounts` | JWT+Company | Create account |
| PUT | `/finance/gl/accounts/:id` | JWT+Company | Update account |
| GET | `/finance/gl/periods?fiscalYear=` | JWT+Company | List fiscal periods |
| GET | `/finance/gl/journals` | JWT+Company | List journals (paginated) |
| GET | `/finance/gl/journals/:id` | JWT+Company | Get journal with lines |
| POST | `/finance/gl/journals` | JWT+Company | Create journal (DRAFT) |
| PATCH | `/finance/gl/journals/:id/post` | JWT+Company | Post journal |
| PATCH | `/finance/gl/journals/:id/void` | JWT+Company | Void journal |
| GET | `/finance/gl/trial-balance?fiscalYear=&period=` | JWT+Company | Trial balance |
| GET | `/finance/reports/pl?fiscalYear=&fromPeriod=&toPeriod=` | JWT+Company | P&L statement |
| GET | `/finance/reports/balance-sheet?fiscalYear=&asOfPeriod=` | JWT+Company | Balance sheet |

### 18.6 Finance — AP API

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/finance/ap/vendors` | JWT+Company | List vendors |
| GET | `/finance/ap/vendors/:id` | JWT+Company | Get vendor |
| POST | `/finance/ap/vendors` | JWT+Company | Create vendor |
| PUT | `/finance/ap/vendors/:id` | JWT+Company | Update vendor |
| GET | `/finance/ap/invoices` | JWT+Company | List invoices |
| GET | `/finance/ap/invoices/:id` | JWT+Company | Get invoice |
| POST | `/finance/ap/invoices` | JWT+Company | Create invoice |
| PATCH | `/finance/ap/invoices/:id/approve` | JWT+Company | Approve invoice |
| PATCH | `/finance/ap/invoices/:id/post` | JWT+Company | Post invoice |
| GET | `/finance/ap/aging` | JWT+Company | AP aging report |

### 18.7 Finance — AR API

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/finance/ar/customers` | JWT+Company | List customers |
| GET | `/finance/ar/customers/:id` | JWT+Company | Get customer |
| POST | `/finance/ar/customers` | JWT+Company | Create customer |
| PUT | `/finance/ar/customers/:id` | JWT+Company | Update customer |
| GET | `/finance/ar/invoices` | JWT+Company | List invoices |
| GET | `/finance/ar/invoices/:id` | JWT+Company | Get invoice |
| POST | `/finance/ar/invoices` | JWT+Company | Create invoice |
| PATCH | `/finance/ar/invoices/:id/post` | JWT+Company | Post invoice |
| GET | `/finance/ar/aging` | JWT+Company | AR aging report |

### 18.8 Finance — Fixed Assets API

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/finance/assets/summary` | JWT+Company | Asset dashboard |
| GET | `/finance/assets` | JWT+Company | List assets |
| GET | `/finance/assets/:id` | JWT+Company | Get asset |
| POST | `/finance/assets` | JWT+Company | Create asset |
| PUT | `/finance/assets/:id` | JWT+Company | Update asset |
| PATCH | `/finance/assets/:id/dispose` | JWT+Company | Dispose asset |
| POST | `/finance/assets/depreciation/run?asOfDate=` | JWT+Company | Run depreciation |

### 18.9 Finance — Bank API

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/finance/bank/summary` | JWT+Company | Bank dashboard |
| GET | `/finance/bank/accounts` | JWT+Company | List bank accounts |
| GET | `/finance/bank/accounts/:id` | JWT+Company | Get bank account |
| POST | `/finance/bank/accounts` | JWT+Company | Create bank account |
| PUT | `/finance/bank/accounts/:id` | JWT+Company | Update bank account |
| GET | `/finance/bank/accounts/:id/transactions` | JWT+Company | List transactions |
| POST | `/finance/bank/transactions` | JWT+Company | Create transaction |

### 18.10 Finance — Budget API

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/finance/budgets` | JWT+Company | List budgets |
| GET | `/finance/budgets/:id` | JWT+Company | Get budget |
| POST | `/finance/budgets` | JWT+Company | Create budget |
| PATCH | `/finance/budgets/:id/approve` | JWT+Company | Approve budget |
| GET | `/finance/budgets/:id/vs-actual` | JWT+Company | Budget vs. actual |

### 18.11 Inventory API

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/inventory/summary` | JWT+Company | Inventory dashboard |
| GET | `/inventory/categories` | JWT+Company | List categories |
| POST | `/inventory/categories` | JWT+Company | Create category |
| GET | `/inventory/items` | JWT+Company | List items |
| GET | `/inventory/items/:id` | JWT+Company | Get item |
| POST | `/inventory/items` | JWT+Company | Create item |
| PUT | `/inventory/items/:id` | JWT+Company | Update item |
| GET | `/inventory/warehouses` | JWT+Company | List warehouses |
| POST | `/inventory/warehouses` | JWT+Company | Create warehouse |
| POST | `/inventory/warehouses/locations` | JWT+Company | Create storage location |
| GET | `/inventory/stock-levels` | JWT+Company | Get stock levels |
| GET | `/inventory/movements` | JWT+Company | List movements |
| POST | `/inventory/movements` | JWT+Company | Create movement |
| GET | `/inventory/counts` | JWT+Company | List counts |
| GET | `/inventory/counts/:id` | JWT+Company | Get count |
| POST | `/inventory/counts` | JWT+Company | Create count |
| POST | `/inventory/counts/:id/post` | JWT+Company | Post count |

### 18.12 Procurement API

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/procurement/dashboard` | JWT+Company | Procurement KPIs |
| GET | `/procurement/vendors` | JWT+Company | List vendors |
| GET | `/procurement/requisitions` | JWT+Company | List PRs |
| GET | `/procurement/requisitions/:id` | JWT+Company | Get PR |
| POST | `/procurement/requisitions` | JWT+Company | Create PR |
| POST | `/procurement/requisitions/:id/approve` | JWT+Company | Approve PR |
| GET | `/procurement/orders` | JWT+Company | List POs |
| GET | `/procurement/orders/:id` | JWT+Company | Get PO |
| POST | `/procurement/orders` | JWT+Company | Create PO |
| POST | `/procurement/orders/:id/approve` | JWT+Company | Approve PO |
| GET | `/procurement/receipts` | JWT+Company | List GRNs |
| GET | `/procurement/receipts/:id` | JWT+Company | Get GRN |
| POST | `/procurement/receipts` | JWT+Company | Create GRN |
| POST | `/procurement/receipts/:id/post` | JWT+Company | Post GRN |

### 18.13 Sales API

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/sales/dashboard` | JWT+Company | Sales KPIs |
| GET | `/sales/price-lists` | JWT+Company | List price lists |
| GET | `/sales/price-lists/:id` | JWT+Company | Get price list |
| POST | `/sales/price-lists` | JWT+Company | Create price list |
| GET | `/sales/quotes` | JWT+Company | List quotes |
| GET | `/sales/quotes/:id` | JWT+Company | Get quote |
| POST | `/sales/quotes` | JWT+Company | Create quote |
| POST | `/sales/quotes/:id/approve` | JWT+Company | Approve quote |
| POST | `/sales/quotes/:id/convert` | JWT+Company | Convert to order |
| GET | `/sales/orders` | JWT+Company | List sales orders |
| GET | `/sales/orders/:id` | JWT+Company | Get order |
| POST | `/sales/orders` | JWT+Company | Create order |
| POST | `/sales/orders/:id/approve` | JWT+Company | Approve order |
| GET | `/sales/deliveries` | JWT+Company | List deliveries |
| GET | `/sales/deliveries/:id` | JWT+Company | Get delivery |
| POST | `/sales/deliveries` | JWT+Company | Create delivery |
| POST | `/sales/deliveries/:id/post` | JWT+Company | Post delivery |

### 18.14 Manufacturing API

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/manufacturing/dashboard` | JWT+Company | Manufacturing KPIs |
| GET | `/manufacturing/bom` | JWT+Company | List BOMs |
| GET | `/manufacturing/bom/:id` | JWT+Company | Get BOM |
| POST | `/manufacturing/bom` | JWT+Company | Create BOM |
| POST | `/manufacturing/bom/:id/activate` | JWT+Company | Activate BOM |
| GET | `/manufacturing/work-centers` | JWT+Company | List work centers |
| POST | `/manufacturing/work-centers` | JWT+Company | Create work center |
| GET | `/manufacturing/routings` | JWT+Company | List routings |
| GET | `/manufacturing/routings/:id` | JWT+Company | Get routing |
| POST | `/manufacturing/routings` | JWT+Company | Create routing |
| GET | `/manufacturing/orders` | JWT+Company | List MOs |
| GET | `/manufacturing/orders/:id` | JWT+Company | Get MO |
| POST | `/manufacturing/orders` | JWT+Company | Create MO |
| POST | `/manufacturing/orders/:id/release` | JWT+Company | Release MO |
| POST | `/manufacturing/orders/:id/produce` | JWT+Company | Record production |
| GET | `/manufacturing/mrp` | JWT+Company | List MRP runs |
| POST | `/manufacturing/mrp/run` | JWT+Company | Run MRP |

### 18.15 CRM API

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/crm/dashboard` | JWT+Company | CRM pipeline KPIs |
| GET | `/crm/leads` | JWT+Company | List leads |
| GET | `/crm/leads/:id` | JWT+Company | Get lead |
| POST | `/crm/leads` | JWT+Company | Create lead |
| PUT | `/crm/leads/:id` | JWT+Company | Update lead |
| GET | `/crm/accounts` | JWT+Company | List CRM accounts |
| GET | `/crm/accounts/:id` | JWT+Company | Get account |
| POST | `/crm/accounts` | JWT+Company | Create account |
| PUT | `/crm/accounts/:id` | JWT+Company | Update account |
| GET | `/crm/contacts` | JWT+Company | List contacts |
| GET | `/crm/contacts/:id` | JWT+Company | Get contact |
| POST | `/crm/contacts` | JWT+Company | Create contact |
| PUT | `/crm/contacts/:id` | JWT+Company | Update contact |
| GET | `/crm/opportunities` | JWT+Company | List opportunities |
| GET | `/crm/opportunities/:id` | JWT+Company | Get opportunity |
| POST | `/crm/opportunities` | JWT+Company | Create opportunity |
| PUT | `/crm/opportunities/:id` | JWT+Company | Update opportunity |
| GET | `/crm/activities` | JWT+Company | List activities |
| POST | `/crm/activities` | JWT+Company | Create activity |
| POST | `/crm/activities/:id/complete` | JWT+Company | Complete activity |

### 18.16 HR API

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/hr/dashboard` | JWT+Company | HR KPIs |
| GET | `/hr/departments` | JWT+Company | List departments |
| POST | `/hr/departments` | JWT+Company | Create department |
| GET | `/hr/positions` | JWT+Company | List positions |
| POST | `/hr/positions` | JWT+Company | Create position |
| GET | `/hr/employees` | JWT+Company | List employees |
| GET | `/hr/employees/:id` | JWT+Company | Get employee |
| POST | `/hr/employees` | JWT+Company | Create employee |
| PUT | `/hr/employees/:id` | JWT+Company | Update employee |
| GET | `/hr/leave-types` | JWT+Company | List leave types |
| POST | `/hr/leave-types` | JWT+Company | Create leave type |
| GET | `/hr/leave` | JWT+Company | List leave requests |
| POST | `/hr/leave` | JWT+Company | Submit leave request |
| POST | `/hr/leave/:id/process` | JWT+Company | Approve/reject leave |
| GET | `/hr/payroll` | JWT+Company | List payroll runs |
| GET | `/hr/payroll/:id` | JWT+Company | Get payroll run |
| POST | `/hr/payroll` | JWT+Company | Create payroll run |
| POST | `/hr/payroll/:id/approve` | JWT+Company | Approve payroll |
| GET | `/hr/recruitment/postings` | JWT+Company | List job postings |
| POST | `/hr/recruitment/postings` | JWT+Company | Create posting |
| POST | `/hr/recruitment/postings/:id/publish` | JWT+Company | Publish posting |
| GET | `/hr/recruitment/applications` | JWT+Company | List applications |
| POST | `/hr/recruitment/applications` | JWT+Company | Submit application |
| PUT | `/hr/recruitment/applications/:id/stage` | JWT+Company | Update stage |

### 18.17 EAM API

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/eam/dashboard` | JWT+Company | EAM KPIs |
| GET | `/eam/categories` | JWT+Company | List asset categories |
| POST | `/eam/categories` | JWT+Company | Create category |
| GET | `/eam/assets` | JWT+Company | List assets |
| GET | `/eam/assets/:id` | JWT+Company | Get asset |
| POST | `/eam/assets` | JWT+Company | Create asset |
| GET | `/eam/plans` | JWT+Company | List maintenance plans |
| POST | `/eam/plans` | JWT+Company | Create plan |
| POST | `/eam/plans/:id/trigger` | JWT+Company | Trigger plan manually |
| GET | `/eam/work-orders` | JWT+Company | List work orders |
| POST | `/eam/work-orders` | JWT+Company | Create work order |
| POST | `/eam/work-orders/:id/start` | JWT+Company | Start work order |
| POST | `/eam/work-orders/:id/complete` | JWT+Company | Complete work order |
| GET | `/eam/iot/devices` | JWT+Company | List IoT devices |
| POST | `/eam/iot/devices` | JWT+Company | Register IoT device |
| GET | `/eam/iot/devices/:id/readings` | JWT+Company | Get device readings |
| POST | `/eam/iot/devices/:id/readings` | JWT+Company | Record reading |

### 18.18 FSM API

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/fsm/dashboard` | JWT+Company | FSM KPIs |
| GET | `/fsm/technicians` | JWT+Company | List technicians |
| POST | `/fsm/technicians` | JWT+Company | Create technician |
| POST | `/fsm/technicians/:id/status` | JWT+Company | Update technician status |
| GET | `/fsm/contracts` | JWT+Company | List service contracts |
| POST | `/fsm/contracts` | JWT+Company | Create contract |
| GET | `/fsm/orders` | JWT+Company | List service orders |
| GET | `/fsm/orders/:id` | JWT+Company | Get order |
| POST | `/fsm/orders` | JWT+Company | Create service order |
| POST | `/fsm/orders/:id/assign` | JWT+Company | Assign technician |
| POST | `/fsm/orders/:id/start` | JWT+Company | Start order |
| POST | `/fsm/orders/:id/complete` | JWT+Company | Complete order |
| POST | `/fsm/orders/:id/notes` | JWT+Company | Add note |

### 18.19 Quality API

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/quality/dashboard` | JWT+Company | Quality KPIs |
| GET | `/quality/templates` | JWT+Company | List inspection templates |
| POST | `/quality/templates` | JWT+Company | Create template |
| GET | `/quality/inspections` | JWT+Company | List inspections |
| GET | `/quality/inspections/:id` | JWT+Company | Get inspection |
| POST | `/quality/inspections` | JWT+Company | Create inspection |
| POST | `/quality/inspections/:id/complete` | JWT+Company | Complete inspection |
| GET | `/quality/ncr` | JWT+Company | List NCRs |
| POST | `/quality/ncr` | JWT+Company | Create NCR |
| POST | `/quality/ncr/:id/actions` | JWT+Company | Add corrective action |
| POST | `/quality/ncr/:id/close` | JWT+Company | Close NCR |
| GET | `/quality/audits` | JWT+Company | List audits |
| POST | `/quality/audits` | JWT+Company | Create audit |
| POST | `/quality/audits/:id/start` | JWT+Company | Start audit |
| POST | `/quality/audits/:id/complete` | JWT+Company | Complete audit |

### 18.20 EHS API

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/ehs/dashboard` | JWT+Company | EHS KPIs |
| GET | `/ehs/incidents` | JWT+Company | List incidents |
| POST | `/ehs/incidents` | JWT+Company | Report incident |
| POST | `/ehs/incidents/:id/investigate` | JWT+Company | Update investigation |
| POST | `/ehs/incidents/:id/close` | JWT+Company | Close incident |
| GET | `/ehs/risks` | JWT+Company | List risk assessments |
| POST | `/ehs/risks` | JWT+Company | Create risk assessment |
| POST | `/ehs/risks/:id/activate` | JWT+Company | Activate assessment |
| GET | `/ehs/permits` | JWT+Company | List work permits |
| POST | `/ehs/permits` | JWT+Company | Create permit |
| POST | `/ehs/permits/:id/approve` | JWT+Company | Approve permit |
| POST | `/ehs/permits/:id/close` | JWT+Company | Close permit |

### 18.21 Projects API

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/projects/dashboard` | JWT+Company | Projects KPIs |
| GET | `/projects` | JWT+Company | List projects |
| GET | `/projects/:id` | JWT+Company | Get project |
| POST | `/projects` | JWT+Company | Create project |
| POST | `/projects/:id/status` | JWT+Company | Update project status |
| GET | `/projects/tasks/list` | JWT+Company | List tasks |
| POST | `/projects/tasks` | JWT+Company | Create task |
| PUT | `/projects/tasks/:id` | JWT+Company | Update task |
| GET | `/projects/timesheets/list` | JWT+Company | List timesheets |
| POST | `/projects/timesheets` | JWT+Company | Create timesheet |
| POST | `/projects/timesheets/:id/approve` | JWT+Company | Approve timesheet |
| GET | `/projects/billing/list` | JWT+Company | List billing records |
| POST | `/projects/billing` | JWT+Company | Create billing record |
| POST | `/projects/billing/:id/invoice` | JWT+Company | Generate AR invoice |

---

## Appendix A: JWT Payload Specification

```typescript
interface JwtPayload {
  sub: string;         // user.id (UUID)
  email: string;       // user.email
  tenantId: string;    // user.tenantId (UUID)
  isSuperAdmin: boolean;
  iat: number;         // Issued at (Unix timestamp, added by jwtService)
  exp: number;         // Expiry (Unix timestamp, computed from JWT_EXPIRES_IN)
}
```

---

## Appendix B: Prisma Table Map

| Prisma Model | PostgreSQL Table |
|---|---|
| Tenant | `tenants` |
| Company | `companies` |
| User | `users` |
| CompanyUser | `company_users` |
| Role | `roles` |
| UserRole | `user_roles` |
| Permission | `permissions` |
| RolePermission | `role_permissions` |
| Session | `sessions` |
| AuditLog | `audit_logs` |
| GlAccount | `gl_accounts` |
| GlPeriod | `gl_periods` |
| GlJournal | `gl_journals` |
| GlJournalLine | `gl_journal_lines` |
| Vendor | `vendors` |
| ApInvoice | `ap_invoices` |
| ApInvoiceLine | `ap_invoice_lines` |
| Customer | `customers` |
| ArInvoice | `ar_invoices` |
| ArInvoiceLine | `ar_invoice_lines` |

---

## Appendix C: Environment Variable Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string |
| `JWT_SECRET` | **Yes** | — | Access token signing key (min 32 chars) |
| `JWT_REFRESH_SECRET` | **Yes** | — | Refresh token signing key (min 32 chars) |
| `JWT_EXPIRES_IN` | No | `15m` | Access token TTL |
| `JWT_REFRESH_EXPIRES_IN` | No | `30d` | Refresh token TTL |
| `PORT` | No | `3001` | API server port |
| `NODE_ENV` | No | `development` | `development` or `production` |
| `FRONTEND_URL` | No | `http://localhost:3000` | Allowed CORS origin |
| `NEXT_PUBLIC_API_URL` | No | `http://localhost:3001` | API base URL (frontend) |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection string |
| `GCS_BUCKET_NAME` | No | — | Google Cloud Storage bucket |
| `GCS_PROJECT_ID` | No | — | GCP project ID |
| `GOOGLE_APPLICATION_CREDENTIALS` | No | — | GCP service account key path (local dev) |
| `SENDGRID_API_KEY` | No | — | SendGrid API key |
| `EMAIL_FROM` | No | — | Sender email address |
| `EMAIL_FROM_NAME` | No | — | Sender display name |

---

*End of Technical Requirements Document*

*STTPS ERP Platform — TRD v1.0 — Generated 2026-05-24*
