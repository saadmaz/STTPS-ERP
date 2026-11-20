import { ProjectsList } from "@/modules/projects/screens";

export default async function Page({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  return <ProjectsList entity={entity} />;
}
