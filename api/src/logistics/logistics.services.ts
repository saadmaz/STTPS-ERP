import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { RequestContext } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { toMinor, toQty } from "../platform/data/money.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { DeliveryService } from "../sales/sales.services.js";
import {
  ArriveStopDto, CompleteStopDto, CreateFuelLogDto, CreateRouteDto, CreateVehicleDto, FailStopDto, RouteStopDto,
  UpdateFuelLogDto, UpdateRouteDto, UpdateVehicleDto,
} from "./logistics.dto.js";
import { FuelLogDoc, LOGISTICS_COLLECTIONS, LOGISTICS_LISTS, RouteDoc, RouteStop, VehicleDoc } from "./logistics.models.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);

@Injectable()
export class VehicleService extends MasterDataService<VehicleDoc, CreateVehicleDto, UpdateVehicleDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "logistics", entity: "vehicle", label: "Vehicle", collection: LOGISTICS_COLLECTIONS.vehicles, route: "/logistics/vehicles",
      uniqueFields: ["code"], filterFields: ["status", "driverId"], customFields: false,
    });
  }

  protected toNew(dto: CreateVehicleDto): NewDoc<VehicleDoc> {
    return {
      code: dto.code, name: dto.name, type: dto.type, registrationNo: orNull(dto.registrationNo), driverId: orNull(dto.driverId),
      odometerKm: dto.odometerKm ?? 0, insuranceExpiry: orNull(dto.insuranceExpiry), licenceExpiry: orNull(dto.licenceExpiry), status: "active", notes: orNull(dto.notes),
    };
  }

  protected searchEntry(doc: VehicleDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.name, subtitle: doc.code };
  }
}

@Injectable()
export class FuelLogService extends MasterDataService<FuelLogDoc, CreateFuelLogDto, UpdateFuelLogDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService, private readonly vehicles: VehicleService) {
    super(fs, audit, unique, {
      module: "logistics", entity: "fuelLog", label: "Fuel log", collection: LOGISTICS_COLLECTIONS.fuelLogs, route: "/logistics/fuel-logs",
      filterFields: ["vehicleId"], customFields: false,
    });
  }

  /** Records the fill-up and keeps the vehicle's own odometer current if this reading is higher. */
  async create(ctx: RequestContext, dto: CreateFuelLogDto): Promise<FuelLogDoc> {
    const log = await super.create(ctx, dto);
    const vehicle = await this.vehicles.repo.get(ctx, dto.vehicleId);
    if (dto.odometerKm > vehicle.odometerKm) await this.vehicles.repo.update(ctx, dto.vehicleId, { odometerKm: dto.odometerKm } as Patch<VehicleDoc>);
    return log;
  }

  protected toNew(dto: CreateFuelLogDto): NewDoc<FuelLogDoc> {
    return { vehicleId: dto.vehicleId, date: dto.date.slice(0, 10), odometerKm: dto.odometerKm, litres: toQty(dto.litres), cost: toMinor(dto.cost, "LKR"), notes: orNull(dto.notes) };
  }

  protected searchEntry(doc: FuelLogDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: `${doc.vehicleId} · ${doc.date}`, subtitle: null };
  }
}

@Injectable()
export class RouteService extends MasterDataService<RouteDoc, CreateRouteDto, UpdateRouteDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService, private readonly deliveries: DeliveryService) {
    super(fs, audit, unique, {
      module: "logistics", entity: "route", label: "Route", collection: LOGISTICS_COLLECTIONS.routes, route: "/logistics/routes",
      large: LOGISTICS_LISTS.routes, filterFields: ["status", "vehicleId", "driverId"],
      numbering: { field: "number", key: "logisticsRoute", prefix: "RT", yearly: true }, customFields: false,
    });
  }

  private stop(dto: RouteStopDto, seq: number): RouteStop {
    return { stopId: randomUUID().slice(0, 8), deliveryId: dto.deliveryId, sequence: dto.sequence ?? seq, status: "pending", arrivedAt: null, completedAt: null, failureReason: null, proofNote: null };
  }

  protected toNew(dto: CreateRouteDto): NewDoc<RouteDoc> {
    return {
      number: "", vehicleId: dto.vehicleId, driverId: orNull(dto.driverId), date: dto.date.slice(0, 10), status: "planned",
      stops: dto.stops.map((s, i) => this.stop(s, i + 1)).sort((a, b) => a.sequence - b.sequence), notes: orNull(dto.notes),
    };
  }

  protected toPatch(dto: UpdateRouteDto): Patch<RouteDoc> {
    const { stops, ...rest } = dto;
    return { ...rest, ...(stops ? { stops: stops.map((s, i) => this.stop(s, i + 1)).sort((a, b) => a.sequence - b.sequence) } : {}) } as Patch<RouteDoc>;
  }

  /** Dispatches every stop's underlying delivery (issuing its stock) through `DeliveryService`, then the route itself. */
  async dispatch(ctx: RequestContext, id: string): Promise<RouteDoc> {
    const route = await this.repo.get(ctx, id);
    if (route.status !== "planned") throw new BadRequestException(`A ${route.status} route cannot be dispatched`);
    for (const stop of route.stops) {
      const delivery = await this.deliveries.repo.get(ctx, stop.deliveryId);
      if (delivery.status !== "dispatched") await this.deliveries.dispatch(ctx, stop.deliveryId);
    }
    return (await this.repo.update(ctx, id, { status: "dispatched" } as Patch<RouteDoc>)).after;
  }

  private findStop(route: RouteDoc, stopId: string): RouteStop {
    const stop = route.stops.find((s) => s.stopId === stopId);
    if (!stop) throw new NotFoundException(`No stop ${stopId} on this route`);
    return stop;
  }

  private settle(route: RouteDoc, stops: RouteStop[]): Patch<RouteDoc> {
    const done = stops.every((s) => ["delivered", "failed"].includes(s.status));
    return { stops, status: done ? "completed" : "in_progress" } as Patch<RouteDoc>;
  }

  async arrive(ctx: RequestContext, id: string, dto: ArriveStopDto): Promise<RouteDoc> {
    const route = await this.repo.get(ctx, id);
    const stop = this.findStop(route, dto.stopId);
    if (stop.status !== "pending") throw new BadRequestException(`This stop is already ${stop.status}`);
    const stops = route.stops.map((s) => (s.stopId === dto.stopId ? { ...s, status: "arrived" as const, arrivedAt: new Date().toISOString() } : s));
    return (await this.repo.update(ctx, id, this.settle(route, stops))).after;
  }

  /** Confirms proof of delivery through `DeliveryService.deliver`, then settles the stop and (once every stop is done) the route. */
  async completeStop(ctx: RequestContext, id: string, dto: CompleteStopDto): Promise<RouteDoc> {
    const route = await this.repo.get(ctx, id);
    const stop = this.findStop(route, dto.stopId);
    if (!["pending", "arrived"].includes(stop.status)) throw new BadRequestException(`This stop is already ${stop.status}`);
    await this.deliveries.deliver(ctx, stop.deliveryId, dto.receivedBy);
    const stops = route.stops.map((s) => (s.stopId === dto.stopId ? { ...s, status: "delivered" as const, completedAt: new Date().toISOString(), proofNote: orNull(dto.proofNote) } : s));
    return (await this.repo.update(ctx, id, this.settle(route, stops))).after;
  }

  async failStop(ctx: RequestContext, id: string, dto: FailStopDto): Promise<RouteDoc> {
    const route = await this.repo.get(ctx, id);
    const stop = this.findStop(route, dto.stopId);
    if (!["pending", "arrived"].includes(stop.status)) throw new BadRequestException(`This stop is already ${stop.status}`);
    await this.deliveries.fail(ctx, stop.deliveryId, dto.reason);
    const stops = route.stops.map((s) => (s.stopId === dto.stopId ? { ...s, status: "failed" as const, completedAt: new Date().toISOString(), failureReason: dto.reason } : s));
    return (await this.repo.update(ctx, id, this.settle(route, stops))).after;
  }

  async cancel(ctx: RequestContext, id: string): Promise<RouteDoc> {
    const route = await this.repo.get(ctx, id);
    if (route.status !== "planned") throw new BadRequestException("Only a planned route (not yet dispatched) can be cancelled");
    return (await this.repo.update(ctx, id, { status: "cancelled" } as Patch<RouteDoc>)).after;
  }

  protected searchEntry(doc: RouteDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.number, subtitle: doc.status };
  }
}
