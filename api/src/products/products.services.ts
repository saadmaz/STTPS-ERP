import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import type { Transaction } from "firebase-admin/firestore";
import { FirestoreService } from "../firestore/firestore.service.js";
import { AuditService } from "../platform/audit/audit.service.js";
import { RequestContext, Scope } from "../platform/context/request-context.js";
import { MasterDataService } from "../platform/crud/master-data.service.js";
import { applyRate, extend, toMinor, toQty, QTY_SCALE } from "../platform/data/money.js";
import { NewDoc, Patch } from "../platform/data/repository.js";
import { UniqueService } from "../platform/data/unique.service.js";
import { EventBusService } from "../platform/events/event-bus.service.js";
import { ApprovalsService } from "../platform/approvals/approvals.service.js";
import { APPROVAL_COMPLETED, ApprovalCompletedPayload } from "../platform/approvals/approvals.models.js";
import { SearchEntry } from "../platform/search/search-index.js";
import { CRM_COLLECTIONS } from "../crm/crm.models.js";
import {
  CategoryDoc,
  DiscountRuleDoc,
  PRODUCT_COLLECTIONS,
  PRODUCT_LISTS,
  PriceListDoc,
  PriceListItemDoc,
  ProductDoc,
  UomDoc,
} from "./products.models.js";
import {
  CreateCategoryDto,
  CreateDiscountRuleDto,
  CreatePriceListDto,
  CreatePriceListItemDto,
  CreateProductDto,
  CreateUomDto,
  UpdateCategoryDto,
  UpdateDiscountRuleDto,
  UpdatePriceListDto,
  UpdatePriceListItemDto,
  UpdateProductDto,
  UpdateUomDto,
} from "./products.dto.js";

const orNull = <V>(v: V | undefined): V | null => (v === undefined ? null : v);
const day = (v: string | undefined | null) => (v ? v.slice(0, 10) : null);
const inWindow = (date: string, from: string | null, to: string | null) => (!from || from <= date) && (!to || date <= to);

@Injectable()
export class CategoryService extends MasterDataService<CategoryDoc, CreateCategoryDto, UpdateCategoryDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "products",
      entity: "category",
      label: "Product category",
      collection: PRODUCT_COLLECTIONS.categories,
      route: "/products/categories",
      uniqueFields: ["code"],
      parentField: "parentId",
      filterFields: ["parentId", "isActive"],
    });
  }

  protected toNew(dto: CreateCategoryDto): NewDoc<CategoryDoc> {
    return { code: dto.code, name: dto.name, parentId: orNull(dto.parentId), isActive: dto.isActive ?? true };
  }
}

@Injectable()
export class UomService extends MasterDataService<UomDoc, CreateUomDto, UpdateUomDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "products",
      entity: "uom",
      label: "Unit of measure",
      collection: PRODUCT_COLLECTIONS.uoms,
      route: "/products/uoms",
      uniqueFields: ["code"],
      filterFields: ["kind", "isActive"],
      customFields: false,
      searchable: false,
    });
  }

  protected toNew(dto: CreateUomDto): NewDoc<UomDoc> {
    return { code: dto.code.toLowerCase(), name: dto.name, kind: dto.kind, wholeOnly: dto.wholeOnly ?? dto.kind === "count", isActive: dto.isActive ?? true };
  }

  /** Unit codes of the company: the basic set when none are defined yet. */
  async codes(scope: Scope, tx?: Transaction): Promise<Set<string>> {
    const defined = (await this.loadAll(scope, tx)).filter((u) => u.isActive).map((u) => u.code);
    return new Set(defined.length ? defined : ["pcs", "kg", "g", "l", "ml", "m", "cm", "box", "pack", "hr", "day"]);
  }
}

@Injectable()
export class ProductService extends MasterDataService<ProductDoc, CreateProductDto, UpdateProductDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService, private readonly uoms: UomService) {
    super(fs, audit, unique, {
      module: "products",
      entity: "product",
      label: "Product",
      collection: PRODUCT_COLLECTIONS.products,
      route: "/products/items",
      uniqueFields: ["sku"],
      references: [
        { field: "categoryId", collection: PRODUCT_COLLECTIONS.categories, label: "Category" },
        { field: "parentProductId", collection: PRODUCT_COLLECTIONS.products, label: "Template product" },
      ],
      filterFields: ["status", "type", "categoryId", "parentProductId", "brand"],
      large: PRODUCT_LISTS.products,
      numbering: { field: "sku", key: "product", prefix: "PRD" },
    });
  }

  protected toNew(dto: CreateProductDto): NewDoc<ProductDoc> {
    const currency = dto.currency ?? "LKR";
    const type = dto.type ?? "stock";
    return {
      sku: dto.sku ?? "",
      name: dto.name.trim(),
      nameLower: dto.name.trim().toLowerCase(),
      description: orNull(dto.description),
      type,
      status: dto.status ?? "active",
      categoryId: orNull(dto.categoryId),
      brand: orNull(dto.brand),
      baseUom: (dto.baseUom ?? (type === "service" ? "hr" : "pcs")).toLowerCase(),
      salesUom: dto.salesUom?.toLowerCase() ?? null,
      purchaseUom: dto.purchaseUom?.toLowerCase() ?? null,
      uomConversions: (dto.uomConversions ?? []).map((c) => ({ uom: c.uom.toLowerCase(), factor: toQty(c.factor) })),
      barcodes: [...new Set((dto.barcodes ?? []).map((b) => b.trim()).filter(Boolean))],
      taxCategory: orNull(dto.taxCategory),
      costingMethod: dto.costingMethod ?? "average",
      currency,
      salesPrice: dto.salesPrice ? toMinor(dto.salesPrice, currency) : 0,
      purchasePrice: dto.purchasePrice ? toMinor(dto.purchasePrice, currency) : 0,
      standardCost: dto.standardCost ? toMinor(dto.standardCost, currency) : 0,
      preferredSupplierId: orNull(dto.preferredSupplierId),
      weightGrams: orNull(dto.weightGrams),
      dimensionsCm: orNull(dto.dimensionsCm),
      warrantyMonths: orNull(dto.warrantyMonths),
      trackLots: dto.trackLots ?? false,
      trackSerials: dto.trackSerials ?? false,
      trackExpiry: dto.trackExpiry ?? false,
      parentProductId: orNull(dto.parentProductId),
      attributes: dto.attributes ?? {},
      components: (dto.components ?? []).map((c) => ({ productId: c.productId, qty: toQty(c.qty) })),
      isSellable: dto.isSellable ?? true,
      isPurchasable: dto.isPurchasable ?? (type === "stock" || type === "non_stock"),
    };
  }

  protected toPatch(dto: UpdateProductDto, before: ProductDoc): Patch<ProductDoc> {
    const { salesPrice, purchasePrice, standardCost, uomConversions, components, customFields: _c, ...rest } = dto;
    const currency = dto.currency ?? before.currency;
    if (dto.currency && dto.currency !== before.currency && salesPrice === undefined) {
      throw new BadRequestException("Re-enter the prices when changing the currency");
    }
    const patch = { ...rest } as Patch<ProductDoc>;
    if (dto.name) patch.nameLower = dto.name.trim().toLowerCase();
    if (dto.baseUom) patch.baseUom = dto.baseUom.toLowerCase();
    if (salesPrice !== undefined) patch.salesPrice = salesPrice ? toMinor(salesPrice, currency) : 0;
    if (purchasePrice !== undefined) patch.purchasePrice = purchasePrice ? toMinor(purchasePrice, currency) : 0;
    if (standardCost !== undefined) patch.standardCost = standardCost ? toMinor(standardCost, currency) : 0;
    if (uomConversions) patch.uomConversions = uomConversions.map((c) => ({ uom: c.uom.toLowerCase(), factor: toQty(c.factor) }));
    if (components) patch.components = components.map((c) => ({ productId: c.productId, qty: toQty(c.qty) }));
    if (dto.barcodes) patch.barcodes = [...new Set(dto.barcodes.map((b) => b.trim()).filter(Boolean))];
    return patch;
  }

  protected async validate(tx: Transaction, ctx: RequestContext, next: ProductDoc, before: ProductDoc | null): Promise<void> {
    const units = await this.uoms.codes(ctx, tx);
    for (const u of [next.baseUom, next.salesUom, next.purchaseUom, ...next.uomConversions.map((c) => c.uom)]) {
      if (u && !units.has(u)) throw new BadRequestException(`Unknown unit "${u}"; add it under units of measure`);
    }
    if (next.uomConversions.some((c) => c.factor <= 0)) throw new BadRequestException("Unit conversion factors must be positive");
    if (next.type === "bundle") {
      if (next.components.length === 0) throw new BadRequestException("A bundle needs at least one component");
      if (next.components.some((c) => c.productId === next.id)) throw new BadRequestException("A bundle cannot contain itself");
      const parts = await tx.getAll(...next.components.map((c) => this.repo.ref(c.productId)));
      if (parts.some((p) => p.data()?.companyId !== ctx.companyId)) throw new BadRequestException("Bundle component not found");
      if (parts.some((p) => p.data()?.type === "bundle")) throw new BadRequestException("Bundles cannot contain other bundles");
    } else if (next.components.length) {
      throw new BadRequestException("Only bundles have components");
    }
    if (next.trackSerials && !["stock", "manufactured"].includes(next.type)) throw new BadRequestException("Only stocked products can track serial numbers");
    if (before && before.baseUom !== next.baseUom && before.type === "stock") {
      throw new BadRequestException("The base unit of a stocked product cannot change; create a new product");
    }
  }

  /** Base-unit quantity (thousandths) for a quantity entered in `uom`. */
  toBaseQty(product: ProductDoc, qty: number, uom: string | null | undefined): number {
    if (!uom || uom === product.baseUom) return qty;
    const conv = product.uomConversions.find((c) => c.uom === uom);
    if (!conv) throw new BadRequestException(`${product.sku} has no conversion from ${uom}`);
    return Math.round((qty * conv.factor) / QTY_SCALE);
  }

  protected searchEntry(doc: ProductDoc): SearchEntry {
    return { entityType: this.entityType, entityId: doc.id, title: doc.name, subtitle: doc.sku, keywords: [doc.sku, doc.brand, ...doc.barcodes] };
  }
}

@Injectable()
export class PriceListService extends MasterDataService<PriceListDoc, CreatePriceListDto, UpdatePriceListDto> implements OnModuleInit {
  constructor(
    fs: FirestoreService,
    audit: AuditService,
    unique: UniqueService,
    private readonly approvals: ApprovalsService,
    private readonly events: EventBusService,
  ) {
    super(fs, audit, unique, {
      module: "products",
      entity: "priceList",
      label: "Price list",
      collection: PRODUCT_COLLECTIONS.priceLists,
      route: "/products/price-lists",
      uniqueFields: ["code"],
      filterFields: ["kind", "status", "isDefault"],
      customFields: false,
    });
  }

  onModuleInit(): void {
    this.events.subscribe<ApprovalCompletedPayload>(APPROVAL_COMPLETED, "products.priceListApproval", async (event) => {
      if (event.payload.entityType !== this.entityType) return;
      const ctx = { tenantId: event.tenantId, companyId: event.companyId, userId: event.payload.decidedBy };
      await this.firestore.runTransaction(async (tx) => {
        const list = await this.repo.find(ctx, event.payload.entityId, tx);
        if (!list || list.status !== "pending_approval") return;
        const others = event.payload.outcome === "approved" && list.isDefault ? await this.otherDefaults(tx, ctx, list) : [];
        this.repo.applyUpdate(ctx, tx, list, { status: event.payload.outcome === "approved" ? "active" : "draft" });
        for (const o of others) this.repo.applyUpdate(ctx, tx, o, { isDefault: false });
      });
    });
  }

  protected toNew(dto: CreatePriceListDto): NewDoc<PriceListDoc> {
    return {
      code: dto.code,
      name: dto.name,
      kind: dto.kind ?? "sales",
      currency: dto.currency ?? "LKR",
      isDefault: dto.isDefault ?? false,
      status: "draft",
      validFrom: day(dto.validFrom),
      validTo: day(dto.validTo),
    };
  }

  protected toPatch(dto: UpdatePriceListDto, before: PriceListDoc): Patch<PriceListDoc> {
    if (before.status === "pending_approval") throw new BadRequestException("Wait for the approval decision before changing this list");
    if (dto.currency && dto.currency !== before.currency) throw new BadRequestException("A price list's currency cannot change");
    return { ...dto, validFrom: dto.validFrom === undefined ? undefined : day(dto.validFrom), validTo: dto.validTo === undefined ? undefined : day(dto.validTo) } as Patch<PriceListDoc>;
  }

  private async otherDefaults(tx: Transaction, scope: Scope, list: PriceListDoc): Promise<PriceListDoc[]> {
    return (await this.loadAll(scope, tx)).filter((l) => l.id !== list.id && l.kind === list.kind && l.isDefault);
  }

  /** Sends a draft list for approval; with no workflow configured it becomes active at once. */
  async activate(ctx: RequestContext, id: string): Promise<PriceListDoc> {
    const list = await this.repo.get(ctx, id);
    if (list.status === "active") return list;
    if (list.status === "pending_approval") throw new BadRequestException("Already waiting for approval");
    const prepared = await this.approvals.prepare(ctx, {
      entityType: this.entityType,
      entityId: id,
      entityLabel: `Price list ${list.code} · ${list.name}`,
      link: `/products/price-lists/${id}`,
      facts: { kind: list.kind, isDefault: list.isDefault, currency: list.currency },
    });
    return this.firestore.runTransaction(async (tx) => {
      const before = await this.repo.get(ctx, id, tx);
      const others = before.isDefault ? await this.otherDefaults(tx, ctx, before) : [];
      const request = await this.approvals.open(tx, ctx, prepared);
      const approved = request.status === "approved";
      const { after } = this.repo.applyUpdate(ctx, tx, before, { status: approved ? "active" : "pending_approval" });
      if (approved) for (const o of others) this.repo.applyUpdate(ctx, tx, o, { isDefault: false });
      this.audit.record(ctx, { module: "products", action: approved ? "activated" : "submitted", entity: this.entityType, entityId: id, before: { status: before.status }, after: { status: after.status } }, tx);
      return after;
    });
  }

  async deactivate(ctx: RequestContext, id: string): Promise<PriceListDoc> {
    const { after } = await this.repo.update(ctx, id, { status: "inactive" });
    this.audit.record(ctx, { module: "products", action: "deactivated", entity: this.entityType, entityId: id });
    return after;
  }
}

type ItemInput = CreatePriceListItemDto & { unitPriceMinor?: number };
type ItemPatchInput = UpdatePriceListItemDto & { unitPriceMinor?: number };

@Injectable()
export class PriceListItemService extends MasterDataService<PriceListItemDoc, ItemInput, ItemPatchInput> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "products",
      entity: "priceListItem",
      label: "Price",
      collection: PRODUCT_COLLECTIONS.priceListItems,
      permission: "products.priceList",
      route: "/products/price-lists",
      references: [
        { field: "priceListId", collection: PRODUCT_COLLECTIONS.priceLists, label: "Price list" },
        { field: "productId", collection: PRODUCT_COLLECTIONS.products, label: "Product" },
      ],
      filterFields: ["priceListId", "productId"],
      large: PRODUCT_LISTS.priceListItems,
      customFields: false,
      searchable: false,
    });
  }

  /** A list's currency never changes, so the price can be converted before the transaction. */
  private async currencyOf(scope: Scope, priceListId: string): Promise<string> {
    const list = (await this.firestore.collection<PriceListDoc>(PRODUCT_COLLECTIONS.priceLists).doc(priceListId).get()).data();
    if (!list || list.companyId !== scope.companyId) throw new BadRequestException("Price list not found");
    return list.currency;
  }

  async create(ctx: RequestContext, dto: ItemInput): Promise<PriceListItemDoc> {
    const currency = await this.currencyOf(ctx, dto.priceListId);
    return super.create(ctx, { ...dto, unitPriceMinor: toMinor(dto.unitPrice, currency) });
  }

  async update(ctx: RequestContext, id: string, dto: ItemPatchInput, expectedVersion?: number): Promise<PriceListItemDoc> {
    if (dto.unitPrice === undefined) return super.update(ctx, id, dto, expectedVersion);
    const item = await this.repo.get(ctx, id);
    const currency = await this.currencyOf(ctx, item.priceListId);
    return super.update(ctx, id, { ...dto, unitPriceMinor: toMinor(dto.unitPrice, currency) }, expectedVersion);
  }

  protected toNew(dto: ItemInput): NewDoc<PriceListItemDoc> {
    return {
      priceListId: dto.priceListId,
      productId: dto.productId,
      minQty: dto.minQty ? toQty(dto.minQty) : 0,
      unitPrice: dto.unitPriceMinor ?? 0,
      validFrom: day(dto.validFrom),
      validTo: day(dto.validTo),
    };
  }

  protected toPatch(dto: ItemPatchInput, before: PriceListItemDoc): Patch<PriceListItemDoc> {
    if (dto.priceListId && dto.priceListId !== before.priceListId) throw new BadRequestException("Move a price by deleting and re-adding it");
    return {
      ...(dto.unitPriceMinor !== undefined ? { unitPrice: dto.unitPriceMinor } : {}),
      ...(dto.minQty !== undefined ? { minQty: dto.minQty ? toQty(dto.minQty) : 0 } : {}),
      ...(dto.validFrom !== undefined ? { validFrom: day(dto.validFrom) } : {}),
      ...(dto.validTo !== undefined ? { validTo: day(dto.validTo) } : {}),
      ...(dto.productId ? { productId: dto.productId } : {}),
    };
  }

  /** Prices of a list waiting for approval are frozen. */
  protected async validate(tx: Transaction, ctx: RequestContext, next: PriceListItemDoc): Promise<void> {
    const list = (await tx.get(this.firestore.collection<PriceListDoc>(PRODUCT_COLLECTIONS.priceLists).doc(next.priceListId))).data();
    if (list?.status === "pending_approval") throw new BadRequestException("Wait for the approval decision before changing this list");
  }
}

@Injectable()
export class DiscountRuleService extends MasterDataService<DiscountRuleDoc, CreateDiscountRuleDto, UpdateDiscountRuleDto> {
  constructor(fs: FirestoreService, audit: AuditService, unique: UniqueService) {
    super(fs, audit, unique, {
      module: "products",
      entity: "discountRule",
      label: "Discount rule",
      collection: PRODUCT_COLLECTIONS.discountRules,
      route: "/products/discounts",
      uniqueFields: ["code"],
      filterFields: ["scope", "isActive", "kind"],
      sortFields: ["priority", "code", "name", "createdAt"],
      customFields: false,
    });
  }

  protected toNew(dto: CreateDiscountRuleDto): NewDoc<DiscountRuleDoc> {
    if (dto.scope !== "all" && !dto.targetIds?.length) throw new BadRequestException("Choose what the discount applies to");
    const value = dto.kind === "percent" ? Math.round(Number(dto.value) * 100) : toMinor(dto.value, "LKR");
    if (dto.kind === "percent" && value > 10_000) throw new BadRequestException("A percentage discount cannot exceed 100%");
    return {
      code: dto.code,
      name: dto.name,
      kind: dto.kind,
      value,
      scope: dto.scope,
      targetIds: dto.targetIds ?? [],
      minQty: dto.minQty ? toQty(dto.minQty) : 0,
      validFrom: day(dto.validFrom),
      validTo: day(dto.validTo),
      priority: dto.priority ?? 100,
      stackable: dto.stackable ?? false,
      isActive: dto.isActive ?? true,
    };
  }

  protected toPatch(dto: UpdateDiscountRuleDto, before: DiscountRuleDoc): Patch<DiscountRuleDoc> {
    const kind = dto.kind ?? before.kind;
    const patch = { ...dto } as Record<string, unknown>;
    if (dto.value !== undefined) patch.value = kind === "percent" ? Math.round(Number(dto.value) * 100) : toMinor(dto.value, "LKR");
    if (dto.minQty !== undefined) patch.minQty = dto.minQty ? toQty(dto.minQty) : 0;
    if (dto.validFrom !== undefined) patch.validFrom = day(dto.validFrom);
    if (dto.validTo !== undefined) patch.validTo = day(dto.validTo);
    return patch as Patch<DiscountRuleDoc>;
  }

  async active(scope: Scope, date: string): Promise<DiscountRuleDoc[]> {
    return (await this.loadAll(scope)).filter((r) => r.isActive && inWindow(date, r.validFrom, r.validTo)).sort((a, b) => a.priority - b.priority);
  }
}

export interface PriceQuote {
  productId: string;
  currency: string;
  qty: number;
  /** Minor units per base unit before discounts. */
  listPrice: number;
  /** Minor units per base unit after discounts. */
  unitPrice: number;
  source: "customer_price_list" | "default_price_list" | "product";
  priceListId: string | null;
  discounts: { code: string; name: string; perUnit: number }[];
  lineTotal: number;
}

/** Resolves the selling price for a customer, quantity and date (blueprint §7 pricing). */
@Injectable()
export class PricingService {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly products: ProductService,
    private readonly lists: PriceListService,
    private readonly discounts: DiscountRuleService,
  ) {}

  async quote(ctx: RequestContext, input: { productId: string; accountId?: string; qty?: string; date?: string }): Promise<PriceQuote> {
    const product = await this.products.repo.find(ctx, input.productId);
    if (!product) throw new NotFoundException("Product not found");
    const qty = input.qty ? toQty(input.qty) : QTY_SCALE;
    const date = (input.date ?? new Date().toISOString()).slice(0, 10);
    const account = input.accountId
      ? ((await this.firestore.collection(CRM_COLLECTIONS.accounts).doc(input.accountId).get()).data() as
          | { companyId: string; priceListId?: string | null; segment?: string | null }
          | undefined)
      : undefined;
    if (input.accountId && account?.companyId !== ctx.companyId) throw new NotFoundException("Customer not found");

    const allLists = (await this.lists.all(ctx)).filter((l) => l.kind === "sales" && l.status === "active" && inWindow(date, l.validFrom, l.validTo));
    const customerList = account?.priceListId ? allLists.find((l) => l.id === account.priceListId) : undefined;
    const defaultList = allLists.find((l) => l.isDefault);

    let listPrice = product.salesPrice;
    let currency = product.currency;
    let source: PriceQuote["source"] = "product";
    let priceListId: string | null = null;
    for (const [list, kind] of [[customerList, "customer_price_list"], [defaultList, "default_price_list"]] as const) {
      if (!list) continue;
      const items = await this.firestore
        .collection<PriceListItemDoc>(PRODUCT_COLLECTIONS.priceListItems)
        .where("companyId", "==", ctx.companyId)
        .where("priceListId", "==", list.id)
        .where("productId", "==", product.id)
        .get();
      const tier = items.docs
        .map((d) => d.data())
        .filter((i) => i.archivedAt == null && i.minQty <= qty && inWindow(date, i.validFrom, i.validTo))
        .sort((a, b) => b.minQty - a.minQty)[0];
      if (tier) {
        listPrice = tier.unitPrice;
        currency = list.currency;
        source = kind;
        priceListId = list.id;
        break;
      }
    }

    const applied: PriceQuote["discounts"] = [];
    let unit = listPrice;
    for (const rule of await this.discounts.active(ctx, date)) {
      if (qty < rule.minQty) continue;
      const matches =
        rule.scope === "all" ||
        (rule.scope === "product" && rule.targetIds.includes(product.id)) ||
        (rule.scope === "category" && !!product.categoryId && rule.targetIds.includes(product.categoryId)) ||
        (rule.scope === "customer" && !!input.accountId && rule.targetIds.includes(input.accountId)) ||
        (rule.scope === "segment" && !!account?.segment && rule.targetIds.includes(account.segment));
      if (!matches) continue;
      const perUnit = Math.min(unit, rule.kind === "percent" ? applyRate(unit, rule.value, 4) : rule.value);
      if (perUnit <= 0) continue;
      unit -= perUnit;
      applied.push({ code: rule.code, name: rule.name, perUnit });
      if (!rule.stackable) break;
    }
    return { productId: product.id, currency, qty, listPrice, unitPrice: unit, source, priceListId, discounts: applied, lineTotal: extend(qty, unit) };
  }
}
