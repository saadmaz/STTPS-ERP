import { NewSalesDocument } from "@/modules/sales/screens";

export default async function Page({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  return <NewSalesDocument kind={kind} />;
}
