import type { BaseDoc } from "../platform/data/repository.js";
import type { LargeListSpec } from "../platform/data/indexes.js";

export const PROCUREMENT_COLLECTIONS = {
  suppliers: "suppliers",
  requisitions: "purchaseRequisitions",
  rfqs: "purchaseRfqs",
  orders: "purchaseOrders",
  receipts: "goodsReceipts",
  returns: "supplierReturns",
} as const;

export interface Address {
  line1?: string | null;
  city?: string | null;
  country?: string | null;
}

export interface SupplierDoc extends BaseDoc {
  code: string;
  name: string;
  nameLower: string;
  category: string | null;
  status: "active" | "on_hold" | "blocked";
  email: string | null;
  phone: string | null;
  address: Address | null;
  taxId: string | null;
  currency: string;
  paymentTermsDays: number;
  bank: { bankName: string | null; accountName: string | null; accountNo: string | null; branch: string | null; swift: string | null } | null;
  certifications: { name: string; expiresOn: string | null }[];
  preferred: boolean;
  leadTimeDays: number | null;
  /** 0-100, updated from receipts: share of quantity accepted on time. */
  performanceScore: number | null;
  receiptsCount: number;
  onTimeCount: number;
  acceptedQty: number;
  receivedQty: number;
  notes: string | null;
}

export interface RequisitionLine {
  lineId: string;
  productId: string | null;
  description: string;
  qty: number;
  uom: string;
  /** Estimated minor units per unit (for budget and approval rules). */
  estimatedPrice: number;
  suggestedSupplierId: string | null;
}

export interface RequisitionDoc extends BaseDoc {
  number: string;
  requesterId: string;
  departmentId: string | null;
  costCentreId: string | null;
  projectId: string | null;
  requiredDate: string | null;
  justification: string | null;
  currency: string;
  lines: RequisitionLine[];
  estimatedTotal: number;
  status: "draft" | "pending_approval" | "approved" | "rejected" | "ordered" | "cancelled";
  orderIds: string[];
}

export interface RfqQuote {
  supplierId: string;
  receivedAt: string;
  /** Minor units per unit, per requisition line id. */
  prices: Record<string, number>;
  leadTimeDays: number | null;
  notes: string | null;
}

export interface RfqDoc extends BaseDoc {
  number: string;
  requisitionId: string | null;
  lines: RequisitionLine[];
  supplierIds: string[];
  quotes: RfqQuote[];
  dueDate: string | null;
  status: "open" | "awarded" | "cancelled";
  awardedSupplierId: string | null;
  awardReason: string | null;
  orderId: string | null;
}

export interface PurchaseLine {
  lineId: string;
  productId: string;
  description: string;
  qty: number;
  /** Minor units per base unit. */
  unitPrice: number;
  taxCode: string | null;
  taxRate: number;
  net: number;
  tax: number;
  total: number;
  received: number;
  rejected: number;
  returned: number;
  stocked: boolean;
}

export interface PurchaseOrderDoc extends BaseDoc {
  number: string;
  supplierId: string;
  requisitionId: string | null;
  rfqId: string | null;
  currency: string;
  date: string;
  expectedDate: string | null;
  warehouseId: string;
  paymentTermsDays: number;
  lines: PurchaseLine[];
  totals: { subtotal: number; tax: number; total: number };
  status: "draft" | "pending_approval" | "approved" | "sent" | "confirmed" | "partially_received" | "received" | "cancelled" | "closed";
  /** Amendment number; each change after approval goes back through approval. */
  amendment: number;
  supplierConfirmedAt: string | null;
  supplierReference: string | null;
  cancelReason: string | null;
  notes: string | null;
}

export interface ReceiptLine {
  orderLineId: string;
  productId: string;
  received: number;
  accepted: number;
  rejected: number;
  rejectReason: string | null;
  lotNo: string | null;
  expiryDate: string | null;
  serialNos: string[];
  locationId: string | null;
}

export interface GoodsReceiptDoc extends BaseDoc {
  number: string;
  orderId: string;
  supplierId: string;
  warehouseId: string;
  date: string;
  supplierDeliveryNote: string | null;
  lines: ReceiptLine[];
  status: "draft" | "posted" | "cancelled";
  postedAt: string | null;
  notes: string | null;
}

export interface SupplierReturnDoc extends BaseDoc {
  number: string;
  receiptId: string;
  orderId: string;
  supplierId: string;
  warehouseId: string;
  reason: string;
  lines: { receiptLineIndex: number; productId: string; qty: number; lotNo: string | null; serialNos: string[] }[];
  status: "draft" | "shipped" | "cancelled";
  shippedAt: string | null;
}

export const PROCUREMENT_LISTS: Record<"suppliers" | "requisitions" | "rfqs" | "orders" | "receipts" | "returns", LargeListSpec> = {
  suppliers: { filters: ["status", "category"], sorts: [{ field: "nameLower", direction: "asc" }, { field: "createdAt", direction: "desc" }] },
  requisitions: { filters: ["status", "requesterId"], sorts: [{ field: "createdAt", direction: "desc" }] },
  rfqs: { filters: ["status"], sorts: [{ field: "createdAt", direction: "desc" }] },
  orders: { filters: ["status", "supplierId"], sorts: [{ field: "createdAt", direction: "desc" }] },
  receipts: { filters: ["status", "orderId", "supplierId"], sorts: [{ field: "createdAt", direction: "desc" }] },
  returns: { filters: ["status", "supplierId"], sorts: [{ field: "createdAt", direction: "desc" }] },
};
