"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDate, humanize } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { useCan } from "@/lib/workspace";
import { MasterConfig } from "@/components/master/MasterData";
import { ConfirmDialog, Field, PageHeader, Spinner, StatusBadge } from "@/components/ui/kit";

export const VEHICLE_STATUSES = ["active", "maintenance", "retired"] as const;
export const ROUTE_STATUSES = ["planned", "dispatched", "in_progress", "completed", "cancelled"] as const;
export const STOP_STATUSES = ["pending", "arrived", "delivered", "failed"] as const;

export interface Vehicle extends BaseRecord {
  code: string; name: string; type: string; registrationNo: string | null; driverId: string | null; odometerKm: number;
  insuranceExpiry: string | null; licenceExpiry: string | null; status: (typeof VEHICLE_STATUSES)[number]; notes: string | null;
}
export interface FuelLog extends BaseRecord {
  vehicleId: string; date: string; odometerKm: number; litres: number; cost: number; notes: string | null;
}
export interface RouteStop {
  stopId: string; deliveryId: string; sequence: number; status: (typeof STOP_STATUSES)[number];
  arrivedAt: string | null; completedAt: string | null; failureReason: string | null; proofNote: string | null;
}
export interface Route extends BaseRecord {
  number: string; vehicleId: string; driverId: string | null; date: string; status: (typeof ROUTE_STATUSES)[number]; stops: RouteStop[]; notes: string | null;
}

const opts = (values: readonly string[]) => values.map((v) => ({ value: v, label: humanize(v) }));

export const logisticsApi = {
  vehicles: crud<Vehicle>("/logistics/vehicles"),
  fuelLogs: crud<FuelLog>("/logistics/fuel-logs"),
  routes: crud<Route>("/logistics/routes"),
  post: <T,>(path: string, body: object = {}) => api.post(path, body).then((r) => r.data as T),
};

export const vehicleOptions = {
  queryKey: ["options", "logistics.vehicles"],
  load: async () => (await logisticsApi.vehicles.list({ limit: 200 })).items.map((v) => ({ value: v.id, label: `${v.code} · ${v.name}` })),
};

export const vehicles: MasterConfig<Vehicle> = {
  entityType: "logistics.vehicle",
  permission: "logistics.vehicle",
  plural: "Vehicles",
  singular: "Vehicle",
  route: "/logistics/vehicles",
  client: logisticsApi.vehicles,
  columns: [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "type", label: "Type" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: opts(VEHICLE_STATUSES) }],
  fields: [
    { key: "code", label: "Code", type: "text", required: true, createOnly: true },
    { key: "name", label: "Name", type: "text", required: true },
    { key: "type", label: "Type", type: "text", required: true, placeholder: "van" },
    { key: "registrationNo", label: "Registration no.", type: "text" },
    { key: "driverId", label: "Driver (user id)", type: "text" },
    { key: "odometerKm", label: "Odometer (km)", type: "number" },
    { key: "insuranceExpiry", label: "Insurance expiry", type: "date" },
    { key: "licenceExpiry", label: "Licence expiry", type: "date" },
    { key: "status", label: "Status", type: "select", options: opts(VEHICLE_STATUSES) },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  title: (r) => r.name,
  subtitle: (r) => r.code,
  status: (r) => r.status,
  details: (r) => [
    { label: "Odometer", value: `${r.odometerKm} km` },
    { label: "Driver", value: r.driverId },
    { label: "Insurance expiry", value: r.insuranceExpiry ? formatDate(r.insuranceExpiry) : null },
    { label: "Licence expiry", value: r.licenceExpiry ? formatDate(r.licenceExpiry) : null },
  ],
};

export const fuelLogs: MasterConfig<FuelLog> = {
  entityType: "logistics.fuelLog",
  permission: "logistics.fuelLog",
  plural: "Fuel logs",
  singular: "Fuel log",
  description: "A fill-up; keeps the vehicle's odometer current when the reading given is higher.",
  route: "/logistics/fuel-logs",
  client: logisticsApi.fuelLogs,
  defaultSort: "-createdAt",
  columns: [
    { key: "vehicleId", label: "Vehicle" },
    { key: "date", label: "Date", render: (r) => formatDate(r.date) },
    { key: "litres", label: "Litres", render: (r) => (r.litres / 1000).toFixed(2) },
    { key: "cost", label: "Cost", render: (r) => formatMoney(r.cost, "LKR") },
  ],
  fields: [
    { key: "vehicleId", label: "Vehicle", type: "reference", reference: vehicleOptions, required: true, createOnly: true },
    { key: "date", label: "Date", type: "date", required: true, createOnly: true },
    { key: "odometerKm", label: "Odometer (km)", type: "number", required: true, createOnly: true },
    { key: "litres", label: "Litres", type: "number", required: true, createOnly: true },
    { key: "cost", label: "Cost", type: "text", required: true, createOnly: true, placeholder: "12000" },
    { key: "notes", label: "Notes", type: "textarea", wide: true, createOnly: true },
  ],
  editable: () => false,
  title: (r) => `${r.vehicleId} · ${formatDate(r.date)}`,
  subtitle: (r) => formatMoney(r.cost, "LKR"),
  details: (r) => [{ label: "Notes", value: r.notes }],
};

function RouteActions({ r, refresh }: { r: Route; refresh: (rt: Route) => void }) {
  const canEdit = useCan("logistics.route.edit");
  const dispatch = useMutation({
    mutationFn: () => logisticsApi.post<Route>(`/logistics/routes/${r.id}/dispatch`),
    onSuccess: (rt) => { toast.success("Dispatched"); refresh(rt); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const cancel = useMutation({
    mutationFn: () => logisticsApi.post<Route>(`/logistics/routes/${r.id}/cancel`),
    onSuccess: (rt) => { toast.success("Cancelled"); refresh(rt); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!canEdit) return null;
  return (
    <>
      {r.status === "planned" && (
        <>
          <button className="btn-primary" disabled={dispatch.isPending} onClick={() => dispatch.mutate()}>Dispatch</button>
          <button className="btn-ghost" disabled={cancel.isPending} onClick={() => cancel.mutate()}>Cancel</button>
        </>
      )}
    </>
  );
}

function StopActions({ route, stop, refresh }: { route: Route; stop: RouteStop; refresh: (r: Route) => void }) {
  const canEdit = useCan("logistics.route.edit");
  const arrive = useMutation({
    mutationFn: () => logisticsApi.post<Route>(`/logistics/routes/${route.id}/stops/arrive`, { stopId: stop.stopId }),
    onSuccess: (r) => { toast.success("Marked arrived"); refresh(r); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const [completeOpen, setCompleteOpen] = useState(false);
  const [receivedBy, setReceivedBy] = useState("");
  const [proofNote, setProofNote] = useState("");
  const complete = useMutation({
    mutationFn: () => logisticsApi.post<Route>(`/logistics/routes/${route.id}/stops/complete`, { stopId: stop.stopId, receivedBy, proofNote: proofNote || undefined }),
    onSuccess: (r) => { setCompleteOpen(false); toast.success("Delivered"); refresh(r); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const [failOpen, setFailOpen] = useState(false);
  const [reason, setReason] = useState("");
  const fail = useMutation({
    mutationFn: () => logisticsApi.post<Route>(`/logistics/routes/${route.id}/stops/fail`, { stopId: stop.stopId, reason }),
    onSuccess: (r) => { setFailOpen(false); toast.success("Marked failed"); refresh(r); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!canEdit || !["pending", "arrived"].includes(stop.status)) return null;
  return (
    <div className="flex gap-2">
      {stop.status === "pending" && <button className="btn-ghost" disabled={arrive.isPending} onClick={() => arrive.mutate()}>Arrived</button>}
      <button className="btn-primary" onClick={() => setCompleteOpen(true)}>Delivered</button>
      <ConfirmDialog open={completeOpen} title="Confirm proof of delivery" confirmLabel="Confirm" busy={complete.isPending} onConfirm={() => complete.mutate()} onClose={() => setCompleteOpen(false)}>
        <div className="space-y-3">
          <Field label="Received by" required><input className="input-base" value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} /></Field>
          <Field label="Note"><textarea className="input-base" value={proofNote} onChange={(e) => setProofNote(e.target.value)} /></Field>
        </div>
      </ConfirmDialog>
      <button className="btn-ghost" onClick={() => setFailOpen(true)}>Failed</button>
      <ConfirmDialog open={failOpen} title="Mark this stop failed" confirmLabel="Mark failed" busy={fail.isPending} onConfirm={() => fail.mutate()} onClose={() => setFailOpen(false)}>
        <Field label="Reason" required><textarea className="input-base" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </ConfirmDialog>
    </div>
  );
}

function RouteExtra({ r }: { r: Route }) {
  const [current, setCurrent] = useState(r);
  return (
    <section className="card overflow-x-auto">
      <h2 className="font-semibold px-4 pt-4 mb-2">Stops</h2>
      <table className="table-base">
        <thead><tr><th>Seq</th><th>Delivery</th><th>Status</th><th>Note</th><th /></tr></thead>
        <tbody>
          {current.stops.map((s) => (
            <tr key={s.stopId}>
              <td>{s.sequence}</td>
              <td>{s.deliveryId}</td>
              <td><StatusBadge status={s.status} /></td>
              <td>{s.proofNote ?? s.failureReason ?? "—"}</td>
              <td><StopActions route={current} stop={s} refresh={setCurrent} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export const routes: MasterConfig<Route> = {
  entityType: "logistics.route",
  permission: "logistics.route",
  plural: "Routes",
  singular: "Route",
  description: "A vehicle's delivery run: an ordered sequence of stops, each pointing at a sales delivery.",
  route: "/logistics/routes",
  client: logisticsApi.routes,
  createHref: "/logistics/routes/new",
  defaultSort: "-createdAt",
  columns: [
    { key: "number", label: "Number" },
    { key: "vehicleId", label: "Vehicle" },
    { key: "date", label: "Date", render: (r) => formatDate(r.date) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [{ key: "status", label: "Status", options: opts(ROUTE_STATUSES) }],
  fields: [
    { key: "vehicleId", label: "Vehicle", type: "reference", reference: vehicleOptions, required: true, createOnly: true },
    { key: "driverId", label: "Driver (user id)", type: "text", createOnly: true },
    { key: "date", label: "Date", type: "date", required: true, createOnly: true },
    { key: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  editable: (r) => r.status === "planned",
  title: (r) => r.number,
  subtitle: (r) => `${r.stops.length} stop(s)`,
  status: (r) => r.status,
  actions: (r, refresh) => <RouteActions r={r} refresh={refresh} />,
  details: (r) => [
    { label: "Vehicle", value: r.vehicleId },
    { label: "Driver", value: r.driverId },
    { label: "Date", value: formatDate(r.date) },
    { label: "Notes", value: r.notes },
  ],
  extra: (r) => <RouteExtra r={r} />,
};

export function NewRoutePage() {
  const router = useRouter();
  const { data: vehicleList } = useQuery({ queryKey: vehicleOptions.queryKey, queryFn: vehicleOptions.load });
  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [deliveryIds, setDeliveryIds] = useState("");
  const create = useMutation({
    mutationFn: () =>
      logisticsApi.post<Route>("/logistics/routes", {
        vehicleId, driverId: driverId || undefined, date,
        stops: deliveryIds.split(",").map((s) => s.trim()).filter(Boolean).map((deliveryId, i) => ({ deliveryId, sequence: i + 1 })),
      }),
    onSuccess: (r) => { toast.success(`Route ${r.number} created`); router.push(`/logistics/routes/${r.id}`); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="space-y-6">
      <PageHeader title="New route" subtitle="Each delivery must already be picked and packed through Sales before it can be added here." />
      <section className="card p-5 max-w-lg space-y-4">
        <Field label="Vehicle" required>
          <select className="input-base" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            <option value="">Select a vehicle…</option>
            {vehicleList?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Driver (user id, optional)"><input className="input-base" value={driverId} onChange={(e) => setDriverId(e.target.value)} /></Field>
        <Field label="Date" required><input type="date" className="input-base" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Delivery ids (comma-separated, in stop order)" required>
          <textarea className="input-base" rows={3} value={deliveryIds} onChange={(e) => setDeliveryIds(e.target.value)} placeholder="delivery-id-1, delivery-id-2" />
        </Field>
        <button className="btn-primary" disabled={!vehicleId || !deliveryIds.trim() || create.isPending} onClick={() => create.mutate()}>
          {create.isPending && <Spinner size={14} className="text-white" />} Create route
        </button>
      </section>
    </div>
  );
}

export const LOGISTICS_SCREENS: Record<string, MasterConfig<never>> = {
  vehicles: vehicles as unknown as MasterConfig<never>,
  "fuel-logs": fuelLogs as unknown as MasterConfig<never>,
  routes: routes as unknown as MasterConfig<never>,
};
