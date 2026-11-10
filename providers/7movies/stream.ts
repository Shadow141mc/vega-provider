import { ProviderContext, Stream, TextTracks } from "../types";
import {
  detectQuality,
  embedHeaders,
  getBaseUrl,
  guessStreamType,
  languageCode,
  stripHtml,
  VIDRIFT_USER_AGENT,
  VIDRIFT_BASE,
} from "./utils";

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY = 500;

async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
  delay = BASE_RETRY_DELAY,
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries <= 0) throw error;
    const isRetryable =
      !error?.response ||
      error?.response?.status === 429 ||
      error?.response?.status >= 500 ||
      error?.code === "ECONNABORTED" ||
      error?.code === "ETIMEDOUT" ||
      error?.code === "ENOTFOUND";
    if (!isRetryable) throw error;
    await new Promise(r => setTimeout(r, delay));
    return fetchWithRetry(fn, retries - 1, delay * 2);
  }
}

interface ParsedLink {
  kind: "movie" | "tv";
  id: string;
  season?: string;
  episode?: string;
}

interface Candidate {
  server: string;
  link: string;
  type: string;
  quality?: string;
}

interface OrionStream {
  url?: string;
  type?: string;
  provider?: string;
  name?: string;
  rungs?: Array<{ width?: number; height?: number }>;
}

interface BootMeta {
  playbackToken?: string;
  orionStreams?: OrionStream[];
  vexonUrl?: string;
  bigbangUrl?: string;
  bigbangSubtitles?: Array<{ lang?: string; label?: string; url?: string }>;
}

interface SourceStream {
  url?: string;
  proxyUrl?: string;
  type?: string;
  provider?: string;
}

/**
 * Direct links are `/movie/{id}` (movies) or `/tv/{id}/{season}/{episode}`
 * (episodes) — see meta.ts / episodes.ts.
 */
function parseStreamLink(link: string): ParsedLink | null {
  const value = String(link || "").trim();

  let match = value.match(/\/movie\/(\d+)/);
  if (match) return { kind: "movie", id: match[1] };

  match = value.match(/\/tv\/(\d+)\/(\d+)\/(\d+)/);
  if (match) return {
    kind: "tv",
    id: match[1],
    season: match[2],
    episode: match[3],
  };

  return null;
}

function mediaPath(parsed: ParsedLink): string {
  if (parsed.kind === "movie") return `movie/${parsed.id}`;
  return `tv/${parsed.id}/${parsed.season}/${parsed.episode}`;
}

/** Collect title-level subtitles (BigBang lane + source API responses). */
function extractSubtitles(
  bootMeta: BootMeta,
  sourcePayloads: any[],
): TextTracks {
  const tracks: TextTracks = [];
  const seen = new Set<string>();

  const push = (rawUrl: any, rawLang: any, rawLabel: any) => {
    const uri = String(rawUrl || "").trim();
    if (!uri || seen.has(uri)) return;
    seen.add(uri);

    const label = stripHtml(String(rawLabel || "")) ||
      languageCode(String(rawLang || "")).toUpperCase();
    tracks.push({
      title: label,
      language: languageCode(String(rawLang || label || "")),
      type: "text/vtt",
      uri,
    });
  };

  for (const sub of Array.isArray(bootMeta?.bigbangSubtitles)
    ? bootMeta.bigbangSubtitles
    : []) {
    push(sub?.url, sub?.lang, sub?.label);
  }

  for (const payload of sourcePayloads) {
    const list = Array.isArray(payload?.subtitles) ? payload.subtitles : [];
    for (const sub of list) {
      push(
        sub?.url || sub?.src || sub?.file,
        sub?.lang || sub?.language,
        sub?.label || sub?.name,
      );
    }
  }

  return tracks;
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
  const baseUrl = await getBaseUrl(providerContext);

  const parsed = parseStreamLink(link);
  if (!parsed) {
    throw new Error(`7Movies: unsupported stream link "${link}".`);
  }
  const path = mediaPath(parsed);

  // ── Boot: mints the playback token and ships the direct manifests ────────
  let bootMeta: BootMeta;
  let token: string;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const bootResponse = await fetchWithRetry(() =>
      axios.get(`${VIDRIFT_BASE}/api/boot/${path}`, {
        headers: embedHeaders({ Referer: `${baseUrl}/` }),
        signal,
      }),
    );
    bootMeta = bootResponse?.data?.meta || {};
    token = String(bootMeta.playbackToken || "");
    if (token) break;
    if (attempt < MAX_RETRIES - 1) {
      await new Promise(r => setTimeout(r, BASE_RETRY_DELAY * (attempt + 1)));
    }
  }
  if (!token) {
    throw new Error("7Movies: Vidrift did not return a playback token after retries.");
  }

  const candidates: Candidate[] = [];

  // Orion ships direct HLS/MP4 renditions (incl. language dubs) in the boot
  // payload — relative URLs resolve against the embed origin.
  for (const stream of Array.isArray(bootMeta.orionStreams)
    ? bootMeta.orionStreams
    : []) {
    const raw = String(stream?.url || "").trim();
    if (!raw) continue;
    const absolute = raw.startsWith("http") ? raw : `${VIDRIFT_BASE}${raw}`;

    const heights = (stream.rungs || [])
      .map(rung => Number(rung?.height) || 0)
      .filter(Boolean);
    const maxHeight = heights.length ? Math.max(...heights) : 0;

    candidates.push({
      server:
        stripHtml(String(stream?.name || "")) ||
        stripHtml(String(stream?.provider || "")) ||
        "Orion",
      link: absolute,
      type: stream?.type === "mp4" ? "mp4" : "m3u8",
      quality: maxHeight ? `${maxHeight}p` : undefined,
    });
  }

  // Self-hosted lanes (Vexon / BigBang) expose one master each.
  if (String(bootMeta.vexonUrl || "").trim()) {
    candidates.push({
      server: "Vexon",
      link: String(bootMeta.vexonUrl).trim(),
      type: "m3u8",
    });
  }
  if (String(bootMeta.bigbangUrl || "").trim()) {
    candidates.push({
      server: "BigBang",
      link: String(bootMeta.bigbangUrl).trim(),
      type: "m3u8",
    });
  }

  // ── Source API: proxy lanes for the same token ─────────────────────────
  // The default call cascades through the site's provider order; explicit
  // lane calls cover titles where the cascade picks a different host.
  // Multiple lanes provide redundancy if one is down or returns decoys.
  const laneNames = ["", "atlas", "photon", "nova"] as const;
  const laneResults = await Promise.all(
    laneNames.map(async lane => {
      try {
        const query =
          `token=${encodeURIComponent(token)}` +
          `&provider=${encodeURIComponent(lane)}` +
          `&parent=${encodeURIComponent(`${baseUrl}/`)}`;
        const response = await fetchWithRetry(() =>
          axios.get(`${VIDRIFT_BASE}/api/source/${path}?${query}`, {
            headers: embedHeaders(),
            signal,
          }),
        );
        return response?.data || null;
      } catch {
        return null;
      }
    }),
  );

  for (const payload of laneResults) {
    const streams: SourceStream[] = Array.isArray(payload?.streams)
      ? payload.streams
      : [];
    // The lane response declares the capped resolution for its streams.
    const maxRes = Number(payload?.maxRes) || 0;
    for (const stream of streams) {
      const raw = String(stream?.proxyUrl || stream?.url || "").trim();
      if (!raw) continue;

      const provider = stripHtml(String(stream?.provider || "")) || "Source";
      // Titan's lane serves a jpg-frame decoy playlist (verified on both
      // movies and TV: hundreds of .jpg "segments", no audio, no RESOLUTION).
      if (/^titan$/i.test(provider)) continue;

      const declared = String(stream?.type || "").toLowerCase();
      const streamType =
        declared === "hls" ? "m3u8" : declared === "mp4" ? "mp4" : guessStreamType(raw);

      candidates.push({
        server: provider,
        link: raw,
        type: streamType,
        quality: maxRes > 0 ? `${maxRes}p` : undefined,
      });
    }
  }

  // ── Dedupe ───────────────────────────────────────────────────────────────
  // Link-level first: the default and explicit lanes hand out fresh signed
  // tokens for the same media, so collapse identical server/quality pairs too.
  const seen = new Set<string>();
  const seenIdentity = new Set<string>();
  const unique = candidates.filter(candidate => {
    if (!candidate.link || seen.has(candidate.link)) return false;
    seen.add(candidate.link);
    const identity = `${candidate.server}|${candidate.type}|${candidate.quality || ""}`;
    if (candidate.quality && seenIdentity.has(identity)) return false;
    seenIdentity.add(identity);
    return true;
  });

  if (!unique.length) {
    throw new Error(
      "7Movies: Vidrift exposed no playable streams for this title.",
    );
  }

  // ── Quality + subtitles ──────────────────────────────────────────────────
  const subtitles = extractSubtitles(bootMeta, laneResults);

  await Promise.all(
    unique.map(async candidate => {
      if (candidate.quality || candidate.type !== "m3u8") return;
      candidate.quality =
        (await detectQuality(
          providerContext,
          candidate.link,
          embedHeaders(),
          signal,
        )) || undefined;
    }),
  );

  const streams: Stream[] = unique.map(candidate => ({
    server: candidate.server,
    link: candidate.link,
    type: candidate.type,
    quality: candidate.quality,
    subtitles: subtitles.length ? subtitles : undefined,
    headers: embedHeaders(),
  }));

  // Original audio always leads — Orion ships language dubs as
  // "Orion · Hindi", and those must not outrank the main track even for
  // downloads. Within each audio group downloads prefer direct MP4 and
  // streaming prefers HLS; higher resolution leads inside each group.
  const dubRank = (stream: Stream) => {
    const server = String(stream.server || "");
    return server.includes("·") && !/original/i.test(server) ? 1 : 0;
  };
  const typeRank = (stream: Stream) => {
    const isMp4 = stream.type === "mp4";
    if (isDownload) return isMp4 ? 0 : 1;
    return isMp4 ? 1 : 0;
  };
  const height = (stream: Stream) =>
    parseInt(String(stream.quality || ""), 10) || 0;

  streams.sort((a, b) => {
    const dub = dubRank(a) - dubRank(b);
    if (dub !== 0) return dub;
    const type = typeRank(a) - typeRank(b);
    if (type !== 0) return type;
    return height(b) - height(a);
  });

  return streams;
};
