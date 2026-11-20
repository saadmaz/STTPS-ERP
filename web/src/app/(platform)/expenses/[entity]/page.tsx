import { ExpensesList } from "@/modules/finance/expenses";

export default async function Page({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  return <ExpensesList entity={entity} />;
}
