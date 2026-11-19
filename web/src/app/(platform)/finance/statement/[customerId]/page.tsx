import { StatementPage } from "@/modules/finance/receivables";

export default async function Page({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  return <StatementPage customerId={customerId} />;
}
