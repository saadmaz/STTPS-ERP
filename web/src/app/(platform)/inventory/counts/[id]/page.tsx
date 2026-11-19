import { CountRecord } from "@/modules/inventory/screens";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CountRecord id={id} />;
}
