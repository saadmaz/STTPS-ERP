import { ProductList } from "@/modules/products/screens";

export default async function Page({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  return <ProductList entity={entity} />;
}
