import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import type { Transaction } from "firebase-admin/firestore";
import { FirestoreService } from "../../firestore/firestore.service.js";
import { COLLECTIONS } from "../../firestore/collections.js";
import { UserDoc } from "../../firestore/models.js";
import { AuditService } from "../audit/audit.service.js";
import { hasPermission, RequestContext } from "../context/request-context.js";
import { MasterDataService } from "../crud/master-data.service.js";
import { NewDoc, Patch } from "../data/repository.js";
import { UniqueService } from "../data/unique.service.js";
import { APPROVAL_COLLECTIONS, ApprovalDefinitionDoc, DelegationDoc, StepDefinition } from "./approvals.models.js";
import {
  CreateApprovalDefinitionDto,
  CreateDelegationDto,
  StepDefinitionDto,
  UpdateApprovalDefinitionDto,
  UpdateDelegationDto,
} from "./approvals.dto.js";

function toSteps(steps: StepDefinitionDto[]): StepDefinition[] {
  return steps.map((s) => {
    for (const a of s.approvers) {
      if (["user", "role", "permission"].includes(a.type) && !a.ids?.length) {
        throw new BadRequestException(`Step "${s.name}": approvers of type ${a.type} need ids`);
      }
    }
    return {
      name: s.name,
      approvers: s.approvers.map((a) => ({ type: a.type, ids: a.ids ?? [] })),
      minApprovals: s.minApprovals ?? 1,
      conditions: s.conditions ?? [],
      timeoutHours: s.timeoutHours ?? null,
      escalateTo: s.escalateTo?.map((a) => ({ type: a.type, ids: a.ids ?? [] })) ?? null,
    };
  });
}

@Injectable()
export class ApprovalDefinitionsService extends MasterDataService<ApprovalDefinitionDoc, CreateApprovalDefinitionDto, UpdateApprovalDefinitionDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "workflow",
      entity: "approvalDefinition",
      label: "Approval workflow",
      collection: APPROVAL_COLLECTIONS.definitions,
      permission: "workflow.definition",
      route: "/settings/workflows",
      customFields: false,
      uniqueFields: ["code"],
      filterFields: ["entityType", "isActive"],
      sortFields: ["priority", "code", "name", "createdAt"],
      searchFields: ["code", "name", "entityType"],
    });
  }

  protected toNew(dto: CreateApprovalDefinitionDto): NewDoc<ApprovalDefinitionDoc> {
    return {
      code: dto.code,
      name: dto.name,
      entityType: dto.entityType,
      priority: dto.priority ?? 100,
      conditions: dto.conditions ?? [],
      steps: toSteps(dto.steps),
      allowSelfApproval: dto.allowSelfApproval ?? false,
      isActive: dto.isActive ?? true,
    };
  }

  protected toPatch(dto: UpdateApprovalDefinitionDto): Patch<ApprovalDefinitionDoc> {
    const { steps, ...rest } = dto;
    return { ...rest, ...(steps ? { steps: toSteps(steps) } : {}) } as Patch<ApprovalDefinitionDoc>;
  }
}

@Injectable()
export class DelegationsService extends MasterDataService<DelegationDoc, CreateDelegationDto, UpdateDelegationDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "workflow",
      entity: "delegation",
      label: "Delegation",
      collection: APPROVAL_COLLECTIONS.delegations,
      route: "/settings/delegations",
      customFields: false,
      searchable: false,
      filterFields: ["userId", "delegateUserId"],
      sortFields: ["startDate", "endDate", "createdAt"],
      searchFields: ["userId", "delegateUserId", "reason"],
    });
  }

  protected toNew(dto: CreateDelegationDto, ctx: RequestContext): NewDoc<DelegationDoc> {
    const userId = dto.userId ?? ctx.userId;
    if (userId !== ctx.userId && !hasPermission(ctx, "workflow.delegation.create")) {
      throw new ForbiddenException("You can only delegate your own approvals");
    }
    return {
      userId,
      delegateUserId: dto.delegateUserId,
      startDate: dto.startDate.slice(0, 10),
      endDate: dto.endDate.slice(0, 10),
      entityTypes: dto.entityTypes ?? [],
      reason: dto.reason ?? null,
    };
  }

  protected toPatch(dto: UpdateDelegationDto, before: DelegationDoc, ctx: RequestContext): Patch<DelegationDoc> {
    if (before.userId !== ctx.userId && !hasPermission(ctx, "workflow.delegation.edit")) {
      throw new ForbiddenException("You can only change your own delegations");
    }
    const { userId: _ignored, ...rest } = dto;
    return {
      ...rest,
      ...(dto.startDate ? { startDate: dto.startDate.slice(0, 10) } : {}),
      ...(dto.endDate ? { endDate: dto.endDate.slice(0, 10) } : {}),
    } as Patch<DelegationDoc>;
  }

  protected async validate(tx: Transaction, ctx: RequestContext, next: DelegationDoc): Promise<void> {
    if (next.endDate < next.startDate) throw new BadRequestException("endDate is before startDate");
    if (next.delegateUserId === next.userId) throw new BadRequestException("You cannot delegate to yourself");
    const refs = [next.userId, next.delegateUserId].map((id) => this.firestore.collection<UserDoc>(COLLECTIONS.users).doc(id));
    const users = await tx.getAll(...refs);
    if (users.some((u) => (u.data() as UserDoc | undefined)?.tenantId !== ctx.tenantId)) throw new BadRequestException("User not found");
  }
}
