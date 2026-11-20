import { ExpensesRecord } from "@/modules/finance/expenses";

export default async function Page({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  return <ExpensesRecord entity={entity} id={id} />;
}
