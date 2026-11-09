import { ProviderContext, Stream, TextTracks } from "../types";
import {
  decodeBase64Url,
  decodeZokoPayload,
  getBaseUrl,
  getRestBase,
  languageCode,
  normalizeUrl,
  siteHeaders,
  stripHtml,
  USER_AGENT,
} from "./utils";

type ServerCandidate = {
  name: string;
  type: string;
  embedUrl: string;
};

/** Parse the `.server-item` list the episode/servers AJAX returns. */
async function fetchServers(
  providerContext: ProviderContext,
  episodeId: string,
): Promise<ServerCandidate[]> {
  const { axios, cheerio } = providerContext;
  const baseUrl = await getBaseUrl(providerContext);
  const restBase = await getRestBase(providerContext);

  const response = await axios.get(
    `${restBase}episode/servers?episodeId=${encodeURIComponent(episodeId)}`,
    { headers: siteHeaders(baseUrl) },
  );

  const html = String(response?.data?.html || response?.data || "");
  const $ = cheerio.load(html);
  const servers: ServerCandidate[] = [];
  const seen = new Set<string>();

  $(".server-item").each((_, element) => {
    const name = stripHtml($(element).find(".btn").first().text()) ||
      String($(element).attr("data-server-name") || "");
    const type = String($(element).attr("data-type") || "").toUpperCase();
    const hash = String($(element).attr("data-hash") || "").trim();
    if (!hash) return;

    const embedUrl = decodeBase64Url(hash).trim();
    if (!/https?:\/\//i.test(embedUrl)) return;

    const key = `${type}:${embedUrl}`;
    if (seen.has(key)) return;
    seen.add(key);

    servers.push({ name, type, embedUrl: normalizeUrl(embedUrl, baseUrl) });
  });

  return servers;
}

/** The episode id lives in the ?ep= query of the watch URL. */
async function resolveEpisodeId(
  providerContext: ProviderContext,
  link: string,
): Promise<string> {
  const ep = link.match(/[?&]ep=(\d+)/);
  if (ep) return ep[1];

  // ?ep=latest or a bare watch URL: read the current episode from the page.
  const { axios, cheerio } = providerContext;
  const baseUrl = await getBaseUrl(providerContext);
  const response = await axios.get(link, { headers: siteHeaders(baseUrl) });
  const id = String(
    cheerio.load(String(response.data || ""))("#ani_detail").first().attr("data-id") || "",
  ).trim();
  return id;
}

function originOf(url: string): string {
  const match = String(url || "").match(/^https?:\/\/[^/]+/i);
  return match ? `${match[0]}/` : "";
}

function extractSubtitles(payload: any): TextTracks {
  const tracks: TextTracks = [];
  const seen = new Set<string>();

  const list = Array.isArray(payload?.subtitles) ? payload.subtitles : [];
  for (const track of list) {
    const uri = String(track?.src || "").trim();
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);

    const label = stripHtml(String(track?.label || "")) ||
      (languageCode(track?.lang || uri).toUpperCase());
    const language = languageCode(track?.lang || label || uri);
    tracks.push({
      title: label,
      language,
      type: "text/vtt",
      uri,
    });
  }

  return tracks;
}

function guessStreamType(url: string): string {
  const clean = String(url || "").split("?")[0];
  return /\.mp4$/i.test(clean) ? "mp4" : "m3u8";
}

async function detectQuality(
  providerContext: ProviderContext,
  source: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<string> {
  if (guessStreamType(source) !== "m3u8") return "";

  try {
    const response = await providerContext.axios.get(source, {
      headers,
      signal,
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
    return "";
  }
}

/**
 * ZokoAnime embeds ship the direct HLS master and all metadata in the page's
 * XOR-obfuscated `window.__P` blob — a single request resolves everything.
 */
async function resolveZoko(
  providerContext: ProviderContext,
  candidate: ServerCandidate,
  signal?: AbortSignal,
): Promise<Stream | null> {
  const { axios } = providerContext;
  const embedOrigin = originOf(candidate.embedUrl);

  // The embed hands out stream tokens per header fingerprint, so keep the
  // minimal set and reuse the exact same headers for the master playlist and
  // for playback.
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
  };
  if (embedOrigin) headers.Referer = embedOrigin;

  const response = await axios.get(candidate.embedUrl, { headers, signal });
  const html = String(response.data || "");
  const payload = decodeZokoPayload(html);
  const source = String(payload?.src || "").trim();
  if (!source) return null;

  const subtitles = extractSubtitles(payload);

  const skip = [];
  const intro = payload?.skip?.intro;
  const outro = payload?.skip?.outro;
  if (intro && Number(intro.end) > Number(intro.start)) {
    skip.push({ title: "Intro", from: Number(intro.start), to: Number(intro.end) });
  }
  if (outro && Number(outro.end) > Number(outro.start)) {
    skip.push({ title: "Outro", from: Number(outro.start), to: Number(outro.end) });
  }

  const quality = await detectQuality(providerContext, source, headers, signal);

  return {
    server: candidate.name || "ZokoAnime",
    link: source,
    type: guessStreamType(source),
    quality: quality || undefined,
    subtitles: subtitles.length ? subtitles : undefined,
    skip: skip.length ? skip : undefined,
    headers: { "User-Agent": USER_AGENT, Referer: embedOrigin },
    tag: candidate.type || undefined,
    tags: candidate.type ? [candidate.type] : undefined,
  };
}

/**
 * MegaPlay (HD-1) embeds resolve through megaplay.buzz/stream/getSources.
 * The public endpoint does not require the id token; most responses are
 * plain but some arrive encrypted, in which case this fails gracefully.
 */
async function resolveMegaplay(
  providerContext: ProviderContext,
  candidate: ServerCandidate,
  signal?: AbortSignal,
): Promise<Stream | null> {
  const { axios, cheerio } = providerContext;

  const embedHeaders: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    Referer: "https://hianime.at/",
  };

  const embedResponse = await axios.get(candidate.embedUrl, {
    headers: embedHeaders,
    signal,
  });
  const html = String(embedResponse.data || "");
  const dataId = String(
    cheerio.load(html)("#megaplay-player").first().attr("data-id") || "",
  ).trim();
  if (!dataId) return null;

  const sourcesResponse = await axios.get(
    `https://megaplay.buzz/stream/getSources?id=${encodeURIComponent(dataId)}`,
    {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json, text/plain, */*",
        Referer: candidate.embedUrl,
        "X-Requested-With": "XMLHttpRequest",
      },
      signal,
    },
  );

  const data = sourcesResponse?.data || {};
  const direct =
    String(data?.sources?.file || "").trim() ||
    String(data?.sources?.url || "").trim() ||
    (typeof data?.sources === "string" ? data.sources.trim() : "");
  if (!direct) return null; // `enc` payloads cannot be decrypted in-sandbox.

  const origin = originOf(candidate.embedUrl);
  const headers = { "User-Agent": USER_AGENT, Referer: origin };
  const quality = await detectQuality(
    providerContext,
    direct,
    { "User-Agent": USER_AGENT, Referer: "https://megaplay.buzz/" },
    signal,
  );

  const tracks = extractSubtitles({
    subtitles: (Array.isArray(data?.tracks) ? data.tracks : []).map((t: any) => ({
      lang: t?.label,
      label: t?.label,
      src: t?.file,
    })),
  });

  const skip = [];
  const intro = data?.intro;
  const outro = data?.outro;
  if (intro && Number(intro.end) > Number(intro.start)) {
    skip.push({ title: "Intro", from: Number(intro.start), to: Number(intro.end) });
  }
  if (outro && Number(outro.end) > Number(outro.start)) {
    skip.push({ title: "Outro", from: Number(outro.start), to: Number(outro.end) });
  }

  return {
    server: candidate.name || "MegaPlay",
    link: direct,
    type: guessStreamType(direct),
    quality: quality || undefined,
    subtitles: tracks.length ? tracks : undefined,
    skip: skip.length ? skip : undefined,
    headers,
    tag: candidate.type || undefined,
    tags: candidate.type ? [candidate.type] : undefined,
  };
}

function resolverFor(embedUrl: string) {
  if (/zokoanime\./i.test(embedUrl)) return resolveZoko;
  if (/megaplay\./i.test(embedUrl)) return resolveMegaplay;
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
  const baseUrl = await getBaseUrl(providerContext);
  const watchUrl = normalizeUrl(link, baseUrl);

  const episodeId = await resolveEpisodeId(providerContext, watchUrl);
  if (!episodeId) {
    throw new Error(`HiAnime: could not resolve an episode id from ${watchUrl}`);
  }

  const servers = await fetchServers(providerContext, episodeId);
  if (!servers.length) {
    throw new Error(
      `HiAnime: no servers found for episode id ${episodeId}.`,
    );
  }

  const supported = servers.filter(server => resolverFor(server.embedUrl));
  if (!supported.length) {
    const names = [...new Set(servers.map(server => server.name))]
      .filter(Boolean)
      .join(", ");
    throw new Error(
      `HiAnime: this episode only offers unsupported servers (${names}.).`,
    );
  }

  const results = await Promise.all(
    supported.map(async server => {
      try {
        const resolve = resolverFor(server.embedUrl)!;
        return await resolve(providerContext, server, signal);
      } catch {
        return null;
      }
    }),
  );

  const seenLinks = new Set<string>();
  const streams = results.filter((stream): stream is Stream => {
    if (!stream?.link) return false;
    if (seenLinks.has(stream.link)) return false;
    seenLinks.add(stream.link);
    return true;
  });

  if (!streams.length) {
    throw new Error(
      "HiAnime: found servers but none of them exposed a playable HLS URL.",
    );
  }

  // Preferred audio ordering: SUB (default), DUB last — unless the caller
  // wants downloads, in which case quality leads.
  let preferredAudio = "";
  try {
    preferredAudio = isDownload
      ? ""
      : await providerContext.kvStore.get<string>("preferredAudio");
  } catch {
    // kvStore is unavailable in some sandboxes; keep the SUB-first default.
  }
  preferredAudio = String(preferredAudio || "").toLowerCase();
  const languageRank = (stream: Stream) => {
    const tag = String(stream.tag || stream.tags?.[0] || "").toLowerCase();
    if (preferredAudio === "dub") return tag === "dub" ? 0 : 1;
    if (tag === "sub") return 0;
    if (tag === "dub") return 1;
    return 2;
  };

  streams.sort((a, b) => {
    if (isDownload) {
      const qualityA = parseInt(String(a.quality || ""), 10) || 0;
      const qualityB = parseInt(String(b.quality || ""), 10) || 0;
      if (qualityA !== qualityB) return qualityB - qualityA;
    }
    return languageRank(a) - languageRank(b);
  });

  return streams;
};
