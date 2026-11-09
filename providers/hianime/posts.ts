import { Post, ProviderContext } from "../types";
import { getBaseUrl, siteHeaders, stripHtml, watchUrlFromLink } from "./utils";

/**
 * Every browse page of the site (search, most-popular, recently-updated,
 * top-airing, most-favorite, top-upcoming, movie, genres/*) renders the same
 * `.flw-item` card grid, so one parser covers all of them.
 */
async function fetchListPage({
  providerContext,
  path,
  page = 1,
  params,
  signal,
}: {
  providerContext: ProviderContext;
  path: string;
  page?: number;
  params?: Record<string, string | number>;
  signal?: AbortSignal;
}): Promise<Post[]> {
  const { axios, cheerio } = providerContext;
  const baseUrl = await getBaseUrl(providerContext);

  let response;
  try {
    response = await axios.get(`${baseUrl}${path}`, {
      params: {
        ...(params || {}),
        ...(page > 1 ? { page } : {}),
      },
      headers: siteHeaders(baseUrl),
      signal,
    });
  } catch (error: any) {
    if (error?.response?.status === 404) return [];
    throw error;
  }

  const $ = cheerio.load(String(response.data || ""));
  const posts: Post[] = [];

  $(".flw-item").each((_, element) => {
    const anchor = $(element).find(".film-name a").first();
    const href = anchor.attr("href") || "";
    const link = watchUrlFromLink(href, baseUrl);
    if (!link) return;

    const image =
      $(element).find(".film-poster img").first().attr("src") ||
      $(element).find(".film-poster img").first().attr("data-src") ||
      "";

    const title =
      anchor.attr("title") ||
      anchor.text() ||
      $(element)
        .find(".film-poster img")
        .first()
        .attr("alt")
        ?.replace(/\s*Posters?$/i, "") ||
      "";

    posts.push({
      title: stripHtml(title),
      link,
      image,
    });
  });

  return posts;
}

/**
 * The "Trending" shelf only exists on /home. Cards there link straight to the
 * detail page, which watchUrlFromLink normalizes for us.
 */
async function fetchTrending({
  providerContext,
  signal,
}: {
  providerContext: ProviderContext;
  signal?: AbortSignal;
}): Promise<Post[]> {
  const { axios, cheerio } = providerContext;
  const baseUrl = await getBaseUrl(providerContext);

  const response = await axios.get(`${baseUrl}/home`, {
    headers: siteHeaders(baseUrl),
    signal,
  });
  const $ = cheerio.load(String(response.data || ""));
  const posts: Post[] = [];

  $("#trending-home .swiper-slide").each((_, element) => {
    const title =
      $(element).find(".film-title").first().attr("data-jname") ||
      $(element).find(".film-title").first().text();
    const href = $(element).find("a.film-poster").first().attr("href") || "";
    const link = watchUrlFromLink(href, baseUrl);
    if (!link) return;

    posts.push({
      title: stripHtml(title),
      link,
      image:
        $(element).find("img").first().attr("src") ||
        $(element).find("img").first().attr("data-src") ||
        "",
    });
  });

  return posts;
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
  const normalized = String(filter || "").trim();
  const currentPage = Math.max(1, page || 1);

  if (normalized === "trending") {
    if (currentPage > 1) return [];
    return fetchTrending({ providerContext, signal });
  }

  const known = new Set([
    "most-popular",
    "recently-updated",
    "top-airing",
    "most-favorite",
    "top-upcoming",
    "movie",
  ]);

  let path: string;
  if (known.has(normalized)) {
    path = `/${normalized}`;
  } else if (normalized.startsWith("genre:")) {
    const slug = normalized.slice("genre:".length).trim();
    if (!slug) return [];
    path = `/genres/${encodeURIComponent(slug)}`;
  } else {
    return [];
  }

  return fetchListPage({
    providerContext,
    path,
    page: currentPage,
    signal,
  });
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

  return fetchListPage({
    providerContext,
    path: `/search`,
    page: Math.max(1, page || 1),
    params: { keyword: query },
    signal,
  });
};
