import { DocumentsList } from "@/modules/documents/screens";

export default async function Page({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  return <DocumentsList entity={entity} />;
}
