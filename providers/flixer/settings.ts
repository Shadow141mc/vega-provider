import { ProviderContext, SettingsField } from "../types";

export const getSettingsSchema = async function ({
  providerContext,
}: {
  providerContext: ProviderContext;
}): Promise<SettingsField[]> {
  void providerContext;
  return [
    {
      key: "baseUrlOverride",
      type: "text",
      label: "Custom Base URL / Mirror",
      description: "Override the default flixer.gd domain with a working mirror.",
      placeholder: "https://flixer.gd",
      defaultValue: "",
    },
    {
      key: "preferredQuality",
      type: "select",
      label: "Preferred Quality",
      description: "Preferred stream resolution when multiple sources are available.",
      options: [
        { label: "Auto", value: "auto" },
        { label: "2160p", value: "2160" },
        { label: "1080p", value: "1080" },
        { label: "720p", value: "720" },
        { label: "480p", value: "480" },
      ],
      defaultValue: "auto",
    },
    {
      key: "autoSubtitles",
      type: "toggle",
      label: "Enable subtitles by default",
      description: "Turn on subtitles automatically when available.",
      defaultValue: true,
    },
  ];
};
