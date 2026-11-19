"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Repeat } from "lucide-react";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDate, formatDateTime, humanize } from "@/lib/format";
import { formatMoney, minorToDecimal } from "@/lib/money";
import { useCan } from "@/lib/workspace";
import { MasterConfig } from "@/components/master/MasterData";
import { Drawer, Field, StatusBadge } from "@/components/ui/kit";
import { useUserName } from "@/components/record/panels";

interface Address {
  line1?: string | null;
  city?: string | null;
  country?: string | null;
}

export interface Account extends BaseRecord {
  code: string;
  name: string;
  type: string;
  status: string;
  segment: string | null;
  industry: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  billingAddress: Address | null;
  currency: string;
  paymentTermsDays: number;
  creditLimit: number | null;
  taxId: string | null;
  ownerUserId: string | null;
  notes: string | null;
}
export interface Contact extends BaseRecord {
  firstName: string;
  lastName: string;
  accountId: string | null;
  title: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  preferredChannel: string | null;
  doNotContact: boolean;
  ownerUserId: string | null;
  notes: string | null;
}
export interface Lead extends BaseRecord {
  firstName: string;
  lastName: string;
  company: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  source: string | null;
  campaign: string | null;
  status: string;
  score: number;
  ownerUserId: string | null;
  notes: string | null;
  convertedAccountId: string | null;
  convertedContactId: string | null;
  convertedOpportunityId: string | null;
}
export interface Opportunity extends BaseRecord {
  name: string;
  accountId: string | null;
  contactId: string | null;
  stage: string;
  probability: number;
  amount: number;
  currency: string;
  expectedCloseDate: string | null;
  forecastCategory: string;
  ownerUserId: string | null;
  source: string | null;
  nextAction: string | null;
  nextActionDate: string | null;
  winLossReason: string | null;
  stageHistory: { stage: string; at: string; by: string | null }[];
  notes: string | null;
}
export interface Activity extends BaseRecord {
  type: string;
  subject: string;
  description: string | null;
  status: string;
  dueAt: string | null;
  completedAt: string | null;
  ownerUserId: string | null;
  relatedType: string | null;
  relatedId: string | null;
  outcome: string | null;
}

export const crmApi = {
  accounts: crud<Account>("/crm/accounts"),
  contacts: crud<Contact>("/crm/contacts"),
  leads: crud<Lead>("/crm/leads"),
  opportunities: crud<Opportunity>("/crm/opportunities"),
  activities: crud<Activity>("/crm/activities"),
  settings: () => api.get("/crm/settings").then((r) => r.data as { leadSources: string[]; lossReasons: string[] }),
  analytics: () => api.get("/crm/analytics").then((r) => r.data),
  moveStage: (id: string, stage: string, reason?: string) => api.post(`/crm/opportunities/${id}/stage`, { stage, reason }).then((r) => r.data as Opportunity),
  convert: (id: string, body: object) => api.post(`/crm/leads/${id}/convert`, body).then((r) => r.data as { account: Account; contact: Contact; opportunity: Opportunity | null }),
  complete: (id: string, outcome?: string) => api.post(`/crm/activities/${id}/complete`, { outcome }).then((r) => r.data as Activity),
};

export const STAGES = ["prospecting", "qualification", "proposal", "negotiation", "won", "lost"];
const opts = (values: string[]) => values.map((v) => ({ value: v, label: humanize(v) }));

const accountOptions = {
  queryKey: ["options", "crm.accounts"],
  load: async () => (await crmApi.accounts.list({ limit: 200, sort: "nameLower" })).items.map((a) => ({ value: a.id, label: `${a.name} (${a.code})` })),
};
const contactOptions = {
  queryKey: ["options", "crm.contacts"],
  load: async () => (await crmApi.contacts.list({ limit: 200, sort: "lastName" })).items.map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}` })),
};

function UserName({ id }: { id: string | null }) {
  const name = useUserName();
  return <>{id ? name(id) : "—"}</>;
}

function AccountName({ id }: { id: string | null }) {
  const { data } = useQuery({ queryKey: ["crm.account", "one", id], queryFn: () => crmApi.accounts.get(id!), enabled: !!id });
  if (!id) return <>—</>;
  return (
    <Link href={`/crm/accounts/${id}`} className="text-blue-700 dark:text-blue-400 hover:underline">
      {data?.name ?? "…"}
    </Link>
  );
}

// ─── Customers ────────────────────────────────────────────────────────────────

const accounts: MasterConfig<Account> = {
  entityType: "crm.account",
  permission: "crm.account",
  plural: "Customers",
  singular: "Customer",
  description: "Organisations you sell to, with their terms and credit limits.",
  route: "/crm/accounts",
  client: crmApi.accounts,
  defaultSort: "nameLower",
  columns: [
    { key: "name", label: "Name", sortable: true, text: (r) => r.name },
    { key: "code", label: "Code" },
    { key: "type", label: "Type", render: (r) => humanize(r.type) },
    { key: "segment", label: "Segment", defaultHidden: true },
    { key: "phone", label: "Phone" },
    { key: "creditLimit", label: "Credit limit", render: (r) => formatMoney(r.creditLimit, r.currency), text: (r) => minorToDecimal(r.creditLimit, r.currency) },
    { key: "ownerUserId", label: "Owner", render: (r) => <UserName id={r.ownerUserId} /> },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [
    { key: "status", label: "Status", options: opts(["active", "inactive", "blocked"]) },
    { key: "type", label: "Type", options: opts(["prospect", "customer", "partner", "other"]) },
  ],
  fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "code", label: "Code", type: "text", hint: "Leave blank to number automatically" },
    { key: "type", label: "Type", type: "select", required: true, options: opts(["prospect", "customer", "partner", "other"]) },
    { key: "status", label: "Status", type: "select", required: true, options: opts(["active", "inactive", "blocked"]) },
    { key: "segment", label: "Segment", type: "text" },
    { key: "industry", label: "Industry", type: "text" },
    { key: "email", label: "Email", type: "email" },
    { key: "phone", label: "Phone", type: "text" },
    { key: "website", label: "Website", type: "text" },
    { key: "taxId", label: "Tax ID / VAT no.", type: "text" },
    { key: "currency", label: "Currency", type: "text", required: true, placeholder: "LKR" },
    { key: "paymentTermsDays", label: "Payment terms (days)", type: "number" },
    { key: "creditLimit", label: "Credit limit", type: "text", hint: "Blank for no limit" },
    { key: "ownerUserId", label: "Account owner", type: "user" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  defaults: { type: "customer", status: "active", currency: "LKR", paymentTermsDays: 30 },
  toForm: (r) => ({
    name: r.name, code: r.code, type: r.type, status: r.status, segment: r.segment ?? "", industry: r.industry ?? "", email: r.email ?? "",
    phone: r.phone ?? "", website: r.website ?? "", taxId: r.taxId ?? "", currency: r.currency, paymentTermsDays: r.paymentTermsDays,
    creditLimit: minorToDecimal(r.creditLimit, r.currency), ownerUserId: r.ownerUserId ?? "", notes: r.notes ?? "",
  }),
  title: (r) => r.name,
  subtitle: (r) => `${r.code} · ${humanize(r.type)}${r.segment ? ` · ${r.segment}` : ""}`,
  status: (r) => r.status,
  details: (r) => [
    { label: "Email", value: r.email },
    { label: "Phone", value: r.phone },
    { label: "Website", value: r.website },
    { label: "Tax ID", value: r.taxId },
    { label: "Payment terms", value: `${r.paymentTermsDays} days` },
    { label: "Credit limit", value: r.creditLimit === null ? "No limit" : formatMoney(r.creditLimit, r.currency) },
    { label: "Owner", value: <UserName id={r.ownerUserId} /> },
    { label: "Notes", value: r.notes },
  ],
  extra: (r) => <AccountSummary accountId={r.id} />,
};

function AccountSummary({ accountId }: { accountId: string }) {
  const contacts = useQuery({ queryKey: ["crm.contact", "list", { account: accountId }], queryFn: () => crmApi.contacts.list({ where: `accountId:${accountId}`, limit: 50 }) });
  const opps = useQuery({ queryKey: ["crm.opportunity", "list", { account: accountId }], queryFn: () => crmApi.opportunities.list({ where: `accountId:${accountId}`, limit: 50 }) });
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <section className="card">
        <h3 className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 font-semibold text-sm">Contacts</h3>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {(contacts.data?.items ?? []).map((c) => (
            <li key={c.id} className="px-5 py-2 text-sm">
              <Link href={`/crm/contacts/${c.id}`} className="text-blue-700 dark:text-blue-400 hover:underline">{c.firstName} {c.lastName}</Link>
              <span className="text-slate-500"> {c.title ?? ""}</span>
            </li>
          ))}
          {contacts.data?.items.length === 0 && <li className="px-5 py-3 text-sm text-slate-500">No contacts</li>}
        </ul>
      </section>
      <section className="card">
        <h3 className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 font-semibold text-sm">Opportunities</h3>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {(opps.data?.items ?? []).map((o) => (
            <li key={o.id} className="px-5 py-2 text-sm flex items-center gap-2">
              <Link href={`/crm/opportunities/${o.id}`} className="flex-1 text-blue-700 dark:text-blue-400 hover:underline">{o.name}</Link>
              <span className="text-slate-500">{formatMoney(o.amount, o.currency)}</span>
              <StatusBadge status={o.stage} />
            </li>
          ))}
          {opps.data?.items.length === 0 && <li className="px-5 py-3 text-sm text-slate-500">No opportunities</li>}
        </ul>
      </section>
    </div>
  );
}

// ─── Contacts ─────────────────────────────────────────────────────────────────

const contacts: MasterConfig<Contact> = {
  entityType: "crm.contact",
  permission: "crm.contact",
  plural: "Contacts",
  singular: "Contact",
  route: "/crm/contacts",
  client: crmApi.contacts,
  defaultSort: "lastName",
  columns: [
    { key: "lastName", label: "Name", sortable: true, render: (r) => `${r.firstName} ${r.lastName}`, text: (r) => `${r.firstName} ${r.lastName}` },
    { key: "title", label: "Title" },
    { key: "accountId", label: "Customer", render: (r) => <AccountName id={r.accountId} /> },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
  ],
  fields: [
    { key: "firstName", label: "First name", type: "text", required: true },
    { key: "lastName", label: "Last name", type: "text", required: true },
    { key: "accountId", label: "Customer", type: "reference", reference: accountOptions },
    { key: "title", label: "Job title", type: "text" },
    { key: "role", label: "Role", type: "select", options: opts(["decision_maker", "influencer", "billing", "technical", "user", "other"]) },
    { key: "email", label: "Email", type: "email" },
    { key: "phone", label: "Phone", type: "text" },
    { key: "preferredChannel", label: "Preferred channel", type: "select", options: opts(["email", "phone", "whatsapp", "sms"]) },
    { key: "doNotContact", label: "Do not contact", type: "boolean" },
    { key: "ownerUserId", label: "Owner", type: "user" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  title: (r) => `${r.firstName} ${r.lastName}`,
  subtitle: (r) => [r.title, r.email].filter(Boolean).join(" · "),
  status: (r) => (r.doNotContact ? "inactive" : null),
  details: (r) => [
    { label: "Customer", value: <AccountName id={r.accountId} /> },
    { label: "Role", value: r.role ? humanize(r.role) : null },
    { label: "Email", value: r.email },
    { label: "Phone", value: r.phone },
    { label: "Preferred channel", value: r.preferredChannel ? humanize(r.preferredChannel) : null },
    { label: "Owner", value: <UserName id={r.ownerUserId} /> },
    { label: "Notes", value: r.notes },
  ],
};

// ─── Leads ────────────────────────────────────────────────────────────────────

function ConvertLead({ lead, refresh }: { lead: Lead; refresh: (row: Lead) => void }) {
  const router = useRouter();
  const canConvert = useCan("crm.lead.convert");
  const [open, setOpen] = useState(false);
  const [withOpp, setWithOpp] = useState(true);
  const [accountId, setAccountId] = useState("");
  const [name, setName] = useState(`${lead.company ?? lead.lastName} opportunity`);
  const [amount, setAmount] = useState("");
  const accountsList = useQuery({ ...{ queryKey: accountOptions.queryKey, queryFn: accountOptions.load }, enabled: open });
  const convert = useMutation({
    mutationFn: () => crmApi.convert(lead.id, { accountId: accountId || undefined, createOpportunity: withOpp, opportunityName: withOpp ? name : undefined, amount: withOpp && amount ? amount : undefined }),
    onSuccess: (res) => {
      toast.success("Lead converted");
      setOpen(false);
      refresh({ ...lead, status: "converted" });
      router.push(res.opportunity ? `/crm/opportunities/${res.opportunity.id}` : `/crm/accounts/${res.account.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!canConvert || lead.status === "converted" || lead.status === "unqualified") return null;
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}>
        <Repeat size={15} /> Convert
      </button>
      <Drawer
        open={open}
        title="Convert lead"
        onClose={() => setOpen(false)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={convert.isPending} onClick={() => convert.mutate()}>Convert</button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">Creates a contact for {lead.firstName} {lead.lastName} at a customer, and optionally an opportunity.</p>
          <Field label="Customer">
            <select className="input-base" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">New customer: {lead.company || `${lead.firstName} ${lead.lastName}`}</option>
              {(accountsList.data ?? []).map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={withOpp} onChange={(e) => setWithOpp(e.target.checked)} /> Create an opportunity
          </label>
          {withOpp && (
            <>
              <Field label="Opportunity name"><input className="input-base" value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label="Amount"><input className="input-base" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></Field>
            </>
          )}
        </div>
      </Drawer>
    </>
  );
}

const leads: MasterConfig<Lead> = {
  entityType: "crm.lead",
  permission: "crm.lead",
  plural: "Leads",
  singular: "Lead",
  description: "People and companies that may become customers.",
  route: "/crm/leads",
  client: crmApi.leads,
  defaultSort: "-createdAt",
  columns: [
    { key: "lastName", label: "Name", render: (r) => `${r.firstName} ${r.lastName}`, text: (r) => `${r.firstName} ${r.lastName}` },
    { key: "company", label: "Company" },
    { key: "source", label: "Source", render: (r) => (r.source ? humanize(r.source) : "—") },
    { key: "score", label: "Score", sortable: true },
    { key: "ownerUserId", label: "Owner", render: (r) => <UserName id={r.ownerUserId} /> },
    { key: "createdAt", label: "Created", sortable: true, render: (r) => formatDate(r.createdAt) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [
    { key: "status", label: "Status", options: opts(["new", "contacted", "qualified", "unqualified", "converted"]) },
    { key: "source", label: "Source", options: opts(["website", "referral", "email", "phone", "event", "campaign", "import", "walk_in", "other"]) },
  ],
  fields: [
    { key: "firstName", label: "First name", type: "text", required: true },
    { key: "lastName", label: "Last name", type: "text", required: true },
    { key: "company", label: "Company", type: "text" },
    { key: "title", label: "Job title", type: "text" },
    { key: "email", label: "Email", type: "email" },
    { key: "phone", label: "Phone", type: "text" },
    { key: "website", label: "Website", type: "text" },
    { key: "source", label: "Source", type: "select", options: opts(["website", "referral", "email", "phone", "event", "campaign", "import", "walk_in", "other"]) },
    { key: "campaign", label: "Campaign", type: "text" },
    { key: "status", label: "Status", type: "select", required: true, options: opts(["new", "contacted", "qualified", "unqualified"]) },
    { key: "ownerUserId", label: "Owner", type: "user", hint: "Leave blank to use lead routing" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  defaults: { status: "new" },
  title: (r) => `${r.firstName} ${r.lastName}`,
  subtitle: (r) => [r.title, r.company].filter(Boolean).join(" at "),
  status: (r) => r.status,
  editable: (r) => r.status !== "converted",
  actions: (r, refresh) => <ConvertLead lead={r} refresh={refresh} />,
  details: (r) => [
    { label: "Score", value: `${r.score} / 100` },
    { label: "Email", value: r.email },
    { label: "Phone", value: r.phone },
    { label: "Source", value: r.source ? humanize(r.source) : null },
    { label: "Campaign", value: r.campaign },
    { label: "Owner", value: <UserName id={r.ownerUserId} /> },
    ...(r.convertedAccountId
      ? [
          { label: "Converted to", value: <AccountName id={r.convertedAccountId} /> },
          { label: "Opportunity", value: r.convertedOpportunityId ? <Link className="text-blue-700 dark:text-blue-400 hover:underline" href={`/crm/opportunities/${r.convertedOpportunityId}`}>Open</Link> : null },
        ]
      : []),
    { label: "Notes", value: r.notes },
  ],
};

// ─── Opportunities ────────────────────────────────────────────────────────────

export function StagePicker({ opp, refresh }: { opp: Opportunity; refresh: (row: Opportunity) => void }) {
  const canEdit = useCan("crm.opportunity.edit");
  const settings = useQuery({ queryKey: ["crm-settings"], queryFn: crmApi.settings });
  const [closing, setClosing] = useState<"won" | "lost" | null>(null);
  const [reason, setReason] = useState("");
  const move = useMutation({
    mutationFn: ({ stage, why }: { stage: string; why?: string }) => crmApi.moveStage(opp.id, stage, why),
    onSuccess: (row) => {
      setClosing(null);
      setReason("");
      refresh(row);
      toast.success(`Moved to ${humanize(row.stage).toLowerCase()}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!canEdit) return null;
  return (
    <>
      <select
        className="input-base w-auto"
        value={opp.stage}
        disabled={move.isPending}
        onChange={(e) => (e.target.value === "won" || e.target.value === "lost" ? setClosing(e.target.value) : move.mutate({ stage: e.target.value }))}
        aria-label="Stage"
      >
        {STAGES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
      </select>
      <Drawer
        open={!!closing}
        title={closing === "won" ? "Mark as won" : "Mark as lost"}
        onClose={() => setClosing(null)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setClosing(null)}>Cancel</button>
            <button className={closing === "lost" ? "btn-danger" : "btn-primary"} disabled={move.isPending || (closing === "lost" && !reason)} onClick={() => move.mutate({ stage: closing!, why: reason || undefined })}>
              Confirm
            </button>
          </>
        }
      >
        <Field label={closing === "lost" ? "Why was it lost?" : "Why did we win? (optional)"} required={closing === "lost"}>
          {closing === "lost" ? (
            <select className="input-base" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Choose a reason</option>
              {(settings.data?.lossReasons ?? []).map((r) => <option key={r} value={r}>{humanize(r)}</option>)}
            </select>
          ) : (
            <input className="input-base" value={reason} onChange={(e) => setReason(e.target.value)} />
          )}
        </Field>
      </Drawer>
    </>
  );
}

const opportunities: MasterConfig<Opportunity> = {
  entityType: "crm.opportunity",
  permission: "crm.opportunity",
  plural: "Opportunities",
  singular: "Opportunity",
  description: "Deals in progress. See the pipeline board for a stage view.",
  route: "/crm/opportunities",
  client: crmApi.opportunities,
  defaultSort: "-createdAt",
  columns: [
    { key: "name", label: "Name" },
    { key: "accountId", label: "Customer", render: (r) => <AccountName id={r.accountId} /> },
    { key: "amount", label: "Amount", sortable: true, render: (r) => formatMoney(r.amount, r.currency), text: (r) => minorToDecimal(r.amount, r.currency) },
    { key: "probability", label: "Probability", render: (r) => `${r.probability}%` },
    { key: "expectedCloseDate", label: "Close date", sortable: true, render: (r) => formatDate(r.expectedCloseDate) },
    { key: "ownerUserId", label: "Owner", render: (r) => <UserName id={r.ownerUserId} /> },
    { key: "stage", label: "Stage", render: (r) => <StatusBadge status={r.stage} /> },
  ],
  filters: [{ key: "stage", label: "Stage", options: opts(STAGES) }],
  fields: [
    { key: "name", label: "Name", type: "text", required: true, wide: true },
    { key: "accountId", label: "Customer", type: "reference", reference: accountOptions },
    { key: "contactId", label: "Contact", type: "reference", reference: contactOptions },
    { key: "stage", label: "Stage", type: "select", createOnly: true, options: opts(["prospecting", "qualification", "proposal", "negotiation"]) },
    { key: "amount", label: "Amount", type: "text", placeholder: "0.00" },
    { key: "currency", label: "Currency", type: "text", placeholder: "LKR" },
    { key: "probability", label: "Probability %", type: "number", hint: "Defaults from the stage" },
    { key: "expectedCloseDate", label: "Expected close", type: "date" },
    { key: "forecastCategory", label: "Forecast", type: "select", options: opts(["pipeline", "best_case", "commit", "omitted"]) },
    { key: "ownerUserId", label: "Owner", type: "user" },
    { key: "nextAction", label: "Next action", type: "text" },
    { key: "nextActionDate", label: "Next action date", type: "date" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  defaults: { stage: "prospecting", currency: "LKR" },
  toForm: (r) => ({
    name: r.name, accountId: r.accountId ?? "", contactId: r.contactId ?? "", amount: minorToDecimal(r.amount, r.currency), currency: r.currency,
    probability: r.probability, expectedCloseDate: r.expectedCloseDate ?? "", forecastCategory: r.forecastCategory === "closed" ? "" : r.forecastCategory,
    ownerUserId: r.ownerUserId ?? "", nextAction: r.nextAction ?? "", nextActionDate: r.nextActionDate ?? "", notes: r.notes ?? "",
  }),
  title: (r) => r.name,
  subtitle: (r) => `${formatMoney(r.amount, r.currency)} · ${r.probability}%`,
  status: (r) => r.stage,
  actions: (r, refresh) => <StagePicker opp={r} refresh={refresh} />,
  details: (r) => [
    { label: "Customer", value: <AccountName id={r.accountId} /> },
    { label: "Expected close", value: formatDate(r.expectedCloseDate) },
    { label: "Forecast", value: humanize(r.forecastCategory) },
    { label: "Owner", value: <UserName id={r.ownerUserId} /> },
    { label: "Next action", value: r.nextAction ? `${r.nextAction}${r.nextActionDate ? ` (${formatDate(r.nextActionDate)})` : ""}` : null },
    { label: "Win / loss reason", value: r.winLossReason ? humanize(r.winLossReason) : null },
    { label: "Stage history", value: r.stageHistory.map((h) => `${humanize(h.stage)} · ${formatDateTime(h.at)}`).join("\n") },
  ],
};

// ─── Activities ───────────────────────────────────────────────────────────────

function CompleteButton({ activity, refresh }: { activity: Activity; refresh: (row: Activity) => void }) {
  const canEdit = useCan("crm.activity.edit");
  const complete = useMutation({
    mutationFn: () => crmApi.complete(activity.id, window.prompt("Outcome (optional)") ?? undefined),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!canEdit || activity.status !== "planned") return null;
  return (
    <button className="btn-primary" onClick={() => complete.mutate()} disabled={complete.isPending}>
      <CheckCircle2 size={15} /> Done
    </button>
  );
}

const RELATED_ROUTE: Record<string, string> = { "crm.lead": "leads", "crm.contact": "contacts", "crm.account": "accounts", "crm.opportunity": "opportunities" };

const activities: MasterConfig<Activity> = {
  entityType: "crm.activity",
  permission: "crm.activity",
  plural: "Activities",
  singular: "Activity",
  description: "Calls, meetings, visits, emails and follow-ups.",
  route: "/crm/activities",
  client: crmApi.activities,
  defaultSort: "dueAt",
  columns: [
    { key: "subject", label: "Subject" },
    { key: "type", label: "Type", render: (r) => humanize(r.type) },
    { key: "dueAt", label: "Due", sortable: true, render: (r) => formatDateTime(r.dueAt) },
    { key: "ownerUserId", label: "Owner", render: (r) => <UserName id={r.ownerUserId} /> },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [
    { key: "status", label: "Status", options: opts(["planned", "done", "cancelled"]) },
    { key: "type", label: "Type", options: opts(["call", "email", "meeting", "visit", "note", "task", "follow_up"]) },
  ],
  fields: [
    { key: "type", label: "Type", type: "select", required: true, options: opts(["call", "email", "meeting", "visit", "note", "task", "follow_up"]) },
    { key: "subject", label: "Subject", type: "text", required: true },
    { key: "dueAt", label: "Due", type: "date" },
    { key: "ownerUserId", label: "Owner", type: "user" },
    { key: "relatedType", label: "About", type: "select", options: [
      { value: "crm.account", label: "Customer" }, { value: "crm.contact", label: "Contact" }, { value: "crm.lead", label: "Lead" }, { value: "crm.opportunity", label: "Opportunity" },
    ] },
    { key: "relatedId", label: "Record id", type: "text", hint: "Easier: add activities from the record itself" },
    { key: "description", label: "Details", type: "textarea" },
  ],
  defaults: { type: "call" },
  title: (r) => r.subject,
  subtitle: (r) => `${humanize(r.type)}${r.dueAt ? ` · due ${formatDateTime(r.dueAt)}` : ""}`,
  status: (r) => r.status,
  actions: (r, refresh) => <CompleteButton activity={r} refresh={refresh} />,
  details: (r) => [
    { label: "Owner", value: <UserName id={r.ownerUserId} /> },
    { label: "About", value: r.relatedType && r.relatedId ? <Link className="text-blue-700 dark:text-blue-400 hover:underline" href={`/crm/${RELATED_ROUTE[r.relatedType]}/${r.relatedId}`}>{humanize(r.relatedType.split(".")[1]!)}</Link> : null },
    { label: "Completed", value: r.completedAt ? formatDateTime(r.completedAt) : null },
    { label: "Outcome", value: r.outcome },
    { label: "Details", value: r.description },
  ],
};

export const CRM_SCREENS: Record<string, MasterConfig<never>> = {
  accounts: accounts as unknown as MasterConfig<never>,
  contacts: contacts as unknown as MasterConfig<never>,
  leads: leads as unknown as MasterConfig<never>,
  opportunities: opportunities as unknown as MasterConfig<never>,
  activities: activities as unknown as MasterConfig<never>,
};
