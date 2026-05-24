"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { Loader2, Plus, Globe, ChevronDown, ChevronUp } from "lucide-react";
import { clsx } from "clsx";
import { toast } from "sonner";
import { format } from "date-fns";

const POSTING_STATUS_COLORS: Record<string, string> = {
  DRAFT: "badge-gray",
  OPEN: "badge-green",
  CLOSED: "badge-red",
  CANCELLED: "badge-red",
};

const STAGE_COLORS: Record<string, string> = {
  APPLIED: "badge-gray",
  SCREENING: "badge-blue",
  INTERVIEW: "badge-yellow",
  OFFER: "badge-violet",
  HIRED: "badge-green",
  REJECTED: "badge-red",
};

const STAGES = ["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "HIRED", "REJECTED"];

export default function RecruitmentPage() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [showPostingForm, setShowPostingForm] = useState(false);
  const [showAppForm, setShowAppForm] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState("");

  const { data: postings, isLoading } = useQuery({
    queryKey: ["job-postings", activeCompany?.id],
    queryFn: () => hrApi.recruitment.postings.list({ limit: 50 }),
    enabled: !!activeCompany,
  });

  const { data: applications } = useQuery({
    queryKey: ["job-applications", activeCompany?.id, expandedId, stageFilter],
    queryFn: () => hrApi.recruitment.applications.list({
      jobPostingId: expandedId ?? undefined,
      stage: stageFilter || undefined,
      limit: 50,
    }),
    enabled: !!activeCompany,
  });

  const postingForm = useForm({
    defaultValues: {
      title: "",
      departmentId: "",
      description: "",
      requirements: "",
      location: "",
      jobType: "FULL_TIME",
      salaryMin: "",
      salaryMax: "",
      closingDate: "",
    },
  });

  const appForm = useForm({
    defaultValues: {
      jobPostingId: "",
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      notes: "",
    },
  });

  const createPostingMutation = useMutation({
    mutationFn: (data: any) => hrApi.recruitment.postings.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["job-postings"] });
      toast.success("Job posting created");
      postingForm.reset();
      setShowPostingForm(false);
    },
    onError: () => toast.error("Failed to create posting"),
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => hrApi.recruitment.postings.publish(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["job-postings"] });
      toast.success("Job posting published");
    },
    onError: () => toast.error("Failed to publish"),
  });

  const createAppMutation = useMutation({
    mutationFn: (data: any) => hrApi.recruitment.applications.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["job-applications"] });
      toast.success("Application added");
      appForm.reset();
      setShowAppForm(null);
    },
    onError: () => toast.error("Failed to add application"),
  });

  const stageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      hrApi.recruitment.applications.updateStage(id, { stage }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["job-applications"] });
      toast.success("Stage updated");
    },
    onError: () => toast.error("Failed to update stage"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  const postingList = postings?.data ?? [];
  const appList = applications?.data ?? [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Recruitment</h1>
          <p className="page-subtitle">{postings?.total ?? 0} job postings</p>
        </div>
        <button className="btn-primary" onClick={() => setShowPostingForm(!showPostingForm)}>
          <Plus size={16} /> New Posting
        </button>
      </div>

      {showPostingForm && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">New Job Posting</h2>
          <form
            onSubmit={postingForm.handleSubmit((v) =>
              createPostingMutation.mutate({
                ...v,
                salaryMin: v.salaryMin ? Number(v.salaryMin) : undefined,
                salaryMax: v.salaryMax ? Number(v.salaryMax) : undefined,
                closingDate: v.closingDate || undefined,
                departmentId: v.departmentId || undefined,
              })
            )}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="form-label">Job Title</label>
                <input className="input-base" {...postingForm.register("title", { required: true })} placeholder="Senior Software Engineer" />
              </div>
              <div>
                <label className="form-label">Job Type</label>
                <select className="input-base" {...postingForm.register("jobType")}>
                  {["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"].map((t) => (
                    <option key={t} value={t}>{t.replace("_", " ")}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Location</label>
                <input className="input-base" {...postingForm.register("location")} placeholder="Remote, New York..." />
              </div>
              <div>
                <label className="form-label">Salary Min</label>
                <input className="input-base" type="number" {...postingForm.register("salaryMin")} />
              </div>
              <div>
                <label className="form-label">Salary Max</label>
                <input className="input-base" type="number" {...postingForm.register("salaryMax")} />
              </div>
              <div>
                <label className="form-label">Closing Date</label>
                <input className="input-base" type="date" {...postingForm.register("closingDate")} />
              </div>
            </div>
            <div>
              <label className="form-label">Description</label>
              <textarea className="input-base" rows={3} {...postingForm.register("description")} />
            </div>
            <div>
              <label className="form-label">Requirements</label>
              <textarea className="input-base" rows={2} {...postingForm.register("requirements")} />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => { postingForm.reset(); setShowPostingForm(false); }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={createPostingMutation.isPending}>
                {createPostingMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Create Posting"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Application pipeline filters */}
      {expandedId && (
        <div className="flex gap-2 mb-4">
          <button onClick={() => setStageFilter("")} className={clsx("text-xs px-3 py-1.5 rounded-lg font-medium", !stageFilter ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>All</button>
          {STAGES.map((s) => (
            <button key={s} onClick={() => setStageFilter(s)} className={clsx("text-xs px-3 py-1.5 rounded-lg font-medium", stageFilter === s ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>{s}</button>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {postingList.length === 0 ? (
          <div className="card p-12 text-center text-slate-400">
            <Globe size={32} className="mx-auto mb-3 text-slate-300" />
            <p>No job postings yet. Create your first posting.</p>
          </div>
        ) : (
          postingList.map((posting: any) => (
            <div key={posting.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <button className="text-slate-400 hover:text-slate-600 mt-0.5" onClick={() => setExpandedId(expandedId === posting.id ? null : posting.id)}>
                    {expandedId === posting.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <div>
                    <p className="font-medium text-slate-800">{posting.title}</p>
                    <p className="text-xs text-slate-500">
                      {posting.jobType?.replace("_", " ")}
                      {posting.location && ` · ${posting.location}`}
                      {(posting.salaryMin || posting.salaryMax) && ` · $${posting.salaryMin?.toLocaleString()}–$${posting.salaryMax?.toLocaleString()}`}
                      {" · "}{posting._count?.applications ?? 0} applicants
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={clsx("badge", POSTING_STATUS_COLORS[posting.status] ?? "badge-gray")}>{posting.status}</span>
                  {posting.status === "DRAFT" && (
                    <button className="btn-secondary text-xs" onClick={() => publishMutation.mutate(posting.id)} disabled={publishMutation.isPending}>
                      Publish
                    </button>
                  )}
                  {posting.status === "OPEN" && (
                    <button className="btn-primary text-xs" onClick={() => { setShowAppForm(posting.id); appForm.setValue("jobPostingId", posting.id); }}>
                      + Applicant
                    </button>
                  )}
                </div>
              </div>

              {/* Add Application Form */}
              {showAppForm === posting.id && (
                <div className="mt-4 ml-6 p-4 bg-slate-50 rounded-lg">
                  <h3 className="text-xs font-semibold text-slate-600 mb-3">Add Applicant</h3>
                  <form
                    onSubmit={appForm.handleSubmit((v) => createAppMutation.mutate(v))}
                    className="grid grid-cols-2 md:grid-cols-3 gap-3"
                  >
                    <input type="hidden" {...appForm.register("jobPostingId")} />
                    <input className="input-base" {...appForm.register("firstName", { required: true })} placeholder="First Name" />
                    <input className="input-base" {...appForm.register("lastName", { required: true })} placeholder="Last Name" />
                    <input className="input-base" type="email" {...appForm.register("email", { required: true })} placeholder="Email" />
                    <input className="input-base" {...appForm.register("phone")} placeholder="Phone" />
                    <input className="input-base" {...appForm.register("notes")} placeholder="Notes" />
                    <div className="flex gap-2">
                      <button type="button" className="btn-secondary text-xs" onClick={() => setShowAppForm(null)}>Cancel</button>
                      <button type="submit" className="btn-primary text-xs" disabled={createAppMutation.isPending}>
                        {createAppMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : "Add"}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Applications */}
              {expandedId === posting.id && (
                <div className="mt-4 ml-6">
                  {appList.length === 0 ? (
                    <p className="text-sm text-slate-400 py-2">No applications yet.</p>
                  ) : (
                    <table className="table-base">
                      <thead>
                        <tr>
                          <th>Applicant</th>
                          <th>Contact</th>
                          <th>Applied</th>
                          <th>Stage</th>
                          <th>Move to</th>
                        </tr>
                      </thead>
                      <tbody>
                        {appList.map((app: any) => (
                          <tr key={app.id}>
                            <td className="font-medium">{app.firstName} {app.lastName}</td>
                            <td className="text-xs text-slate-500">{app.email}</td>
                            <td className="text-xs">{format(new Date(app.appliedAt), "MMM d, yyyy")}</td>
                            <td><span className={clsx("badge", STAGE_COLORS[app.stage] ?? "badge-gray")}>{app.stage}</span></td>
                            <td>
                              <select
                                className="input-base text-xs py-0.5"
                                value={app.stage}
                                onChange={(e) => stageMutation.mutate({ id: app.id, stage: e.target.value })}
                                disabled={stageMutation.isPending}
                              >
                                {STAGES.map((s) => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
