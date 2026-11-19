import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable } from "@nestjs/common";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { RequestContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { CreateIncidentDto, CreatePermitDto, CreateRiskAssessmentDto, InvestigateIncidentDto, RiskHazardDto, UpdateIncidentDto, UpdatePermitDto, UpdateRiskAssessmentDto } from "./ehs.dto.js";
import { EHS_COLLECTIONS, IncidentDoc, PermitToWorkDoc, RiskAssessmentDoc, RiskHazard } from "./ehs.models.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);
const today = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class IncidentService extends MasterDataService<IncidentDoc, CreateIncidentDto, UpdateIncidentDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "ehs", entity: "incident", label: "Incident", collection: EHS_COLLECTIONS.incidents, route: "/ehs/incidents",
      filterFields: ["status", "incidentType", "severity"], numbering: { field: "number", key: "ehsIncident", prefix: "INC", yearly: true }, customFields: false,
    });
  }

  protected toNew(dto: CreateIncidentDto, ctx: RequestContext): NewDoc<IncidentDoc> {
    return {
      number: "", title: dto.title, incidentType: dto.incidentType ?? "other", severity: dto.severity ?? "medium", status: "reported",
      reportedBy: ctx.userId, occurredAt: dto.occurredAt, location: orNull(dto.location), description: dto.description,
      injuries: orNull(dto.injuries), witnesses: orNull(dto.witnesses), rootCause: null, preventiveActions: null, closedAt: null,
    };
  }

  async investigate(ctx: RequestContext, id: string, dto: InvestigateIncidentDto): Promise<IncidentDoc> {
    const incident = await this.repo.get(ctx, id);
    if (incident.status === "closed") throw new BadRequestException("This incident is closed");
    return (
      await this.repo.update(ctx, id, {
        status: "investigating", rootCause: dto.rootCause !== undefined ? orNull(dto.rootCause) : incident.rootCause,
        preventiveActions: dto.preventiveActions !== undefined ? orNull(dto.preventiveActions) : incident.preventiveActions,
      } as Patch<IncidentDoc>)
    ).after;
  }

  async close(ctx: RequestContext, id: string): Promise<IncidentDoc> {
    const incident = await this.repo.get(ctx, id);
    if (incident.status === "closed") throw new BadRequestException("Already closed");
    return (await this.repo.update(ctx, id, { status: "closed", closedAt: new Date().toISOString() } as Patch<IncidentDoc>)).after;
  }

  protected searchEntry(doc: IncidentDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: `${doc.number} · ${doc.title}`, subtitle: doc.severity };
  }
}

@Injectable()
export class RiskAssessmentService extends MasterDataService<RiskAssessmentDoc, CreateRiskAssessmentDto, UpdateRiskAssessmentDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "ehs", entity: "riskAssessment", label: "Risk assessment", collection: EHS_COLLECTIONS.riskAssessments, route: "/ehs/risk-assessments",
      filterFields: ["status"], numbering: { field: "number", key: "ehsRisk", prefix: "RA", yearly: true }, customFields: false,
    });
  }

  private hazard(dto: RiskHazardDto): RiskHazard {
    const residualScore = dto.residualLikelihood && dto.residualSeverity ? dto.residualLikelihood * dto.residualSeverity : null;
    return {
      hazardId: randomUUID().slice(0, 8), hazard: dto.hazard, category: dto.category ?? "general", likelihood: dto.likelihood, severity: dto.severity,
      riskScore: dto.likelihood * dto.severity, controls: orNull(dto.controls), residualLikelihood: orNull(dto.residualLikelihood),
      residualSeverity: orNull(dto.residualSeverity), residualScore,
    };
  }

  protected toNew(dto: CreateRiskAssessmentDto, ctx: RequestContext): NewDoc<RiskAssessmentDoc> {
    return {
      number: "", title: dto.title, assessedBy: ctx.userId, assessedAt: today(), reviewDue: dto.reviewDue, status: "draft",
      hazards: (dto.hazards ?? []).map((h) => this.hazard(h)),
    };
  }

  protected toPatch(dto: UpdateRiskAssessmentDto): Patch<RiskAssessmentDoc> {
    const { hazards, ...rest } = dto;
    return { ...rest, ...(hazards ? { hazards: hazards.map((h) => this.hazard(h)) } : {}) } as Patch<RiskAssessmentDoc>;
  }

  async activate(ctx: RequestContext, id: string): Promise<RiskAssessmentDoc> {
    const risk = await this.repo.get(ctx, id);
    if (risk.hazards.length === 0) throw new BadRequestException("Add at least one hazard before activating this risk assessment");
    return (await this.repo.update(ctx, id, { status: "active" } as Patch<RiskAssessmentDoc>)).after;
  }

  protected searchEntry(doc: RiskAssessmentDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: `${doc.number} · ${doc.title}`, subtitle: doc.status };
  }
}

@Injectable()
export class PermitToWorkService extends MasterDataService<PermitToWorkDoc, CreatePermitDto, UpdatePermitDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "ehs", entity: "permit", label: "Permit to work", collection: EHS_COLLECTIONS.permits, route: "/ehs/permits",
      filterFields: ["status", "permitType"], numbering: { field: "number", key: "ehsPermit", prefix: "PTW", yearly: true }, customFields: false,
    });
  }

  protected toNew(dto: CreatePermitDto, ctx: RequestContext): NewDoc<PermitToWorkDoc> {
    return {
      number: "", permitType: dto.permitType ?? "other", title: dto.title, location: orNull(dto.location), requestedBy: ctx.userId,
      validFrom: dto.validFrom, validTo: dto.validTo, conditions: orNull(dto.conditions), status: "pending", approvedBy: null, closedAt: null,
    };
  }

  async approve(ctx: RequestContext, id: string): Promise<PermitToWorkDoc> {
    const permit = await this.repo.get(ctx, id);
    if (permit.status !== "pending") throw new BadRequestException(`A ${permit.status} permit cannot be approved`);
    return (await this.repo.update(ctx, id, { status: "approved", approvedBy: ctx.userId } as Patch<PermitToWorkDoc>)).after;
  }

  async reject(ctx: RequestContext, id: string): Promise<PermitToWorkDoc> {
    const permit = await this.repo.get(ctx, id);
    if (permit.status !== "pending") throw new BadRequestException(`A ${permit.status} permit cannot be rejected`);
    return (await this.repo.update(ctx, id, { status: "rejected" } as Patch<PermitToWorkDoc>)).after;
  }

  async close(ctx: RequestContext, id: string): Promise<PermitToWorkDoc> {
    const permit = await this.repo.get(ctx, id);
    if (permit.status === "closed") throw new BadRequestException("Already closed");
    return (await this.repo.update(ctx, id, { status: "closed", closedAt: new Date().toISOString() } as Patch<PermitToWorkDoc>)).after;
  }

  protected searchEntry(doc: PermitToWorkDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: `${doc.number} · ${doc.title}`, subtitle: doc.status };
  }
}
