import { ProviderContext, Stream } from "../types";
import { throwProviderError } from "../providerErrors";
import {
  tmdbHeaders,
  extractVideoUrls,
  guessStreamType,
  normalizeVideoUrl,
} from "./utils";

function directStream(link: string): Stream | null {
  const url = normalizeVideoUrl(link);
  if (!url) return null;
  const clean = url.split("?")[0];
  if (!/\.(m3u8|mp4)$/i.test(clean)) return null;
  return {
    server: "Flixer",
    link: url,
    type: guessStreamType(url),
  };
}

function isVideoUrl(url: string): boolean {
  const clean = url.split("?")[0];
  return /\.(m3u8|mp4)$/i.test(clean);
}

function extractPlayerSources(html: string): string[] {
  const text = String(html || "");
  const urls = new Set<string>();
  for (const url of extractVideoUrls(text)) {
    if (isVideoUrl(url)) urls.add(url);
  }
  const patterns = [
    /["']?(?:src|file|source|videoUrl|streamUrl|hls|dash|playlist)["']?\s*[:=]\s*["']([^"']+)["']/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const url = normalizeVideoUrl(match[1]);
      if (url && isVideoUrl(url)) urls.add(url);
    }
  }
  return [...urls];
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
  void isDownload;
  const input = String(link || "").trim();

  const direct = directStream(input);
  if (direct) return [direct];

  const { axios, cheerio } = providerContext;
  let html = "";
  try {
    const response = await axios.get(input, {
      headers: tmdbHeaders(),
      signal,
    });
    html = String(response.data || "");
  } catch (error) {
    throwProviderError("Flixer", "getStream", error);
  }

  const sources = extractPlayerSources(html);

  const seen = new Set<string>();
  const streams: Stream[] = [];
  for (const url of sources) {
    if (seen.has(url)) continue;
    seen.add(url);
    streams.push({
      server: "Flixer",
      link: url,
      type: guessStreamType(url),
    });
  }

  if (!streams.length) {
    throw new Error(
      "Flixer: no playable video source (m3u8/mp4) found on the watch page.",
    );
  }

  return streams;
};
