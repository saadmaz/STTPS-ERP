import type { BaseDoc } from "../platform/data/repository.js";
import type { LargeListSpec } from "../platform/data/indexes.js";

export const LOGISTICS_COLLECTIONS = {
  vehicles: "logisticsVehicles",
  fuelLogs: "logisticsFuelLogs",
  routes: "logisticsRoutes",
} as const;

export const VEHICLE_STATUSES = ["active", "maintenance", "retired"] as const;
export const ROUTE_STATUSES = ["planned", "dispatched", "in_progress", "completed", "cancelled"] as const;
export const STOP_STATUSES = ["pending", "arrived", "delivered", "failed"] as const;

export interface VehicleDoc extends BaseDoc {
  code: string;
  name: string;
  type: string;
  registrationNo: string | null;
  driverId: string | null;
  odometerKm: number;
  insuranceExpiry: string | null;
  licenceExpiry: string | null;
  status: (typeof VEHICLE_STATUSES)[number];
  notes: string | null;
}

export interface FuelLogDoc extends BaseDoc {
  vehicleId: string;
  date: string;
  odometerKm: number;
  litres: number;
  cost: number;
  notes: string | null;
}

/**
 * One stop on a route, pointing at an existing Sales `DeliveryDoc` — not a
 * second "delivery order" concept. The stop's own status tracks routing
 * progress (pending/arrived); the underlying delivery's dispatch/deliver/fail
 * transitions are driven through `DeliveryService` itself, so there is one
 * source of truth for whether the goods actually moved.
 */
export interface RouteStop {
  stopId: string;
  deliveryId: string;
  sequence: number;
  status: (typeof STOP_STATUSES)[number];
  arrivedAt: string | null;
  completedAt: string | null;
  failureReason: string | null;
  proofNote: string | null;
}

export interface RouteDoc extends BaseDoc {
  number: string;
  vehicleId: string;
  driverId: string | null;
  date: string;
  status: (typeof ROUTE_STATUSES)[number];
  stops: RouteStop[];
  notes: string | null;
}

export const LOGISTICS_LISTS: Record<"routes", LargeListSpec> = {
  routes: { filters: [], sorts: [{ field: "createdAt", direction: "desc" }] },
};
