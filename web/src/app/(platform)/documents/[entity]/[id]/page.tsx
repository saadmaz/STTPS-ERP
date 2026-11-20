import { DocumentsRecord } from "@/modules/documents/screens";

export default async function Page({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  return <DocumentsRecord entity={entity} id={id} />;
}
