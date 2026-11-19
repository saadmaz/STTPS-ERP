"use client";

import { useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MasterListPage, MasterRecordPage } from "@/components/master/MasterData";
import { ErrorState, Field, PageHeader, Spinner, StatusBadge } from "@/components/ui/kit";
import { api, errorMessage } from "@/lib/api";
import { toast } from "sonner";
import { HR_SCREENS, OrgChartNode } from "./config";
import { RECRUITMENT_SCREENS } from "./recruitment";

const ALL_HR_SCREENS = { ...HR_SCREENS, ...RECRUITMENT_SCREENS };

export function HrList({ entity }: { entity: string }) {
  const config = ALL_HR_SCREENS[entity];
  if (!config) notFound();
  return <MasterListPage config={config} />;
}

export function HrRecord({ entity, id }: { entity: string; id: string }) {
  const config = ALL_HR_SCREENS[entity];
  if (!config) notFound();
  return <MasterRecordPage config={config} id={id} />;
}

function OrgChartTree({ node }: { node: OrgChartNode }) {
  return (
    <li>
      <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2">
        <Link className="font-medium text-blue-700 dark:text-blue-400 hover:underline" href={`/hr/employees/${node.id}`}>{node.name}</Link>
        <span className="text-xs text-slate-500">{node.employeeNumber}</span>
        {node.status !== "active" && <StatusBadge status={node.status} />}
      </div>
      {node.reports.length > 0 && (
        <ul className="mt-2 ml-6 space-y-2 border-l border-slate-200 dark:border-slate-800 pl-4">
          {node.reports.map((r) => <OrgChartTree key={r.id} node={r} />)}
        </ul>
      )}
    </li>
  );
}

export function OrgChartPage() {
  const q = useQuery({ queryKey: ["hr-org-chart"], queryFn: () => api.get("/hr/employees/org-chart").then((r) => r.data as OrgChartNode[]) });
  return (
    <div className="space-y-6">
      <PageHeader title="Org chart" subtitle="The reporting line from the top." />
      {q.isLoading ? <Spinner /> : q.isError ? <ErrorState message="Could not load the org chart" /> : (
        <section className="card p-5 overflow-x-auto">
          {q.data!.length === 0 ? <p className="text-sm text-slate-500">No one is set up yet.</p> : (
            <ul className="space-y-2">{q.data!.map((n) => <OrgChartTree key={n.id} node={n} />)}</ul>
          )}
        </section>
      )}
    </div>
  );
}

// ─── Public career page ────────────────────────────────────────────────────────

interface PublicPosting {
  id: string;
  title: string;
  description: string;
  location: string | null;
  employmentType: string;
  publishedAt: string | null;
}

export function CareersListPage({ companyId }: { companyId: string }) {
  const q = useQuery({ queryKey: ["careers", companyId], queryFn: () => api.get(`/public/careers/${companyId}`).then((r) => r.data as PublicPosting[]) });
  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold">Open positions</h1>
        {q.isLoading ? <Spinner /> : q.isError ? <ErrorState message="Could not load open positions" /> : q.data!.length === 0 ? (
          <p className="text-slate-600 dark:text-slate-300">There are no open positions right now. Please check back soon.</p>
        ) : (
          <ul className="space-y-3">
            {q.data!.map((p) => (
              <li key={p.id}>
                <Link href={`/careers/${companyId}/${p.id}`} className="card p-5 block hover:border-blue-400 dark:hover:border-blue-500 transition-colors">
                  <p className="font-semibold">{p.title}</p>
                  <p className="text-sm text-slate-500">{[p.location, p.employmentType.replace("_", " ")].filter(Boolean).join(" · ")}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

export function CareersDetailPage({ companyId, postingId }: { companyId: string; postingId: string }) {
  const q = useQuery({ queryKey: ["careers", companyId, postingId], queryFn: () => api.get(`/public/careers/${companyId}/${postingId}`).then((r) => r.data as PublicPosting), retry: false });
  const [submitted, setSubmitted] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [resumeUrl, setResumeUrl] = useState("");
  const [linkedInUrl, setLinkedInUrl] = useState("");
  const [notes, setNotes] = useState("");
  const apply = useMutation({
    mutationFn: () => api.post(`/public/careers/${companyId}/${postingId}/apply`, { firstName, lastName, email, phone: phone || undefined, resumeUrl: resumeUrl || undefined, linkedInUrl: linkedInUrl || undefined, notes: notes || undefined }),
    onSuccess: () => setSubmitted(true),
    onError: (e) => toast.error(errorMessage(e, "Could not submit the application")),
  });
  if (q.isLoading) return <div className="min-h-screen flex items-center justify-center"><Spinner /></div>;
  if (q.isError) return <div className="min-h-screen flex items-center justify-center p-6"><ErrorState message="This posting is not available" /></div>;
  const p = q.data!;
  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <Link href={`/careers/${companyId}`} className="text-sm text-blue-700 dark:text-blue-400 hover:underline">← All positions</Link>
        <div className="card p-6 sm:p-8 space-y-6">
          <header>
            <h1 className="text-2xl font-semibold">{p.title}</h1>
            <p className="text-sm text-slate-500">{[p.location, p.employmentType.replace("_", " ")].filter(Boolean).join(" · ")}</p>
          </header>
          <p className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">{p.description}</p>
          {submitted ? (
            <p className="border-t pt-4 text-sm font-medium">Thanks for applying — we will be in touch.</p>
          ) : (
            <form className="border-t pt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); apply.mutate(); }}>
              <h2 className="font-semibold">Apply</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="First name" required><input className="input-base" value={firstName} onChange={(e) => setFirstName(e.target.value)} /></Field>
                <Field label="Last name" required><input className="input-base" value={lastName} onChange={(e) => setLastName(e.target.value)} /></Field>
                <Field label="Email" required><input type="email" className="input-base" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
                <Field label="Phone"><input className="input-base" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
                <Field label="Resume link" hint="Google Drive, Dropbox …"><input className="input-base" value={resumeUrl} onChange={(e) => setResumeUrl(e.target.value)} /></Field>
                <Field label="LinkedIn"><input className="input-base" value={linkedInUrl} onChange={(e) => setLinkedInUrl(e.target.value)} /></Field>
              </div>
              <Field label="Anything you'd like to add"><textarea className="input-base" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
              <button className="btn-primary" disabled={!firstName || !lastName || !email || apply.isPending}>Submit application</button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
