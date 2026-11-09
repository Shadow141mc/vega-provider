import { Info, Link, ProviderContext } from "../types";
import {
  getBaseUrl,
  getRestBase,
  normalizeUrl,
  siteHeaders,
  stripHtml,
} from "./utils";

export function slugOfUrl(url: string): string {
  return url
    .split("?")[0]
    .replace(/\/+$/, "")
    .split("/")
    .filter(Boolean)
    .pop() || "";
}

function detailItemValue($: any, label: string): string {
  let value = "";
  $(".anisc-info .item").each((_: any, element: any) => {
    const key = stripHtml($(element).find(".item-head").text())
      .replace(/:$/, "")
      .trim()
      .toLowerCase();
    if (key === label.toLowerCase()) {
      value = stripHtml($(element).find(".name").text());
      return false;
    }
  });
  return value;
}

export const getMeta = async function ({
  link,
  providerContext,
}: {
  link: string;
  providerContext: ProviderContext;
}): Promise<Info> {
  const { axios, cheerio } = providerContext;
  const baseUrl = await getBaseUrl(providerContext);
  const url = normalizeUrl(link, baseUrl);

  // ── Watch page: current episode id and the anime id ───────────────────────
  const watchResponse = await axios.get(url, { headers: siteHeaders(baseUrl) });
  const watchHtml = String(watchResponse.data || "");
  const watch$ = cheerio.load(watchHtml);

  const aniDetail = watch$("#ani_detail").first();
  const animeId = String(aniDetail.attr("data-anime-id") || "").trim();
  if (!animeId) {
    throw new Error(`HiAnime: could not resolve an anime id from ${url}`);
  }
  const currentEpisodeId = String(aniDetail.attr("data-id") || "").trim();

  const watchAnchor = watch$(".anisc-detail .film-name a").first();
  const title =
    stripHtml(watchAnchor.attr("title") || watchAnchor.text()) ||
    stripHtml(watch$("meta[property='og:title']").first().attr("content") || "") ||
    "Unknown";
  const image =
    normalizeUrl(
      watch$(".anisc-poster .film-poster-img").first().attr("src") || "",
      baseUrl,
    ) ||
    normalizeUrl(
      watch$("meta[property='og:image']").first().attr("content") || "",
      baseUrl,
    );

  const synopsisWatch = stripHtml(
    watch$(".anisc-detail .film-description .text").first().text(),
  );

  // `Type` (TV / Movie / OVA / ONA / Special) drives the Vega detail page.
  // Only look at the title block's stats, not at the recommendation cards
  // further down the page which carry their own type ticks.
  const declaredType = stripHtml(
    watch$(".anisc-detail .film-stats .tick")
      .first()
      .find("span.item")
      .first()
      .text() || "",
  ).toLowerCase();

  // ── Detail page: full synopsis, rating, genres, studios, cast ────────────
  let synopsis = synopsisWatch;
  let rating = "";
  let tags: string[] = [];
  let cast: string[] = [];
  let type = declaredType;

  const slug = slugOfUrl(url);
  if (slug) {
    try {
      const detailResponse = await axios.get(`${baseUrl}/${slug}`, {
        headers: siteHeaders(baseUrl),
      });
      const detail$ = cheerio.load(String(detailResponse.data || ""));

      const overview = stripHtml(
        detail$(".anisc-info .item .text").first().text(),
      );
      if (overview.length > synopsis.length) synopsis = overview;
      if (!synopsis) {
        synopsis = stripHtml(
          detail$(".film-description .text").first().text(),
        );
      }

      rating = detailItemValue(detail$, "MAL Score");

      tags = [];
      detail$(".anisc-info .item-list").each((_, element) => {
        const key = stripHtml(detail$(element).find(".item-head").text())
          .replace(/:$/, "")
          .trim();
        if (key.toLowerCase() !== "genres") return;
        detail$(element)
          .find("a")
          .each((__: any, anchor: any) => {
            const genre = stripHtml(detail$(anchor).text());
            if (genre) tags.push(genre);
          });
      });

      const detailType =
        detail$(".prebreadcrumb a[href*='/movie']").first().text() ||
        detailItemValue(detail$, "Type") ||
        "";
      if (stripHtml(detailType).toLowerCase().includes("movie")) {
        type = "movie";
      }

      cast = [];
      detail$(".bac-item .pi-detail .pi-name").each((_, element) => {
        const name = stripHtml(detail$(element).text());
        if (name && !cast.includes(name) && cast.length < 20) cast.push(name);
      });
    } catch {
      // The detail page is a nice-to-have; the watch page already carries
      // everything essential.
    }
  }

  const isMovie = type.includes("movie") || declaredType === "movie";

  // ── Link list ─────────────────────────────────────────────────────────────
  const linkList: Link[] = [];

  if (isMovie) {
    // Movies usually have a single episode. Pull the episode list once so the
    // direct link carries the real episode id (stream resolution needs it).
    let movieEpisodes: { id: string; href: string; title: string }[] = [];
    try {
      const restBase = await getRestBase(providerContext);
      const episodeResponse = await axios.get(`${restBase}episode/list/${animeId}`, {
        headers: siteHeaders(baseUrl),
      });
      const episodeHtml = String(episodeResponse?.data?.html || "");
      const episode$ = cheerio.load(episodeHtml);
      episode$(".ep-item").each((_, element) => {
        const id = String($(element).attr("data-id") || "").trim();
        if (!id) return;
        movieEpisodes.push({
          id,
          href: $(element).attr("href") || "",
          title:
            $(element).find(".ep-name").first().attr("title") ||
            stripHtml($(element).find(".ep-name").first().text()) ||
            `Episode ${$(element).attr("data-number") || ""}`,
        });
      });
    } catch {
      // Fall back to the episode the watch URL already pointed at.
    }

    if (!movieEpisodes.length && currentEpisodeId) {
      movieEpisodes.push({
        id: currentEpisodeId,
        href: url,
        title: title,
      });
    }

    const directLinks = movieEpisodes.map(episode => ({
      title: episode.title || title,
      link: normalizeUrl(episode.href || url, baseUrl).includes("?ep=")
        ? normalizeUrl(episode.href || url, baseUrl)
        : `${baseUrl}/watch/${slug}?ep=${episode.id}`,
      type: "movie" as const,
    }));

    if (directLinks.length) {
      linkList.push({ title: "Movie", directLinks });
    }
  } else {
    if (!linkList.length) {
      linkList.push({
        title: "Episodes",
        episodesLink: animeId,
      });
    }
  }

  return {
    title,
    synopsis: synopsis || "",
    image,
    imdbId: "",
    type: isMovie ? "movie" : "series",
    tags: tags.length ? tags : undefined,
    cast: cast.length ? cast : undefined,
    rating: rating || undefined,
    linkList,
    webUrl: url,
  };
};
