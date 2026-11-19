import { BankAccountPage } from "@/modules/finance/banking";

export default async function Page({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  return <BankAccountPage accountId={accountId} />;
}
