import { MasterListPage } from "@/components/master/MasterData";
import { webhooks } from "@/modules/platform/integrations";

export default function Page() {
  return <MasterListPage config={webhooks} />;
}
