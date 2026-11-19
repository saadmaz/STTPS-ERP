import { EhsList } from "@/modules/ehs/screens";

export default async function Page({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  return <EhsList entity={entity} />;
}
