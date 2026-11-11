import { ProviderContext, Stream } from "../types";
import {
  detectQuality,
  getBaseUrl,
  guessStreamType,
  siteHeaders,
} from "./utils";
import { throwProviderError } from "../providerErrors";

interface ParsedLink {
  kind: "movie" | "tv";
  id: string;
  season?: string;
  episode?: string;
}

function parseStreamLink(link: string): ParsedLink | null {
  const value = String(link || "").trim();

  let match = value.match(/\/movie\/(\d+)/);
  if (match) return { kind: "movie", id: match[1] };

  match = value.match(/\/tv\/(\d+)\/(\d+)\/(\d+)/);
  if (match)
    return {
      kind: "tv",
      id: match[1],
      season: match[2],
      episode: match[3],
    };

  return null;
}

function resolveUrl(baseUrl: string, src: string): string {
  try {
    return new URL(src, baseUrl).href;
  } catch {
    return src;
  }
}

export const getStream = async function ({
  link,
  type,
  signal,
  providerContext,
  isDownload,
}: {
  link: string;
  type: string;
  signal?: AbortSignal;
  providerContext: ProviderContext;
  isDownload?: boolean;
}): Promise<Stream[]> {
  void type;
  const { axios, cheerio, commonHeaders } = providerContext;
  const baseUrl = await getBaseUrl(providerContext);

  const parsed = parseStreamLink(link);
  if (!parsed) {
    throwProviderError(
      "Ghostflix",
      "getStream",
      new Error(`unsupported stream link "${link}".`),
    );
  }

  // Watch page URL patterns to try, in order.
  const watchUrls: string[] = [];
  if (parsed.kind === "movie") {
    watchUrls.push(
      `${baseUrl}/watch/movie/${parsed.id}`,
      `${baseUrl}/play/movie/${parsed.id}`,
      `${baseUrl}/player/movie/${parsed.id}`,
    );
  } else {
    watchUrls.push(
      `${baseUrl}/watch/tv/${parsed.id}/${parsed.season}/${parsed.episode}`,
    );
  }

  const streams: Stream[] = [];
  const seen = new Set<string>();

  for (const watchUrl of watchUrls) {
    try {
      const response = await axios.get(watchUrl, {
        headers: siteHeaders(baseUrl, commonHeaders),
        signal,
        timeout: 15000,
      });
      const html = String(response.data || "");
      const $ = cheerio.load(html);

      const candidates = new Set<string>();

      $("source[src]").each((_, el) => {
        const src = $(el).attr("src");
        if (src) candidates.add(src);
      });
      $("video[src]").each((_, el) => {
        const src = $(el).attr("src");
        if (src) candidates.add(src);
      });
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href");
        if (href && /\.(m3u8|mp4)(\?|$)/i.test(href)) candidates.add(href);
      });

      const regexMatches =
        html.match(/https?:\/\/[^"'<>\s]+\.(?:m3u8|mp4)[^"'<>\s]*/gi) || [];
      for (const u of regexMatches) candidates.add(u);

      for (const src of candidates) {
        if (!src || seen.has(src)) continue;
        seen.add(src);
        const absolute = resolveUrl(baseUrl, src);
        const streamType = guessStreamType(absolute);
        streams.push({
          server: "Ghostflix",
          link: absolute,
          type: streamType,
          quality: "",
        });
      }
    } catch {
      // Try the next watch URL pattern.
    }
  }

  // Detect quality for HLS streams by reading the master playlist.
  for (const stream of streams) {
    if (stream.type !== "m3u8") continue;
    try {
      stream.quality =
        (await detectQuality(
          providerContext,
          stream.link,
          siteHeaders(baseUrl, commonHeaders),
          signal,
        )) || undefined;
    } catch {
      // Keep quality unset on failure.
    }
  }

  if (!streams.length) {
    throwProviderError(
      "Ghostflix",
      "getStream",
      new Error("no playable streams found on watch page."),
    );
  }

  // Sort: downloads prefer MP4, streaming prefers HLS; higher quality leads.
  const height = (s: Stream) => parseInt(String(s.quality || ""), 10) || 0;
  streams.sort((a, b) => {
    const aMp4 = a.type === "mp4";
    const bMp4 = b.type === "mp4";
    if (aMp4 !== bMp4) {
      return isDownload ? (aMp4 ? -1 : 1) : (aMp4 ? 1 : -1);
    }
    return height(b) - height(a);
  });

  return streams;
};
