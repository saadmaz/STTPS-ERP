import { AutomationList } from "@/modules/automation/screens";

export default async function Page({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  return <AutomationList entity={entity} />;
}
