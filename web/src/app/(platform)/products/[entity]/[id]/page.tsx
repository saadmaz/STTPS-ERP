import { ProductRecord } from "@/modules/products/screens";

export default async function Page({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  return <ProductRecord entity={entity} id={id} />;
}
