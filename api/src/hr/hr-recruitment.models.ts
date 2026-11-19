import type { BaseDoc } from "../platform/data/repository.js";
import type { LargeListSpec } from "../platform/data/indexes.js";

export const RECRUITMENT_COLLECTIONS = {
  requisitions: "hrJobRequisitions",
  postings: "hrJobPostings",
  candidates: "hrCandidates",
} as const;

export const REQUISITION_STATUSES = ["draft", "pending_approval", "approved", "rejected", "closed", "cancelled"] as const;

/** A request to hire into a position, routed through the approval engine (blueprint §11). */
export interface JobRequisitionDoc extends BaseDoc {
  number: string;
  positionId: string;
  departmentId: string | null;
  branchId: string | null;
  openings: number;
  /** Candidates hired against this requisition so far. */
  filledCount: number;
  justification: string;
  /** An employee, usually the position's department manager. */
  hiringManagerId: string | null;
  currency: string;
  targetSalaryMin: number | null;
  targetSalaryMax: number | null;
  status: (typeof REQUISITION_STATUSES)[number];
  notes: string | null;
}

export const POSTING_STATUSES = ["draft", "published", "closed"] as const;

/** A job ad for an approved requisition; published postings appear on the public career page. */
export interface JobPostingDoc extends BaseDoc {
  requisitionId: string;
  title: string;
  description: string;
  location: string | null;
  employmentType: string;
  status: (typeof POSTING_STATUSES)[number];
  publishedAt: string | null;
  closedAt: string | null;
}

/** Applied → Screening → Shortlisted → Interview → Assessment → Final Interview → Offer → Hired / Rejected (blueprint §11). */
export const PIPELINE_STAGES = ["applied", "screening", "shortlisted", "interview", "assessment", "final_interview", "offer", "hired", "rejected"] as const;
export const INTERVIEW_TYPES = ["phone", "video", "onsite", "technical", "panel", "other"] as const;
export const CANDIDATE_SOURCES = ["career_page", "referral", "agency", "direct", "other"] as const;

export interface InterviewEntry {
  interviewId: string;
  scheduledAt: string;
  type: (typeof INTERVIEW_TYPES)[number];
  /** An employee. */
  interviewerId: string | null;
  status: "scheduled" | "completed" | "cancelled";
  /** 1–5. */
  rating: number | null;
  comments: string | null;
}

export interface Offer {
  /** Minor units of `currency`. */
  salary: number | null;
  currency: string;
  startDate: string | null;
  status: "none" | "extended" | "accepted" | "declined";
  extendedAt: string | null;
  notes: string | null;
}

export interface CandidateDoc extends BaseDoc {
  postingId: string | null;
  requisitionId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  /** A link the candidate provides (Drive, Dropbox, LinkedIn …); staff attach copies through the record's Files tab. */
  resumeUrl: string | null;
  linkedInUrl: string | null;
  source: (typeof CANDIDATE_SOURCES)[number];
  stage: (typeof PIPELINE_STAGES)[number];
  /** Average of completed interview ratings (1–5), one decimal place. */
  score: number | null;
  skills: string[];
  notes: string | null;
  interviews: InterviewEntry[];
  offer: Offer;
  rejectionReason: string | null;
  hiredAt: string | null;
  /** Set once hired. */
  employeeId: string | null;
}

export const RECRUITMENT_LISTS: Record<"candidates", LargeListSpec> = {
  candidates: { filters: ["stage", "postingId", "requisitionId", "source"], sorts: [{ field: "createdAt", direction: "desc" }] },
};
