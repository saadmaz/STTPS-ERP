import { FinanceReport } from "@/modules/finance/screens";

export default async function Page({ params }: { params: Promise<{ report: string }> }) {
  const { report } = await params;
  return <FinanceReport report={report} />;
}
