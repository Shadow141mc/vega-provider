import { Post, ProviderContext } from "../types";
import { getBaseUrl, siteHeaders, stripHtml, TMDB_BASE } from "./utils";
import { throwProviderError } from "../providerErrors";

interface TmdbResult {
  id?: number;
  title?: string;
  name?: string;
  media_type?: "movie" | "tv";
  poster_path?: string | null;
}

const IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

/** Map a TMDB result card onto the Vega Post shape. */
function toPost(item: TmdbResult): Post | null {
  const id = Number(item?.id);
  if (!id) return null;

  const kind = String(item?.media_type || "").toLowerCase() === "tv" ? "tv" : "movie";
  const title = stripHtml(String(item?.title || item?.name || "")).trim();
  if (!title) return null;

  const posterPath = String(item?.poster_path || "");
  return {
    title,
    link: `/${kind}/${id}`,
    image: posterPath ? `${IMAGE_BASE}${posterPath}` : "",
  };
}

/**
 * Browse engine. One endpoint serves every catalog row: {TMDB_BASE}/{filter}?page=N.
 * Filters include trending/movie/week, movie/popular, movie/top_rated, tv/popular,
 * tv/top_rated, movie/now_playing and discover/*?with_genres=... genre rows.
 */
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
  const { axios } = providerContext;
  const baseUrl = await getBaseUrl(providerContext);

  const normalized = String(filter || "").trim();
  const currentPage = Math.max(1, page || 1);
  const separator = normalized.includes("?") ? "&" : "?";
  const url = `${TMDB_BASE}/${normalized}${separator}page=${currentPage}`;

  let response;
  try {
    response = await axios.get(url, {
      headers: siteHeaders(baseUrl),
      signal,
    });
  } catch (error: any) {
    if (error?.response?.status === 404) return [];
    throwProviderError("Ghostflix", "getPosts", error);
  }

  const results: TmdbResult[] = Array.isArray(response?.data?.results)
    ? response.data.results
    : [];
  return results
    .map(toPost)
    .filter((post: Post | null): post is Post => !!post);
};

/**
 * Search hits both the movie and TV search endpoints and merges the results.
 */
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
  const currentPage = Math.max(1, page || 1);

  const { axios } = providerContext;
  const baseUrl = await getBaseUrl(providerContext);

  const encoded = encodeURIComponent(query);
  const urls = [
    `${TMDB_BASE}/search/movie?query=${encoded}&page=${currentPage}`,
    `${TMDB_BASE}/search/tv?query=${encoded}&page=${currentPage}`,
  ];

  const results: TmdbResult[] = [];
  for (const url of urls) {
    try {
      const response = await axios.get(url, {
        headers: siteHeaders(baseUrl),
        signal,
      });
      const list = Array.isArray(response?.data?.results)
        ? response.data.results
        : [];
      results.push(...list);
    } catch {
      // Continue with the other endpoint if one fails.
    }
  }

  return results
    .map(toPost)
    .filter((post: Post | null): post is Post => !!post);
};
