import { SupplierStatementPage } from "@/modules/finance/payables";

export default async function Page({ params }: { params: Promise<{ supplierId: string }> }) {
  const { supplierId } = await params;
  return <SupplierStatementPage supplierId={supplierId} />;
}
