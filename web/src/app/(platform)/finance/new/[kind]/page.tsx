import { NewFinanceDocument } from "@/modules/finance/screens";

export default async function Page({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  return <NewFinanceDocument kind={kind} />;
}
