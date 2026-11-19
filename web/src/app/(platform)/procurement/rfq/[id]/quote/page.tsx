import { RfqQuotePage } from "@/modules/procurement/screens";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RfqQuotePage id={id} />;
}
