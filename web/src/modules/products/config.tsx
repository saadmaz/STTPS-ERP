"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, BaseRecord, crud, errorMessage } from "@/lib/api";
import { formatDate, humanize } from "@/lib/format";
import { formatMoney, minorToDecimal } from "@/lib/money";
import { useCan } from "@/lib/workspace";
import { MasterConfig } from "@/components/master/MasterData";
import { StatusBadge } from "@/components/ui/kit";

export interface Product extends BaseRecord {
  sku: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  categoryId: string | null;
  brand: string | null;
  baseUom: string;
  barcodes: string[];
  taxCategory: string | null;
  costingMethod: string;
  currency: string;
  salesPrice: number;
  purchasePrice: number;
  standardCost: number;
  trackLots: boolean;
  trackSerials: boolean;
  trackExpiry: boolean;
  isSellable: boolean;
  isPurchasable: boolean;
  uomConversions: { uom: string; factor: number }[];
}
interface Category extends BaseRecord {
  code: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
}
interface Uom extends BaseRecord {
  code: string;
  name: string;
  kind: string;
  wholeOnly: boolean;
  isActive: boolean;
}
interface PriceList extends BaseRecord {
  code: string;
  name: string;
  kind: string;
  currency: string;
  isDefault: boolean;
  status: string;
  validFrom: string | null;
  validTo: string | null;
}
interface PriceItem extends BaseRecord {
  priceListId: string;
  productId: string;
  minQty: number;
  unitPrice: number;
  validFrom: string | null;
  validTo: string | null;
}
interface DiscountRule extends BaseRecord {
  code: string;
  name: string;
  kind: string;
  value: number;
  scope: string;
  targetIds: string[];
  minQty: number;
  priority: number;
  stackable: boolean;
  isActive: boolean;
}

export const productsApi = {
  items: crud<Product>("/products/items"),
  categories: crud<Category>("/products/categories"),
  uoms: crud<Uom>("/products/uoms"),
  priceLists: crud<PriceList>("/products/price-lists"),
  prices: crud<PriceItem>("/products/prices"),
  discounts: crud<DiscountRule>("/products/discounts"),
};

const opts = (values: string[]) => values.map((v) => ({ value: v, label: humanize(v) }));
const qty = (thousandths: number) => String(thousandths / 1000);
const categoryOptions = {
  queryKey: ["options", "products.categories"],
  load: async () => (await productsApi.categories.list({ limit: 200 })).items.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` })),
};

const items: MasterConfig<Product> = {
  entityType: "products.product",
  permission: "products.product",
  plural: "Products",
  singular: "Product",
  description: "Everything you buy, stock, make or sell.",
  route: "/products/items",
  client: productsApi.items,
  defaultSort: "nameLower",
  columns: [
    { key: "name", label: "Name", text: (r) => r.name },
    { key: "sku", label: "SKU" },
    { key: "type", label: "Type", render: (r) => humanize(r.type) },
    { key: "baseUom", label: "Unit" },
    { key: "salesPrice", label: "Price", render: (r) => formatMoney(r.salesPrice, r.currency), text: (r) => minorToDecimal(r.salesPrice, r.currency) },
    { key: "brand", label: "Brand", defaultHidden: true },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  filters: [
    { key: "type", label: "Type", options: opts(["stock", "non_stock", "service", "bundle", "manufactured", "digital"]) },
    { key: "status", label: "Status", options: opts(["active", "inactive", "discontinued"]) },
  ],
  fields: [
    { key: "name", label: "Name", type: "text", required: true, wide: true },
    { key: "sku", label: "SKU", type: "text", hint: "Leave blank to number automatically" },
    { key: "type", label: "Type", type: "select", required: true, createOnly: true, options: opts(["stock", "non_stock", "service", "bundle", "manufactured", "digital"]) },
    { key: "status", label: "Status", type: "select", required: true, options: opts(["active", "inactive", "discontinued"]) },
    { key: "categoryId", label: "Category", type: "reference", reference: categoryOptions },
    { key: "brand", label: "Brand", type: "text" },
    { key: "baseUom", label: "Base unit", type: "text", createOnly: true, placeholder: "pcs" },
    { key: "currency", label: "Currency", type: "text", placeholder: "LKR" },
    { key: "salesPrice", label: "Sales price", type: "text", placeholder: "0.00" },
    { key: "purchasePrice", label: "Purchase price", type: "text", placeholder: "0.00" },
    { key: "costingMethod", label: "Costing", type: "select", options: opts(["average", "fifo", "standard"]) },
    { key: "taxCategory", label: "Tax category", type: "text" },
    { key: "trackLots", label: "Track lots / batches", type: "boolean" },
    { key: "trackSerials", label: "Track serial numbers", type: "boolean" },
    { key: "trackExpiry", label: "Track expiry dates", type: "boolean" },
    { key: "isSellable", label: "Can be sold", type: "boolean" },
    { key: "isPurchasable", label: "Can be purchased", type: "boolean" },
    { key: "description", label: "Description", type: "textarea" },
  ],
  defaults: { type: "stock", status: "active", currency: "LKR", costingMethod: "average", isSellable: true, isPurchasable: true },
  toForm: (r) => ({
    name: r.name, sku: r.sku, status: r.status, categoryId: r.categoryId ?? "", brand: r.brand ?? "", currency: r.currency,
    salesPrice: minorToDecimal(r.salesPrice, r.currency), purchasePrice: minorToDecimal(r.purchasePrice, r.currency), costingMethod: r.costingMethod,
    taxCategory: r.taxCategory ?? "", trackLots: r.trackLots, trackSerials: r.trackSerials, trackExpiry: r.trackExpiry,
    isSellable: r.isSellable, isPurchasable: r.isPurchasable, description: r.description ?? "",
  }),
  title: (r) => r.name,
  subtitle: (r) => `${r.sku} · ${humanize(r.type)} · ${r.baseUom}`,
  status: (r) => r.status,
  details: (r) => [
    { label: "Sales price", value: `${formatMoney(r.salesPrice, r.currency)} per ${r.baseUom}` },
    { label: "Purchase price", value: formatMoney(r.purchasePrice, r.currency) },
    { label: "Costing", value: humanize(r.costingMethod) },
    { label: "Brand", value: r.brand },
    { label: "Tax category", value: r.taxCategory },
    { label: "Tracking", value: [r.trackLots && "lots", r.trackSerials && "serials", r.trackExpiry && "expiry"].filter(Boolean).join(", ") || "None" },
    { label: "Units", value: r.uomConversions.length ? r.uomConversions.map((c) => `1 ${c.uom} = ${qty(c.factor)} ${r.baseUom}`).join("\n") : null },
    { label: "Barcodes", value: r.barcodes.join(", ") || null },
    { label: "Description", value: r.description },
  ],
};

const categories: MasterConfig<Category> = {
  entityType: "products.category",
  permission: "products.category",
  plural: "Product categories",
  singular: "Category",
  route: "/products/categories",
  client: productsApi.categories,
  defaultSort: "code",
  columns: [
    { key: "code", label: "Code", sortable: true },
    { key: "name", label: "Name", sortable: true },
    { key: "isActive", label: "Status", render: (r) => <StatusBadge status={r.isActive ? "active" : "inactive"} /> },
  ],
  fields: [
    { key: "code", label: "Code", type: "text", required: true },
    { key: "name", label: "Name", type: "text", required: true },
    { key: "parentId", label: "Parent", type: "reference", reference: categoryOptions },
    { key: "isActive", label: "Active", type: "boolean" },
  ],
  defaults: { isActive: true },
  title: (r) => r.name,
  subtitle: (r) => r.code,
  status: (r) => (r.isActive ? "active" : "inactive"),
};

const uoms: MasterConfig<Uom> = {
  entityType: "products.uom",
  permission: "products.uom",
  plural: "Units of measure",
  singular: "Unit",
  description: "Until you add units, the basic set (pcs, kg, g, l, ml, m, cm, box, pack, hr, day) is available.",
  route: "/products/uoms",
  client: productsApi.uoms,
  defaultSort: "code",
  columns: [
    { key: "code", label: "Code", sortable: true },
    { key: "name", label: "Name", sortable: true },
    { key: "kind", label: "Kind", render: (r) => humanize(r.kind) },
    { key: "wholeOnly", label: "Whole units only", render: (r) => (r.wholeOnly ? "Yes" : "No") },
  ],
  fields: [
    { key: "code", label: "Code", type: "text", required: true, placeholder: "pcs" },
    { key: "name", label: "Name", type: "text", required: true },
    { key: "kind", label: "Kind", type: "select", required: true, options: opts(["count", "weight", "volume", "length", "area", "time"]) },
    { key: "wholeOnly", label: "Whole units only", type: "boolean" },
    { key: "isActive", label: "Active", type: "boolean" },
  ],
  defaults: { kind: "count", wholeOnly: true, isActive: true },
  title: (r) => `${r.name} (${r.code})`,
  status: (r) => (r.isActive ? "active" : "inactive"),
};

function PricesTable({ list }: { list: PriceList }) {
  const queryClient = useQueryClient();
  const canEdit = useCan("products.priceList.edit") && list.status !== "pending_approval";
  const prices = useQuery({ queryKey: ["prices", list.id], queryFn: () => productsApi.prices.list({ where: `priceListId:${list.id}`, limit: 200 }) });
  const products = useQuery({ queryKey: ["options", "products.items"], queryFn: () => productsApi.items.list({ limit: 200 }) });
  const [productId, setProductId] = useState("");
  const [price, setPrice] = useState("");
  const [minQty, setMinQty] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["prices", list.id] });
  const add = useMutation({
    mutationFn: () => productsApi.prices.create({ priceListId: list.id, productId, unitPrice: price, minQty: minQty || undefined }),
    onSuccess: () => {
      setPrice("");
      setMinQty("");
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({ mutationFn: (id: string) => productsApi.prices.archive(id), onSuccess: refresh, onError: (e) => toast.error(errorMessage(e)) });
  const name = (id: string) => products.data?.items.find((p) => p.id === id)?.name ?? id;

  return (
    <section className="card">
      <h3 className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 font-semibold text-sm">Prices ({list.currency})</h3>
      <table className="table-base">
        <thead>
          <tr><th>Product</th><th>From qty</th><th>Unit price</th><th>Valid</th>{canEdit && <th />}</tr>
        </thead>
        <tbody>
          {(prices.data?.items ?? []).map((p) => (
            <tr key={p.id}>
              <td>{name(p.productId)}</td>
              <td>{qty(p.minQty)}</td>
              <td>{formatMoney(p.unitPrice, list.currency)}</td>
              <td>{p.validFrom || p.validTo ? `${formatDate(p.validFrom)} – ${formatDate(p.validTo)}` : "Always"}</td>
              {canEdit && (
                <td>
                  <button className="btn-ghost" onClick={() => remove.mutate(p.id)} aria-label="Remove price"><Trash2 size={14} /></button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {canEdit && (
        <form className="flex flex-wrap gap-2 p-3 border-t border-slate-200 dark:border-slate-800" onSubmit={(e) => { e.preventDefault(); if (productId && price) add.mutate(); }}>
          <select className="input-base flex-1 min-w-[180px]" value={productId} onChange={(e) => setProductId(e.target.value)} aria-label="Product">
            <option value="">Product…</option>
            {(products.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
          </select>
          <input className="input-base w-28" placeholder="From qty" value={minQty} onChange={(e) => setMinQty(e.target.value)} aria-label="From quantity" />
          <input className="input-base w-32" placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Unit price" />
          <button className="btn-primary" disabled={add.isPending}><Plus size={15} /> Add</button>
        </form>
      )}
    </section>
  );
}

function ActivateButton({ list, refresh }: { list: PriceList; refresh: (row: PriceList) => void }) {
  const canEdit = useCan("products.priceList.edit");
  const activate = useMutation({
    mutationFn: () => api.post(`/products/price-lists/${list.id}/activate`).then((r) => r.data as PriceList),
    onSuccess: (row) => {
      refresh(row);
      toast.success(row.status === "active" ? "Price list is active" : "Sent for approval");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!canEdit || list.status === "active" || list.status === "pending_approval") return null;
  return <button className="btn-primary" onClick={() => activate.mutate()} disabled={activate.isPending}><Send size={15} /> Activate</button>;
}

const priceLists: MasterConfig<PriceList> = {
  entityType: "products.priceList",
  permission: "products.priceList",
  plural: "Price lists",
  singular: "Price list",
  description: "The default list prices everyone; give customers their own list for special prices.",
  route: "/products/price-lists",
  client: productsApi.priceLists,
  defaultSort: "code",
  columns: [
    { key: "code", label: "Code", sortable: true },
    { key: "name", label: "Name", sortable: true },
    { key: "currency", label: "Currency" },
    { key: "isDefault", label: "Default", render: (r) => (r.isDefault ? "Yes" : "") },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  fields: [
    { key: "code", label: "Code", type: "text", required: true },
    { key: "name", label: "Name", type: "text", required: true },
    { key: "kind", label: "Kind", type: "select", createOnly: true, options: opts(["sales", "purchase"]) },
    { key: "currency", label: "Currency", type: "text", createOnly: true, placeholder: "LKR" },
    { key: "isDefault", label: "Default list", type: "boolean" },
    { key: "validFrom", label: "Valid from", type: "date" },
    { key: "validTo", label: "Valid to", type: "date" },
  ],
  defaults: { kind: "sales", currency: "LKR" },
  title: (r) => r.name,
  subtitle: (r) => `${r.code} · ${r.currency}${r.isDefault ? " · default" : ""}`,
  status: (r) => r.status,
  editable: (r) => r.status !== "pending_approval",
  actions: (r, refresh) => <ActivateButton list={r} refresh={refresh} />,
  details: (r) => [
    { label: "Kind", value: humanize(r.kind) },
    { label: "Valid", value: r.validFrom || r.validTo ? `${formatDate(r.validFrom)} – ${formatDate(r.validTo)}` : "Always" },
  ],
  extra: (r) => <PricesTable list={r} />,
};

const discounts: MasterConfig<DiscountRule> = {
  entityType: "products.discountRule",
  permission: "products.discountRule",
  plural: "Discount rules",
  singular: "Discount rule",
  description: "Applied in priority order; a rule that does not stack stops further discounts.",
  route: "/products/discounts",
  client: productsApi.discounts,
  defaultSort: "priority",
  columns: [
    { key: "name", label: "Name", sortable: true },
    { key: "kind", label: "Discount", render: (r) => (r.kind === "percent" ? `${r.value / 100}%` : formatMoney(r.value, "LKR")) },
    { key: "scope", label: "Applies to", render: (r) => humanize(r.scope) },
    { key: "priority", label: "Priority", sortable: true },
    { key: "isActive", label: "Status", render: (r) => <StatusBadge status={r.isActive ? "active" : "inactive"} /> },
  ],
  fields: [
    { key: "code", label: "Code", type: "text", required: true },
    { key: "name", label: "Name", type: "text", required: true },
    { key: "kind", label: "Kind", type: "select", required: true, options: [{ value: "percent", label: "Percent" }, { value: "amount", label: "Amount per unit" }] },
    { key: "value", label: "Value", type: "text", required: true, placeholder: "10" },
    { key: "scope", label: "Applies to", type: "select", required: true, options: opts(["all", "category", "product", "customer", "segment"]) },
    { key: "minQty", label: "Minimum quantity", type: "text" },
    { key: "priority", label: "Priority", type: "number" },
    { key: "stackable", label: "Can combine with later rules", type: "boolean" },
    { key: "validFrom", label: "Valid from", type: "date" },
    { key: "validTo", label: "Valid to", type: "date" },
    { key: "isActive", label: "Active", type: "boolean" },
  ],
  defaults: { kind: "percent", scope: "all", priority: 100, isActive: true },
  toForm: (r) => ({ code: r.code, name: r.name, kind: r.kind, value: r.kind === "percent" ? String(r.value / 100) : minorToDecimal(r.value, "LKR"), scope: r.scope, minQty: r.minQty ? qty(r.minQty) : "", priority: r.priority, stackable: r.stackable, isActive: r.isActive }),
  title: (r) => r.name,
  subtitle: (r) => r.code,
  status: (r) => (r.isActive ? "active" : "inactive"),
  details: (r) => [
    { label: "Discount", value: r.kind === "percent" ? `${r.value / 100}%` : `${formatMoney(r.value, "LKR")} per unit` },
    { label: "Applies to", value: `${humanize(r.scope)}${r.targetIds.length ? ` (${r.targetIds.length} selected)` : ""}` },
    { label: "Minimum quantity", value: r.minQty ? qty(r.minQty) : null },
    { label: "Stacks", value: r.stackable ? "Yes" : "No" },
  ],
};

export const PRODUCT_SCREENS: Record<string, MasterConfig<never>> = {
  items: items as unknown as MasterConfig<never>,
  categories: categories as unknown as MasterConfig<never>,
  uoms: uoms as unknown as MasterConfig<never>,
  "price-lists": priceLists as unknown as MasterConfig<never>,
  discounts: discounts as unknown as MasterConfig<never>,
};
