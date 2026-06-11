import { PageHeader } from "@/components/shared/page-header";
import { ApolloConnectionCard } from "@/components/settings/apollo-connection-card";
import { GoogleSheetsCard } from "@/components/settings/google-sheets-card";
import { isConfigured } from "@/lib/apollo";
import { getSheetConnectionSafe, getSheetHistory } from "@/lib/services/sheets";

export default async function SettingsPage() {
  const configured = isConfigured();
  const connection = await getSheetConnectionSafe();
  const histories = connection ? await getSheetHistory(connection.id) : [];

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Settings"
        description="Integrations, data sources, and connection status."
      />
      <ApolloConnectionCard configured={configured} />
      <GoogleSheetsCard connection={connection} histories={histories} />
    </div>
  );
}
