import { AccountLedger } from "@/modules/finance/screens";

export default async function Page({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  return <AccountLedger accountId={accountId} />;
}
