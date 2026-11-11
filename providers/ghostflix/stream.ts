import { ProviderContext, Stream, TextTracks } from "../types";
import { throwProviderError } from "../providerErrors";

const VIDBOLT_BASE = "https://vidbolt.pro";

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
  const { axios, commonHeaders } = providerContext;

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
      headers: {
        ...commonHeaders,
        Accept: "application/json",
      },
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
      type: "m3u8",
      quality: String(source?.quality || "").trim() || undefined,
      subtitles: subtitles.length ? subtitles : undefined,
      headers: commonHeaders,
    });
  }

  if (!candidates.length) {
    throwProviderError(
      "Ghostflix",
      "getStream",
      new Error("no sources returned by VidBolt resolver."),
    );
  }

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
