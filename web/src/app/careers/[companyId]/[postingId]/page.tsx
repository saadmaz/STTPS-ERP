import { CareersDetailPage } from "@/modules/hr/screens";

export default async function Page({ params }: { params: Promise<{ companyId: string; postingId: string }> }) {
  const { companyId, postingId } = await params;
  return <CareersDetailPage companyId={companyId} postingId={postingId} />;
}
