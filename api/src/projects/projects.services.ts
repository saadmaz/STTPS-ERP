import { BadRequestException, Injectable } from "@nestjs/common";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { RequestContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { toMinor } from "../platform/data/money.js";
import { NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { InvoiceService } from "../finance/ar.services.js";
import { InvoiceDoc } from "../finance/ar.models.js";
import { CRM_COLLECTIONS } from "../crm/crm.models.js";
import { TimeEntryService } from "../tasks/tasks.services.js";
import { BillProjectDto, CreateMilestoneDto, CreatePhaseDto, CreateProjectCostDto, CreateProjectDto, UpdateMilestoneDto, UpdatePhaseDto, UpdateProjectCostDto, UpdateProjectDto } from "./projects.dto.js";
import { MilestoneDoc, PROJECT_COLLECTIONS, ProjectCostDoc, ProjectDoc, ProjectPhaseDoc } from "./projects.models.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);

@Injectable()
export class ProjectPhaseService extends MasterDataService<ProjectPhaseDoc, CreatePhaseDto, UpdatePhaseDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "projects", entity: "phase", label: "Project phase", collection: PROJECT_COLLECTIONS.phases, route: "/projects/phases",
      filterFields: ["projectId"], references: [{ field: "projectId", collection: PROJECT_COLLECTIONS.projects, label: "Project" }], customFields: false,
    });
  }

  protected toNew(dto: CreatePhaseDto): NewDoc<ProjectPhaseDoc> {
    return { projectId: dto.projectId, name: dto.name, sequence: dto.sequence ?? 0, startDate: dto.startDate?.slice(0, 10) ?? null, endDate: dto.endDate?.slice(0, 10) ?? null, status: "not_started" };
  }

  async forProject(ctx: RequestContext, projectId: string): Promise<ProjectPhaseDoc[]> {
    const all = await this.loadAll(ctx);
    return all.filter((p) => p.projectId === projectId).sort((a, b) => a.sequence - b.sequence);
  }

  protected searchEntry(doc: ProjectPhaseDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.name, subtitle: doc.status };
  }
}

@Injectable()
export class MilestoneService extends MasterDataService<MilestoneDoc, CreateMilestoneDto, UpdateMilestoneDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "projects", entity: "milestone", label: "Milestone", collection: PROJECT_COLLECTIONS.milestones, route: "/projects/milestones",
      filterFields: ["projectId"], references: [{ field: "projectId", collection: PROJECT_COLLECTIONS.projects, label: "Project" }], customFields: false,
    });
  }

  protected toNew(dto: CreateMilestoneDto): NewDoc<MilestoneDoc> {
    return { projectId: dto.projectId, phaseId: orNull(dto.phaseId), name: dto.name, dueDate: dto.dueDate?.slice(0, 10) ?? null, status: "pending", completedAt: null, notes: orNull(dto.notes) };
  }

  async complete(ctx: RequestContext, id: string): Promise<MilestoneDoc> {
    return (await this.repo.update(ctx, id, { status: "completed", completedAt: new Date().toISOString() } as Patch<MilestoneDoc>)).after;
  }

  async forProject(ctx: RequestContext, projectId: string): Promise<MilestoneDoc[]> {
    const all = await this.loadAll(ctx);
    return all.filter((m) => m.projectId === projectId);
  }

  protected searchEntry(doc: MilestoneDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.name, subtitle: doc.status };
  }
}

@Injectable()
export class ProjectCostService extends MasterDataService<ProjectCostDoc, CreateProjectCostDto, UpdateProjectCostDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "projects", entity: "projectCost", label: "Project cost", collection: PROJECT_COLLECTIONS.costs, route: "/projects/costs",
      filterFields: ["projectId", "category"], references: [{ field: "projectId", collection: PROJECT_COLLECTIONS.projects, label: "Project" }], customFields: false,
    });
  }

  protected toNew(dto: CreateProjectCostDto): NewDoc<ProjectCostDoc> {
    return { projectId: dto.projectId, category: dto.category, amount: toMinor(dto.amount, "LKR"), date: dto.date.slice(0, 10), description: orNull(dto.description) };
  }

  async forProject(ctx: RequestContext, projectId: string): Promise<ProjectCostDoc[]> {
    const all = await this.loadAll(ctx);
    return all.filter((c) => c.projectId === projectId);
  }

  protected searchEntry(doc: ProjectCostDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.description ?? doc.category, subtitle: doc.category };
  }
}

@Injectable()
export class ProjectService extends MasterDataService<ProjectDoc, CreateProjectDto, UpdateProjectDto> {
  constructor(
    fs: FirestoreService,
    audit: AuditService,
    unique: UniqueService,
    private readonly invoices: InvoiceService,
    private readonly phases: ProjectPhaseService,
    private readonly milestones: MilestoneService,
    private readonly costs: ProjectCostService,
    private readonly timeEntries: TimeEntryService,
  ) {
    super(fs, audit, unique, {
      module: "projects", entity: "project", label: "Project", collection: PROJECT_COLLECTIONS.projects, route: "/projects", uniqueFields: ["code"],
      references: [{ field: "customerId", collection: CRM_COLLECTIONS.accounts, label: "Customer" }], customFields: false,
    });
  }

  protected toNew(dto: CreateProjectDto): NewDoc<ProjectDoc> {
    const currency = dto.currency ?? "LKR";
    return {
      code: dto.code, name: dto.name, customerId: orNull(dto.customerId), managerId: orNull(dto.managerId), teamUserIds: dto.teamUserIds ?? [],
      departmentId: orNull(dto.departmentId), branchId: orNull(dto.branchId), startDate: dto.startDate?.slice(0, 10) ?? null, endDate: dto.endDate?.slice(0, 10) ?? null,
      status: "planning", priority: dto.priority ?? "medium", currency, budget: dto.budget ? toMinor(dto.budget, currency) : null,
      estimatedRevenue: dto.estimatedRevenue ? toMinor(dto.estimatedRevenue, currency) : null, estimatedCost: dto.estimatedCost ? toMinor(dto.estimatedCost, currency) : null,
      billingMethod: dto.billingMethod ?? "fixed", billedToDate: 0, description: orNull(dto.description), notes: orNull(dto.notes),
    };
  }

  protected toPatch(dto: UpdateProjectDto, before: ProjectDoc): Patch<ProjectDoc> {
    const { startDate, endDate, budget, estimatedRevenue, estimatedCost, ...rest } = dto;
    const patch = { ...rest } as Patch<ProjectDoc>;
    if (startDate !== undefined) Object.assign(patch, { startDate: startDate?.slice(0, 10) ?? null });
    if (endDate !== undefined) Object.assign(patch, { endDate: endDate?.slice(0, 10) ?? null });
    if (budget !== undefined) Object.assign(patch, { budget: budget ? toMinor(budget, before.currency) : null });
    if (estimatedRevenue !== undefined) Object.assign(patch, { estimatedRevenue: estimatedRevenue ? toMinor(estimatedRevenue, before.currency) : null });
    if (estimatedCost !== undefined) Object.assign(patch, { estimatedCost: estimatedCost ? toMinor(estimatedCost, before.currency) : null });
    return patch;
  }

  /** Raises an invoice for the project's customer and tracks it toward `billedToDate`. The billing method decides only the invoice's `invoiceType`, not any automatic amount or schedule. */
  async bill(ctx: RequestContext, id: string, dto: BillProjectDto): Promise<InvoiceDoc> {
    const project = await this.repo.get(ctx, id);
    if (!project.customerId) throw new BadRequestException("This project has no customer to bill");
    const invoice = await this.invoices.create(ctx, {
      customerId: project.customerId, invoiceType: project.billingMethod === "milestone" ? "milestone" : undefined,
      lines: [{ description: dto.description, qty: "1", unitPrice: dto.amount }], notes: `${project.code} — ${project.name}`,
    });
    await this.repo.update(ctx, id, { billedToDate: project.billedToDate + invoice.totals.total } as Patch<ProjectDoc>);
    return invoice;
  }

  /** Budget vs actual, from labour (time entries' recorded cost) and material/contractor/other costs, against what's been billed. */
  async summary(ctx: RequestContext, id: string) {
    const project = await this.repo.get(ctx, id);
    const [phases, milestones, costs, timeEntries] = await Promise.all([
      this.phases.forProject(ctx, id), this.milestones.forProject(ctx, id), this.costs.forProject(ctx, id), this.timeEntries.forProject(ctx, id),
    ]);
    const laborCost = timeEntries.reduce((a, e) => a + (e.cost ?? 0), 0);
    const laborHours = timeEntries.reduce((a, e) => a + e.hours, 0);
    const materialCost = costs.reduce((a, c) => a + c.amount, 0);
    const actualCost = laborCost + materialCost;
    return {
      project, phases, milestones, costs,
      laborCost, laborHours, materialCost, actualCost,
      budgetVariance: project.budget !== null ? project.budget - actualCost : null,
      billedToDate: project.billedToDate,
      profitability: project.billedToDate - actualCost,
    };
  }

  protected searchEntry(doc: ProjectDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.name, subtitle: doc.code };
  }
}
