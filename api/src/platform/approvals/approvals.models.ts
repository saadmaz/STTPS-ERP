import { BaseDoc } from "../data/repository.js";

export const APPROVAL_COLLECTIONS = {
  definitions: "approvalDefinitions",
  requests: "approvalRequests",
  delegations: "delegations",
} as const;

export const CONDITION_OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "in", "nin"] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

/** A test against one fact of the record being approved, e.g. amount gte 100000. */
export interface Condition {
  fact: string;
  op: ConditionOp;
  value: string | number | boolean | (string | number)[];
}

export const APPROVER_TYPES = ["user", "role", "permission", "departmentManager", "requesterManager"] as const;
export type ApproverType = (typeof APPROVER_TYPES)[number];

/**
 * Who may approve a step:
 * - user: the listed user ids
 * - role: every user holding one of the listed role ids in the company
 * - permission: every user holding one of the listed permission codes
 * - departmentManager: the manager of the department in fact `departmentId`
 * - requesterManager: the manager of the requester's department (fact `requesterDepartmentId`)
 */
export interface ApproverSpec {
  type: ApproverType;
  ids?: string[];
}

export interface StepDefinition {
  name: string;
  approvers: ApproverSpec[];
  /** How many distinct approvals complete the step; 1 means "any one of", a larger number means parallel approval. */
  minApprovals: number;
  /** Only evaluated when all conditions hold; lets one definition skip steps (e.g. director approval above a threshold). */
  conditions?: Condition[];
  /** Escalate when the step is still pending after this many hours. */
  timeoutHours?: number | null;
  escalateTo?: ApproverSpec[] | null;
}

export interface ApprovalDefinitionDoc extends BaseDoc {
  code: string;
  name: string;
  /** What it approves, e.g. "procurement.requisition". */
  entityType: string;
  /** Definitions are tried in ascending priority; the first whose conditions match is used. */
  priority: number;
  conditions: Condition[];
  steps: StepDefinition[];
  /** Whether the requester may approve their own request. */
  allowSelfApproval: boolean;
  isActive: boolean;
}

export type ApprovalStatus = "pending" | "approved" | "rejected" | "changes_requested" | "cancelled";
export type Decision = "approved" | "rejected" | "changes_requested" | "reassigned" | "escalated" | "cancelled" | "auto_approved";

export interface RequestStep {
  name: string;
  minApprovals: number;
  /** Resolved user ids allowed to act on this step. */
  approverIds: string[];
  approvedBy: string[];
  status: "waiting" | "pending" | "approved" | "rejected" | "skipped";
  startedAt: string | null;
  completedAt: string | null;
  timeoutHours: number | null;
  escalateTo: ApproverSpec[] | null;
  escalated: boolean;
}

export interface DecisionRecord {
  step: number;
  userId: string;
  /** Set when a delegate acted for the approver. */
  onBehalfOf: string | null;
  decision: Decision;
  comment: string | null;
  at: string;
}

export interface ApprovalRequestDoc extends BaseDoc {
  definitionId: string | null;
  definitionName: string;
  entityType: string;
  entityId: string;
  /** Human label of the record, e.g. "PR-2026-000042 · 12 laptops". */
  entityLabel: string;
  /** Link to the record in the staff app. */
  link: string | null;
  facts: Record<string, unknown>;
  requesterId: string;
  status: ApprovalStatus;
  currentStep: number;
  steps: RequestStep[];
  decisions: DecisionRecord[];
  /** `${companyId}:${userId}` for every user who can act now; drives "waiting for me" queries without composite indexes. */
  pendingKeys: string[];
  completedAt: string | null;
}

export interface DelegationDoc extends BaseDoc {
  /** The approver who is away. */
  userId: string;
  delegateUserId: string;
  startDate: string;
  endDate: string;
  /** Entity types covered; empty means all. */
  entityTypes: string[];
  reason: string | null;
}

/** Published on the event bus when a request reaches a final state; modules subscribe to move their record on. */
export const APPROVAL_COMPLETED = "ApprovalCompleted";

export interface ApprovalCompletedPayload {
  requestId: string;
  entityType: string;
  entityId: string;
  outcome: "approved" | "rejected" | "changes_requested" | "cancelled";
  comment: string | null;
  decidedBy: string | null;
}
