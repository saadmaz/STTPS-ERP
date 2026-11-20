import { CalendarList } from "@/modules/calendar/screens";

export default async function Page({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  return <CalendarList entity={entity} />;
}
