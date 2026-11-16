# Implementation Plan — STTPS ERP

> **As of:** May 2026  
> **Current version:** v0.7.0 — Phase 7 complete  
> **Stack:** NestJS 10 · Next.js 15 · Prisma 6 · PostgreSQL 16 · Redis 7 · GCP  
> **Repo:** pnpm 11.2.2 monorepo with Turborepo

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Gap Analysis](#2-gap-analysis)
3. [Implementation Phases](#3-implementation-phases)
4. [Phase 8 — Production Hardening](#4-phase-8--production-hardening)
5. [Phase 9 — Notifications & Integrations](#5-phase-9--notifications--integrations)
6. [Phase 10 — Advanced Features](#6-phase-10--advanced-features)
7. [Phase 11 — Analytics & Reporting](#7-phase-11--analytics--reporting)
8. [Phase 12 — Mobile & Real-time](#8-phase-12--mobile--real-time)
9. [Infrastructure & Deployment](#9-infrastructure--deployment)
10. [Testing Strategy](#10-testing-strategy)
11. [Sprint Breakdown](#11-sprint-breakdown)
12. [Risk Register](#12-risk-register)
13. [Definition of Done](#13-definition-of-done)

---

## 1. Current State Assessment

### What Is Built and Working

All 12 ERP modules have fully implemented backend services, controller routes, DTO validation, and frontend pages. The system is not scaffolded — it contains real business logic.

| Module | Backend | Frontend | API Client | Status |
|---|---|---|---|---|
| Authentication | ✅ | ✅ | ✅ | Production-ready |
| Finance — GL | ✅ | ✅ | ✅ | Production-ready |
| Finance — AP | ✅ | ✅ | ✅ | Production-ready |
| Finance — AR | ✅ | ✅ | ✅ | Production-ready |
| Finance — Bank | ✅ | ✅ | ✅ | Production-ready |
| Finance — Assets | ✅ | ✅ | ✅ | Production-ready |
| Finance — Budgets | ✅ | ✅ | ✅ | Production-ready |
| Finance — Reports | ✅ | ✅ | ✅ | Production-ready |
| Inventory | ✅ | ✅ | ✅ | Production-ready |
| Procurement | ✅ | ✅ | ✅ | Production-ready |
| CRM | ✅ | ✅ | ✅ | Production-ready |
| Sales | ✅ | ✅ | ✅ | Production-ready |
| Manufacturing | ✅ | ✅ | ✅ | Production-ready |
| Human Resources | ✅ | ✅ | ✅ | Production-ready |
| EAM | ✅ | ✅ | ✅ | Production-ready |
| FSM | ✅ | ✅ | ✅ | Production-ready |
| Quality | ✅ | ✅ | ✅ | Production-ready |
| EHS | ✅ | ✅ | ✅ | Production-ready |
| Projects | ✅ | ✅ | ✅ | Production-ready |

### Quality Markers Already Present

- Double-entry bookkeeping balance validation (`Math.abs(totalDebit - totalCredit) > 0.001`)
- Prisma `$transaction` on all stock movements, GRNs, payroll runs, and work order completions
- Multi-tenancy enforced on every Prisma query (`tenantId`, `companyId`)
- JWT refresh token rotation with httpOnly cookie
- `Promise.all` on all dashboard stat queries (8 concurrent per module)
- NestJS `ValidationPipe` (whitelist, transform, forbidNonWhitelisted) globally
- Helmet, cookie-parser, CORS in bootstrap
- `Decimal(19,4)` for all monetary amounts, `Decimal(19,6)` for exchange rates
- Status machine transitions with existence checks before every state change

### Metrics

| Metric | Count |
|---|---|
| Backend services | 19 |
| API endpoints | 200+ |
| Frontend pages | 72 |
| Prisma models | 15+ (core; domain models in migrations) |
| DTO classes | 50+ |
| Lines of TypeScript | ~15,000 |

---

## 2. Gap Analysis

The following capabilities are **absent or incomplete** and form the backlog for Phases 8–12.

### 2.1 Infrastructure Gaps

| Gap | Impact | Effort |
|---|---|---|
| No CI/CD pipeline | Deployments are manual and risky | Medium |
| No Dockerfile(s) | Cannot containerise or deploy to cloud | Low |
| No Kubernetes / Cloud Run manifests | Cannot deploy to GCP | Medium |
| Redis not integrated (infra only) | No caching; dashboards hit DB every request | Medium |
| No health-check endpoints | Load balancers cannot detect down pods | Low |
| No structured logging | Cannot alert, trace, or audit in production | Medium |
| No rate limiting | APIs exposed to abuse | Low |

### 2.2 Quality & Testing Gaps

| Gap | Impact | Effort |
|---|---|---|
| 0 unit tests | Regressions go undetected | High |
| 0 integration / e2e tests | Workflow breakages go undetected | High |
| No code coverage enforcement | Quality cannot be measured | Low |
| No linting / pre-commit hooks | Code style inconsistencies accumulate | Low |
| Swagger decorators missing on most controllers | API not self-documented | Medium |

### 2.3 Feature Gaps

| Gap | Module | Priority |
|---|---|---|
| Email notifications (approvals, reminders, alerts) | All | P1 |
| File / document attachments (GCS) | Procurement, Quality, EHS, HR | P1 |
| RBAC enforcement in controllers | All | P1 |
| Audit log writes in services | All | P1 |
| Role management UI | Settings | P1 |
| Advanced P2P: RFQ / vendor quote comparison | Procurement | P2 |
| Lot / batch / serial number tracking | Inventory, Manufacturing | P2 |
| Gantt / capacity planning | Manufacturing | P2 |
| Real-time technician dispatch | FSM | P2 |
| Payroll: country-specific tax tables | HR | P2 |
| Budget vs actual alerts | Finance | P2 |
| Report export (Excel / PDF) | Finance, Procurement, HR | P2 |
| Dashboard charts (per-module) | All | P2 |
| MFA enforcement flow | Auth | P3 |
| SSO / SAML integration | Auth | P3 |
| IoT alert rules engine | EAM | P3 |
| Mobile app (PWA / React Native) | FSM, EAM | P3 |
| Data archival / retention policies | Platform | P3 |

### 2.4 Security Gaps

| Gap | Risk | Effort |
|---|---|---|
| RBAC not enforced at controller level | Any authenticated user can call any endpoint | Medium |
| No input sanitisation beyond DTO whitelist | XSS risk on rich-text fields | Low |
| No API rate limiting | Brute-force and DDoS exposure | Low |
| Refresh tokens not stored hashed | DB compromise exposes sessions | Low |
| No security headers audit | Missing CSP, HSTS etc. | Low |

---

## 3. Implementation Phases

```
Phase 8  — Production Hardening          (Weeks 1–6)
Phase 9  — Notifications & Integrations  (Weeks 7–10)
Phase 10 — Advanced Features             (Weeks 11–18)
Phase 11 — Analytics & Reporting         (Weeks 19–22)
Phase 12 — Mobile & Real-time            (Weeks 23–30)
```

Each phase produces a releasable increment. Phases 8 and 9 are prerequisites for production launch.

---

## 4. Phase 8 — Production Hardening

**Goal:** Make the existing codebase safe, observable, and deployable.  
**Duration:** 6 weeks  
**Prerequisites:** None — start immediately.

---

### 4.1 RBAC Enforcement

**Problem:** Controllers accept any JWT without checking permissions.

**Implementation:**

```
apps/api/src/common/guards/
  ├── jwt-auth.guard.ts          (exists)
  ├── roles.guard.ts             (create)
  └── permissions.guard.ts      (create)

apps/api/src/common/decorators/
  ├── roles.decorator.ts         (create)
  └── require-permission.decorator.ts (create)
```

**Steps:**

1. Create `PermissionsGuard` that reads `RequirePermission` metadata and checks `RolePermission` table via Prisma.
2. Create `@RequirePermission('finance.journal.post')` decorator.
3. Seed the `permissions` table with all 80+ permission codes (one per significant action).
4. Apply guard to every `@Patch`, `@Post`, `@Put` endpoint that changes state.
5. The `Administrator` role created during registration receives all permissions automatically.

**Permission code convention:** `<module>.<entity>.<action>`  
Examples: `finance.journal.post`, `procurement.po.approve`, `hr.payroll.approve`

**Effort:** 1 week

---

### 4.2 Audit Log Writes

**Problem:** `AuditLog` table exists in the schema but no service writes to it.

**Implementation:**

```typescript
// apps/api/src/common/services/audit.service.ts
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(params: {
    tenantId: string;
    companyId?: string;
    userId?: string;
    module: string;
    action: string;
    entity: string;
    entityId?: string;
    before?: any;
    after?: any;
    ipAddress?: string;
  }) {
    await this.prisma.auditLog.create({ data: params });
  }
}
```

**Steps:**

1. Create `AuditService` and add to `CommonModule`.
2. Inject into all domain services.
3. Write audit entries on every state-changing operation: `CREATE`, `UPDATE`, `APPROVE`, `POST`, `VOID`, `DELETE`.
4. Capture `before` snapshot by reading current record before update.
5. Expose `GET /api/v1/audit-logs` endpoint for Settings → Audit Log page.

**Effort:** 1 week

---

### 4.3 Redis Caching

**Problem:** Redis is running (docker-compose) but not connected to NestJS. Dashboard queries hit PostgreSQL on every request.

**Implementation:**

```bash
pnpm add @nestjs/cache-manager cache-manager cache-manager-redis-yet
```

```typescript
// apps/api/src/app.module.ts — add to imports
CacheModule.registerAsync({
  isGlobal: true,
  useFactory: (config: ConfigService) => ({
    store: redisStore,
    url: config.get('REDIS_URL'),
    ttl: 60, // seconds default
  }),
  inject: [ConfigService],
}),
```

**Cache targets** (TTL in seconds):

| Endpoint | TTL | Invalidation trigger |
|---|---|---|
| `GET /finance/gl/dashboard` | 60 | Journal posted/voided |
| `GET /finance/gl/accounts` | 300 | Account created/updated |
| `GET /finance/gl/trial-balance` | 120 | Journal posted |
| `GET /inventory/summary` | 60 | Stock movement created |
| `GET /procurement/dashboard` | 60 | PO/GRN status change |
| `GET /hr/dashboard` | 120 | Employee/payroll change |
| Per-module dashboard endpoints | 60 | Module-specific writes |

**Effort:** 3 days

---

### 4.4 Health Check Endpoints

**Implementation:**

```bash
pnpm add @nestjs/terminus
```

```typescript
// apps/api/src/health/health.controller.ts
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return this.health.check([
      () => this.db.pingCheck('postgresql'),
      () => this.redis.pingCheck('redis'),
      () => this.disk.checkStorage('storage', { threshold: 0.9, path: '/' }),
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
    ]);
  }
}
```

Endpoints:
- `GET /api/v1/health` — full check (database + redis + disk + memory)
- `GET /api/v1/health/live` — liveness probe (returns 200 always if process is up)
- `GET /api/v1/health/ready` — readiness probe (returns 200 only if DB is reachable)

**Effort:** 1 day

---

### 4.5 Structured Logging

**Implementation:**

```bash
pnpm add @nestjs/axios winston nest-winston
```

Replace default NestJS logger with Winston:

```typescript
// apps/api/src/main.ts
app.useLogger(
  WinstonModule.createLogger({
    transports: [
      new winston.transports.Console({ format: winston.format.json() }),
      new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    ],
  }),
);
```

Log format (JSON for GCP Cloud Logging ingestion):
```json
{
  "timestamp": "2026-05-24T10:00:00Z",
  "level": "info",
  "message": "Journal posted",
  "tenantId": "...",
  "companyId": "...",
  "userId": "...",
  "entityId": "JE-000042",
  "durationMs": 12
}
```

Add request logging interceptor that logs method, path, statusCode, durationMs for every request.

**Effort:** 2 days

---

### 4.6 API Rate Limiting

```bash
pnpm add @nestjs/throttler
```

```typescript
ThrottlerModule.forRoot([
  { name: 'short',  ttl: 1000,  limit: 20  },   // 20 req/sec
  { name: 'medium', ttl: 10000, limit: 100 },   // 100 req/10s
  { name: 'long',   ttl: 60000, limit: 500 },   // 500 req/min
]),
```

Apply `ThrottlerGuard` globally. Override with `@SkipThrottle()` on health and internal endpoints. Apply stricter limits on `/auth/login` (5 req/min) to prevent brute-force.

**Effort:** 1 day

---

### 4.7 Swagger Documentation

Add `@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiQuery` decorators to all controllers that are missing them (Quality, EHS, Projects controllers currently have none).

Enable Swagger UI at `/api/docs` in all non-production environments.

Add `@ApiProperty` to all response DTOs (currently only request DTOs are decorated).

**Effort:** 3 days

---

### 4.8 Containerisation

Create production-ready Dockerfiles:

**`apps/api/Dockerfile`**
```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY . .
RUN npm install -g pnpm && pnpm install --frozen-lockfile
RUN pnpm --filter api build
RUN pnpm prisma generate

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
EXPOSE 3001
CMD ["node", "dist/main.js"]
```

**`apps/web/Dockerfile`**
```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY . .
RUN npm install -g pnpm && pnpm install --frozen-lockfile
RUN pnpm --filter web build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./.next/static
COPY --from=builder /app/apps/web/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

Add `output: 'standalone'` to `apps/web/next.config.js`.

**Effort:** 2 days

---

### 4.9 CI/CD Pipeline

Create `.github/workflows/` directory with:

**`ci.yml`** — Runs on every PR:
```yaml
name: CI
on: [push, pull_request]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env: { POSTGRES_DB: sttps_test, POSTGRES_USER: sttps, POSTGRES_PASSWORD: test }
      redis:
        image: redis:7-alpine
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm prisma migrate deploy
      - run: pnpm test

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -f apps/api/Dockerfile -t sttps-api .
      - run: docker build -f apps/web/Dockerfile -t sttps-web .
```

**`deploy.yml`** — Runs on merge to `main`:
```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}
      - uses: google-github-actions/setup-gcloud@v2
      - run: |
          gcloud builds submit --tag gcr.io/$PROJECT_ID/sttps-api apps/api
          gcloud run deploy sttps-api --image gcr.io/$PROJECT_ID/sttps-api --region us-central1
```

**Effort:** 2 days

---

### 4.10 Security Hardening

1. **Hash refresh tokens at rest** — store `sha256(refreshToken)` in `sessions.refreshToken`, compare with `sha256(incomingToken)` on refresh.
2. **Add CSP header** — extend Helmet config with Content-Security-Policy.
3. **Sanitise rich-text inputs** — use `dompurify` on any field that may accept HTML (`notes`, `description` fields rendered in frontend).
4. **Rotate JWT secret** — move JWT secret to GCP Secret Manager with a rotation schedule.
5. **Add `X-Request-ID` header** — generate UUID per request, propagate to logs and responses for trace correlation.

**Effort:** 3 days

---

### Phase 8 Deliverables

| Deliverable | Owner | Week |
|---|---|---|
| RBAC guard + permission seeding | Backend | 1–2 |
| Audit log writes in all services | Backend | 1–2 |
| Redis caching integration | Backend | 2 |
| Health check endpoints | Backend | 2 |
| Structured logging (Winston + JSON) | Backend | 2 |
| Rate limiting | Backend | 3 |
| Swagger decorators on all controllers | Backend | 3 |
| Dockerfiles (api + web) | DevOps | 3 |
| GitHub Actions CI/CD | DevOps | 4 |
| Security hardening (token hashing, CSP) | Backend | 4 |
| Unit test foundation (Jest setup, first 20 tests) | QA | 5–6 |
| Integration test harness | QA | 5–6 |

---

## 5. Phase 9 — Notifications & Integrations

**Goal:** Connect external services — email, file storage, and webhooks.  
**Duration:** 4 weeks  
**Prerequisites:** Phase 8 complete (specifically CI/CD and Dockerfiles).

---

### 5.1 Email Notification Service

**Package:**
```bash
pnpm add @nestjs-modules/mailer nodemailer @types/nodemailer handlebars
```

**Architecture:**
```
apps/api/src/notifications/
  ├── notifications.module.ts
  ├── email.service.ts
  ├── templates/
  │   ├── invoice-approved.hbs
  │   ├── leave-approved.hbs
  │   ├── leave-rejected.hbs
  │   ├── payroll-ready.hbs
  │   ├── po-approved.hbs
  │   ├── incident-reported.hbs
  │   ├── permit-approved.hbs
  │   └── welcome.hbs
  └── notifications.service.ts
```

**Email triggers:**

| Event | Template | Recipient |
|---|---|---|
| User invited to company | `welcome.hbs` | New user |
| AP invoice approved | `invoice-approved.hbs` | Requester |
| AP invoice due in 7 days | `invoice-due.hbs` | AP team |
| AR invoice overdue | `invoice-overdue.hbs` | AR team |
| Leave request submitted | `leave-submitted.hbs` | Manager |
| Leave approved / rejected | `leave-decision.hbs` | Employee |
| Payroll run approved | `payroll-ready.hbs` | All employees |
| PO approved | `po-approved.hbs` | Procurement team |
| EHS incident reported | `incident-reported.hbs` | EHS manager |
| Permit to work approved | `permit-approved.hbs` | Requester |
| Work order overdue | `wo-overdue.hbs` | Assignee + manager |
| Budget variance > 10% | `budget-alert.hbs` | Finance manager |

**Scheduled reminders** (use NestJS `@nestjs/schedule`):

```typescript
@Cron('0 8 * * *') // 8 AM daily
async sendDailyReminders() {
  await this.sendApDueReminders();      // invoices due in 7 days
  await this.sendArOverdueAlerts();     // AR invoices past due
  await this.sendWorkOrderOverdue();    // EAM work orders past scheduled end
  await this.sendPermitExpiryAlerts(); // permits expiring in 24h
}
```

**Effort:** 1.5 weeks

---

### 5.2 File Attachment Service (Google Cloud Storage)

**Package:**
```bash
pnpm add @google-cloud/storage multer @types/multer
```

**Architecture:**
```
apps/api/src/storage/
  ├── storage.module.ts
  ├── storage.service.ts    — GCS client, signed URL generation
  └── upload.controller.ts  — POST /api/v1/upload
```

**Upload endpoint:**
```
POST /api/v1/upload
Content-Type: multipart/form-data

Body: { file: File, entityType: string, entityId: string }

Response: { url: string, key: string, mimeType: string, sizeBytes: number }
```

**Attachment linkage** — add `Attachment` model to Prisma schema:
```prisma
model Attachment {
  id         String   @id @default(uuid())
  tenantId   String
  entityType String   // "ap_invoice" | "quality_inspection" | "ehs_incident" | ...
  entityId   String
  url        String
  key        String   // GCS object key
  fileName   String
  mimeType   String
  sizeBytes  Int
  uploadedBy String
  createdAt  DateTime @default(now())

  @@index([tenantId, entityType, entityId])
  @@map("attachments")
}
```

**Add attachment query to:** AP invoices, GRNs, quality inspections, NCRs, audits, EHS incidents, risk assessments, EAM work orders, HR employee records.

**Frontend:** Add `<AttachmentZone>` component (drag-and-drop) to all relevant detail modals.

**Effort:** 1 week

---

### 5.3 Webhook Outbound Events

Allow tenants to subscribe to events and receive HTTP POST callbacks.

**Schema:**
```prisma
model WebhookEndpoint {
  id        String   @id @default(uuid())
  tenantId  String
  url       String
  events    Json     // ["ap_invoice.posted", "grn.posted", ...]
  secret    String   // HMAC signing secret
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  @@map("webhook_endpoints")
}
```

**Events to emit:** `journal.posted`, `ap_invoice.posted`, `ar_invoice.posted`, `grn.posted`, `payroll.approved`, `incident.reported`, `permit.approved`

**Delivery:** HMAC-SHA256 signed payload in `X-STTPS-Signature` header, retry with exponential backoff (3 attempts).

**Effort:** 1 week

---

### 5.4 Role Management UI

**Currently missing:** There is no frontend to assign roles to users or manage permissions.

**Pages to create:**
```
/settings/roles            — List roles, create/edit
/settings/roles/:id        — Role detail with permission matrix
/settings/users/:id/roles  — Assign roles to a user within a company
```

**Backend endpoints to add:**
```
GET    /api/v1/roles                    — List roles for company
POST   /api/v1/roles                    — Create role
PUT    /api/v1/roles/:id                — Update role name/description
DELETE /api/v1/roles/:id                — Delete non-system role
GET    /api/v1/roles/:id/permissions    — Get permissions for role
PUT    /api/v1/roles/:id/permissions    — Bulk set permissions for role
POST   /api/v1/users/:id/roles          — Assign role to user in company
DELETE /api/v1/users/:id/roles/:roleId  — Remove role from user
GET    /api/v1/permissions              — List all permission codes
```

**Permission matrix UI:** Grouped table (module × action) with checkboxes. Saving sends `PUT /roles/:id/permissions` with full set.

**Effort:** 1 week

---

### Phase 9 Deliverables

| Deliverable | Owner | Week |
|---|---|---|
| Email service + SendGrid integration | Backend | 7 |
| 12 email templates | Frontend/Design | 7 |
| Email triggers in all services | Backend | 8 |
| Daily scheduled reminders | Backend | 8 |
| File upload endpoint + GCS service | Backend | 8 |
| Attachment Prisma model + migration | Backend | 8 |
| Attachment UI component (drag-and-drop) | Frontend | 9 |
| Attachments wired to 8 entity detail pages | Frontend | 9 |
| Webhook outbound events | Backend | 9 |
| Role management UI (3 pages) | Frontend | 10 |
| Role management API endpoints | Backend | 10 |

---

## 6. Phase 10 — Advanced Features

**Goal:** Close the major feature gaps identified in §2.3.  
**Duration:** 8 weeks  
**Priority:** P1 items must ship; P2 items are planned but may slip to next cycle.

---

### 6.1 P1 — Procurement: RFQ Workflow

**Current:** PR → PO (no vendor quote step)  
**Target:** PR → RFQ (sent to 3 vendors) → Quote Comparison → Best price selected → PO

**New Prisma models:**
```prisma
model RFQ {
  id          String     @id @default(uuid())
  tenantId    String
  companyId   String
  prId        String?
  number      String
  title       String
  dueDate     DateTime
  status      String     @default("OPEN")  // OPEN | CLOSED | AWARDED
  notes       String?
  createdBy   String
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  lines       RFQLine[]
  responses   RFQResponse[]
  @@map("rfqs")
}

model RFQLine {
  id       String  @id @default(uuid())
  rfqId    String
  itemId   String
  qty      Decimal @db.Decimal(19,4)
  uom      String
  @@map("rfq_lines")
}

model RFQResponse {
  id         String         @id @default(uuid())
  rfqId      String
  vendorId   String
  submittedAt DateTime?
  status     String         @default("PENDING")
  notes      String?
  lines      RFQResponseLine[]
  @@map("rfq_responses")
}

model RFQResponseLine {
  id         String  @id @default(uuid())
  responseId String
  rfqLineId  String
  unitPrice  Decimal @db.Decimal(19,4)
  leadDays   Int?
  notes      String?
  @@map("rfq_response_lines")
}
```

**New endpoints:**
```
POST   /api/v1/procurement/rfq              — Create RFQ
GET    /api/v1/procurement/rfq              — List RFQs
GET    /api/v1/procurement/rfq/:id          — Get RFQ with responses
POST   /api/v1/procurement/rfq/:id/send     — Send to vendors (email)
POST   /api/v1/procurement/rfq/:id/respond  — Vendor submits quote
GET    /api/v1/procurement/rfq/:id/compare  — Side-by-side comparison
POST   /api/v1/procurement/rfq/:id/award    — Award to vendor → creates PO
```

**Effort:** 2 weeks

---

### 6.2 P1 — Inventory: Lot / Batch Tracking

**Current:** Items are tracked by quantity only.  
**Target:** Items with `trackLots: true` require a lot number on every movement.

**New Prisma models:**
```prisma
model ItemLot {
  id             String   @id @default(uuid())
  tenantId       String
  companyId      String
  itemId         String
  lotNumber      String
  manufacturedDate DateTime?
  expiryDate     DateTime?
  qty            Decimal  @default(0) @db.Decimal(19,4)
  status         String   @default("AVAILABLE")
  notes          String?
  createdAt      DateTime @default(now())
  @@unique([tenantId, companyId, itemId, lotNumber])
  @@map("item_lots")
}
```

**Changes to `CreateItemDto`:** Add `trackLots: boolean` field.  
**Changes to `CreateStockMovementDto`:** Add optional `lotNumber: string` field.  
**Changes to `GRNLineDto`:** Add optional `lotNumber: string` for receiving.

**Frontend:** Lot number input appears conditionally on movement forms when item has `trackLots: true`. Lot list shown in item detail page.

**Effort:** 1.5 weeks

---

### 6.3 P2 — Manufacturing: Gantt / Capacity Planning

**Current:** Production orders have `plannedStart` / `plannedEnd` fields but no scheduling UI.

**Add:**
- `GET /api/v1/manufacturing/schedule?from=&to=` — returns production orders + work center bookings in Gantt-compatible format
- Frontend: React Gantt component (using `@dhtmlx/gantt` or `frappe-gantt`) on `/manufacturing/orders` page
- Work center capacity check: before releasing an order, verify the work center is not over-booked for the planned period
- Visual: colour bars by status (DRAFT=grey, RELEASED=blue, IN_PROGRESS=green, CLOSED=black)

**Effort:** 1.5 weeks

---

### 6.4 P2 — FSM: Real-time Technician Location

**Current:** Technicians have a `status` field updated manually.

**Add:**
- WebSocket gateway (`@nestjs/websockets` + `socket.io`)
- Technician mobile app (or PWA) pushes GPS coordinates every 30 seconds
- Backend stores last known location in Redis (not DB — ephemeral)
- Dispatch map page shows live technician pins on a map (Leaflet.js)

**New endpoint:**
```
WS  /ws/technicians        — authenticated WebSocket connection
    emit: { event: 'location', lat, lng, technicianId }
    subscribe: { event: 'technician-locations', data: [...] }
```

**Effort:** 2 weeks

---

### 6.5 P2 — HR: Payroll Tax Tables

**Current:** Service has hardcoded tax rate logic.

**Add:**
- `TaxTable` Prisma model with country code, bracket thresholds, and rates
- Admin endpoint to seed / update tax tables
- Payroll calculation service uses tax tables instead of hardcoded rates
- Support for: UAE (0%), KSA (0%), USA (federal brackets), UK (HMRC bands), generic flat-rate fallback

**Effort:** 1 week

---

### 6.6 P2 — Finance: Budget Variance Alerts

**Add:**
- Cron job (daily) that computes actual spend per account vs budget
- Sends email alert when variance exceeds configurable threshold (default 10%)
- Adds `BudgetAlert` record to database
- Frontend: alert banner on Finance Dashboard when budget is over threshold
- Settings: configurable alert threshold per company

**Effort:** 1 week

---

### Phase 10 Deliverables

| Deliverable | Owner | Week |
|---|---|---|
| RFQ schema + migration | Backend | 11 |
| RFQ service + endpoints | Backend | 11–12 |
| RFQ frontend pages (create, compare, award) | Frontend | 12–13 |
| Lot tracking schema + migration | Backend | 13 |
| Lot tracking service changes | Backend | 13 |
| Lot tracking UI (conditional fields) | Frontend | 14 |
| Manufacturing Gantt component | Frontend | 14–15 |
| Capacity check on order release | Backend | 15 |
| WebSocket gateway (FSM) | Backend | 15–16 |
| Technician dispatch map | Frontend | 16–17 |
| Payroll tax tables | Backend | 17 |
| Budget variance cron + alerts | Backend | 18 |

---

## 7. Phase 11 — Analytics & Reporting

**Goal:** Add actionable charts, KPI dashboards, and export capabilities across all modules.  
**Duration:** 4 weeks

---

### 7.1 Chart Library

Use **Recharts** (already compatible with Next.js + React 19):

```bash
pnpm add recharts
```

---

### 7.2 Module-level Dashboard Charts

Add charts to each module's overview page:

| Module | Chart types |
|---|---|
| Finance | Monthly P&L bar chart, cash flow trend line, AR/AP aging donut |
| Inventory | Stock value by category pie, reorder-level items list, movement trend |
| Procurement | PO value by vendor bar, PO status donut, monthly spend trend |
| Sales | Revenue by month bar, pipeline funnel (CRM → Quote → SO), top customers |
| Manufacturing | Production output vs target, work center utilisation heat map |
| HR | Headcount by department bar, leave balance, payroll cost trend |
| EAM | Asset downtime trend, work order completion rate, planned vs reactive ratio |
| FSM | Service order resolution time trend, SLA compliance gauge, technician utilisation |
| Quality | Inspection pass/fail rate, NCR severity donut, audit findings by type |
| EHS | Incident frequency rate (IFR) trend, risk matrix heat map |
| Projects | Burndown chart (hours planned vs actual), project status donut |

Each chart fetches from existing dashboard endpoints — no new API needed except specific analytics queries where aggregation logic is more complex.

**Effort:** 2 weeks

---

### 7.3 Report Export (Excel + PDF)

**Backend packages:**
```bash
pnpm add exceljs @nestjs/platform-express
pnpm add puppeteer
```

**New endpoint pattern:**
```
GET /api/v1/finance/reports/pl?format=xlsx&fiscalYear=2025
GET /api/v1/finance/reports/pl?format=pdf&fiscalYear=2025
GET /api/v1/finance/ap/invoices?format=xlsx&status=POSTED
GET /api/v1/hr/employees?format=xlsx
GET /api/v1/procurement/orders?format=xlsx&status=APPROVED
```

**Implementation:**
- `ExportService` accepts data array + column config, returns `Buffer`
- Excel: use `exceljs` with company logo header, styled column headers
- PDF: render HTML template via `handlebars`, convert with `puppeteer`
- Frontend: "Export" dropdown on every list page with Excel / PDF options

**Effort:** 1.5 weeks

---

### 7.4 Analytics Module (Cross-module)

**New page:** `/analytics` — executive dashboard aggregating data across all modules.

**KPIs shown:**
- Revenue YTD (AR posted invoices)
- Expenses YTD (AP posted invoices)
- Gross margin %
- Cash position (bank summary)
- Open orders value (SO + PO)
- Headcount
- Open incidents + risk level
- Projects on-time rate

**New endpoint:**
```
GET /api/v1/analytics/executive?fiscalYear=2025
```

Returns single JSON object with all cross-module KPIs, computed in parallel via `Promise.all`.

**Effort:** 0.5 weeks

---

### Phase 11 Deliverables

| Deliverable | Owner | Week |
|---|---|---|
| Recharts integration | Frontend | 19 |
| Finance dashboard charts | Frontend | 19 |
| Inventory / Procurement / Sales charts | Frontend | 19–20 |
| Manufacturing / HR / EAM / FSM charts | Frontend | 20 |
| Quality / EHS / Projects charts | Frontend | 20 |
| Excel export (all list endpoints) | Backend | 21 |
| PDF export (financial reports, invoices) | Backend | 21 |
| Export buttons in all list pages | Frontend | 21 |
| Executive analytics page | Frontend + Backend | 22 |

---

## 8. Phase 12 — Mobile & Real-time

**Goal:** Mobile-accessible interface for field workers and real-time event streaming.  
**Duration:** 8 weeks

---

### 8.1 Progressive Web App (PWA)

Configure Next.js as a PWA so field technicians and EHS officers can use the app offline on mobile devices.

```bash
pnpm add next-pwa
```

**Offline-capable pages:**
- FSM: view and update assigned service orders
- EAM: view and complete work orders
- EHS: report incidents

**Service worker strategy:** Cache-first for static assets, network-first for API calls with offline fallback queue (sync when reconnected).

**Effort:** 2 weeks

---

### 8.2 Server-Sent Events (SSE) for Live Updates

For lower-complexity real-time (no WebSocket overhead):

```typescript
@Sse('events')
@UseGuards(JwtAuthGuard)
liveEvents(@CurrentUser() user): Observable<MessageEvent> {
  return this.eventService.subscribe(user.tenantId);
}
```

Events pushed to clients:

| Event | Trigger |
|---|---|
| `journal.posted` | GL journal posted |
| `invoice.approved` | AP/AR invoice approved |
| `incident.reported` | EHS incident created |
| `work-order.completed` | EAM work order completed |
| `service-order.assigned` | FSM service order assigned |

Frontend: SSE hook refreshes relevant React Query caches when matching events arrive — no full page reload needed.

**Effort:** 1 week

---

### 8.3 MFA Enforcement

**Current:** `mfaEnabled` and `mfaSecret` fields exist on `User` but no flow.

**Implementation:**
1. `POST /api/v1/auth/mfa/setup` — generates TOTP secret, returns QR code URI
2. `POST /api/v1/auth/mfa/verify` — verifies 6-digit TOTP, sets `mfaEnabled: true`
3. `POST /api/v1/auth/mfa/disable` — requires current TOTP to disable
4. Login flow: if `mfaEnabled: true`, login returns `{ mfaRequired: true, mfaToken }` (short-lived); second step `POST /auth/mfa/authenticate` validates TOTP and returns access token
5. Admin can enforce MFA for all users in a company via company settings

**Package:** `otplib`

**Effort:** 1 week

---

### 8.4 SSO / SAML Integration

**Package:** `passport-saml`

**Flow:**
1. `GET /api/v1/auth/saml/login` — redirect to IdP (Azure AD, Google Workspace, Okta)
2. IdP redirects to `POST /api/v1/auth/saml/callback` with SAML assertion
3. API validates assertion, finds or creates user, issues JWT
4. Company settings stores: entityId, ssoUrl, certificate, attribute mappings

**Effort:** 2 weeks

---

### Phase 12 Deliverables

| Deliverable | Owner | Week |
|---|---|---|
| PWA configuration + service worker | Frontend | 23–24 |
| Offline-capable FSM / EAM / EHS pages | Frontend | 24–25 |
| SSE gateway | Backend | 25 |
| Live update hooks in frontend | Frontend | 25–26 |
| MFA setup + verify flow | Backend + Frontend | 26–27 |
| SAML SSO backend | Backend | 27–28 |
| SAML SSO frontend (company settings) | Frontend | 28–30 |

---

## 9. Infrastructure & Deployment

### 9.1 GCP Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Google Cloud Platform                                   │
│                                                         │
│  ┌──────────┐    ┌──────────────┐   ┌───────────────┐  │
│  │  Cloud   │    │  Cloud Run   │   │  Cloud Run    │  │
│  │  Load    │───▶│  (NestJS API)│   │  (Next.js Web)│  │
│  │ Balancer │    │  min 1 inst  │   │  min 1 inst   │  │
│  └──────────┘    └──────┬───────┘   └───────────────┘  │
│                         │                               │
│  ┌──────────────────────┼──────────────────────────┐   │
│  │                      ▼                          │   │
│  │  ┌──────────────┐  ┌─────────────────┐          │   │
│  │  │  Cloud SQL   │  │  Memorystore    │          │   │
│  │  │ (PostgreSQL) │  │    (Redis)      │          │   │
│  │  │  HA, 1 read  │  │                 │          │   │
│  │  │  replica     │  └─────────────────┘          │   │
│  │  └──────────────┘                               │   │
│  │  Private VPC                                    │   │
│  └────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────┐  ┌────────────────┐  ┌───────────────┐  │
│  │  Cloud   │  │  Secret        │  │  Cloud        │  │
│  │  Storage │  │  Manager       │  │  Monitoring   │  │
│  │  (Files) │  │  (Secrets)     │  │  + Alerting   │  │
│  └──────────┘  └────────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 9.2 GCP Services Required

| Service | Purpose | SKU |
|---|---|---|
| Cloud Run | API + Web hosting | Standard |
| Cloud SQL | PostgreSQL 16, HA | db-g1-small → db-n1-standard-2 |
| Memorystore | Redis 7 | Basic 1 GB |
| Cloud Storage | File attachments | Standard storage class |
| Secret Manager | All secrets | — |
| Cloud Load Balancing | HTTPS termination, CDN | Global HTTP(S) LB |
| Artifact Registry | Docker images | Standard |
| Cloud Build | CI/CD | — |
| Cloud Monitoring | Metrics, alerts | — |
| Cloud Logging | Structured logs | — |
| Cloud Scheduler | Cron jobs (email reminders) | — |

### 9.3 Deployment Steps (First Production Launch)

```
Step 1 — GCP Project setup
  - Create project sttps-erp-prod
  - Enable: Cloud Run, Cloud SQL, Memorystore, GCS, Secret Manager, Artifact Registry

Step 2 — Database
  - Provision Cloud SQL PostgreSQL 16 instance
  - Create database: sttps
  - Run: pnpm prisma migrate deploy

Step 3 — Secrets
  - Store in Secret Manager:
      DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, SENDGRID_API_KEY,
      GCS_BUCKET, REDIS_URL

Step 4 — Build and push Docker images
  - docker build + push sttps-api:v0.8.0 to Artifact Registry
  - docker build + push sttps-web:v0.8.0 to Artifact Registry

Step 5 — Deploy API to Cloud Run
  - gcloud run deploy sttps-api \
      --image REGION-docker.pkg.dev/sttps-erp-prod/api/sttps-api:v0.8.0 \
      --set-secrets DATABASE_URL=DATABASE_URL:latest \
      --set-env-vars NODE_ENV=production \
      --min-instances 1 --max-instances 10 \
      --cpu 1 --memory 512Mi \
      --port 3001 \
      --region us-central1

Step 6 — Deploy Web to Cloud Run
  - gcloud run deploy sttps-web \
      --image REGION-docker.pkg.dev/sttps-erp-prod/web/sttps-web:v0.8.0 \
      --set-env-vars NEXT_PUBLIC_API_URL=https://api.sttps.live \
      --min-instances 1 --max-instances 5 \
      --region us-central1

Step 7 — Configure Load Balancer + Custom Domains
  - api.sttps.live → sttps-api Cloud Run service
  - app.sttps.live → sttps-web Cloud Run service
  - SSL managed by Google-managed certificate

Step 8 — Verify
  - GET https://api.sttps.live/api/v1/health → { status: "ok" }
  - Register new org via UI
  - Post a journal entry end-to-end
```

### 9.4 Environment Variables

| Variable | Used by | Source |
|---|---|---|
| `DATABASE_URL` | API | Secret Manager |
| `JWT_SECRET` | API | Secret Manager |
| `JWT_REFRESH_SECRET` | API | Secret Manager |
| `JWT_EXPIRES_IN` | API | `15m` (hardcoded in config) |
| `JWT_REFRESH_EXPIRES_IN` | API | `30d` (hardcoded in config) |
| `REDIS_URL` | API | Secret Manager |
| `SENDGRID_API_KEY` | API | Secret Manager |
| `SENDGRID_FROM` | API | `noreply@sttps.live` |
| `GCS_BUCKET` | API | Secret Manager |
| `GCP_PROJECT_ID` | API | Metadata server (auto) |
| `NODE_ENV` | API | `production` |
| `PORT` | API | `3001` |
| `NEXT_PUBLIC_API_URL` | Web | Cloud Run env var |

---

## 10. Testing Strategy

### 10.1 Testing Pyramid

```
          ▲
         / \
        / E2E \       (10%) — Playwright browser tests
       /────────\
      / Integration\  (30%) — NestJS supertest, real DB
     /──────────────\
    /   Unit Tests   \ (60%) — Jest, mocked dependencies
   /──────────────────\
```

### 10.2 Unit Tests

**Target:** Core business logic in services.

**Setup:**
```bash
pnpm add -D jest @nestjs/testing ts-jest @types/jest
```

**Priority test cases (first 30 tests):**

| Service | Test case |
|---|---|
| `GlService.createJournal` | Rejects unbalanced entries |
| `GlService.createJournal` | Rejects if no open period for date |
| `GlService.postJournal` | Rejects posting a non-DRAFT journal |
| `GlService.voidJournal` | Rejects voiding a non-POSTED journal |
| `ApService.approveInvoice` | Rejects if already approved |
| `ApService.postInvoice` | Creates GL journal entry on post |
| `InventoryService.createMovement` | Correctly adjusts stock level |
| `InventoryService.postStockCount` | Creates adjustment movements for variances |
| `ProcurementService.createGRN` | Adds stock to warehouse |
| `ProcurementService.approvePR` | Only approves DRAFT status |
| `AuthService.login` | Returns tokens on valid credentials |
| `AuthService.refreshTokens` | Rotates refresh token |
| `HrService.processLeave` | Validates action is APPROVE or REJECT |
| `ManufacturingService.recordProduction` | Only proceeds on RELEASED orders |
| `EhsService.approvePermit` | Sets approvedBy and activates permit |

**Mock pattern:**
```typescript
const mockPrisma = {
  glJournal: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};
```

### 10.3 Integration Tests

**Setup:** Use NestJS `Test.createTestingModule` with real PostgreSQL (test database seeded via `prisma migrate reset`).

**Priority integration tests:**

1. Full journal lifecycle: create → post → void
2. AP invoice lifecycle: create → approve → post (verify GL journal created)
3. GRN lifecycle: create GRN → post → verify stock level incremented
4. Quote → Sales Order conversion
5. Production order: create → release → produce → close
6. Payroll run: create → approve → verify payroll lines exist

### 10.4 End-to-End Tests

**Package:** Playwright

```bash
pnpm add -D @playwright/test
```

**Priority E2E flows:**

1. Register new organisation → login → create company
2. Create GL account → create journal → post journal → view trial balance
3. Create vendor → create AP invoice → approve → post
4. Create item → create warehouse → create GRN → verify stock level
5. Create employee → submit leave → approve leave → verify balance

### 10.5 Code Coverage Target

| Phase | Target coverage |
|---|---|
| End of Phase 8 | 20% (foundation only) |
| End of Phase 9 | 40% |
| End of Phase 10 | 60% |
| Production stable | 70% services, 50% overall |

---

## 11. Sprint Breakdown

> 2-week sprints. Each sprint has a demo and retrospective.

### Phase 8 — Sprints 1–3

**Sprint 1 (Weeks 1–2):** Security foundation
- [ ] RBAC `PermissionsGuard` implementation
- [ ] Permission seeding (all 80 codes)
- [ ] Apply guard to all state-changing endpoints
- [ ] `AuditService` implementation
- [ ] Audit log writes in GL, AP, AR services
- [ ] Health check controller (`/health`, `/health/live`, `/health/ready`)

**Sprint 2 (Weeks 3–4):** Observability + containerisation
- [ ] Redis `CacheModule` integration
- [ ] Cache decorators on 8 dashboard endpoints
- [ ] Winston structured logging
- [ ] Request logging interceptor with `X-Request-ID`
- [ ] `ThrottlerModule` + login rate limiting
- [ ] Swagger decorators — Quality, EHS, Projects controllers
- [ ] `apps/api/Dockerfile`
- [ ] `apps/web/Dockerfile` + `next.config.js standalone` mode

**Sprint 3 (Weeks 5–6):** CI/CD + testing foundation
- [ ] GitHub Actions `ci.yml` (lint, test, build)
- [ ] GitHub Actions `deploy.yml` (GCP Cloud Run)
- [ ] Security: refresh token hashing
- [ ] Security: CSP headers
- [ ] Jest setup + first 20 unit tests (GL + AP + AR)
- [ ] Integration test harness with test database

### Phase 9 — Sprints 4–5

**Sprint 4 (Weeks 7–8):** Notifications
- [ ] `NotificationsModule` + `EmailService`
- [ ] 12 Handlebars email templates
- [ ] Email triggers: leave approved/rejected, payroll, invoices
- [ ] `@nestjs/schedule` cron: daily AP/AR reminders
- [ ] File upload endpoint (`POST /upload`)
- [ ] GCS `StorageService`
- [ ] `Attachment` Prisma model + migration

**Sprint 5 (Weeks 9–10):** Attachments + RBAC UI
- [ ] `<AttachmentZone>` drag-and-drop component
- [ ] Attachments wired to: AP invoices, GRNs, quality inspections, EHS incidents
- [ ] Webhook outbound events + signing
- [ ] Role management API endpoints
- [ ] Role management frontend (3 pages)
- [ ] Permission matrix UI

### Phase 10 — Sprints 6–9

**Sprint 6 (Weeks 11–12):** RFQ workflow
- [ ] RFQ Prisma models + migration
- [ ] RFQ service (create, send, respond, compare, award)
- [ ] RFQ API endpoints
- [ ] RFQ frontend — create page

**Sprint 7 (Weeks 13–14):** RFQ UI + lot tracking
- [ ] RFQ comparison page (side-by-side vendor prices)
- [ ] Lot tracking Prisma model + migration
- [ ] Lot tracking service changes (movements, GRN)
- [ ] Lot tracking UI (conditional lot fields)

**Sprint 8 (Weeks 15–16):** Manufacturing + FSM
- [ ] Gantt component integration
- [ ] Manufacturing schedule endpoint
- [ ] Work center capacity check on order release
- [ ] WebSocket gateway setup
- [ ] Technician location push endpoint (Redis store)

**Sprint 9 (Weeks 17–18):** FSM map + HR + Finance alerts
- [ ] Dispatch map (Leaflet.js) with live technician pins
- [ ] Payroll tax tables (Prisma model + seeding)
- [ ] Payroll service refactor to use tax tables
- [ ] Budget variance cron job
- [ ] Budget alert email + frontend banner

### Phase 11 — Sprints 10–11

**Sprint 10 (Weeks 19–20):** Charts
- [ ] Recharts integration
- [ ] Finance, Inventory, Procurement, Sales charts
- [ ] Manufacturing, HR, EAM, FSM, Quality, EHS, Projects charts

**Sprint 11 (Weeks 21–22):** Exports + analytics
- [ ] Excel export (exceljs) — all major list endpoints
- [ ] PDF export (puppeteer) — financial reports, invoices
- [ ] Export UI (dropdown on all list pages)
- [ ] Executive analytics page + endpoint

### Phase 12 — Sprints 12–15

**Sprint 12 (Weeks 23–24):** PWA
- [ ] `next-pwa` configuration
- [ ] Service worker with offline fallback
- [ ] Offline FSM service order page
- [ ] Offline EHS incident report page

**Sprint 13 (Weeks 25–26):** SSE + MFA
- [ ] SSE gateway
- [ ] Frontend SSE hook + React Query cache invalidation
- [ ] MFA setup and verify endpoints
- [ ] MFA login flow (two-step)
- [ ] MFA management in user profile

**Sprint 14–15 (Weeks 27–30):** SSO
- [ ] SAML backend (`passport-saml`)
- [ ] SAML company settings (entityId, certificate, attribute mapping)
- [ ] SAML SSO login button on login page
- [ ] End-to-end SSO test with Azure AD

---

## 12. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Database migration fails in production | Medium | Critical | Test every migration against production data snapshot in staging |
| Cloud Run cold start latency | Medium | Medium | Set `min-instances: 1` to keep warm; use Cloud Run v2 startup probes |
| Redis connection drop causes dashboard errors | Low | Medium | Add fallback: if cache miss, serve from DB; log cache misses |
| GCS bucket misconfigured (public) | Low | Critical | Enforce uniform bucket-level access; sign all URLs |
| Email delivery rate drops (spam) | Medium | Medium | Set up DKIM/SPF/DMARC on sttps.live domain; use dedicated SendGrid IP |
| Playwright tests flaky on CI | Medium | Low | Use `--retries=2` flag; avoid time-dependent assertions |
| WebSocket connection limits on Cloud Run | Low | Medium | Cloud Run supports up to 1,000 concurrent WebSocket connections per instance; auto-scale |
| SAML certificate rotation causes SSO outage | Low | High | Store multiple certificates; document rotation runbook |
| Payroll tax calculation error | Low | Critical | Add dedicated unit tests for every tax bracket; require finance sign-off before release |
| Multi-tenancy data leak (missing where clause) | Low | Critical | Add Prisma middleware that validates tenantId presence on every query; run automated tenant isolation tests |

---

## 13. Definition of Done

A feature or phase is **Done** when all of the following are true:

### Code Quality
- [ ] TypeScript compiles with zero errors (`pnpm build`)
- [ ] ESLint passes with zero warnings (`pnpm lint`)
- [ ] No `any` type added without a comment explaining why
- [ ] No commented-out code committed

### Testing
- [ ] Unit tests written for all new service methods with business logic
- [ ] Integration test covers the happy path and at least one error path
- [ ] New tests pass in CI (`pnpm test`)
- [ ] Coverage does not drop below the phase target

### API Contracts
- [ ] New endpoints have `@ApiOperation`, `@ApiResponse`, and `@ApiBearerAuth` decorators
- [ ] Request DTOs validated with `class-validator`
- [ ] Response shape documented in Backend-Schema.md if new fields introduced

### Security
- [ ] New endpoints protected by `JwtAuthGuard`
- [ ] State-changing endpoints protected by `PermissionsGuard` with correct permission code
- [ ] No secrets in committed code or logs
- [ ] SQL injection impossible (Prisma parameterised queries only)

### Observability
- [ ] New service methods log at `info` level on success, `error` level on failure
- [ ] Audit log written for every state-changing operation
- [ ] New cron jobs log start/completion with duration

### Frontend
- [ ] Page renders without errors in both loading and loaded states
- [ ] Empty state shown when no data returned
- [ ] Error toast shown on API failure
- [ ] Form validation shown inline (not just on submit)
- [ ] Responsive down to 1024px width

### Deployment
- [ ] Feature merged to `main` branch via reviewed PR
- [ ] CI pipeline green (lint + test + build)
- [ ] Deployed to staging environment and manually smoke-tested
- [ ] No performance regression on dashboard endpoints (< 500ms p95)
- [ ] Release notes entry added to CHANGELOG.md
