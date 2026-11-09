import { ProviderContext, SettingsField } from "../types";
import { KNOWN_DOMAINS } from "./utils";

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
      description:
        "HiAnime rotates its domains. Pick a mirror that works for your region, or paste any mirror into the text override.",
      options: domainOptions,
      defaultValue: "https://hianime.at",
    },
    {
      key: "preferredAudio",
      type: "select",
      label: "Preferred Audio",
      description: "Controls which audio track is offered first when both exist.",
      options: [
        { label: "Subbed (Japanese)", value: "sub" },
        { label: "Dubbed (English)", value: "dub" },
      ],
      defaultValue: "sub",
    },
  ];
};
