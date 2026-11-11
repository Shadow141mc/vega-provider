import { ProviderContext } from "../types";

export const DEFAULT_BASE_URL = "https://ghostflix.st";

export const TMDB_BASE = "https://ghostflix.st/api/tmdb";

export const KNOWN_DOMAINS = ["ghostflix.st", "ghostflix.com"];

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Resolve the active base URL (settings value wins over the default). */
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

/** Headers for requests against the site. */
export function siteHeaders(
  baseUrl: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    "User-Agent": USER_AGENT,
    Accept: "application/json, text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: `${baseUrl}/`,
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
  return /hls|proxy\?u=/i.test(String(url || "")) ? "m3u8" : "mp4";
}

/**
 * Read the highest RESOLUTION of an HLS master playlist so the app can show
 * a quality badge. Failures degrade to an empty string.
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
