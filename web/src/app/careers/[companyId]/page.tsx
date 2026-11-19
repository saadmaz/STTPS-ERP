import { CareersListPage } from "@/modules/hr/screens";

export default async function Page({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  return <CareersListPage companyId={companyId} />;
}
