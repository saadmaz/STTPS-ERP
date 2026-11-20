import { SalesList } from "@/modules/sales/screens";

export default async function Page({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  return <SalesList entity={entity} />;
}
