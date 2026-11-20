import type { BaseDoc } from "../platform/data/repository.js";
import type { LargeListSpec } from "../platform/data/indexes.js";

export const PRODUCT_COLLECTIONS = {
  categories: "productCategories",
  uoms: "unitsOfMeasure",
  products: "products",
  priceLists: "priceLists",
  priceListItems: "priceListItems",
  discountRules: "discountRules",
} as const;

export interface CategoryDoc extends BaseDoc {
  code: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
}

export const UOM_KINDS = ["count", "weight", "volume", "length", "area", "time"] as const;

export interface UomDoc extends BaseDoc {
  code: string;
  name: string;
  kind: (typeof UOM_KINDS)[number];
  /** Whole units only (pieces), or fractions allowed (kg). */
  wholeOnly: boolean;
  isActive: boolean;
}

export const PRODUCT_TYPES = ["stock", "non_stock", "service", "bundle", "manufactured", "digital"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];
export const COSTING_METHODS = ["average", "fifo", "standard"] as const;

export interface UomConversion {
  uom: string;
  /** How many base units one of `uom` holds, in thousandths (a box of 12 pieces is 12000). */
  factor: number;
}

export interface BundleComponent {
  productId: string;
  /** Thousandths of the component's base unit per one bundle. */
  qty: number;
}

export interface ProductDoc extends BaseDoc {
  sku: string;
  name: string;
  nameLower: string;
  description: string | null;
  type: ProductType;
  status: "active" | "inactive" | "discontinued";
  categoryId: string | null;
  brand: string | null;
  baseUom: string;
  salesUom: string | null;
  purchaseUom: string | null;
  uomConversions: UomConversion[];
  barcodes: string[];
  taxCategory: string | null;
  costingMethod: (typeof COSTING_METHODS)[number];
  currency: string;
  /** Minor units per base unit. */
  salesPrice: number;
  purchasePrice: number;
  standardCost: number;
  preferredSupplierId: string | null;
  weightGrams: number | null;
  dimensionsCm: { length: number; width: number; height: number } | null;
  warrantyMonths: number | null;
  trackLots: boolean;
  trackSerials: boolean;
  trackExpiry: boolean;
  /** Variants point at their template product and carry attribute values (colour, size …). */
  parentProductId: string | null;
  attributes: Record<string, string>;
  components: BundleComponent[];
  isSellable: boolean;
  isPurchasable: boolean;
}

export interface PriceListDoc extends BaseDoc {
  code: string;
  name: string;
  kind: "sales" | "purchase";
  currency: string;
  /** Used when a customer has no list of its own. */
  isDefault: boolean;
  /** Draft lists can be edited freely; activation goes through approval. */
  status: "draft" | "pending_approval" | "active" | "inactive";
  validFrom: string | null;
  validTo: string | null;
}

export interface PriceListItemDoc extends BaseDoc {
  priceListId: string;
  productId: string;
  /** Quantity break in thousandths of the base unit; 0 for the base price. */
  minQty: number;
  /** Minor units per base unit. */
  unitPrice: number;
  validFrom: string | null;
  validTo: string | null;
}

export const DISCOUNT_SCOPES = ["all", "category", "product", "customer", "segment"] as const;

export interface DiscountRuleDoc extends BaseDoc {
  code: string;
  name: string;
  kind: "percent" | "amount";
  /** Percent in hundredths (12.5% = 1250) or an amount in minor units per base unit. */
  value: number;
  scope: (typeof DISCOUNT_SCOPES)[number];
  targetIds: string[];
  /** Minimum quantity (thousandths) for the rule to apply. */
  minQty: number;
  validFrom: string | null;
  validTo: string | null;
  /** Lower runs first. Non-stackable rules stop further discounts. */
  priority: number;
  stackable: boolean;
  isActive: boolean;
}

export const PRODUCT_LISTS: Record<"products" | "priceListItems", LargeListSpec> = {
  products: { filters: ["status", "type", "categoryId"], sorts: [{ field: "nameLower", direction: "asc" }, { field: "createdAt", direction: "desc" }] },
  priceListItems: { filters: ["priceListId", "productId"], sorts: [{ field: "createdAt", direction: "desc" }] },
};
