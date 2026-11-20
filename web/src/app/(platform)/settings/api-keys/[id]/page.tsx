import { MasterRecordPage } from "@/components/master/MasterData";
import { apiKeys } from "@/modules/platform/integrations";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MasterRecordPage config={apiKeys} id={id} />;
}
