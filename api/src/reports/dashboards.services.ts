import { Injectable } from "@nestjs/common";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { RequestContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { NotificationDoc, NotificationsService } from "../platform/notifications/notifications.service.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { CreateDashboardDto, CreateKpiDefinitionDto, DashboardWidgetDto, UpdateDashboardDto, UpdateKpiDefinitionDto } from "./dashboards.dto.js";
import { DASHBOARD_COLLECTIONS, DashboardDoc, DashboardWidget, KpiDefinitionDoc, KpiStatus } from "./dashboards.models.js";
import { ReportingEngineService, ReportRunResult } from "./reports.services.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);
const toWidget = (w: DashboardWidgetDto): DashboardWidget => ({
  id: w.id, type: w.type, title: w.title, kpiId: orNull(w.kpiId), reportId: orNull(w.reportId),
  chartType: orNull(w.chartType), alertCategory: orNull(w.alertCategory), x: w.x, y: w.y, w: w.w, h: w.h,
});

@Injectable()
export class KpiDefinitionService extends MasterDataService<KpiDefinitionDoc, CreateKpiDefinitionDto, UpdateKpiDefinitionDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "analytics", entity: "kpiDefinition", label: "KPI", collection: DASHBOARD_COLLECTIONS.kpis, route: "/reports/kpis",
      filterFields: ["reportId"], customFields: false,
    });
  }

  protected toNew(dto: CreateKpiDefinitionDto): NewDoc<KpiDefinitionDoc> {
    return {
      name: dto.name, description: orNull(dto.description), reportId: dto.reportId, metric: dto.metric,
      target: orNull(dto.target), warningThreshold: orNull(dto.warningThreshold), criticalThreshold: orNull(dto.criticalThreshold),
      direction: dto.direction ?? "higher_is_better", ownerUserId: orNull(dto.ownerUserId), frequency: orNull(dto.frequency),
    };
  }

  protected toPatch(dto: UpdateKpiDefinitionDto): Patch<KpiDefinitionDoc> {
    return { ...dto } as Patch<KpiDefinitionDoc>;
  }

  protected searchEntry(doc: KpiDefinitionDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.name, subtitle: doc.metric };
  }
}

@Injectable()
export class DashboardService extends MasterDataService<DashboardDoc, CreateDashboardDto, UpdateDashboardDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "analytics", entity: "dashboard", label: "Dashboard", collection: DASHBOARD_COLLECTIONS.dashboards, route: "/reports/dashboards",
      filterFields: ["shared", "ownerUserId"], customFields: false,
    });
  }

  protected toNew(dto: CreateDashboardDto, ctx: RequestContext): NewDoc<DashboardDoc> {
    return { name: dto.name, description: orNull(dto.description), widgets: (dto.widgets ?? []).map(toWidget), shared: dto.shared ?? false, ownerUserId: ctx.userId };
  }

  protected toPatch(dto: UpdateDashboardDto): Patch<DashboardDoc> {
    const { widgets, ...rest } = dto;
    return { ...rest, ...(widgets ? { widgets: widgets.map(toWidget) } : {}) } as Patch<DashboardDoc>;
  }

  protected searchEntry(doc: DashboardDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.name, subtitle: doc.shared ? "Shared" : "Private" };
  }
}

export interface KpiResult {
  name: string;
  value: number | null;
  status: KpiStatus;
  target: number | null;
  warningThreshold: number | null;
  criticalThreshold: number | null;
  direction: KpiDefinitionDoc["direction"];
}

function statusOf(value: number | null, kpi: KpiDefinitionDoc): Pick<KpiResult, "status" | "target" | "warningThreshold" | "criticalThreshold" | "direction"> {
  const base = { target: kpi.target, warningThreshold: kpi.warningThreshold, criticalThreshold: kpi.criticalThreshold, direction: kpi.direction };
  if (value === null || (kpi.warningThreshold === null && kpi.criticalThreshold === null)) return { ...base, status: "unknown" };
  const worseThan = kpi.direction === "higher_is_better" ? (a: number, b: number) => a < b : (a: number, b: number) => a > b;
  if (kpi.criticalThreshold !== null && worseThan(value, kpi.criticalThreshold)) return { ...base, status: "critical" };
  if (kpi.warningThreshold !== null && worseThan(value, kpi.warningThreshold)) return { ...base, status: "warning" };
  return { ...base, status: "ok" };
}

export type DashboardWidgetResult =
  | { id: string; type: "kpi"; data: KpiResult | null; error?: string }
  | { id: string; type: "alerts"; data: NotificationDoc[] | null; error?: string }
  | { id: string; type: "report_table" | "report_chart" | "report_pivot"; data: ReportRunResult | null; error?: string };

/**
 * Computes a KPI's live value (and a widget's live data) on demand — there
 * is no materialised snapshot, so a dashboard always reflects the current
 * data, at the cost of recomputing every widget's underlying report on
 * every `run`. Each KPI/report widget inherits `ReportingEngineService.run()`'s
 * own source-permission check for free; an "alerts" widget needs none,
 * since it only ever reads the caller's own notifications.
 */
@Injectable()
export class DashboardEngineService {
  constructor(
    private readonly kpis: KpiDefinitionService,
    private readonly dashboards: DashboardService,
    private readonly reports: ReportingEngineService,
    private readonly notifications: NotificationsService,
  ) {}

  async runKpi(ctx: RequestContext, id: string): Promise<KpiResult> {
    const kpi = await this.kpis.repo.get(ctx, id);
    const result = await this.reports.run(ctx, kpi.reportId);
    const value = typeof result.summary[kpi.metric] === "number" ? result.summary[kpi.metric]! : null;
    return { name: kpi.name, value, ...statusOf(value, kpi) };
  }

  async runDashboard(ctx: RequestContext, id: string): Promise<{ dashboard: DashboardDoc; widgets: DashboardWidgetResult[] }> {
    const dashboard = await this.dashboards.repo.get(ctx, id);
    const widgets = await Promise.all(dashboard.widgets.map((w) => this.runWidget(ctx, w)));
    return { dashboard, widgets };
  }

  private async runWidget(ctx: RequestContext, w: DashboardWidget): Promise<DashboardWidgetResult> {
    try {
      if (w.type === "kpi") {
        if (!w.kpiId) return { id: w.id, type: "kpi", data: null };
        return { id: w.id, type: "kpi", data: await this.runKpi(ctx, w.kpiId) };
      }
      if (w.type === "alerts") {
        const all = await this.notifications.listMine(ctx.userId, { unreadOnly: true, limit: 50 });
        const filtered = w.alertCategory ? all.filter((n) => n.category === w.alertCategory) : all;
        return { id: w.id, type: "alerts", data: filtered.slice(0, 10) };
      }
      if (!w.reportId) return { id: w.id, type: w.type, data: null };
      return { id: w.id, type: w.type, data: await this.reports.run(ctx, w.reportId) };
    } catch (error) {
      return { id: w.id, type: w.type, data: null, error: (error as Error).message.slice(0, 300) };
    }
  }
}
