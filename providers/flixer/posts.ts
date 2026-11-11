import { Post, ProviderContext } from "../types";
import {
  TMDB_BASE,
  tmdbGet,
  tmdbHeaders,
  imageFor,
  watchMovieUrl,
  watchTvUrl,
} from "./utils";

const PER_PAGE = 20;

type FilterKind = { path: string; type: "movie" | "tv" };

function resolveFilter(filter: string): FilterKind | null {
  const f = String(filter || "").trim().toLowerCase();
  const moviePaths = [
    "trending/movie/week",
    "movie/popular",
    "movie/top_rated",
    "movie/now_playing",
    "movie/upcoming",
    "discover/movie",
  ];
  const tvPaths = [
    "trending/tv/week",
    "tv/popular",
    "tv/top_rated",
    "tv/airing_today",
    "tv/on_the_air",
    "discover/tv",
  ];
  if (moviePaths.includes(f)) return { path: `/${f}`, type: "movie" };
  if (tvPaths.includes(f)) return { path: `/${f}`, type: "tv" };
  if (f.startsWith("movie/")) return { path: `/${f}`, type: "movie" };
  if (f.startsWith("tv/")) return { path: `/${f}`, type: "tv" };
  return null;
}

function mapItem(item: any, type: "movie" | "tv"): Post {
  const id = item?.id;
  const title = String(item?.title || item?.name || "");
  const image = imageFor(item);
  const link = type === "movie" ? watchMovieUrl(id) : watchTvUrl(id);
  return { title, link, image };
}

async function fetchList(
  providerContext: ProviderContext,
  kind: FilterKind,
  page: number,
  signal?: AbortSignal,
): Promise<Post[]> {
  const data = await tmdbGet(providerContext, kind.path, {
    page: Math.max(1, page || 1),
  }, signal);
  const results = Array.isArray(data?.results) ? data.results : [];
  return results.map((item: any) => mapItem(item, kind.type));
}

export const getPosts = async function ({
  filter,
  page,
  providerValue,
  signal,
  providerContext,
}: {
  filter: string;
  page: number;
  providerValue: string;
  signal: AbortSignal;
  providerContext: ProviderContext;
}): Promise<Post[]> {
  void providerValue;
  const kind = resolveFilter(filter);
  if (!kind) return [];
  return fetchList(providerContext, kind, page, signal);
};

export const getSearchPosts = async function ({
  searchQuery,
  page,
  providerValue,
  signal,
  providerContext,
}: {
  searchQuery: string;
  page: number;
  providerValue: string;
  signal: AbortSignal;
  providerContext: ProviderContext;
}): Promise<Post[]> {
  void providerValue;
  const query = String(searchQuery || "").trim();
  if (!query) return [];
  const pageNum = Math.max(1, page || 1);
  const [movieData, tvData] = await Promise.all([
    tmdbGet(providerContext, "/search/movie", { query, page: pageNum }, signal).catch(() => ({ results: [] })),
    tmdbGet(providerContext, "/search/tv", { query, page: pageNum }, signal).catch(() => ({ results: [] })),
  ]);
  const movies = (Array.isArray(movieData?.results) ? movieData.results : []).map(
    (item: any) => mapItem(item, "movie"),
  );
  const shows = (Array.isArray(tvData?.results) ? tvData.results : []).map((item: any) => mapItem(item, "tv"));
  return [...movies, ...shows];
};
