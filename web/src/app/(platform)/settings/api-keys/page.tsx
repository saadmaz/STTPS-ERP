import { MasterListPage } from "@/components/master/MasterData";
import { apiKeys } from "@/modules/platform/integrations";

export default function Page() {
  return <MasterListPage config={apiKeys} />;
}
