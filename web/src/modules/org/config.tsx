"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useCan } from "@/lib/workspace";
import { MasterConfig } from "@/components/master/MasterData";
import { StatusBadge } from "@/components/ui/kit";
import { useUserName } from "@/components/record/panels";

interface Coded extends BaseRecord {
  code: string;
  name: string;
  isActive: boolean;
}
export interface Branch extends Coded {
  type: string;
  phone: string | null;
  email: string | null;
  managerUserId: string | null;
  timezone: string | null;
  address: { line1?: string; city?: string; country?: string } | null;
}
export interface Department extends Coded {
  parentId: string | null;
  branchId: string | null;
  costCentreId: string | null;
  managerUserId: string | null;
}
export interface Team extends Coded {
  departmentId: string | null;
  leadUserId: string | null;
  memberUserIds: string[];
}
export interface CostCentre extends Coded {
  parentId: string | null;
  ownerUserId: string | null;
}
export interface BusinessUnit extends Coded {
  managerUserId: string | null;
}
export interface FiscalPeriod {
  number: number;
  name: string;
  startDate: string;
  endDate: string;
  status: "open" | "soft_closed" | "locked";
}
export interface FiscalYear extends BaseRecord {
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "open" | "closed";
  periods: FiscalPeriod[];
}
export interface ExchangeRate extends BaseRecord {
  fromCurrency: string;
  toCurrency: string;
  rate: string;
  effectiveDate: string;
  source: string | null;
}

export const orgApi = {
  branches: crud<Branch>("/org/branches"),
  departments: crud<Department>("/org/departments"),
  teams: crud<Team>("/org/teams"),
  costCentres: crud<CostCentre>("/org/cost-centres"),
  businessUnits: crud<BusinessUnit>("/org/business-units"),
  fiscalYears: crud<FiscalYear>("/org/fiscal-years"),
  exchangeRates: crud<ExchangeRate>("/org/exchange-rates"),
};

const options = <T extends Coded>(client: ReturnType<typeof crud<T>>, key: string) => ({
  queryKey: ["options", key],
  load: async () => (await client.list({ limit: 200, where: "isActive:true" })).items.map((r) => ({ value: r.id, label: `${r.code} · ${r.name}` })),
});

const activeFilter = { key: "isActive", label: "Status", options: [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }] };
const codeName = [
  { key: "code", label: "Code", type: "text" as const, required: true, placeholder: "e.g. HQ" },
  { key: "name", label: "Name", type: "text" as const, required: true },
];
const activeField = { key: "isActive", label: "Active", type: "boolean" as const };
const codedColumns = <T extends Coded>(): { key: keyof T & string; label: string; sortable: boolean }[] => [
  { key: "code", label: "Code", sortable: true },
  { key: "name", label: "Name", sortable: true },
];
const statusColumn = <T extends Coded>() => ({ key: "isActive", label: "Status", render: (r: T) => <StatusBadge status={r.isActive ? "active" : "inactive"} />, text: (r: T) => (r.isActive ? "Active" : "Inactive") });

function UserName({ id }: { id: string | null }) {
  const name = useUserName();
  return <>{id ? name(id) : "—"}</>;
}

const BRANCH_TYPES = ["office", "branch", "store", "warehouse", "factory", "site"].map((v) => ({ value: v, label: v[0]!.toUpperCase() + v.slice(1) }));

const branches: MasterConfig<Branch> = {
  entityType: "org.branch",
  permission: "org.branch",
  plural: "Branches",
  singular: "Branch",
  description: "Offices, stores, warehouses and sites.",
  route: "/org/branches",
  client: orgApi.branches,
  defaultSort: "code",
  columns: [
    ...codedColumns<Branch>(),
    { key: "type", label: "Type", sortable: true },
    { key: "city", label: "City", render: (r) => r.address?.city ?? "—", text: (r) => r.address?.city ?? "" },
    { key: "phone", label: "Phone", defaultHidden: true },
    statusColumn<Branch>(),
  ],
  filters: [{ key: "type", label: "Type", options: BRANCH_TYPES }, activeFilter],
  fields: [
    ...codeName,
    { key: "type", label: "Type", type: "select", options: BRANCH_TYPES, required: true },
    { key: "managerUserId", label: "Manager", type: "user" },
    { key: "phone", label: "Phone", type: "text" },
    { key: "email", label: "Email", type: "email" },
    { key: "timezone", label: "Time zone", type: "text", placeholder: "Asia/Colombo" },
    activeField,
  ],
  defaults: { type: "branch", isActive: true },
  title: (r) => r.name,
  subtitle: (r) => `${r.code} · ${r.type}`,
  status: (r) => (r.isActive ? "active" : "inactive"),
  details: (r) => [
    { label: "Type", value: r.type },
    { label: "Manager", value: <UserName id={r.managerUserId} /> },
    { label: "Phone", value: r.phone },
    { label: "Email", value: r.email },
    { label: "Time zone", value: r.timezone },
    { label: "Address", value: [r.address?.line1, r.address?.city, r.address?.country].filter(Boolean).join(", ") || null },
  ],
};

const costCentres: MasterConfig<CostCentre> = {
  entityType: "org.costCentre",
  permission: "org.costCentre",
  plural: "Cost centres",
  singular: "Cost centre",
  description: "Where costs are tracked and budgeted.",
  route: "/org/cost-centres",
  client: orgApi.costCentres,
  defaultSort: "code",
  columns: [...codedColumns<CostCentre>(), statusColumn<CostCentre>()],
  filters: [activeFilter],
  fields: [
    ...codeName,
    { key: "parentId", label: "Parent", type: "reference", reference: options(orgApi.costCentres, "costCentres") },
    { key: "ownerUserId", label: "Owner", type: "user" },
    activeField,
  ],
  defaults: { isActive: true },
  title: (r) => r.name,
  subtitle: (r) => r.code,
  status: (r) => (r.isActive ? "active" : "inactive"),
  details: (r) => [{ label: "Owner", value: <UserName id={r.ownerUserId} /> }],
};

const departments: MasterConfig<Department> = {
  entityType: "org.department",
  permission: "org.department",
  plural: "Departments",
  singular: "Department",
  route: "/org/departments",
  client: orgApi.departments,
  defaultSort: "code",
  columns: [...codedColumns<Department>(), { key: "managerUserId", label: "Manager", render: (r) => <UserName id={r.managerUserId} /> }, statusColumn<Department>()],
  filters: [activeFilter],
  fields: [
    ...codeName,
    { key: "parentId", label: "Parent department", type: "reference", reference: options(orgApi.departments, "departments") },
    { key: "branchId", label: "Branch", type: "reference", reference: options(orgApi.branches, "branches") },
    { key: "costCentreId", label: "Cost centre", type: "reference", reference: options(orgApi.costCentres, "costCentres") },
    { key: "managerUserId", label: "Manager", type: "user", hint: "Approves requests routed to the department manager" },
    activeField,
  ],
  defaults: { isActive: true },
  title: (r) => r.name,
  subtitle: (r) => r.code,
  status: (r) => (r.isActive ? "active" : "inactive"),
  details: (r) => [{ label: "Manager", value: <UserName id={r.managerUserId} /> }],
};

const teams: MasterConfig<Team> = {
  entityType: "org.team",
  permission: "org.team",
  plural: "Teams",
  singular: "Team",
  route: "/org/teams",
  client: orgApi.teams,
  defaultSort: "code",
  columns: [...codedColumns<Team>(), { key: "members", label: "Members", render: (r) => r.memberUserIds.length, text: (r) => String(r.memberUserIds.length) }, statusColumn<Team>()],
  filters: [activeFilter],
  fields: [
    ...codeName,
    { key: "departmentId", label: "Department", type: "reference", reference: options(orgApi.departments, "departments") },
    { key: "leadUserId", label: "Lead", type: "user" },
    { key: "memberUserIds", label: "Members", type: "users" },
    activeField,
  ],
  defaults: { isActive: true, memberUserIds: [] },
  title: (r) => r.name,
  subtitle: (r) => r.code,
  status: (r) => (r.isActive ? "active" : "inactive"),
  details: (r) => [
    { label: "Lead", value: <UserName id={r.leadUserId} /> },
    { label: "Members", value: r.memberUserIds.length ? r.memberUserIds.map((id) => <div key={id}><UserName id={id} /></div>) : null },
  ],
};

const businessUnits: MasterConfig<BusinessUnit> = {
  entityType: "org.businessUnit",
  permission: "org.businessUnit",
  plural: "Business units",
  singular: "Business unit",
  route: "/org/business-units",
  client: orgApi.businessUnits,
  defaultSort: "code",
  columns: [...codedColumns<BusinessUnit>(), statusColumn<BusinessUnit>()],
  filters: [activeFilter],
  fields: [...codeName, { key: "managerUserId", label: "Manager", type: "user" }, activeField],
  defaults: { isActive: true },
  title: (r) => r.name,
  subtitle: (r) => r.code,
  status: (r) => (r.isActive ? "active" : "inactive"),
  details: (r) => [{ label: "Manager", value: <UserName id={r.managerUserId} /> }],
};

function PeriodsTable({ year }: { year: FiscalYear }) {
  const queryClient = useQueryClient();
  const canClose = useCan("org.fiscalYear.close");
  const set = useMutation({
    mutationFn: ({ number, status }: { number: number; status: FiscalPeriod["status"] }) =>
      api.post(`/org/fiscal-years/${year.id}/periods/${number}/status`, { status }).then((r) => r.data as FiscalYear),
    onSuccess: (row) => {
      queryClient.setQueryData(["org.fiscalYear", "one", year.id], row);
      toast.success("Period updated");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="card overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            <th>#</th>
            <th>Period</th>
            <th>From</th>
            <th>To</th>
            <th>Status</th>
            {canClose && <th />}
          </tr>
        </thead>
        <tbody>
          {year.periods.map((p) => (
            <tr key={p.number}>
              <td>{p.number}</td>
              <td>{p.name}</td>
              <td>{formatDate(p.startDate)}</td>
              <td>{formatDate(p.endDate)}</td>
              <td>
                <StatusBadge status={p.status} />
              </td>
              {canClose && (
                <td>
                  <select
                    className="input-base w-auto py-1"
                    value={p.status}
                    disabled={set.isPending}
                    onChange={(e) => set.mutate({ number: p.number, status: e.target.value as FiscalPeriod["status"] })}
                    aria-label={`Status of ${p.name}`}
                  >
                    <option value="open">Open</option>
                    <option value="soft_closed">Soft-closed</option>
                    <option value="locked">Locked</option>
                  </select>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const fiscalYears: MasterConfig<FiscalYear> = {
  entityType: "org.fiscalYear",
  permission: "org.fiscalYear",
  plural: "Fiscal years",
  singular: "Fiscal year",
  description: "Accounting periods. Postings are only allowed into open periods.",
  route: "/org/fiscal-years",
  client: orgApi.fiscalYears,
  defaultSort: "-startDate",
  columns: [
    { key: "code", label: "Code", sortable: true },
    { key: "name", label: "Name" },
    { key: "startDate", label: "From", sortable: true, render: (r) => formatDate(r.startDate) },
    { key: "endDate", label: "To", render: (r) => formatDate(r.endDate) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  fields: [
    { key: "code", label: "Code", type: "text", required: true, placeholder: "FY2026", createOnly: true },
    { key: "name", label: "Name", type: "text", placeholder: "Financial year 2026/27" },
    { key: "startDate", label: "First day", type: "date", required: true, createOnly: true, hint: "Must be the first day of a month" },
    { key: "months", label: "Months", type: "number", createOnly: true, hint: "Default 12" },
  ],
  toForm: (r) => ({ name: r.name }),
  title: (r) => r.name,
  subtitle: (r) => `${formatDate(r.startDate)} to ${formatDate(r.endDate)}`,
  status: (r) => r.status,
  details: (r) => [{ label: "Code", value: r.code }],
  extra: (r) => <PeriodsTable year={r} />,
};

const exchangeRates: MasterConfig<ExchangeRate> = {
  entityType: "org.exchangeRate",
  permission: "org.exchangeRate",
  plural: "Exchange rates",
  singular: "Exchange rate",
  description: "Rates used to convert foreign-currency transactions, by effective date.",
  route: "/org/exchange-rates",
  client: orgApi.exchangeRates,
  defaultSort: "-effectiveDate",
  columns: [
    { key: "pair", label: "Pair", render: (r) => `${r.fromCurrency} → ${r.toCurrency}`, text: (r) => `${r.fromCurrency}/${r.toCurrency}` },
    { key: "rate", label: "Rate" },
    { key: "effectiveDate", label: "Effective", sortable: true, render: (r) => formatDate(r.effectiveDate) },
    { key: "source", label: "Source" },
  ],
  fields: [
    { key: "fromCurrency", label: "From", type: "text", required: true, placeholder: "USD" },
    { key: "toCurrency", label: "To", type: "text", required: true, placeholder: "LKR" },
    { key: "rate", label: "Rate", type: "text", required: true, hint: "Units of the second currency per one unit of the first" },
    { key: "effectiveDate", label: "Effective from", type: "date", required: true },
    { key: "source", label: "Source", type: "text", placeholder: "CBSL" },
  ],
  title: (r) => `${r.fromCurrency} → ${r.toCurrency}`,
  subtitle: (r) => `${r.rate} from ${formatDate(r.effectiveDate)}`,
  details: (r) => [
    { label: "Rate", value: r.rate },
    { label: "Effective", value: formatDate(r.effectiveDate) },
    { label: "Source", value: r.source },
  ],
};

/** Organisation screens by URL segment. */
export const ORG_SCREENS: Record<string, MasterConfig<never>> = {
  branches: branches as unknown as MasterConfig<never>,
  departments: departments as unknown as MasterConfig<never>,
  teams: teams as unknown as MasterConfig<never>,
  "cost-centres": costCentres as unknown as MasterConfig<never>,
  "business-units": businessUnits as unknown as MasterConfig<never>,
  "fiscal-years": fiscalYears as unknown as MasterConfig<never>,
  "exchange-rates": exchangeRates as unknown as MasterConfig<never>,
};
