import { ProviderContext, SettingsField } from "../types";
import { DEFAULT_BASE_URL, KNOWN_DOMAINS } from "./utils";

export const getSettingsSchema = async function ({
  providerContext,
}: {
  providerContext: ProviderContext;
}): Promise<SettingsField[]> {
  void providerContext;

  const domainOptions = KNOWN_DOMAINS.map(domain => ({
    label: domain,
    value: `https://${domain}`,
  }));

  return [
    {
      key: "baseUrl",
      type: "select",
      label: "Site Mirror",
      description: "Pick a mirror that works for your region.",
      options: domainOptions,
      defaultValue: DEFAULT_BASE_URL,
    },
  ];
};
