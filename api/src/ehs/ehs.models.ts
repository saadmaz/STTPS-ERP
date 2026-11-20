import type { BaseDoc } from "../platform/data/repository.js";

export const EHS_COLLECTIONS = {
  incidents: "ehsIncidents",
  riskAssessments: "ehsRiskAssessments",
  permits: "ehsPermitsToWork",
} as const;

export const INCIDENT_TYPES = ["injury", "near_miss", "property_damage", "environmental", "other"] as const;
export const INCIDENT_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const INCIDENT_STATUSES = ["reported", "investigating", "closed"] as const;
export const RISK_STATUSES = ["draft", "active"] as const;
export const PERMIT_TYPES = ["hot_work", "confined_space", "working_at_height", "electrical", "excavation", "other"] as const;
export const PERMIT_STATUSES = ["pending", "approved", "rejected", "closed"] as const;

export interface IncidentDoc extends BaseDoc {
  number: string;
  title: string;
  incidentType: (typeof INCIDENT_TYPES)[number];
  severity: (typeof INCIDENT_SEVERITIES)[number];
  status: (typeof INCIDENT_STATUSES)[number];
  reportedBy: string;
  occurredAt: string;
  location: string | null;
  description: string;
  injuries: string | null;
  witnesses: string | null;
  rootCause: string | null;
  preventiveActions: string | null;
  closedAt: string | null;
}

export interface RiskHazard {
  hazardId: string;
  hazard: string;
  category: string;
  likelihood: number;
  severity: number;
  riskScore: number;
  controls: string | null;
  residualLikelihood: number | null;
  residualSeverity: number | null;
  residualScore: number | null;
}

export interface RiskAssessmentDoc extends BaseDoc {
  number: string;
  title: string;
  assessedBy: string;
  assessedAt: string;
  reviewDue: string;
  status: (typeof RISK_STATUSES)[number];
  hazards: RiskHazard[];
}

export interface PermitToWorkDoc extends BaseDoc {
  number: string;
  permitType: (typeof PERMIT_TYPES)[number];
  title: string;
  location: string | null;
  requestedBy: string;
  validFrom: string;
  validTo: string;
  conditions: string | null;
  status: (typeof PERMIT_STATUSES)[number];
  approvedBy: string | null;
  closedAt: string | null;
}
