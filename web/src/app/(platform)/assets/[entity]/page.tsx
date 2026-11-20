import { AssetsList } from "@/modules/finance/assets";

export default async function Page({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  return <AssetsList entity={entity} />;
}
