import { MasterRecordPage } from "@/components/master/MasterData";
import { webhooks } from "@/modules/platform/integrations";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MasterRecordPage config={webhooks} id={id} />;
}
