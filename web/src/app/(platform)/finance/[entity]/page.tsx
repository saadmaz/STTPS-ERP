import { FinanceList } from "@/modules/finance/screens";

export default async function Page({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  return <FinanceList entity={entity} />;
}
