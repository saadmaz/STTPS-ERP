# STTPS — Enterprise ERP Platform
## Complete Architecture & Implementation Plan

> **This document describes the long-term product vision** (GCP/GKE, Kafka,
> Elasticsearch, microservices, 13 module suites, etc.) and predates the
> current codebase. **It does not describe what's actually deployed today.**
> The real, current setup is three standalone apps (`web/`, `admin/`, `api/`)
> on Firebase Firestore, deployed to Zircon cPanel hosting — see
> [DEPLOYMENT.md](DEPLOYMENT.md) for the architecture and deploy process
> that's actually in effect. Treat the rest of this file as roadmap, not
> as-built documentation.

---

## Table of Contents

1. [Product Vision & Scope](#1-product-vision--scope)
2. [System Architecture Overview](#2-system-architecture-overview)
3. [Technology Stack](#3-technology-stack)
4. [Multi-Tenancy & Data Architecture](#4-multi-tenancy--data-architecture)
5. [Security Architecture](#5-security-architecture)
6. [Module Breakdown & Domain Map](#6-module-breakdown--domain-map)
7. [Infrastructure & DevOps](#7-infrastructure--devops)
8. [API Design Strategy](#8-api-design-strategy)
9. [Frontend Architecture](#9-frontend-architecture)
10. [Implementation Roadmap (Phases)](#10-implementation-roadmap-phases)
11. [Team Structure](#11-team-structure)
12. [Cost Estimates](#12-cost-estimates)
13. [Risks & Mitigations](#13-risks--mitigations)
14. [Where to Start — Day 1 Actions](#14-where-to-start--day-1-actions)

---

## 1. Product Vision & Scope

### What STTPS Is

STTPS (sttps.live) is a cloud-native, multi-tenant Enterprise Resource Planning platform that unifies the capabilities of SAP S/4HANA, IFS Cloud, Odoo, Microsoft Dynamics 365, and Oracle NetSuite into a single coherent product.

Target customers:
- **SME tier**: 50–500 employees (compete with Odoo, Business Central)
- **Mid-market tier**: 500–5,000 employees (compete with IFS, NetSuite)
- **Enterprise tier**: 5,000+ employees (compete with SAP, Dynamics F&SCM)

### Core Platform Principles

1. **Multi-tenant by design** — one codebase serves thousands of companies
2. **Group of companies** — full legal entity hierarchy under one login (parent → subsidiaries → branches)
3. **Module-selective** — customers activate only what they need, pay per module
4. **API-first** — every feature is accessible via API before UI is built
5. **Composable** — modules can be deployed independently (like IFS's composable architecture)
6. **Localization-ready** — tax engines, currencies, languages designed from day one

### Domain
- Primary: `www.sttps.live`
- Customer portals: `{company}.sttps.live` or custom domain mapping (`erp.clientcompany.com → STTPS`)
- API: `api.sttps.live`
- Admin panel: `admin.sttps.live`

---

## 2. System Architecture Overview

### Architecture Pattern: Modular Monolith → Microservices

**Do NOT start with pure microservices.** The pragmatic approach for a product of this scope with a team that will grow over time:

```
Phase 1–2:  Modular Monolith
             ┌──────────────────────────────────────────┐
             │         STTPS Application Server         │
             │  ┌────────┐ ┌────────┐ ┌────────┐        │
             │  │Finance │ │  SCM   │ │  HCM   │  ...   │
             │  └────────┘ └────────┘ └────────┘        │
             │     Shared DB Schema │ Shared Auth       │
             └──────────────────────────────────────────┘

Phase 3+:   Extract high-load domains into dedicated microservices
             (MRP Engine, Payroll, Reporting, E-Commerce, IoT)
```

This lets you move fast early without the operational overhead of 40+ microservices, while maintaining clean domain boundaries that make extraction easy later.

### High-Level System Diagram

```
                          ┌─────────────────────┐
                          │   www.sttps.live    │
                          │   (Next.js Frontend)│
                          │   CDN: Cloud CDN    │
                          └──────────┬──────────┘
                                     │ HTTPS
                          ┌──────────▼──────────┐
                          │    API Gateway      │
                          │  (Kong / Cloud LB)  │
                          │  Rate Limiting, Auth│
                          │  Request Routing    │
                          └──────────┬───────────┘
                                     │
          ┌──────────────────────────┼──────────────────────────┐
          │                          │                          │
   ┌──────▼──────┐          ┌────────▼──────┐         ┌────────▼──────┐
   │  Core API   │          │  Finance API  │         │   SCM API     │
   │  (NestJS)   │          │  (NestJS)     │         │   (NestJS)    │
   │  Auth/Tenant│          │  GL/AP/AR/FA  │         │  Inventory    │
   │  Users/RBAC │          │  Tax Engine   │         │  Procurement  │
   └──────┬──────┘          └──────┬────────┘         └────────┬──────┘
          │                        │                            │
          └──────────────┬─────────┘────────────────┬──────────┘
                         │                           │
               ┌─────────▼──────────┐   ┌───────────▼──────────┐
               │   PostgreSQL 16    │   │   Redis Cluster       │
               │  (Cloud SQL HA)    │   │   Sessions / Cache    │
               │   Schema-per-Tenant│   │   Job Queues (Bull)   │
               └────────────────────┘   └──────────────────────┘
                         │
               ┌─────────▼──────────┐
               │   Apache Kafka     │
               │   Event Streaming  │
               │   Domain Events    │
               └─────────┬──────────┘
                         │
          ┌──────────────┼───────────────┐
          │              │               │
   ┌──────▼──────┐  ┌────▼──────┐  ┌────▼──────────┐
   │Elasticsearch│  │   GCS     │  │  TimescaleDB  │
   │Search/Audit │  │Files/Docs │  │  IoT / Time   │
   └─────────────┘  └───────────┘  └───────────────┘
```

---

## 3. Technology Stack

### Frontend
| Layer | Technology | Why |
|---|---|---|
| Framework | **Next.js 15** (App Router) | SSR for performance, SEO, streaming |
| Language | **TypeScript** | Type safety across the entire app |
| UI Library | **shadcn/ui** + Radix UI | Unstyled accessible primitives, fully customizable |
| Styling | **Tailwind CSS** | Utility-first, consistent design system |
| State (server) | **TanStack Query v5** | Server state, caching, real-time sync |
| State (client) | **Zustand** | Lightweight global state (user, tenant, theme) |
| Forms | **React Hook Form** + **Zod** | Type-safe validation, performant |
| Data Grid | **AG Grid Enterprise** | Required for ERP-grade table performance (100k rows) |
| Charts | **Recharts** + **Apache ECharts** | Dashboards and analytics |
| PDF/Print | **React PDF** | Invoice, report generation |
| i18n | **next-intl** | Internationalization from day one |
| Drag & Drop | **dnd-kit** | Kanban boards, Gantt charts |
| Rich Text | **TipTap** | Document editor, notes |

### Backend
| Layer | Technology | Why |
|---|---|---|
| Runtime | **Node.js 22 LTS** | Consistent with frontend TS ecosystem |
| Framework | **NestJS** | Structured, decorator-based, DI container, great for large teams |
| Language | **TypeScript** | End-to-end type safety |
| ORM | **Prisma** | Type-safe DB access, migration tooling, multi-schema support |
| Validation | **Zod** (shared with frontend) | Single source of truth for schemas |
| Auth | **Passport.js** + custom JWT | Multiple strategies: local, SAML, OAuth |
| Job Queue | **BullMQ** (Redis-backed) | Payroll runs, MRP calculations, batch jobs |
| File Processing | **Multer** + **Sharp** | Upload handling, image optimization |
| Email | **Nodemailer** + **MJML** | Transactional email with template engine |
| PDF Generation | **Puppeteer** (server-side) | Server-rendered PDF reports |
| WebSockets | **Socket.io** | Real-time notifications, live dashboards |

### Databases & Storage
| Purpose | Technology | Why |
|---|---|---|
| Primary DB | **PostgreSQL 16** | ACID compliance, JSONB, row-level security, schema isolation |
| Caching | **Redis 7** (Cluster) | Sub-millisecond cache, pub/sub, BullMQ |
| Search | **Elasticsearch 8** | Full-text search across all modules |
| Time-series | **TimescaleDB** | IoT sensor data, predictive maintenance |
| Document Store | **Google Cloud Storage** | Files, attachments, exports, backups |
| Analytics Store | **ClickHouse** (later phase) | OLAP queries for business intelligence |

### Infrastructure
| Layer | Technology |
|---|---|
| Cloud | **GCP** (primary) |
| Container Orchestration | **Kubernetes** (GKE) |
| API Gateway | **Kong** or **Google Cloud API Gateway** |
| CDN | **Google Cloud CDN** |
| Load Balancer | **Google Cloud Load Balancing** |
| DNS | **Google Cloud DNS** |
| SSL | **Google-managed SSL Certificates** |
| Secrets | **Google Secret Manager** |
| Monitoring | **Grafana** + **Prometheus** + **Cloud Monitoring** |
| Error Tracking | **Sentry** |
| Logging | **Google Cloud Logging** + **ELK Stack** |
| Email | **SendGrid** (via GCP Marketplace) |
| Storage | **Google Cloud Storage** |
| Message Queue | **Apache Kafka** (Confluent on GCP) |
| VPN | **Google Cloud VPN** |

### CI/CD & Development
| Tool | Purpose |
|---|---|
| Git | **GitHub** |
| CI/CD | **GitHub Actions** |
| Containers | **Docker** + **Docker Compose** (local dev) |
| Package Manager | **pnpm** (monorepo performance) |
| Monorepo | **Turborepo** |
| Code Quality | **ESLint** + **Prettier** + **Husky** |
| Testing | **Jest** + **Supertest** + **Playwright** (E2E) |
| API Docs | **Swagger/OpenAPI** (auto-generated by NestJS) |
| Helm | Kubernetes deployment charts |

---

## 4. Multi-Tenancy & Data Architecture

### Tenant Model

```
Tenant (Group of Companies)
  └── Company A (Parent / Holding)
        ├── Company B (Subsidiary — Region 1)
        │     ├── Branch B1
        │     └── Branch B2
        ├── Company C (Subsidiary — Region 2)
        └── Company D (Joint Venture)
```

**Key rules:**
- Each **Tenant** = one subscription account = one isolated database schema
- Multiple **Companies** can exist within one Tenant (inter-company transactions, consolidation)
- Each Company has its own Chart of Accounts, Currency, Tax Regime, Fiscal Year
- Users can have roles in one or more companies within the same Tenant

### Database Strategy: Schema-per-Tenant (PostgreSQL)

```sql
-- Public schema: platform-level tables
public.tenants
public.tenant_subscriptions
public.platform_users
public.audit_log_platform

-- Per-tenant schemas (dynamically created on signup)
tenant_abc.companies
tenant_abc.users
tenant_abc.roles
tenant_abc.gl_accounts
tenant_abc.gl_journal_entries
tenant_abc.inventory_items
-- ... all ERP tables live here

tenant_xyz.companies
-- ... isolated from tenant_abc
```

**Why schema-per-tenant over row-level isolation:**
- True data isolation — a bug cannot leak cross-tenant data
- Easy backup/restore per tenant
- Schema can be exported when a customer leaves
- Postgres Row Level Security as additional safety net

**Why not database-per-tenant:**
- Too expensive at scale (1,000 tenants = 1,000 databases)
- Schema isolation provides sufficient security for business ERP data

### Tenant Identification

Each request is identified by:
1. **Subdomain**: `acmecorp.sttps.live` → resolves to tenant `acmecorp`
2. **JWT claim**: `tenantId` embedded in every access token
3. **Middleware**: NestJS interceptor sets the Prisma client schema on every request

```typescript
// Simplified tenant resolution middleware
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const subdomain = req.hostname.split('.')[0];
    const tenant = await this.tenantService.resolveBySubdomain(subdomain);
    req.tenantSchema = `tenant_${tenant.schemaId}`;
    next();
  }
}
```

### Core Schema Design Principles

- Every table has: `id` (UUID), `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at` (soft delete)
- Every financial transaction table has: `company_id`, `fiscal_year`, `period`, `currency`, `exchange_rate`
- Audit trail is automatic via Prisma middleware — every write is logged
- All monetary values stored as integers (cents/smallest unit) — no floating point money bugs

---

## 5. Security Architecture

### Authentication & Authorization

**Auth Flow:**
```
User Login → Email/Password or SSO (SAML/OAuth)
          → MFA (TOTP / SMS / Email OTP)
          → JWT Access Token (15 min TTL)
          → Refresh Token (30 day TTL, stored httpOnly cookie)
          → Token contains: userId, tenantId, companyId[], roles[], permissions[]
```

**Authorization Model: RBAC + ABAC**
- **Roles** are defined per company (e.g., CFO, Accountant, Warehouse Manager, HR Manager)
- **Permissions** are granular: `finance:journal:create`, `inventory:item:delete`
- **Field-level security**: Some fields (salary, bank accounts) visible only to specific roles
- **Record-level security**: Users see only records from their assigned company/business unit

**SSO Support (Enterprise Tier):**
- SAML 2.0 (Azure AD, Okta, Google Workspace)
- OAuth 2.0 / OpenID Connect
- Custom LDAP/Active Directory sync

### Security Layers

| Layer | Mechanism |
|---|---|
| Transport | TLS 1.3 enforced, HSTS headers |
| API | JWT validation on every request, API rate limiting (Kong) |
| Database | VPC private subnet, no public access, Cloud SQL IAM auth |
| Secrets | Google Secret Manager, no secrets in code/env files |
| Data at rest | AES-256 encryption on GCS, Cloud SQL encrypted volumes |
| Audit | Every write operation logged with user, IP, timestamp, before/after values |
| WAF | Google Cloud Armor — OWASP top 10 protection, SQL injection, XSS blocking |
| Pen Testing | Quarterly external penetration tests |
| Compliance | SOC 2 Type II, GDPR, ISO 27001 roadmap |

### GDPR / Data Residency
- Customers can choose GCP region (us-central1, europe-west1, asia-southeast1) during onboarding
- Data never leaves the selected region
- Right to erasure: anonymization pipeline for deleted tenants
- Data Processing Agreements (DPA) available

---

## 6. Module Breakdown & Domain Map

Organized into **Suites** (like SAP's modules). Each suite is a bounded domain context.

### Suite 1: Platform Core (required for all)
Installed for every tenant. Cannot be deactivated.

| Service | Functions |
|---|---|
| **Auth & Identity** | Login, MFA, SSO, session management, refresh tokens |
| **Tenant Management** | Onboarding, subscription, schema provisioning |
| **Company Management** | Legal entity setup, company hierarchy, fiscal year, currency |
| **User & Role Management** | Users, roles, permission sets, delegation of authority |
| **Workflow Engine** | Configurable approval workflows (e.g., PO approval > $10k → CFO) |
| **Notification Service** | In-app, email, SMS, push notifications |
| **Audit Trail** | Tamper-proof log of every transaction change |
| **Document Management** | File attachments, version control, DMS |
| **Reporting Engine** | Report builder, scheduled exports, PDF/Excel |
| **Integration Hub** | Webhooks, REST API, connector framework |
| **Settings & Configuration** | System parameters per company |

### Suite 2: Financial Management (FI)

| Module | Key Features |
|---|---|
| **General Ledger** | Chart of accounts, journals, trial balance, period close, parallel ledgers (IFRS + local GAAP), multi-currency |
| **Accounts Payable** | Vendor master, invoice processing, OCR capture, 3-way matching (PO→GR→Invoice), payment runs, aging |
| **Accounts Receivable** | Customer invoicing, collections, dunning, aging, credit management |
| **Fixed Assets** | Asset register, depreciation runs (straight-line, declining balance, units of production), revaluation, disposal |
| **Cash & Bank** | Bank accounts, bank statement import (OFX/MT940), bank reconciliation, cash forecasting |
| **Tax Engine** | VAT, GST, withholding tax, tax codes by country, tax return preparation, nexus management |
| **Financial Close** | Period close checklist, intercompany elimination, consolidation, group reporting |
| **Treasury** | FX management, hedging instruments, bank guarantees, LC management |
| **Cost Accounting** | Cost centers, cost elements, actual vs plan, activity-based costing |
| **Profitability Analysis** | P&L by product, customer, segment, region |
| **Budget & Planning** | Budget templates, scenario planning, variance analysis |
| **Revenue Recognition** | IFRS 15 / ASC 606 compliance, contract performance obligations, deferred revenue |

### Suite 3: Procurement & Supply Chain (SCM)

| Module | Key Features |
|---|---|
| **Supplier Management** | Supplier master, vendor qualification, performance scoring, portal |
| **Purchasing** | Purchase requisitions, RFQ, purchase orders, blanket orders, contracts |
| **Goods Receipt** | GRN processing, quality inspection gate, partial receipts |
| **Invoice Verification** | 3-way match, price variance tolerance, OCR-assisted matching |
| **Inventory Management** | Multi-warehouse, real-time stock, valuation (FIFO/AVCO/Standard), batch/serial |
| **Warehouse Management** | Putaway rules, picking strategies (FEFO, FIFO), wave/batch picking, packing stations |
| **Demand Planning** | Statistical forecasting, collaborative forecasting, consensus planning |
| **Replenishment** | Min/max rules, reorder point, safety stock calculation, VMI |
| **Landed Cost** | Import duties, freight allocation across PO lines |
| **Dropshipping** | Direct vendor-to-customer delivery flow |
| **Logistics** | Delivery notes, carrier management, shipment tracking |

### Suite 4: Manufacturing (MFG)

| Module | Key Features |
|---|---|
| **BOM Management** | Engineering BOM, manufacturing BOM, multi-level, variant BOM, BOM comparison |
| **Routing & Work Centers** | Operation sequences, machine centers, labor centers, setup/run times |
| **MRP Engine** | Material requirements planning, net change MRP, demand pegging, exception messages |
| **Production Orders** | Discrete manufacturing orders, operation confirmations, goods issue, goods receipt |
| **Process Orders** | Batch/recipe manufacturing, by-products, co-products, batch classification |
| **Capacity Planning** | Work center load, capacity leveling, finite scheduling |
| **Shop Floor Control** | Work order tracking, mobile shop floor app, barcode/QR confirmation |
| **Product Costing** | Standard cost, actual cost, cost roll-up, work in progress valuation |
| **Subcontracting** | Send components to vendor, receive finished goods, track processing fees |
| **Kanban** | Replenishment signals, kanban boards, supermarket management |
| **Repetitive Manufacturing** | Rate-based planning for high-volume production lines |
| **MES Interface** | API integration with manufacturing execution systems |

### Suite 5: Sales & CRM

| Module | Key Features |
|---|---|
| **Lead & Opportunity Management** | Pipeline, stages, probability, activity scheduling, email integration |
| **Quotation Management** | Multi-currency quotes, validity, approval workflow, version history |
| **Sales Orders** | Standard, rush, scheduling agreements, credit check, ATP check |
| **Pricing Engine** | Price lists, customer-specific pricing, volume discounts, condition technique |
| **Contract Management** | Long-term agreements, release orders, rebate management |
| **Customer Master** | 360° customer view, contact hierarchy, credit limit |
| **Shipping & Delivery** | Delivery processing, packing, goods issue, tracking |
| **Billing & Invoicing** | Standard, milestone, resource-related, proforma |
| **Returns & Claims** | RMA, credit notes, quality-related returns |
| **Available-to-Promise** | Real-time ATP check against stock, planned receipts, production |
| **Customer Service** | Cases, tickets, SLA management, knowledge base |
| **Sales Analytics** | Revenue forecast, pipeline analytics, sales rep performance |

### Suite 6: Enterprise Asset Management (EAM)

| Module | Key Features |
|---|---|
| **Asset Master** | Equipment hierarchy, functional locations, asset specifications |
| **Linear Assets** | Pipelines, roads, railways — asset measured in length/distance |
| **Maintenance Planning** | Maintenance strategies, task lists, maintenance plans, calendars |
| **Work Orders** | Corrective, preventive, predictive, emergency work orders |
| **Condition Monitoring** | IoT sensor integration, threshold alerts, trend analysis |
| **Predictive Maintenance** | ML-based failure prediction from sensor time-series data |
| **MRO Inventory** | Spare parts management linked to equipment, critical stock |
| **Reliability Engineering** | RCM, FMEA, failure analysis, MTBF tracking |
| **Warranty Management** | Warranty registration, claim processing, supplier recovery |
| **Cost Tracking** | Cost per asset, cost per work order, maintenance budget |
| **GIS Integration** | Geographic positioning of assets on map |
| **Mobile Maintenance** | Offline-capable mobile app for technicians |

### Suite 7: Field Service Management (FSM)

| Module | Key Features |
|---|---|
| **Service Work Orders** | Creation, scheduling, dispatch, completion |
| **Resource Scheduling** | Skills-based matching, geographic optimization, availability |
| **Technician Mobile App** | iOS/Android, offline mode, photo capture, digital signature |
| **Service Contracts** | SLA terms, response time, coverage hours, penalty tracking |
| **Parts Management** | Van stock, parts ordering from field, return unneeded parts |
| **Customer Portal** | Service request, real-time tech tracking, history |
| **Remote Assistance** | AR-guided support (WebRTC + AR.js) |
| **Route Optimization** | Multi-stop route planning, traffic-aware |
| **Time & Expense** | Technician time capture, mileage, expense claims |
| **Invoicing** | Automatic invoice generation on work order completion |

### Suite 8: Human Capital Management (HCM)

| Module | Key Features |
|---|---|
| **Employee Master** | Personal data, employment history, documents, org chart |
| **Organization Management** | Org structure, positions, reporting lines, headcount |
| **Time & Attendance** | Clock-in/out, shifts, schedules, absence management, overtime |
| **Leave Management** | Leave types, policies, accruals, approval workflows, calendar |
| **Payroll Engine** | Pay structures, earnings/deductions, statutory computations, payslips |
| **Payroll Localization** | Country-specific tax, social insurance, statutory reports |
| **Recruitment** | Job postings, application tracking, interview scheduling, offer letters |
| **Onboarding** | Digital onboarding checklist, document collection, IT provisioning tasks |
| **Performance Management** | Goal setting, mid-year review, annual appraisal, 360 feedback |
| **Learning Management** | Course catalog, assignments, completion tracking, certifications |
| **Succession Planning** | Talent pool, career paths, flight risk |
| **Compensation** | Salary bands, merit increases, bonus calculation |
| **Benefits Administration** | Health insurance, pension, flexible benefits |
| **Employee Self-Service** | Payslips, leave requests, profile updates, expense claims |

### Suite 9: Project Management (PM)

| Module | Key Features |
|---|---|
| **Project Structure** | WBS, network diagram, phases, milestones |
| **Project Planning** | Gantt chart, resource assignments, dependencies, critical path |
| **Budget & Cost Control** | Budget, commitments, actual costs, EAC, earned value |
| **Resource Management** | Skills-based resource allocation, utilization tracking |
| **Time & Expense** | Timesheet entry per project/task, expense claims |
| **Procurement Integration** | POs raised against project WBS elements |
| **Subcontractor Management** | Subcontract agreements, progress claims, payment certificates |
| **Milestone Billing** | Invoice triggers on milestone completion |
| **Revenue Recognition** | % completion method, cost-to-cost |
| **Portfolio Management** | Multi-project view, cross-project resource conflicts |
| **Project Collaboration** | Issues, risks, documents, meeting minutes |

### Suite 10: Quality Management (QM)

| Module | Key Features |
|---|---|
| **Inspection Plans** | Inspection characteristics, sampling procedures, acceptance criteria |
| **Quality Inspections** | GR inspection, in-process inspection, final inspection, skip logic |
| **Quality Notifications** | Defect recording, root cause analysis, corrective actions |
| **Non-Conformance** | NCR management, disposition, containment actions |
| **Statistical Process Control** | Control charts (X-Bar, R, P, C charts), process capability (Cpk) |
| **Calibration Management** | Measurement equipment, calibration schedules, certificates |
| **Supplier Quality** | Vendor qualification audits, incoming quality data |
| **Audit Management** | Internal/external audits, findings, action tracking |
| **Document Control** | SOPs, work instructions, quality manual, revision control |

### Suite 11: Environment, Health & Safety (EHS)

| Module | Key Features |
|---|---|
| **Incident Management** | Incident reporting, investigation, root cause, corrective actions |
| **Risk Assessment** | Hazard identification, risk matrix, control measures |
| **Chemical Management** | SDS management, GHS labeling, REACH/RoHS compliance |
| **Waste Management** | Waste streams, disposal tracking, compliance reporting |
| **Occupational Health** | Medical surveillance, fitness for duty, health monitoring |
| **Environmental Reporting** | Emissions, energy, water consumption tracking |
| **Regulatory Compliance** | Compliance register, permit tracking, regulatory deadlines |
| **Training & Competency** | Safety training records, certifications per role |
| **Permit to Work** | PTW system for high-risk activities (hot work, confined space) |
| **ESG Reporting** | GHG scope 1/2/3, sustainability KPIs, ESG dashboards |

### Suite 12: Analytics & Business Intelligence

| Module | Key Features |
|---|---|
| **Real-time Dashboards** | Role-based KPI dashboards, drag-and-drop |
| **Report Builder** | Self-service cross-module reports, pivot tables |
| **Saved Searches** | Ad-hoc search across all records |
| **Financial Analytics** | P&L, balance sheet, cash flow, ratio analysis |
| **Supply Chain Analytics** | Inventory turns, supplier performance, demand accuracy |
| **HR Analytics** | Headcount, attrition, cost-per-hire, absenteeism |
| **Sales Analytics** | Pipeline, win rate, revenue forecast, customer analytics |
| **Data Export** | Excel, CSV, PDF, API, Webhook to data warehouse |
| **Scheduled Reports** | Email delivery of reports on schedule |
| **AI Insights** | Anomaly detection, forecast suggestions, outlier alerts |

### Suite 13: E-Commerce & Portal

| Module | Key Features |
|---|---|
| **B2B Commerce** | Customer-specific pricing, credit accounts, approval workflows |
| **B2C Storefront** | Product catalog, cart, checkout, payment gateways |
| **Customer Portal** | Order tracking, invoice access, support tickets, service requests |
| **Supplier Portal** | PO acknowledgment, ASN submission, invoice upload |
| **Product Catalog** | Rich product data, variants, pricing, availability |
| **Payment Integration** | Stripe, PayPal, bank transfer, local payment methods |
| **Multi-site** | Multiple storefronts per tenant |

---

## 7. Infrastructure & DevOps

### GCP Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ GCP Project: sttps-production                                   │
│                                                                 │
│  Cloud DNS (sttps.live)                                         │
│       │                                                         │
│  Cloud CDN ─────────────────────── GCS (static assets)         │
│       │                                                         │
│  Cloud Armor (OWASP rules)                                      │
│       │                                                         │
│  Cloud Load Balancing                                           │
│       │                                                         │
│  ┌────┴───────────────────────────────┐                         │
│  │         GKE Cluster                │                         │
│  │   ┌──────┐ ┌──────┐ ┌──────┐      │                         │
│  │   │Core  │ │Finance│ │SCM   │ ...  │                         │
│  │   │Pods  │ │Pods  │ │Pods  │      │                         │
│  │   └──────┘ └──────┘ └──────┘      │                         │
│  │   ┌──────────────────────────┐    │                         │
│  │   │  Kong API Gateway         │    │                         │
│  │   └──────────────────────────┘    │                         │
│  └────────────────────────────────────┘                         │
│       │                                                         │
│  ┌────┴─────────────────────────────────┐                       │
│  │         Private VPC Subnet            │                       │
│  │  Cloud SQL PostgreSQL (HA)            │                       │
│  │  Memorystore Redis (Cluster Mode)     │                       │
│  │  Confluent Kafka (on GCP)             │                       │
│  │  Elasticsearch (on GKE)              │                       │
│  └───────────────────────────────────────┘                      │
│                                                                 │
│  SendGrid (Email) │ Cloud Pub/Sub │ Cloud Logging │ Secret Mgr  │
└─────────────────────────────────────────────────────────────────┘
```

### Environments

| Environment | Purpose | Scale |
|---|---|---|
| **development** | Local Docker Compose | Single machine |
| **staging** | Pre-production testing | 20% of prod spec |
| **production** | Live customer data | Full HA, Multi-AZ |

### Kubernetes Deployment Strategy

- **Namespaces**: `platform-core`, `finance`, `scm`, `manufacturing`, `hcm`, etc.
- **HPA** (Horizontal Pod Autoscaler): Scale pods based on CPU/memory
- **PDB** (Pod Disruption Budgets): Ensure minimum availability during updates
- **Rolling updates**: Zero-downtime deployments
- **Helm charts**: Standardized deployment configs

### CI/CD Pipeline (GitHub Actions)

```
Push to branch →
  ├── Lint (ESLint, Prettier)
  ├── Type Check (TypeScript)
  ├── Unit Tests (Jest)
  ├── Build Docker Image
  └── Push to Artifact Registry (staging tag)

PR to main →
  ├── All above +
  ├── Integration Tests (Supertest)
  ├── Security scan (Snyk, Trivy)
  └── Preview deployment (staging)

Merge to main →
  ├── Build production Docker image
  ├── Push to Artifact Registry (production tag)
  ├── Helm upgrade (rolling deploy to GKE)
  ├── Smoke tests
  └── Slack notification
```

### Monorepo Structure

```
sttps/
├── apps/
│   ├── web/                    # Next.js frontend
│   ├── api-core/               # Core platform API (NestJS)
│   ├── api-finance/            # Finance module API
│   ├── api-scm/                # SCM module API
│   ├── api-manufacturing/      # Manufacturing API
│   ├── api-hcm/                # HCM API
│   ├── api-eam/                # EAM API
│   ├── api-fsm/                # FSM API
│   ├── api-crm/                # CRM/Sales API
│   ├── api-project/            # Project Management API
│   ├── api-analytics/          # Reporting & BI API
│   └── mobile/                 # React Native technician app
├── packages/
│   ├── ui/                     # Shared component library
│   ├── schemas/                # Shared Zod schemas (frontend + backend)
│   ├── types/                  # Shared TypeScript types
│   ├── utils/                  # Shared utilities
│   ├── prisma/                 # Prisma client + schema files
│   ├── config/                 # Shared ESLint, TS, Tailwind configs
│   └── kafka/                  # Kafka producer/consumer helpers
├── infrastructure/
│   ├── terraform/              # GCP infrastructure as code
│   ├── helm/                   # Kubernetes Helm charts
│   └── docker/                 # Dockerfiles
├── scripts/
│   ├── migrate.sh              # Run DB migrations
│   ├── seed.sh                 # Seed demo data
│   └── provision-tenant.sh     # New tenant schema creation
├── docs/
│   ├── api/                    # OpenAPI specs
│   └── architecture/           # Architecture decision records (ADRs)
├── turbo.json
├── package.json
└── pnpm-workspace.yaml
```

---

## 8. API Design Strategy

### REST API — Standard Operations

```
Base URL: api.sttps.live/v1

# Tenant-scoped (all authenticated endpoints)
GET    /finance/gl/accounts
POST   /finance/gl/journal-entries
GET    /finance/gl/journal-entries/{id}
PUT    /finance/gl/journal-entries/{id}
DELETE /finance/gl/journal-entries/{id}

# Company context passed via header
X-Company-Id: {companyId}
Authorization: Bearer {jwt}
```

### GraphQL — Complex Queries & Reporting

Used for the analytics layer where clients need flexible query shapes:

```graphql
query DashboardData($companyId: ID!, $period: PeriodInput!) {
  financialSummary(companyId: $companyId, period: $period) {
    revenue
    expenses
    netProfit
    cashPosition
  }
  topCustomers(companyId: $companyId, limit: 10) {
    name
    revenue
    outstandingBalance
  }
  inventoryAlerts(companyId: $companyId) {
    item { name, sku }
    currentStock
    reorderPoint
  }
}
```

### WebSocket — Real-time Events

```
ws://api.sttps.live/realtime

Events pushed to connected clients:
- approval.requested (workflow approval needed)
- alert.inventory.low (stock below reorder point)
- alert.maintenance.due (maintenance due)
- notification.new (general notification)
- dashboard.kpi.updated (live KPI refresh)
```

### Event-Driven (Kafka Topics)

```
Topics (organized by domain):

finance.journal-entry.posted
finance.invoice.created
finance.payment.processed

scm.purchase-order.approved
scm.goods-receipt.posted
scm.stock.updated

manufacturing.production-order.started
manufacturing.production-order.completed

hcm.employee.hired
hcm.payroll.run-completed

eam.work-order.created
eam.asset.condition-alert
```

---

## 9. Frontend Architecture

### Page Structure (Next.js App Router)

```
app/
├── (auth)/
│   ├── login/
│   ├── signup/
│   └── sso/
├── (platform)/
│   ├── layout.tsx              # Shell: sidebar, topbar, notifications
│   ├── dashboard/
│   ├── finance/
│   │   ├── general-ledger/
│   │   ├── accounts-payable/
│   │   ├── accounts-receivable/
│   │   └── reports/
│   ├── procurement/
│   ├── inventory/
│   ├── manufacturing/
│   ├── sales/
│   ├── crm/
│   ├── eam/
│   ├── field-service/
│   ├── hr/
│   ├── projects/
│   ├── quality/
│   ├── ehs/
│   └── analytics/
├── admin/                      # Platform admin panel
└── portal/                     # Customer/Supplier self-service portal
```

### Component Design System

```
packages/ui/
├── primitives/         # Button, Input, Select, Checkbox (shadcn/ui base)
├── data-display/       # DataGrid, Table, List, Badge, Avatar
├── forms/              # FormField, FormSection, DatePicker, CurrencyInput
├── layouts/            # PageLayout, SplitView, Modal, Drawer, Tabs
├── charts/             # LineChart, BarChart, PieChart, GaugeChart
├── erp-specific/       # JournalEntryForm, PurchaseOrderCard, WorkOrderTimeline
└── feedback/           # Toast, Alert, LoadingSpinner, EmptyState
```

### Key UX Principles for ERP

1. **Keyboard-first**: Power users never lift their hands from the keyboard. Global command palette (Cmd+K)
2. **Configurable columns**: Users save their own column preferences per grid
3. **Bulk operations**: Select many rows → approve, post, delete in one action
4. **Inline editing**: Click a cell to edit without opening a separate form
5. **Sticky filters**: Filters remember last state per user per screen
6. **Drill-down everywhere**: Click any amount → see underlying journal entries → see source documents
7. **Offline awareness**: Graceful degradation, queue writes when offline

---

## 10. Implementation Roadmap (Phases)

### Phase 0 — Foundation (Month 1–3)
*Goal: Working platform shell with one complete module.*

**Infrastructure:**
- GCP project setup, VPC, GKE cluster, Cloud SQL, Memorystore, Confluent Kafka
- GitHub organization, monorepo setup with Turborepo
- CI/CD pipeline (GitHub Actions → Artifact Registry → GKE)
- Domain setup: sttps.live, Cloud DNS, SSL certificates
- Monitoring: Grafana, Prometheus, Cloud Monitoring, Sentry

**Platform Core:**
- Tenant signup flow (create tenant → provision schema → send welcome email)
- Authentication: email/password login, JWT, refresh tokens, MFA (TOTP)
- Company setup: create companies, fiscal year, currency, chart of accounts structure
- User management: invite users, assign roles, RBAC permission system
- Workflow engine: configurable approval rules (rule builder)
- Notification service: in-app + email
- Audit trail: every write logged
- File upload service: GCS-backed attachments
- Global settings: number formats, date formats, languages

**Deliverable**: Tenant can sign up, configure their company, invite users, set permissions.

---

### Phase 1 — Financial Core (Month 3–7)
*Goal: Complete double-entry accounting.*

**General Ledger:**
- Chart of accounts (import from Excel, manual setup)
- Journal entry creation, validation, posting
- Period open/close management
- Fiscal year management
- Financial statements: Trial Balance, P&L, Balance Sheet
- Multi-currency with exchange rates
- Parallel ledgers (IFRS + local GAAP)

**Accounts Payable:**
- Vendor master data management
- Purchase invoice entry (manual + OCR-ready)
- Invoice approval workflow
- Payment run (batch payments, bank file generation)
- Aging report

**Accounts Receivable:**
- Customer master
- Customer invoice creation
- Payment posting (manual allocation)
- Dunning (overdue reminders)
- Aging report

**Bank & Cash:**
- Bank account setup
- Bank statement import (CSV, OFX)
- Bank reconciliation (auto-match + manual)

**Tax Engine:**
- Tax code setup per country
- Tax calculation on transactions
- Tax return data extraction

**Deliverable**: CFO can run month-end close, generate P&L and balance sheet, process vendor payments.

---

### Phase 2 — Procurement & Inventory (Month 7–10)
*Goal: Procure-to-pay cycle complete.*

**Procurement:**
- Supplier master
- Purchase requisition → PR approval
- RFQ (Request for Quotation)
- Purchase order creation (from approved PR or manual)
- PO approval workflow
- Goods receipt (GRN)
- 3-way match: PO ↔ GRN ↔ Invoice
- Vendor invoice automated posting

**Inventory:**
- Item/product master
- Multi-warehouse setup
- Stock movements (receipt, issue, transfer)
- Inventory valuation (FIFO, AVCO, Standard)
- Stock counting / cycle counting
- Batch and serial number tracking
- Reorder point alerts
- Inventory reports: stock on hand, movements, valuation

**Warehouse:**
- Warehouse structure (zones, aisles, bins)
- Put-away rules
- Picking (FIFO, FEFO)
- Barcode scanning integration (mobile browser or handheld)

**Deliverable**: Complete procure-to-pay with 3-way matching, inventory tracking.

---

### Phase 3 — Sales & CRM (Month 10–13)
*Goal: Quote-to-cash cycle complete.*

**CRM:**
- Lead capture, pipeline management
- Contact and account management
- Activity tracking (calls, meetings, emails)
- Opportunity management

**Sales:**
- Product/service catalog
- Quotation creation, approval, send to customer
- Sales order (from quote or standalone)
- Delivery/shipment processing
- Customer invoice generation
- Customer payment collection

**Pricing:**
- Price lists (standard, customer-specific)
- Volume discounts, tiered pricing
- Promotional pricing with validity dates

**ATP Check:**
- Available-to-Promise against inventory + production

**Deliverable**: Full quote-to-cash, sales pipeline visible to sales team.

---

### Phase 4 — Manufacturing (Month 13–18)
*Goal: Production planning and execution.*

**BOM & Routing:**
- Bill of Materials (multi-level)
- Work centers and machines
- Routing operations

**MRP Engine:**
- Demand calculation (from sales orders + forecast)
- Supply proposal generation (planned orders)
- MRP run (full + net change)
- Exception messages

**Production:**
- Convert planned orders to production orders
- Material staging (goods issue to production)
- Operation confirmations
- Yield and scrap recording
- Goods receipt from production

**Product Costing:**
- Standard cost roll-up
- Actual cost capture
- WIP valuation
- Variance analysis (material, labor, overhead)

**Deliverable**: Manufacturer can plan and execute production with full cost visibility.

---

### Phase 5 — Human Capital Management (Month 18–22)
*Goal: Hire-to-retire.*

**HR Core:**
- Employee records
- Org chart
- Position management

**Time & Attendance:**
- Shift scheduling
- Clock-in/clock-out (web + mobile + kiosk)
- Absence and leave management

**Payroll Engine:**
- Pay structure setup
- Gross-to-net calculation
- Country-specific tax (start with 3–5 highest-demand markets)
- Payslip generation (PDF)
- Payroll journal posting to GL

**Recruitment:**
- Job postings
- Application pipeline
- Interview scheduling
- Offer letter generation

**Performance:**
- Goal setting
- Appraisal cycles
- Manager review submissions

**Deliverable**: Full HR cycle — hire, manage attendance, run payroll, post to GL.

---

### Phase 6 — Asset Management & Field Service (Month 22–27)
*Goal: Asset-intensive and service industries supported.*

**EAM:**
- Asset master and hierarchy
- Preventive maintenance plans
- Work order management (corrective, preventive)
- Mobile maintenance app
- Cost tracking per asset

**FSM:**
- Service work orders
- Technician scheduling and dispatch
- Technician mobile app (React Native)
- Service contracts and SLA tracking
- Customer portal for service requests

**IoT Foundation:**
- Device registration
- Sensor data ingestion (MQTT/REST → TimescaleDB)
- Condition alert thresholds
- Predictive maintenance rules

**Deliverable**: Utility, telecom, energy and facilities management customers can onboard.

---

### Phase 7 — Quality, EHS & Project Management (Month 27–32)
*Goal: Complete the enterprise feature set.*

**Quality Management** — Full QM suite
**EHS** — Incident management, risk, permit to work, environmental reporting
**Project Management** — Full WBS, Gantt, earned value, project billing

---

### Phase 8 — Advanced Features (Month 32+)
*Ongoing competitive differentiation.*

- AI / Copilot layer (LLM-powered: journal entry suggestion, demand forecasting, anomaly detection)
- Advanced analytics (ClickHouse OLAP, self-service BI)
- E-Commerce / B2B portal
- Marketplace for 3rd-party integrations
- Advanced supply chain optimization
- ESG reporting and carbon footprint tracking
- Multi-language UI (Arabic RTL, Chinese, French, Spanish, German)
- ERP mobile app (React Native companion app)

---

## 11. Team Structure

### Year 1 (Building Foundation + Finance + SCM)

| Role | Count | Responsibility |
|---|---|---|
| CTO / Lead Architect | 1 | Overall technical vision, architecture decisions |
| Platform Backend Engineers | 2 | Core platform, auth, tenant management, workflow engine |
| Finance Backend Engineers | 2 | GL, AP, AR, tax engine |
| SCM Backend Engineers | 2 | Inventory, procurement, warehouse |
| Frontend Engineers | 3 | Next.js UI across all modules |
| DevOps / Infrastructure | 1 | GCP, Kubernetes, CI/CD, monitoring |
| QA Engineer | 1 | Test automation, manual testing |
| Product Manager | 1 | Feature prioritization, customer discovery |
| UX Designer | 1 | Design system, screen designs |
| **Total** | **14** | |

### Year 2 (Manufacturing, HR, Sales)

Add:
- Manufacturing Backend Team (2)
- HR / Payroll Team (2)
- CRM / Sales Team (1)
- Mobile Developer (1) — React Native
- Data Engineer (1) — Analytics, BI
- 2 more Frontend Engineers
- Customer Success / Onboarding (2)
- **+11 new hires → ~25 total**

### Year 3 (EAM, FSM, Advanced)

Add:
- EAM / FSM Team (2)
- AI / ML Engineer (1–2)
- Security Engineer (1)
- Solutions Architects (2) — implementation support
- Localization / Compliance Specialists
- **~35–40 total**

---

## 12. Cost Estimates

### GCP Infrastructure (Monthly, Production)

| Service | Estimated Cost (USD/month) |
|---|---|
| GKE (3 node groups, 6–12 nodes) | $1,400–$2,800 |
| Cloud SQL PostgreSQL (HA, n2-standard-8) | $750–$1,400 |
| Memorystore Redis (M1 Standard × 3) | $450 |
| Confluent Kafka (on GCP) | $400 |
| Elasticsearch (on GKE) | $300 |
| GCS (1 TB + transfer) | $80–$250 |
| Cloud CDN | $80–$180 |
| Cloud Load Balancing, Cloud Armor, Cloud DNS | $200 |
| SendGrid, Cloud Pub/Sub, misc | $100 |
| **Total Infrastructure** | **~$3,800–$6,800/month** |

At scale (1,000+ tenants), this is <$10/tenant/month infrastructure cost.

### SaaS Pricing (Recommended)

| Tier | Monthly Price | Included |
|---|---|---|
| **Starter** | $299/month | 10 users, Finance + CRM + Inventory |
| **Professional** | $999/month | 50 users, all core modules |
| **Enterprise** | Custom | Unlimited users, all modules, SLA, SSO, custom domain |

Target: 100 paying customers at avg $1,000/month = $1.2M ARR to break even.

---

## 13. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Scope creep (trying to build everything at once) | High | High | Phase gates — no phase starts until previous is stable and has real users |
| Payroll tax compliance complexity | High | High | Use tax calculation service APIs (Avalara, Taxjar) for tax layer; partner with local payroll providers |
| ERP implementation takes too long to first customer | Medium | High | Launch Finance module alone — accounting is standalone value |
| Multi-tenant data breach | Low | Critical | Schema isolation, pen tests, WAF, SOC 2 audit |
| MRP engine performance (complex calculations) | Medium | Medium | Run MRP as async job; optimize with PostgreSQL materialized views and proper indexing |
| Customer switching costs from SAP/Oracle | High | Medium | Provide import tools for SAP data migration; offer free implementation support for first 10 enterprise customers |
| Compliance in every country (payroll, tax) | High | High | Start with 3–5 countries; expand localization based on customer geography |
| Key engineering talent leaving | Medium | High | Documentation-first culture; no single points of failure; competitive equity structure |

---

## 14. Where to Start — Day 1 Actions

### Week 1: Foundation

1. **Register the domain** `sttps.live` on Google Domains or Cloudflare
2. **Create GCP Organization** with separate projects: `sttps-dev`, `sttps-staging`, `sttps-production`
3. **Initialize GitHub organization** `sttps-platform` with monorepo
4. **Bootstrap the monorepo**:
   ```bash
   pnpm create turbo@latest sttps --template with-tailwind
   ```
5. **Set up Terraform** for GCP infrastructure (VPC, GKE, Cloud SQL skeleton)
6. **Design the database schema** for: tenants, companies, users, roles, permissions
7. **Build Auth first** — login, JWT, refresh token, MFA

### Week 2: Platform Core

8. **Tenant provisioning flow**: Sign up → Schema created → Company wizard → Invite users
9. **RBAC system**: Roles, permissions, middleware, guards
10. **UI shell**: Sidebar navigation (module-aware), top bar, user menu, notification bell
11. **Set up Prisma** with multi-schema support and tenant middleware

### Week 3–4: Chart of Accounts & General Ledger MVP

12. **COA setup**: Create/import chart of accounts
13. **Journal entry form**: Debit/credit lines, validation (debits = credits), posting
14. **Trial balance report**: Real-time from posted journals
15. **Period management**: Open/close periods, prevent posting to closed periods

### First Customer Milestone (Month 2–3)

Get **one real company** using the Finance module:
- One company running their entire AP/AR/GL in STTPS
- Generates a real financial statement at month-end
- Gives you real feedback on UX and data model assumptions

This is infinitely more valuable than building 13 modules with no users.

### Critical Technical Decisions to Make Before Writing Code

1. **Decide definitively on the ORM**: Prisma vs TypeORM vs Drizzle — this is hard to change later. Prisma recommended for type safety and schema-first multi-tenant migrations.
2. **Decide on API style**: REST-only to start (simpler), add GraphQL in Phase 2 for analytics. Do not build both from day one.
3. **Decide on workflow engine**: Build custom (complex) or embed Temporal.io (recommended for complex approval flows).
4. **Decide on number precision library**: Use `decimal.js` everywhere for money — never `float`.
5. **Decide on report generation**: Puppeteer (HTML → PDF) vs dedicated service like Jasper Reports. Puppeteer is simpler to start.

---

## Summary: The Stack in One Page

```
Domain:       sttps.live (Cloud DNS + Cloud CDN)
Frontend:     Next.js 15 + TypeScript + Tailwind + shadcn/ui
Backend:      NestJS + TypeScript (modular monolith → microservices)
ORM:          Prisma (schema-per-tenant multi-tenant)
Database:     PostgreSQL 16 (Cloud SQL HA)
Cache:        Redis 7 (Memorystore Cluster)
Search:       Elasticsearch (on GKE)
Queue:        Apache Kafka (Confluent on GCP) + BullMQ
Files:        Google Cloud Storage
Auth:         JWT + TOTP MFA + SAML SSO
Infra:        GKE (Kubernetes) on GCP
CI/CD:        GitHub Actions → Artifact Registry → Helm → GKE
Monitoring:   Grafana + Prometheus + Cloud Monitoring + Sentry
Monorepo:     Turborepo + pnpm
```

---

*Document version 1.0 — STTPS Platform Architecture*
