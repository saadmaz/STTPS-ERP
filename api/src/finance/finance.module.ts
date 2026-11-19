import { BadRequestException, Body, Controller, Get, HttpCode, Module, Param, Post, Put, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { Ctx, RequestContext } from "../platform/context/request-context.js";
import { createMasterDataController, validated } from "../platform/crud/master-data.controller.js";
import { RequireModule } from "../platform/modules/require-module.decorator.js";
import { OrgModule } from "../org/org.module.js";
import { SalesModule } from "../sales/sales.module.js";
import { InvoiceService, ReceiptService, ReceivablesService } from "./ar.services.js";
import { BillService, PayablesService, PaymentService } from "./ap.services.js";
import { BankService } from "./bank.services.js";
import { BudgetService, CreateBudgetDto, UpdateBudgetDto } from "./budget.js";
import { AssetCategoryService, AssetsController, CreateAssetCategoryDto, CreateAssetDto, FixedAssetService, UpdateAssetCategoryDto, UpdateAssetDto } from "./assets.js";
import { CreateExpenseCategoryDto, CreateExpenseClaimDto, ExpenseCategoryService, ExpenseClaimService, ExpensesController, UpdateExpenseCategoryDto, UpdateExpenseClaimDto } from "./expenses.js";
import { CreateFromLineDto, ImportStatementDto, MatchLineDto, ReconcileDto, TransferDto } from "./bank.dto.js";
import { ApplyDebitDto, BillFromReceiptDto, CreateBillDto, CreatePaymentDto, PaymentRunDto, PostBillDto, UpdateBillDto, UpdatePaymentDto } from "./ap.dto.js";
import { ApplyCreditDto, CreateInvoiceDto, CreateReceiptDto, UpdateInvoiceDto, UpdateReceiptDto, WriteOffDto } from "./ar.dto.js";
import { AccountService, AutoPostingService, FinanceReportsService, FinanceSettingsService, JournalService } from "./finance.services.js";
import { GeneralLedger } from "./ledger.service.js";
import { CreateAccountDto, CreateJournalDto, FinanceSettingsDto, ReverseJournalDto, SetupFinanceDto, UpdateAccountDto, UpdateJournalDto } from "./finance.dto.js";

const MONTH = /^\d{4}-\d{2}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const month = (v?: string) => {
  if (v === undefined || v === "") return undefined;
  if (!MONTH.test(v)) throw new BadRequestException("Months look like 2026-11");
  return v;
};
const day = (v?: string) => {
  if (v === undefined || v === "") return undefined;
  if (!DAY.test(v)) throw new BadRequestException("Dates look like 2026-11-30");
  return v;
};

@ApiTags("Finance")
@ApiBearerAuth()
@RequireModule("finance")
@Controller("finance")
class FinanceController {
  constructor(
    private readonly settings: FinanceSettingsService,
    private readonly journals: JournalService,
    private readonly postings: AutoPostingService,
    private readonly reports: FinanceReportsService,
    private readonly invoices: InvoiceService,
    private readonly receivables: ReceivablesService,
    private readonly bills: BillService,
    private readonly payments: PaymentService,
    private readonly payables: PayablesService,
    private readonly bank: BankService,
    private readonly budgets: BudgetService,
  ) {}

  @Post("budgets/:id/submit")
  @HttpCode(200)
  @RequirePermission("finance.budget.edit")
  @ApiOperation({ summary: "Approve the budget (through a workflow when one applies); a revision supersedes the one it revises" })
  submitBudget(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.budgets.submit(ctx, id);
  }

  @Post("budgets/:id/revise")
  @HttpCode(200)
  @RequirePermission("finance.budget.create")
  reviseBudget(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.budgets.revise(ctx, id);
  }

  @Get("budgets/:id/vs-actual")
  @RequirePermission("finance.budget.view")
  budgetVsActual(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.budgets.vsActual(ctx, id);
  }

  @Get("bank/accounts")
  @RequirePermission("finance.bank.view")
  @ApiOperation({ summary: "Bank and cash accounts with balances, unmatched statement lines and last reconciliation" })
  bankAccounts(@Ctx() ctx: RequestContext) {
    return this.bank.accounts(ctx);
  }

  @Post("bank/transfers")
  @HttpCode(200)
  @RequirePermission("finance.bank.edit")
  transfer(@Ctx() ctx: RequestContext, @Body(validated(TransferDto)) dto: TransferDto) {
    return this.bank.transfer(ctx, dto);
  }

  @Post("bank/statements")
  @HttpCode(200)
  @RequirePermission("finance.bank.edit")
  @ApiOperation({ summary: "Import a CSV or OFX statement; duplicates are skipped and exact matches are made automatically" })
  importStatement(@Ctx() ctx: RequestContext, @Body(validated(ImportStatementDto)) dto: ImportStatementDto) {
    return this.bank.importStatement(ctx, dto);
  }

  @Get("bank/:accountId/lines")
  @RequirePermission("finance.bank.view")
  statementLines(@Ctx() ctx: RequestContext, @Param("accountId") accountId: string, @Query("status") status?: string) {
    return this.bank.statementLines(ctx, accountId, status === "matched" || status === "unmatched" ? status : undefined);
  }

  @Get("bank/:accountId/unmatched-entries")
  @RequirePermission("finance.bank.view")
  unmatchedEntries(@Ctx() ctx: RequestContext, @Param("accountId") accountId: string) {
    return this.bank.unmatchedEntries(ctx, accountId);
  }

  @Post("bank/:accountId/auto-match")
  @HttpCode(200)
  @RequirePermission("finance.bank.edit")
  async autoMatch(@Ctx() ctx: RequestContext, @Param("accountId") accountId: string) {
    await this.bank.bankAccount(ctx, accountId);
    return { matched: await this.bank.autoMatch(ctx, accountId) };
  }

  @Post("bank/lines/:id/match")
  @HttpCode(200)
  @RequirePermission("finance.bank.edit")
  matchLine(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(MatchLineDto)) dto: MatchLineDto) {
    return this.bank.match(ctx, id, dto.entryIds);
  }

  @Post("bank/lines/:id/unmatch")
  @HttpCode(200)
  @RequirePermission("finance.bank.edit")
  unmatchLine(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.bank.unmatch(ctx, id);
  }

  @Post("bank/lines/:id/create")
  @HttpCode(200)
  @RequirePermission("finance.bank.edit")
  @ApiOperation({ summary: "Post a line that is not in the books yet (bank charges, interest) and match it" })
  createFromLine(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(CreateFromLineDto)) dto: CreateFromLineDto) {
    return this.bank.createFromLine(ctx, id, dto.accountId, dto.description);
  }

  @Post("bank/reconciliations")
  @HttpCode(200)
  @RequirePermission("finance.bank.edit")
  reconcile(@Ctx() ctx: RequestContext, @Body(validated(ReconcileDto)) dto: ReconcileDto) {
    return this.bank.reconcile(ctx, dto);
  }

  @Get("bank/:accountId/reconciliations")
  @RequirePermission("finance.bank.view")
  reconciliations(@Ctx() ctx: RequestContext, @Param("accountId") accountId: string) {
    return this.bank.reconciliations(ctx, accountId);
  }

  @Post("bills/:id/post")
  @HttpCode(200)
  @RequirePermission("finance.bill.edit")
  @ApiOperation({ summary: "Post the bill to payables after three-way matching (an override reason is needed when it does not match)" })
  postBill(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(PostBillDto)) dto: PostBillDto) {
    return this.bills.post(ctx, id, dto.overrideReason);
  }

  @Post("bills/:id/cancel")
  @HttpCode(200)
  @RequirePermission("finance.bill.edit")
  cancelBill(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.bills.cancel(ctx, id);
  }

  @Post("bills/:id/apply-debit")
  @HttpCode(200)
  @RequirePermission("finance.bill.edit")
  applyDebit(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(ApplyDebitDto)) dto: ApplyDebitDto) {
    return this.bills.applyDebit(ctx, id, dto.billId, dto.amount);
  }

  @Post("bills/from-receipt/:receiptId")
  @HttpCode(200)
  @RequirePermission("finance.bill.create")
  @ApiOperation({ summary: "Draft a bill for a posted goods receipt at the order prices" })
  billFromReceipt(@Ctx() ctx: RequestContext, @Param("receiptId") receiptId: string, @Body(validated(BillFromReceiptDto)) dto: BillFromReceiptDto) {
    return this.bills.fromReceipt(ctx, receiptId, dto.supplierInvoiceNo, dto.date);
  }

  @Post("payments/run")
  @HttpCode(200)
  @RequirePermission("finance.payment.create")
  @ApiOperation({ summary: "Pay the chosen bills in full, one payment per supplier" })
  paymentRun(@Ctx() ctx: RequestContext, @Body(validated(PaymentRunDto)) dto: PaymentRunDto) {
    return this.payments.run(ctx, dto);
  }

  @Get("payables/ageing")
  @RequirePermission("finance.bill.view")
  payablesAgeing(@Ctx() ctx: RequestContext, @Query("asOf") asOf?: string) {
    return this.payables.ageing(ctx, day(asOf));
  }

  @Get("payables/due")
  @RequirePermission("finance.bill.view")
  @ApiOperation({ summary: "Open bills due by a date (default today), for a payment run" })
  due(@Ctx() ctx: RequestContext, @Query("by") by?: string) {
    return this.payables.due(ctx, day(by));
  }

  @Get("payables/statement/:supplierId")
  @RequirePermission("finance.bill.view")
  supplierStatement(@Ctx() ctx: RequestContext, @Param("supplierId") supplierId: string) {
    return this.payables.statement(ctx, supplierId);
  }

  @Post("invoices/:id/post")
  @HttpCode(200)
  @RequirePermission("finance.invoice.edit")
  @ApiOperation({ summary: "Post the invoice or credit note to receivables" })
  postInvoice(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.invoices.post(ctx, id);
  }

  @Post("invoices/:id/cancel")
  @HttpCode(200)
  @RequirePermission("finance.invoice.edit")
  cancelInvoice(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.invoices.cancel(ctx, id);
  }

  @Post("invoices/:id/apply-credit")
  @HttpCode(200)
  @RequirePermission("finance.invoice.edit")
  @ApiOperation({ summary: "Use this credit note to settle part of an open invoice" })
  applyCredit(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(ApplyCreditDto)) dto: ApplyCreditDto) {
    return this.invoices.applyCredit(ctx, id, dto.invoiceId, dto.amount);
  }

  @Post("invoices/:id/write-off")
  @HttpCode(200)
  @RequirePermission("finance.invoice.delete")
  writeOff(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(WriteOffDto)) dto: WriteOffDto) {
    return this.invoices.writeOff(ctx, id, dto.accountId, dto.reason);
  }

  @Post("invoices/from-delivery/:deliveryId")
  @HttpCode(200)
  @RequirePermission("finance.invoice.create")
  @ApiOperation({ summary: "Draft an invoice for a dispatched delivery at the order prices" })
  fromDelivery(@Ctx() ctx: RequestContext, @Param("deliveryId") deliveryId: string) {
    return this.invoices.fromDelivery(ctx, deliveryId);
  }

  @Post("invoices/from-return/:returnId")
  @HttpCode(200)
  @RequirePermission("finance.invoice.create")
  @ApiOperation({ summary: "Draft a credit note for a received sales return" })
  fromReturn(@Ctx() ctx: RequestContext, @Param("returnId") returnId: string) {
    return this.invoices.fromReturn(ctx, returnId);
  }

  @Get("receivables/ageing")
  @RequirePermission("finance.invoice.view")
  ageing(@Ctx() ctx: RequestContext, @Query("asOf") asOf?: string) {
    return this.receivables.ageing(ctx, day(asOf));
  }

  @Get("receivables/statement/:customerId")
  @RequirePermission("finance.invoice.view")
  statement(@Ctx() ctx: RequestContext, @Param("customerId") customerId: string) {
    return this.receivables.statement(ctx, customerId);
  }

  @Get("settings")
  @RequirePermission("finance.account.view")
  getSettings(@Ctx() ctx: RequestContext) {
    return this.settings.get(ctx);
  }

  @Put("settings")
  @RequirePermission("finance.settings.edit")
  @ApiOperation({ summary: "Base currency and the account used for each kind of automatic posting" })
  putSettings(@Ctx() ctx: RequestContext, @Body(validated(FinanceSettingsDto)) dto: FinanceSettingsDto) {
    return this.settings.update(ctx, dto);
  }

  @Post("setup")
  @HttpCode(200)
  @RequirePermission("finance.settings.edit")
  @ApiOperation({ summary: "Create the standard chart of accounts and posting rules (new companies only)" })
  setup(@Ctx() ctx: RequestContext, @Body(validated(SetupFinanceDto)) dto: SetupFinanceDto) {
    return this.settings.setup(ctx, dto.baseCurrency);
  }

  @Post("journals/:id/post")
  @HttpCode(200)
  @RequirePermission("finance.journal.edit")
  @ApiOperation({ summary: "Post the journal (or send it for approval when a workflow applies)" })
  post(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.journals.submit(ctx, id);
  }

  @Post("journals/:id/reverse")
  @HttpCode(200)
  @RequirePermission("finance.journal.edit")
  reverse(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body(validated(ReverseJournalDto)) dto: ReverseJournalDto) {
    return this.journals.reverse(ctx, id, dto.date, dto.memo);
  }

  @Post("journals/:id/cancel")
  @HttpCode(200)
  @RequirePermission("finance.journal.edit")
  cancel(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.journals.cancel(ctx, id);
  }

  @Get("posting-issues")
  @RequirePermission("finance.journal.view")
  @ApiOperation({ summary: "Automatic postings that failed (closed period, missing account mapping …)" })
  issues(@Ctx() ctx: RequestContext, @Query("status") status?: string) {
    return this.postings.issues(ctx, status === "resolved" ? "resolved" : "open");
  }

  @Post("posting-issues/:id/retry")
  @HttpCode(200)
  @RequirePermission("finance.journal.edit")
  retry(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return this.postings.retry(ctx, id);
  }

  @Get("reports/trial-balance")
  @RequirePermission("finance.reports.view")
  trialBalance(@Ctx() ctx: RequestContext, @Query("to") to?: string) {
    return this.reports.trialBalance(ctx, month(to));
  }

  @Get("reports/profit-and-loss")
  @RequirePermission("finance.reports.view")
  profitAndLoss(@Ctx() ctx: RequestContext, @Query("from") from?: string, @Query("to") to?: string) {
    return this.reports.profitAndLoss(ctx, month(from), month(to));
  }

  @Get("reports/balance-sheet")
  @RequirePermission("finance.reports.view")
  balanceSheet(@Ctx() ctx: RequestContext, @Query("to") to?: string) {
    return this.reports.balanceSheet(ctx, month(to));
  }

  @Get("reports/ledger/:accountId")
  @RequirePermission("finance.reports.view")
  @ApiOperation({ summary: "One account's posted lines with a running balance" })
  ledger(@Ctx() ctx: RequestContext, @Param("accountId") accountId: string, @Query("from") from?: string, @Query("to") to?: string) {
    return this.reports.accountLedger(ctx, accountId, day(from), day(to));
  }
}

const crud = [
  createMasterDataController({ path: "finance/accounts", tag: "Finance: Chart of accounts", module: "finance", permission: "finance.account", service: AccountService, createDto: CreateAccountDto, updateDto: UpdateAccountDto }),
  createMasterDataController({ path: "finance/journals", tag: "Finance: Journals", module: "finance", permission: "finance.journal", service: JournalService, createDto: CreateJournalDto, updateDto: UpdateJournalDto }),
  createMasterDataController({ path: "finance/invoices", tag: "Finance: Invoices and credit notes", module: "finance", permission: "finance.invoice", service: InvoiceService, createDto: CreateInvoiceDto, updateDto: UpdateInvoiceDto }),
  createMasterDataController({ path: "finance/receipts", tag: "Finance: Customer receipts", module: "finance", permission: "finance.receipt", service: ReceiptService, createDto: CreateReceiptDto, updateDto: UpdateReceiptDto }),
  createMasterDataController({ path: "expenses/categories", tag: "Expenses: Categories", module: "expenses", permission: "expenses.category", service: ExpenseCategoryService, createDto: CreateExpenseCategoryDto, updateDto: UpdateExpenseCategoryDto }),
  createMasterDataController({ path: "expenses/claims", tag: "Expenses: Claims", module: "expenses", permission: "expenses.claim", service: ExpenseClaimService, createDto: CreateExpenseClaimDto, updateDto: UpdateExpenseClaimDto }),
  createMasterDataController({ path: "assets/categories", tag: "Assets: Categories", module: "assets", permission: "assets.category", service: AssetCategoryService, createDto: CreateAssetCategoryDto, updateDto: UpdateAssetCategoryDto }),
  createMasterDataController({ path: "assets/register", tag: "Assets: Register", module: "assets", permission: "assets.asset", service: FixedAssetService, createDto: CreateAssetDto, updateDto: UpdateAssetDto }),
  createMasterDataController({ path: "finance/budgets", tag: "Finance: Budgets", module: "finance", permission: "finance.budget", service: BudgetService, createDto: CreateBudgetDto, updateDto: UpdateBudgetDto }),
  createMasterDataController({ path: "finance/bills", tag: "Finance: Supplier bills and debit notes", module: "finance", permission: "finance.bill", service: BillService, createDto: CreateBillDto, updateDto: UpdateBillDto }),
  createMasterDataController({ path: "finance/payments", tag: "Finance: Supplier payments", module: "finance", permission: "finance.payment", service: PaymentService, createDto: CreatePaymentDto, updateDto: UpdatePaymentDto }),
];

const SERVICES = [AssetCategoryService, FixedAssetService, ExpenseCategoryService, ExpenseClaimService, BudgetService, BankService, BillService, PaymentService, PayablesService, GeneralLedger, AccountService, FinanceSettingsService, JournalService, AutoPostingService, FinanceReportsService, InvoiceService, ReceiptService, ReceivablesService];

@Module({
  imports: [OrgModule, SalesModule],
  controllers: [FinanceController, ExpensesController, AssetsController, ...crud],
  providers: SERVICES,
  exports: SERVICES,
})
export class FinanceModule {}
