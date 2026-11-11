import { ProviderContext } from "../types";

export const DEFAULT_BASE_URL = "https://flixer.gd";
export const TMDB_BASE = "https://plsdontscrapemelove.flixer.su/api/tmdb";
export const KNOWN_DOMAINS = ["flixer.gd", "flixer.su", "flixer.cx", "flixor.ru"];
export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
export const PLACEHOLDER_IMAGE = "https://placehold.co/500x750";

export function tmdbHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "User-Agent": USER_AGENT,
    Accept: "application/json",
    ...extra,
  };
}

export function resolveBaseUrl(custom: string | null | undefined): string {
  const base = String(custom || "").trim().replace(/\/+$/, "");
  return base || DEFAULT_BASE_URL;
}

export function watchMovieUrl(tmdbId: string | number, baseUrl: string = DEFAULT_BASE_URL): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/watch/movie/${tmdbId}`;
}

export function watchTvUrl(
  tmdbId: string | number,
  season?: number | string,
  episode?: number | string,
  baseUrl: string = DEFAULT_BASE_URL,
): string {
  const base = baseUrl.replace(/\/+$/, "");
  if (season !== undefined && episode !== undefined) {
    return `${base}/watch/tv/${tmdbId}/${season}/${episode}`;
  }
  if (season !== undefined) {
    return `${base}/watch/tv/${tmdbId}/${season}`;
  }
  return `${base}/watch/tv/${tmdbId}`;
}

export function extractTmdbId(link: string): string | null {
  const value = String(link || "");
  const patterns = [
    /\/watch\/(?:movie|tv)\/(\d+)(?:\/|\?|$)/i,
    /\/(?:movie|tv)\/(\d+)(?:\/|\?|$)/i,
    /[?&]tmdb[_-]?id=(\d+)/i,
    /[?&]id=(\d+)(?:&|$)/i,
    /\/(\d+)(?:\/|\?|$)/i,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export function extractType(link: string): "movie" | "series" | null {
  const value = String(link || "").toLowerCase();
  if (value.includes("/watch/movie/") || value.includes("/movie/")) return "movie";
  if (value.includes("/watch/tv/") || value.includes("/tv/")) return "series";
  return null;
}

export async function tmdbGet(
  providerContext: ProviderContext,
  path: string,
  params?: Record<string, string | number>,
  signal?: AbortSignal,
): Promise<any> {
  const { axios } = providerContext;
  const response = await axios.get(`${TMDB_BASE}${path}`, {
    params,
    headers: tmdbHeaders(),
    signal,
  });
  return response?.data;
}

export function posterUrl(path: string | null | undefined, size = "w500"): string {
  const p = String(path || "");
  if (!p) return "";
  return `https://image.tmdb.org/t/p/${size}${p.startsWith("/") ? p : "/" + p}`;
}

export function backdropUrl(path: string | null | undefined, size = "w780"): string {
  const p = String(path || "");
  if (!p) return "";
  return `https://image.tmdb.org/t/p/${size}${p.startsWith("/") ? p : "/" + p}`;
}

export function imageFor(item: any): string {
  return (
    posterUrl(item?.poster_path) ||
    posterUrl(item?.backdrop_path) ||
    backdropUrl(item?.backdrop_path) ||
    PLACEHOLDER_IMAGE
  );
}

export function normalizeVideoUrl(value: string): string | null {
  const url = String(value || "").trim();
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("//")) return `https:${url}`;
  return null;
}

export function guessStreamType(url: string): string {
  const clean = String(url || "").split("?")[0];
  return /\.mp4$/i.test(clean) ? "mp4" : "m3u8";
}

export function extractVideoUrls(html: string): string[] {
  const text = String(html || "");
  const urls = new Set<string>();
  const patterns = [
    /(https?:\/\/[^"'\s<>\\]+?\.m3u8[^"'\s<>\\]*)/gi,
    /(https?:\/\/[^"'\s<>\\]+?\.mp4[^"'\s<>\\]*)/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const url = normalizeVideoUrl(match[1]);
      if (url) urls.add(url);
    }
  }
  return [...urls];
}
