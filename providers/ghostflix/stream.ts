import { ProviderContext, Stream, TextTracks } from "../types";
import { throwProviderError } from "../providerErrors";
import {
  detectQuality,
  guessStreamType,
} from "./utils";

const VIDBOLT_BASE = "https://vidbolt.pro";
const VIDBOLT_REFERER = "https://vidbolt.pro/";

interface ParsedLink {
  kind: "movie" | "tv";
  id: string;
  season?: string;
  episode?: string;
}

interface VidBoltSource {
  url?: string;
  kind?: string;
  quality?: string;
  language?: string;
}

interface VidBoltStream {
  server?: string;
  sources?: VidBoltSource[];
  thumbnails?: string;
}

interface VidBoltResponse {
  stream?: VidBoltStream;
}

/** Headers used for both the resolve API and stream playback. */
function vidboltHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: VIDBOLT_REFERER,
    Origin: VIDBOLT_BASE,
    ...extra,
  };
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
  const { axios } = providerContext;

  const parsed = parseStreamLink(link);
  if (!parsed) {
    throwProviderError(
      "Ghostflix",
      "getStream",
      new Error(`unsupported stream link "${link}".`),
    );
  }

  const params: Record<string, string> = {
    type: parsed.kind,
    id: parsed.id,
  };
  if (parsed.kind === "tv" && parsed.season && parsed.episode) {
    params.season = parsed.season;
    params.episode = parsed.episode;
  }

  const response = await axios.get<VidBoltResponse>(
    `${VIDBOLT_BASE}/api/resolve`,
    {
      params,
      headers: vidboltHeaders({ Accept: "application/json" }),
      signal,
      timeout: 15000,
    },
  );

  const data = response?.data || {};
  const stream = data.stream;
  const sources: VidBoltSource[] = Array.isArray(stream?.sources)
    ? stream.sources
    : [];
  const thumbnails = String(stream?.thumbnails || "").trim() || undefined;

  const subtitles: TextTracks = thumbnails
    ? [
        {
          title: "English",
          language: "en",
          type: "text/vtt",
          uri: thumbnails,
        },
      ]
    : [];

  const candidates: Stream[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    const url = String(source?.url || "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);

    candidates.push({
      server: String(stream?.server || "VidBolt").trim() || "VidBolt",
      link: url,
      type: guessStreamType(url),
      quality: String(source?.quality || "").trim() || undefined,
      subtitles: subtitles.length ? subtitles : undefined,
      headers: vidboltHeaders(),
    });
  }

  if (!candidates.length) {
    throwProviderError(
      "Ghostflix",
      "getStream",
      new Error("no sources returned by VidBolt resolver."),
    );
  }

  // Detect actual m3u8 quality by reading the master playlist RESOLUTION tags.
  await Promise.all(
    candidates.map(async candidate => {
      if (candidate.quality || candidate.type !== "m3u8") return;
      candidate.quality =
        (await detectQuality(
          providerContext,
          candidate.link,
          vidboltHeaders(),
          signal,
        )) || undefined;
    }),
  );

  const height = (s: Stream) => parseInt(String(s.quality || ""), 10) || 0;
  candidates.sort((a, b) => {
    const aMp4 = a.type === "mp4";
    const bMp4 = b.type === "mp4";
    if (aMp4 !== bMp4) {
      return isDownload ? (aMp4 ? -1 : 1) : (aMp4 ? 1 : -1);
    }
    return height(b) - height(a);
  });

  return candidates;
};
