import type { BaseDoc } from "../platform/data/repository.js";

export const AGENT_ACTION_COLLECTIONS = { actions: "aiAgentActions" } as const;

/** Blueprint §28's five permission tiers. */
export const AGENT_TIERS = ["read_only", "draft", "recommend", "low_risk_execute", "approval_required_execute"] as const;
export const AGENT_ACTION_STATUSES = ["executed", "pending_approval", "approved", "rejected", "failed"] as const;

/**
 * One call to `AiAgentService.act()` — always written, regardless of tier
 * (the audit trail blueprint §28 asks for), and for `approval_required_execute`
 * the record an `ApprovalRequest` points at until a human decides it.
 */
export interface AgentActionDoc extends BaseDoc {
  actionName: string;
  domain: string;
  tier: (typeof AGENT_TIERS)[number];
  input: Record<string, unknown>;
  status: (typeof AGENT_ACTION_STATUSES)[number];
  result: Record<string, unknown> | null;
  error: string | null;
  requestedBy: string;
}
