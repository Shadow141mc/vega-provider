import { Post, ProviderContext } from "../types";
import { apiHeaders, getBaseUrl } from "./utils";

interface DiscoverItem {
  id: number;
  title: string;
  mediaType: string;
  poster: string;
}

/** Map an API result card onto the Vega Post shape. */
function toPost(item: DiscoverItem, baseUrl: string): Post | null {
  const id = Number(item?.id);
  if (!id) return null;

  const kind = String(item?.mediaType || "").toLowerCase() === "tv" ? "tv" : "movie";
  const title = String(item?.title || "").trim();
  if (!title) return null;

  return {
    title,
    link: `${baseUrl}/${kind}/${id}`,
    image: String(item?.poster || ""),
  };
}

/**
 * The site's browse engine. One endpoint serves every catalog row and genre
 * row: /api/discover?{filter}&page=N (filter is the catalog entry's own
 * filter string, e.g. "type=tv&sort=rated").
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
  const query = [normalized, `page=${currentPage}`].filter(Boolean).join("&");

  let response;
  try {
    response = await axios.get(`${baseUrl}/api/discover?${query}`, {
      headers: apiHeaders(baseUrl),
      signal,
    });
  } catch (error: any) {
    if (error?.response?.status === 404) return [];
    throw error;
  }

  const items = Array.isArray(response?.data?.items) ? response.data.items : [];
  return items
    .map((item: DiscoverItem) => toPost(item, baseUrl))
    .filter((post: Post | null): post is Post => !!post);
};

/**
 * Search is a single-shot endpoint (no server-side pagination), so pages
 * beyond the first return an empty list to stop the pager.
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
  if (Math.max(1, page || 1) > 1) return [];

  const { axios } = providerContext;
  const baseUrl = await getBaseUrl(providerContext);

  const response = await axios.get(
    `${baseUrl}/api/search?v=5&q=${encodeURIComponent(query)}`,
    { headers: apiHeaders(baseUrl), signal },
  );

  const results = Array.isArray(response?.data?.results)
    ? response.data.results
    : [];
  return results
    .map((item: DiscoverItem) => toPost(item, baseUrl))
    .filter((post: Post | null): post is Post => !!post);
};
