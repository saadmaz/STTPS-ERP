"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { glApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Search, ChevronRight, ChevronDown, Loader2, X } from "lucide-react";
import { clsx } from "clsx";

const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const;

const TYPE_COLORS: Record<string, string> = {
  ASSET: "badge-blue",
  LIABILITY: "badge-red",
  EQUITY: "badge-green",
  REVENUE: "badge-green",
  EXPENSE: "badge-yellow",
};

const accountSchema = z.object({
  code: z.string().min(1, "Code required"),
  name: z.string().min(1, "Name required"),
  type: z.enum(ACCOUNT_TYPES),
  subtype: z.string().optional(),
  description: z.string().optional(),
  parentId: z.string().optional(),
  isPosting: z.boolean().default(true),
});

type AccountForm = z.infer<typeof accountSchema>;

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  subtype?: string;
  parentId?: string;
  isPosting: boolean;
  isActive: boolean;
  children?: Account[];
}

function buildTree(accounts: Account[]): Account[] {
  const map: Record<string, Account> = {};
  const roots: Account[] = [];

  accounts.forEach((a) => {
    map[a.id] = { ...a, children: [] };
  });

  accounts.forEach((a) => {
    if (a.parentId && map[a.parentId]) {
      map[a.parentId].children!.push(map[a.id]);
    } else {
      roots.push(map[a.id]);
    }
  });

  return roots;
}

function AccountRow({ account, depth = 0 }: { account: Account; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = account.children && account.children.length > 0;

  return (
    <>
      <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-1" style={{ paddingLeft: `${depth * 20}px` }}>
            {hasChildren ? (
              <button
                onClick={() => setExpanded(!expanded)}
                className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-600"
              >
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <span className="w-5" />
            )}
            <span className="font-mono text-sm font-medium text-slate-700">{account.code}</span>
          </div>
        </td>
        <td className="px-4 py-2.5 text-sm text-slate-800 font-medium">{account.name}</td>
        <td className="px-4 py-2.5">
          <span className={clsx("badge", TYPE_COLORS[account.type] || "badge-slate")}>
            {account.type}
          </span>
        </td>
        <td className="px-4 py-2.5 text-sm text-slate-500">{account.subtype || "—"}</td>
        <td className="px-4 py-2.5 text-center">
          <span className={clsx("badge", account.isPosting ? "badge-green" : "badge-slate")}>
            {account.isPosting ? "Posting" : "Group"}
          </span>
        </td>
        <td className="px-4 py-2.5 text-center">
          <span className={clsx("badge", account.isActive ? "badge-green" : "badge-red")}>
            {account.isActive ? "Active" : "Inactive"}
          </span>
        </td>
      </tr>
      {expanded &&
        hasChildren &&
        account.children!.map((child) => (
          <AccountRow key={child.id} account={child} depth={depth + 1} />
        ))}
    </>
  );
}

export default function ChartOfAccountsPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["gl-accounts", activeCompany?.id],
    queryFn: () => glApi.accounts.list(),
    enabled: !!activeCompany,
  });

  const { mutate: createAccount, isPending } = useMutation({
    mutationFn: (data: AccountForm) => glApi.accounts.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gl-accounts"] });
      toast.success("Account created");
      setShowCreate(false);
      reset();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Failed to create account"),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AccountForm>({
    resolver: zodResolver(accountSchema),
    defaultValues: { type: "ASSET", isPosting: true },
  });

  const filtered = search
    ? accounts.filter(
        (a: Account) =>
          a.name.toLowerCase().includes(search.toLowerCase()) ||
          a.code.toLowerCase().includes(search.toLowerCase()),
      )
    : accounts;

  const tree = search ? filtered : buildTree(accounts);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Chart of Accounts</h1>
          <p className="page-subtitle">{accounts.length} accounts in {activeCompany?.name}</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={16} />
          New Account
        </button>
      </div>

      {/* Search */}
      <div className="card mb-4">
        <div className="flex items-center gap-3 p-3">
          <Search size={16} className="text-slate-400" />
          <input
            type="text"
            placeholder="Search by code or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 text-sm outline-none text-slate-700 placeholder-slate-400"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin text-blue-600" size={32} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Subtype</th>
                  <th className="text-center">Nature</th>
                  <th className="text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {(search ? filtered : tree).map((account: Account) =>
                  search ? (
                    <AccountRow key={account.id} account={account} depth={0} />
                  ) : (
                    <AccountRow key={account.id} account={account} depth={0} />
                  ),
                )}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400">
                      No accounts found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900">New GL Account</h2>
              <button
                onClick={() => { setShowCreate(false); reset(); }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit((data) => createAccount(data))} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Account Code *</label>
                  <input {...register("code")} className="input-base" placeholder="e.g. 1100" />
                  {errors.code && <p className="form-error">{errors.code.message}</p>}
                </div>
                <div>
                  <label className="form-label">Type *</label>
                  <select {...register("type")} className="input-base">
                    {ACCOUNT_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label">Account Name *</label>
                <input {...register("name")} className="input-base" placeholder="e.g. Cash and Equivalents" />
                {errors.name && <p className="form-error">{errors.name.message}</p>}
              </div>

              <div>
                <label className="form-label">Parent Account</label>
                <select {...register("parentId")} className="input-base">
                  <option value="">— No Parent (Top Level) —</option>
                  {accounts
                    .filter((a: Account) => !a.isPosting)
                    .map((a: Account) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="form-label">Description</label>
                <textarea
                  {...register("description")}
                  className="input-base resize-none"
                  rows={2}
                  placeholder="Optional description"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isPosting"
                  {...register("isPosting")}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600"
                />
                <label htmlFor="isPosting" className="text-sm text-slate-700">
                  Posting account (transactions can be posted to this account)
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); reset(); }}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" disabled={isPending} className="btn-primary flex-1">
                  {isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
