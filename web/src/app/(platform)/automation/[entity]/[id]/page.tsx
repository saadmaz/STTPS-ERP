import { AutomationRecord } from "@/modules/automation/screens";

export default async function Page({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  return <AutomationRecord entity={entity} id={id} />;
}
