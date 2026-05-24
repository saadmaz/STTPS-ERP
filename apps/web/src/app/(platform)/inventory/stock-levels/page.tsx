"use client";

import { useQuery } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { clsx } from "clsx";

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 4 });
const fmtMoney = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2 });

export default function StockLevelsPage() {
  const { activeCompany } = useAuth();
  const [warehouseFilter, setWarehouseFilter] = useState("");

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses", activeCompany?.id],
    queryFn: () => inventoryApi.warehouses.list(),
    enabled: !!activeCompany,
  });

  const { data: stockLevels = [], isLoading } = useQuery({
    queryKey: ["stock-levels", activeCompany?.id, warehouseFilter],
    queryFn: () => inventoryApi.stockLevels({ warehouseId: warehouseFilter || undefined }),
    enabled: !!activeCompany,
  });

  const levels = stockLevels as any[];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Stock Levels</h1>
          <p className="page-subtitle">{levels.length} stock lines</p>
        </div>
      </div>

      <div className="card mb-4 p-4">
        <div className="flex items-center gap-4">
          <div>
            <label className="form-label mb-1">Warehouse</label>
            <select
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value)}
              className="input-base w-64"
            >
              <option value="">All Warehouses</option>
              {(warehouses as any[]).map((w: any) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Item Code</th>
                  <th>Item Name</th>
                  <th>Warehouse</th>
                  <th>Location</th>
                  <th className="text-right">On Hand</th>
                  <th className="text-right">Reserved</th>
                  <th className="text-right">Available</th>
                  <th className="text-right">Avg Cost</th>
                  <th className="text-right">Stock Value</th>
                </tr>
              </thead>
              <tbody>
                {levels.map((sl: any) => {
                  const available = Number(sl.qty) - Number(sl.reservedQty);
                  const stockValue = Number(sl.qty) * Number(sl.avgCost);
                  const isLow = sl.item?.reorderPoint > 0 && Number(sl.qty) <= Number(sl.item?.reorderPoint);
                  return (
                    <tr key={sl.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3"><span className="font-mono text-sm text-slate-600">{sl.item?.code}</span></td>
                      <td className="px-4 py-3 text-sm text-slate-900">{sl.item?.name}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{sl.warehouse?.name}</td>
                      <td className="px-4 py-3 text-sm text-slate-400">{sl.location?.name || "—"}</td>
                      <td className={clsx("px-4 py-3 text-sm text-right font-mono font-medium", isLow ? "text-red-600" : "text-slate-900")}>
                        {fmt(Number(sl.qty))}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono text-slate-500">{fmt(Number(sl.reservedQty))}</td>
                      <td className="px-4 py-3 text-sm text-right font-mono text-blue-700 font-medium">{fmt(available)}</td>
                      <td className="px-4 py-3 text-sm text-right font-mono text-slate-500">{fmtMoney(Number(sl.avgCost))}</td>
                      <td className="px-4 py-3 text-sm text-right font-mono font-semibold">{fmtMoney(stockValue)}</td>
                    </tr>
                  );
                })}
                {levels.length === 0 && <tr><td colSpan={9} className="text-center py-12 text-slate-400">No stock levels found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
