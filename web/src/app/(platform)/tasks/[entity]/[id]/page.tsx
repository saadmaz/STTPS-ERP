import { TasksRecord } from "@/modules/tasks/screens";

export default async function Page({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  return <TasksRecord entity={entity} id={id} />;
}
