import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding STTPS database...\n");

  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: {},
    create: { name: "STTPS Demo Organization", slug: "demo", plan: "professional" },
  });
  console.log(`✅ Tenant: ${tenant.name}`);

  const company = await prisma.company.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: "DEMO" } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "Demo Corporation Ltd",
      code: "DEMO",
      legalName: "Demo Corporation Limited",
      currency: "USD",
      timezone: "America/New_York",
      fiscalYearStart: 1,
    },
  });
  console.log(`✅ Company: ${company.name}`);

  const passwordHash = await bcrypt.hash("Admin@123", 12);
  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "admin@demo.sttps.live" } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: "admin@demo.sttps.live",
      firstName: "System",
      lastName: "Administrator",
      passwordHash,
      isActive: true,
      isSuperAdmin: true,
    },
  });
  console.log(`✅ Admin user: ${user.email}`);

  const companyUser = await prisma.companyUser.upsert({
    where: { userId_companyId: { userId: user.id, companyId: company.id } },
    update: {},
    create: { userId: user.id, companyId: company.id, isDefault: true },
  });

  const adminRole = await prisma.role.upsert({
    where: { id: `role-admin-${company.id}` },
    update: {},
    create: {
      id: `role-admin-${company.id}`,
      tenantId: tenant.id,
      companyId: company.id,
      name: "Administrator",
      description: "Full system access",
      isSystem: true,
    },
  });

  await prisma.userRole.upsert({
    where: { companyUserId_roleId: { companyUserId: companyUser.id, roleId: adminRole.id } },
    update: {},
    create: { companyUserId: companyUser.id, roleId: adminRole.id },
  });

  // Chart of Accounts
  const accounts = [
    { code: "1000", name: "Current Assets", type: "ASSET", isPosting: false },
    { code: "1100", name: "Cash and Cash Equivalents", type: "ASSET", parentCode: "1000" },
    { code: "1110", name: "Petty Cash", type: "ASSET", parentCode: "1100" },
    { code: "1120", name: "Checking Account", type: "ASSET", parentCode: "1100" },
    { code: "1130", name: "Savings Account", type: "ASSET", parentCode: "1100" },
    { code: "1200", name: "Accounts Receivable", type: "ASSET", parentCode: "1000" },
    { code: "1300", name: "Inventory", type: "ASSET", parentCode: "1000" },
    { code: "1400", name: "Prepaid Expenses", type: "ASSET", parentCode: "1000" },
    { code: "1500", name: "Fixed Assets", type: "ASSET", isPosting: false },
    { code: "1510", name: "Land", type: "ASSET", parentCode: "1500" },
    { code: "1520", name: "Buildings", type: "ASSET", parentCode: "1500" },
    { code: "1530", name: "Machinery & Equipment", type: "ASSET", parentCode: "1500" },
    { code: "1590", name: "Accumulated Depreciation", type: "ASSET", parentCode: "1500" },
    { code: "2000", name: "Current Liabilities", type: "LIABILITY", isPosting: false },
    { code: "2100", name: "Accounts Payable", type: "LIABILITY", parentCode: "2000" },
    { code: "2200", name: "Accrued Liabilities", type: "LIABILITY", parentCode: "2000" },
    { code: "2300", name: "Sales Tax Payable", type: "LIABILITY", parentCode: "2000" },
    { code: "2400", name: "Payroll Liabilities", type: "LIABILITY", parentCode: "2000" },
    { code: "2600", name: "Long-term Liabilities", type: "LIABILITY", isPosting: false },
    { code: "2610", name: "Long-term Debt", type: "LIABILITY", parentCode: "2600" },
    { code: "3000", name: "Equity", type: "EQUITY", isPosting: false },
    { code: "3100", name: "Common Stock", type: "EQUITY", parentCode: "3000" },
    { code: "3200", name: "Retained Earnings", type: "EQUITY", parentCode: "3000" },
    { code: "4000", name: "Revenue", type: "REVENUE", isPosting: false },
    { code: "4100", name: "Sales Revenue", type: "REVENUE", parentCode: "4000" },
    { code: "4200", name: "Service Revenue", type: "REVENUE", parentCode: "4000" },
    { code: "4300", name: "Other Income", type: "REVENUE", parentCode: "4000" },
    { code: "5000", name: "Cost of Goods Sold", type: "EXPENSE", isPosting: false },
    { code: "5100", name: "Direct Materials", type: "EXPENSE", parentCode: "5000" },
    { code: "5200", name: "Direct Labor", type: "EXPENSE", parentCode: "5000" },
    { code: "6000", name: "Operating Expenses", type: "EXPENSE", isPosting: false },
    { code: "6100", name: "Salaries & Wages", type: "EXPENSE", parentCode: "6000" },
    { code: "6200", name: "Rent & Facilities", type: "EXPENSE", parentCode: "6000" },
    { code: "6300", name: "Utilities", type: "EXPENSE", parentCode: "6000" },
    { code: "6400", name: "Office Supplies", type: "EXPENSE", parentCode: "6000" },
    { code: "6500", name: "Travel & Entertainment", type: "EXPENSE", parentCode: "6000" },
    { code: "6600", name: "Marketing & Advertising", type: "EXPENSE", parentCode: "6000" },
    { code: "6700", name: "Professional Fees", type: "EXPENSE", parentCode: "6000" },
    { code: "6800", name: "Depreciation Expense", type: "EXPENSE", parentCode: "6000" },
    { code: "7000", name: "Other Expenses", type: "EXPENSE", isPosting: false },
    { code: "7100", name: "Interest Expense", type: "EXPENSE", parentCode: "7000" },
    { code: "7200", name: "Bank Charges", type: "EXPENSE", parentCode: "7000" },
  ];

  const accountMap: Record<string, string> = {};
  for (const acc of accounts) {
    const created = await prisma.glAccount.upsert({
      where: { tenantId_companyId_code: { tenantId: tenant.id, companyId: company.id, code: acc.code } },
      update: {},
      create: {
        tenantId: tenant.id,
        companyId: company.id,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        isPosting: acc.isPosting !== false,
        parentId: acc.parentCode ? accountMap[acc.parentCode] : null,
      },
    });
    accountMap[acc.code] = created.id;
  }
  console.log(`✅ Chart of Accounts: ${accounts.length} accounts`);

  // Fiscal Periods
  const currentYear = new Date().getFullYear();
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  for (let m = 1; m <= 12; m++) {
    await prisma.glPeriod.upsert({
      where: { tenantId_companyId_fiscalYear_period: { tenantId: tenant.id, companyId: company.id, fiscalYear: currentYear, period: m } },
      update: {},
      create: {
        tenantId: tenant.id,
        companyId: company.id,
        fiscalYear: currentYear,
        period: m,
        name: `${monthNames[m - 1]} ${currentYear}`,
        startDate: new Date(currentYear, m - 1, 1),
        endDate: new Date(currentYear, m, 0),
        status: m < new Date().getMonth() + 1 ? "CLOSED" : "OPEN",
      },
    });
  }
  console.log(`✅ Fiscal periods: 12 months for ${currentYear}`);

  // Sample journal entry
  const openPeriod = await prisma.glPeriod.findFirst({
    where: { tenantId: tenant.id, companyId: company.id, status: "OPEN" },
    orderBy: [{ fiscalYear: "asc" }, { period: "asc" }],
  });

  if (openPeriod) {
    const existingJournal = await prisma.glJournal.findFirst({
      where: { tenantId: tenant.id, companyId: company.id, number: "JE-000001" },
    });

    if (!existingJournal) {
      await prisma.glJournal.create({
        data: {
          tenantId: tenant.id,
          companyId: company.id,
          periodId: openPeriod.id,
          number: "JE-000001",
          date: new Date(),
          description: "Opening balance entry",
          type: "MANUAL",
          status: "POSTED",
          currency: "USD",
          totalDebit: 50000,
          totalCredit: 50000,
          createdBy: user.id,
          postedBy: user.id,
          postedAt: new Date(),
          lines: {
            create: [
              { accountId: accountMap["1120"], lineNumber: 1, description: "Initial deposit", debit: 50000, credit: 0 },
              { accountId: accountMap["3100"], lineNumber: 2, description: "Owner investment", debit: 0, credit: 50000 },
            ],
          },
        },
      });
      console.log("✅ Sample journal entry created");
    }
  }

  console.log("\n🎉 Seed complete!");
  console.log("─────────────────────────");
  console.log("Login credentials:");
  console.log("  URL:      http://localhost:3000");
  console.log("  Email:    admin@demo.sttps.live");
  console.log("  Password: Admin@123");
  console.log("─────────────────────────");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
