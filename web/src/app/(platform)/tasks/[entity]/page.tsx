import { TasksList } from "@/modules/tasks/screens";

export default async function Page({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  return <TasksList entity={entity} />;
}
