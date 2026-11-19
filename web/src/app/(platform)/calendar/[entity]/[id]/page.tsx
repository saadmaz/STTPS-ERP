import { CalendarRecord } from "@/modules/calendar/screens";

export default async function Page({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  return <CalendarRecord entity={entity} id={id} />;
}
