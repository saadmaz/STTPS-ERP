import { WorkflowEditor } from "@/modules/workflow/WorkflowEditor";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkflowEditor id={id === "new" ? null : id} />;
}
