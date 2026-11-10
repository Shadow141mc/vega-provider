import { ProviderContext } from "../types";

export const DEFAULT_BASE_URL = "https://7movies.ac";

/** Known working 7movies mirrors. Stored in the provider settings as choices. */
export const KNOWN_DOMAINS = ["7movies.ac", "7movies.ws"];

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Vidrift's edge challenges full browser user agents that arrive without
 * client-hint headers (403) but serves plain `Mozilla/5.0` — verified by
 * interleaved requests against /api/boot.
 * Using a realistic Chrome UA with Sec-CH-UA headers helps bypass regional blocks.
 */
export const VIDRIFT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** The stream resolver lives on Vidrift's embed origin, not on the site. */
export const VIDRIFT_BASE = "https://embed.vidrift.net";

/** Resolve the active mirror (settings value wins over the default). */
export async function getBaseUrl(
  providerContext: ProviderContext,
): Promise<string> {
  try {
    const saved = await providerContext.kvStore?.get<string>("baseUrl");
    const value = String(saved || "").trim();
    if (value) {
      if (/^https?:\/\//i.test(value)) return value.replace(/\/+$/, "");
      if (/^[a-z0-9.-]+$/i.test(value)) return `https://${value}`;
    }
  } catch {
    // kvStore is unavailable in some sandboxes; keep the default mirror.
  }
  return DEFAULT_BASE_URL;
}

/** Headers for JSON API calls against the site itself. */
export function apiHeaders(
  baseUrl: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    "User-Agent": USER_AGENT,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: `${baseUrl}/`,
    ...extra,
  };
}

/** Headers for the Vidrift boot/source endpoints and manifest fetches. */
export function embedHeaders(
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    "User-Agent": VIDRIFT_USER_AGENT,
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-CH-UA": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "Sec-CH-UA-Mobile": "?0",
    "Sec-CH-UA-Platform": '"Windows"',
    Referer: `${VIDRIFT_BASE}/`,
    ...extra,
  };
}

/** Remove markup and normalize whitespace from a scraped text blob. */
export function stripHtml(value: string): string {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Infer the Vega stream type from a media URL. */
export function guessStreamType(url: string): string {
  const clean = String(url || "").split("?")[0];
  if (/\.mp4$/i.test(clean)) return "mp4";
  if (/\.m3u8(\.png)?$/i.test(clean)) return "m3u8";
  return /hls|hls_mps|proxy\?u=/i.test(String(url || "")) ? "m3u8" : "mp4";
}

/**
 * Read the highest RESOLUTION of an HLS master playlist so the app can show
 * a quality badge. Failures degrade to an empty string.
 * Includes retry logic for slow connections or transient network issues.
 */
export async function detectQuality(
  providerContext: ProviderContext,
  source: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<string> {
  if (guessStreamType(source) !== "m3u8") return "";

  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await providerContext.axios.get(source, {
        headers,
        signal,
        timeout: 10000,
      });
      const text = String(response.data || "");
      const pattern = /RESOLUTION=\d+x(\d+)/gi;
      let match: RegExpExecArray | null;
      let height = 0;

      while ((match = pattern.exec(text))) {
        const value = Number(match[1]);
        if (value > height) height = value;
      }

      return height ? `${height}p` : "";
    } catch {
      if (attempt === maxRetries) return "";
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return "";
}

/** Map a subtitle label/lang to a 2-letter language code for the player. */
export function languageCode(label: string): string {
  const value = String(label || "").toLowerCase().trim();
  if (/^[a-z]{2}$/.test(value)) return value;

  const exact: Record<string, string> = {
    ara: "ar",
    ben: "bn",
    chi: "zh",
    dut: "nl",
    eng: "en",
    fre: "fr",
    ger: "de",
    hin: "hi",
    ita: "it",
    jpn: "ja",
    kor: "ko",
    por: "pt",
    rus: "ru",
    spa: "es",
    tur: "tr",
    vie: "vi",
    zho: "zh",
    "pt-br": "pt",
  };
  if (exact[value]) return exact[value];

  const phrase: Array<[RegExp, string]> = [
    [/english|\ben\b/, "en"],
    [/hindi|\bhi\b/, "hi"],
    [/arab/, "ar"],
    [/spanish/, "es"],
    [/french/, "fr"],
    [/german/, "de"],
    [/italian/, "it"],
    [/japanese/, "ja"],
    [/korean/, "ko"],
    [/portug|brazil/, "pt"],
    [/russi/, "ru"],
    [/turkish/, "tr"],
    [/viet/, "vi"],
    [/chin/, "zh"],
    [/dutch/, "nl"],
  ];
  for (const [pattern, code] of phrase) {
    if (pattern.test(value)) return code;
  }
  return "en";
}
