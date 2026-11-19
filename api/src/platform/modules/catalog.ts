/**
 * The module catalogue (blueprint §2 and §43): every module the platform
 * offers, what it depends on, and the permissions it defines. Permission
 * codes follow `<module>.<entity>.<action>`.
 *
 * `available` marks modules that are built. Tenants can only switch on
 * available modules; the rest appear as "coming soon" in navigation.
 */

export type ModuleGroup = "platform" | "core" | "finance" | "people" | "operations" | "advanced" | "intelligence";

export interface PermissionDefinition {
  code: string;
  name: string;
  module: string;
  action: string;
}

export interface ModuleDefinition {
  key: string;
  name: string;
  description: string;
  group: ModuleGroup;
  /** Always on; cannot be switched off. */
  core?: boolean;
  available: boolean;
  dependsOn: string[];
  permissions: PermissionDefinition[];
}

const CRUD = ["view", "create", "edit", "delete"] as const;

/** Standard view/create/edit/delete permissions plus any extra actions for one entity. */
export function entityPermissions(
  module: string,
  entity: string,
  label: string,
  extra: Record<string, string> = {},
): PermissionDefinition[] {
  const verbs: Record<string, string> = { view: "View", create: "Create", edit: "Edit", delete: "Archive" };
  return [
    ...CRUD.map((action) => ({ code: `${module}.${entity}.${action}`, name: `${verbs[action]} ${label}`, module, action })),
    ...Object.entries(extra).map(([action, name]) => ({ code: `${module}.${entity}.${action}`, name, module, action })),
  ];
}

function mod(def: Omit<ModuleDefinition, "permissions" | "dependsOn"> & Partial<Pick<ModuleDefinition, "permissions" | "dependsOn">>): ModuleDefinition {
  return { permissions: [], dependsOn: [], ...def };
}

export const MODULES: ModuleDefinition[] = [
  // Platform
  mod({
    key: "platform",
    name: "Platform",
    description: "Companies, users, roles, settings, audit and module activation.",
    group: "platform",
    core: true,
    available: true,
    permissions: [
      ...entityPermissions("platform", "user", "users"),
      ...entityPermissions("platform", "role", "roles"),
      { code: "platform.company.edit", name: "Edit company settings", module: "platform", action: "edit" },
      { code: "platform.audit.view", name: "View audit log", module: "platform", action: "view" },
      { code: "platform.settings.edit", name: "Edit settings", module: "platform", action: "edit" },
      ...entityPermissions("platform", "customField", "custom fields"),
      ...entityPermissions("platform", "savedView", "shared saved views"),
    ],
  }),
  mod({
    key: "org",
    name: "Organisation",
    description: "Branches, departments, teams, cost centres, business units, fiscal calendar and currencies.",
    group: "platform",
    core: true,
    available: true,
    permissions: [
      ...entityPermissions("org", "branch", "branches"),
      ...entityPermissions("org", "department", "departments"),
      ...entityPermissions("org", "team", "teams"),
      ...entityPermissions("org", "costCentre", "cost centres"),
      ...entityPermissions("org", "businessUnit", "business units"),
      ...entityPermissions("org", "fiscalYear", "fiscal years", { close: "Close or lock fiscal periods" }),
      ...entityPermissions("org", "exchangeRate", "exchange rates"),
    ],
  }),
  mod({
    key: "workflow",
    name: "Approvals & Workflow",
    description: "Configurable approval workflows, delegation and escalation.",
    group: "platform",
    core: true,
    available: true,
    permissions: [
      ...entityPermissions("workflow", "definition", "approval workflows"),
      ...entityPermissions("workflow", "delegation", "delegations of other users"),
      { code: "workflow.request.view", name: "View all approval requests", module: "workflow", action: "view" },
      { code: "workflow.request.manage", name: "Cancel any approval request", module: "workflow", action: "manage" },
    ],
  }),
  mod({
    key: "documents",
    name: "Documents",
    description: "Files, versions and document management.",
    group: "platform",
    available: true,
    permissions: [
      ...entityPermissions("documents", "folder", "document folders"),
      ...entityPermissions("documents", "document", "documents"),
    ],
  }),
  mod({
    key: "calendar",
    name: "Calendar",
    description: "Shared calendars, events and meetings.",
    group: "platform",
    available: true,
    dependsOn: ["hr", "projects"],
    permissions: [...entityPermissions("calendar", "event", "events")],
  }),

  // Core operations
  mod({
    key: "crm",
    name: "CRM",
    description: "Leads, contacts, customers, opportunities and activities.",
    group: "core",
    available: true,
    permissions: [
      ...entityPermissions("crm", "lead", "leads", { convert: "Convert leads" }),
      ...entityPermissions("crm", "contact", "contacts"),
      ...entityPermissions("crm", "account", "customers"),
      ...entityPermissions("crm", "opportunity", "opportunities"),
      ...entityPermissions("crm", "activity", "activities"),
      { code: "crm.settings.edit", name: "Edit CRM settings (scoring, routing)", module: "crm", action: "edit" },
      { code: "crm.analytics.view", name: "View CRM analytics", module: "crm", action: "view" },
    ],
  }),
  mod({
    key: "products",
    name: "Products & Services",
    description: "Product master, variants, units and pricing.",
    group: "core",
    available: true,
    permissions: [
      ...entityPermissions("products", "product", "products"),
      ...entityPermissions("products", "category", "product categories"),
      ...entityPermissions("products", "uom", "units of measure"),
      ...entityPermissions("products", "priceList", "price lists and prices"),
      ...entityPermissions("products", "discountRule", "discount rules"),
    ],
  }),
  mod({
    key: "sales",
    name: "Sales",
    description: "Quotes, orders, fulfilment and returns.",
    group: "core",
    available: true,
    dependsOn: ["products", "crm", "inventory"],
    permissions: [
      ...entityPermissions("sales", "quote", "quotes"),
      ...entityPermissions("sales", "order", "sales orders"),
      ...entityPermissions("sales", "delivery", "deliveries"),
      ...entityPermissions("sales", "return", "returns"),
      { code: "sales.settings.edit", name: "Edit sales settings (tax rates, thresholds)", module: "sales", action: "edit" },
    ],
  }),
  mod({
    key: "inventory",
    name: "Inventory",
    description: "Stock, warehouses, movements, counts and traceability.",
    group: "core",
    available: true,
    dependsOn: ["products"],
    permissions: [
      ...entityPermissions("inventory", "warehouse", "warehouses and bin locations"),
      ...entityPermissions("inventory", "adjustment", "stock adjustments"),
      ...entityPermissions("inventory", "transfer", "stock transfers"),
      ...entityPermissions("inventory", "count", "stock counts", { approve: "Post stock counts" }),
      { code: "inventory.stock.view", name: "View stock levels and movements", module: "inventory", action: "view" },
      { code: "inventory.stock.edit", name: "Edit reorder settings", module: "inventory", action: "edit" },
      { code: "inventory.valuation.view", name: "View stock value and costs", module: "inventory", action: "view" },
      { code: "inventory.settings.edit", name: "Edit inventory settings", module: "inventory", action: "edit" },
    ],
  }),
  mod({
    key: "procurement",
    name: "Procurement",
    description: "Suppliers, requisitions, purchase orders and receipts.",
    group: "core",
    available: true,
    dependsOn: ["products", "inventory"],
    permissions: [
      ...entityPermissions("procurement", "supplier", "suppliers"),
      ...entityPermissions("procurement", "requisition", "purchase requisitions"),
      ...entityPermissions("procurement", "rfq", "requests for quotation"),
      ...entityPermissions("procurement", "order", "purchase orders"),
      ...entityPermissions("procurement", "receipt", "goods receipts and supplier returns"),
      { code: "procurement.analytics.view", name: "View procurement analytics", module: "procurement", action: "view" },
    ],
  }),

  // Finance
  mod({
    key: "finance",
    name: "Finance",
    description: "Ledger, receivables, payables, banking, tax, budgets and reports.",
    group: "finance",
    available: true,
    permissions: [
      ...entityPermissions("finance", "account", "chart of accounts"),
      ...entityPermissions("finance", "journal", "journals"),
      ...entityPermissions("finance", "invoice", "customer invoices and credit notes"),
      ...entityPermissions("finance", "receipt", "customer receipts"),
      ...entityPermissions("finance", "bill", "supplier bills and debit notes"),
      ...entityPermissions("finance", "payment", "supplier payments"),
      ...entityPermissions("finance", "budget", "budgets"),
      { code: "finance.bank.view", name: "View bank accounts, statements and reconciliations", module: "finance", action: "view" },
      { code: "finance.bank.edit", name: "Transfer money, import statements, match and reconcile", module: "finance", action: "edit" },
      { code: "finance.bill.override", name: "Post supplier bills that do not match the order and receipts", module: "finance", action: "edit" },
      { code: "finance.journal.control", name: "Post manual journals to control accounts", module: "finance", action: "edit" },
      { code: "finance.settings.edit", name: "Edit finance settings and posting rules", module: "finance", action: "edit" },
      { code: "finance.reports.view", name: "View financial statements and ledgers", module: "finance", action: "view" },
    ],
  }),
  mod({
    key: "expenses",
    name: "Expenses",
    description: "Employee expense claims and reimbursement.",
    group: "finance",
    available: true,
    dependsOn: ["finance"],
    permissions: [...entityPermissions("expenses", "category", "expense categories"), ...entityPermissions("expenses", "claim", "expense claims")],
  }),
  mod({
    key: "assets",
    name: "Assets",
    description: "Asset register, assignment, depreciation and audits.",
    group: "finance",
    available: true,
    dependsOn: ["finance"],
    permissions: [
      ...entityPermissions("assets", "category", "asset categories"),
      ...entityPermissions("assets", "asset", "fixed assets"),
      ...entityPermissions("assets", "audit", "asset audits"),
      ...entityPermissions("assets", "repair", "repairs"),
    ],
  }),

  // People
  mod({
    key: "hr",
    name: "HR & People",
    description: "Employees, organisation chart, recruitment, attendance, leave and performance.",
    group: "people",
    available: true,
    permissions: [
      ...entityPermissions("hr", "employee", "employees", { compensation: "View and edit salary, bank details and national ID", terminate: "Terminate or reinstate employees" }),
      ...entityPermissions("hr", "position", "positions"),
      ...entityPermissions("hr", "jobGrade", "job grades"),
      ...entityPermissions("hr", "jobRequisition", "job requisitions"),
      ...entityPermissions("hr", "jobPosting", "job postings"),
      ...entityPermissions("hr", "candidate", "candidates"),
      ...entityPermissions("hr", "checklist", "onboarding and offboarding checklists"),
      ...entityPermissions("hr", "attendanceRecord", "attendance records"),
      ...entityPermissions("hr", "device", "attendance devices"),
      ...entityPermissions("hr", "shiftTemplate", "shift templates"),
      ...entityPermissions("hr", "shiftAssignment", "shift assignments"),
      ...entityPermissions("hr", "leavePolicy", "leave policies"),
      ...entityPermissions("hr", "holiday", "holidays"),
      ...entityPermissions("hr", "leaveRequest", "leave requests"),
      ...entityPermissions("hr", "performanceCycle", "performance cycles"),
      ...entityPermissions("hr", "goal", "goals"),
      ...entityPermissions("hr", "review", "reviews"),
      ...entityPermissions("hr", "developmentPlan", "development plans"),
      ...entityPermissions("hr", "announcement", "announcements"),
      ...entityPermissions("hr", "hrRequest", "HR requests"),
      ...entityPermissions("hr", "equipmentRequest", "equipment requests"),
      ...entityPermissions("hr", "statutoryRate", "statutory rates"),
      ...entityPermissions("hr", "apitBracket", "APIT brackets"),
      ...entityPermissions("hr", "salaryComponent", "salary components"),
      ...entityPermissions("hr", "salaryStructure", "salary structures"),
      ...entityPermissions("hr", "loan", "loans and advances"),
      ...entityPermissions("hr", "payrollRun", "payroll runs"),
    ],
  }),
  // Operations
  mod({
    key: "projects",
    name: "Projects",
    description: "Projects, tasks, time tracking and project billing.",
    group: "operations",
    available: true,
    permissions: [
      ...entityPermissions("projects", "project", "projects"),
      ...entityPermissions("projects", "phase", "project phases"),
      ...entityPermissions("projects", "milestone", "milestones"),
      ...entityPermissions("projects", "projectCost", "project costs"),
      { code: "tasks.allTasks.view", name: "View every task and time entry, not just my own", module: "projects", action: "view" },
      { code: "tasks.timeEntry.approve", name: "Approve time entries", module: "projects", action: "edit" },
      { code: "projects.billing.edit", name: "Raise an invoice from a project", module: "projects", action: "edit" },
    ],
  }),
  mod({
    key: "support",
    name: "Support",
    description: "Tickets, SLAs and the customer portal.",
    group: "operations",
    available: true,
    dependsOn: ["crm"],
    permissions: [
      ...entityPermissions("support", "slaPolicy", "SLA policies"),
      ...entityPermissions("support", "ticket", "tickets", { manage: "Assign, escalate, merge and reopen any ticket" }),
      ...entityPermissions("support", "portalUser", "customer portal logins"),
    ],
  }),
  mod({
    key: "maintenance",
    name: "Maintenance",
    description: "Work orders, maintenance plans and field service.",
    group: "operations",
    available: true,
    dependsOn: ["assets"],
    permissions: [...entityPermissions("maintenance", "plan", "maintenance plans"), ...entityPermissions("maintenance", "workOrder", "work orders")],
  }),

  // Advanced operations
  mod({
    key: "manufacturing",
    name: "Manufacturing",
    description: "BOMs, routings, production orders and MRP.",
    group: "advanced",
    available: true,
    dependsOn: ["inventory"],
    permissions: [
      ...entityPermissions("manufacturing", "workCentre", "work centres"),
      ...entityPermissions("manufacturing", "machine", "machines"),
      ...entityPermissions("manufacturing", "bom", "bills of materials"),
      ...entityPermissions("manufacturing", "routing", "routings"),
      ...entityPermissions("manufacturing", "productionOrder", "production orders"),
    ],
  }),
  mod({ key: "quality", name: "Quality", description: "Inspections, non-conformance and corrective actions.", group: "advanced", available: false }),
  mod({ key: "ehs", name: "Health & Safety", description: "Incidents, risk assessments and permits to work.", group: "advanced", available: false }),
  mod({ key: "pos", name: "POS & Retail", description: "Point of sale, shifts, loyalty and promotions.", group: "advanced", available: false, dependsOn: ["sales", "inventory"] }),
  mod({ key: "logistics", name: "Logistics & Fleet", description: "Delivery routes, drivers, vehicles and fleet costs.", group: "advanced", available: false, dependsOn: ["sales"] }),
  mod({ key: "marketing", name: "Marketing", description: "Campaigns, segments and marketing automation.", group: "advanced", available: false, dependsOn: ["crm"] }),

  // Intelligence
  mod({ key: "analytics", name: "Analytics & Reports", description: "Report builder, dashboards and KPIs.", group: "intelligence", available: false }),
  mod({ key: "automation", name: "Automation", description: "No-code triggers, conditions and actions.", group: "intelligence", available: false }),
  mod({ key: "ai", name: "AI Assistant", description: "Assistant, document extraction, insights and agents.", group: "intelligence", available: false }),
  mod({ key: "integrations", name: "Integrations & API", description: "API keys, webhooks and third-party connectors.", group: "intelligence", available: false }),
];

export const MODULES_BY_KEY = new Map(MODULES.map((m) => [m.key, m]));

export function allPermissions(): PermissionDefinition[] {
  return MODULES.flatMap((m) => m.permissions);
}

/** Modules a tenant gets when nothing has been configured: everything built. */
export function defaultEnabledModules(): string[] {
  return MODULES.filter((m) => m.available).map((m) => m.key);
}
