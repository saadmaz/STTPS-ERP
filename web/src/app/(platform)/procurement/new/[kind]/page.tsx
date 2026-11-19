import { NewProcurementDocument } from "@/modules/procurement/screens";

export default async function Page({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  return <NewProcurementDocument kind={kind} />;
}
