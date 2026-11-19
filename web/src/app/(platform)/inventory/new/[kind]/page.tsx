import { NewStockDocument } from "@/modules/inventory/screens";

export default async function Page({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  return <NewStockDocument kind={kind} />;
}
