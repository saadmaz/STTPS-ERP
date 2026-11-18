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
  mod({ key: "workflow", name: "Approvals & Workflow", description: "Configurable approval workflows.", group: "platform", core: true, available: false }),
  mod({ key: "documents", name: "Documents", description: "Files, versions and document management.", group: "platform", available: false }),
  mod({ key: "calendar", name: "Calendar", description: "Shared calendars, events and meetings.", group: "platform", available: false }),

  // Core operations
  mod({ key: "crm", name: "CRM", description: "Leads, contacts, customers, opportunities and activities.", group: "core", available: false }),
  mod({ key: "products", name: "Products & Services", description: "Product master, variants, units and pricing.", group: "core", available: false }),
  mod({ key: "sales", name: "Sales", description: "Quotes, orders, fulfilment and returns.", group: "core", available: false, dependsOn: ["products", "crm"] }),
  mod({ key: "inventory", name: "Inventory", description: "Stock, warehouses, movements, counts and traceability.", group: "core", available: false, dependsOn: ["products"] }),
  mod({ key: "procurement", name: "Procurement", description: "Suppliers, requisitions, purchase orders and receipts.", group: "core", available: false, dependsOn: ["products"] }),

  // Finance
  mod({ key: "finance", name: "Finance", description: "Ledger, receivables, payables, banking, tax, budgets and reports.", group: "finance", available: false }),
  mod({ key: "expenses", name: "Expenses", description: "Employee expense claims and reimbursement.", group: "finance", available: false, dependsOn: ["finance"] }),
  mod({ key: "assets", name: "Assets", description: "Asset register, assignment, depreciation and audits.", group: "finance", available: false }),

  // People
  mod({ key: "hr", name: "HR & People", description: "Employees, organisation chart, recruitment, attendance, leave and performance.", group: "people", available: false }),
  mod({ key: "payroll", name: "Payroll", description: "Salary structures, payroll runs, payslips and statutory filings.", group: "people", available: false, dependsOn: ["hr", "finance"] }),

  // Operations
  mod({ key: "projects", name: "Projects", description: "Projects, tasks, time tracking and project billing.", group: "operations", available: false }),
  mod({ key: "support", name: "Support", description: "Tickets, SLAs and the customer portal.", group: "operations", available: false, dependsOn: ["crm"] }),
  mod({ key: "maintenance", name: "Maintenance", description: "Work orders, maintenance plans and field service.", group: "operations", available: false, dependsOn: ["assets"] }),

  // Advanced operations
  mod({ key: "manufacturing", name: "Manufacturing", description: "BOMs, routings, production orders and MRP.", group: "advanced", available: false, dependsOn: ["inventory"] }),
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
