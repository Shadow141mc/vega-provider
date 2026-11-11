import { Info, Link, ProviderContext } from "../types";
import {
  tmdbGet,
  imageFor,
  posterUrl,
  backdropUrl,
  extractTmdbId,
  extractType,
  watchMovieUrl,
  watchTvUrl,
} from "./utils";

async function fetchDetail(
  providerContext: ProviderContext,
  tmdbId: string,
  preferredType: "movie" | "series" | null,
): Promise<{ detail: any; type: "movie" | "series" }> {
  const tryMovie = preferredType === "movie" || preferredType === null;
  const trySeries = preferredType === "series" || preferredType === null;

  if (tryMovie) {
    const detail = await tmdbGet(providerContext, `/movie/${tmdbId}`, {}).catch(() => ({}));
    if (detail?.id) return { detail, type: "movie" };
  }
  if (trySeries) {
    const detail = await tmdbGet(providerContext, `/tv/${tmdbId}`, {}).catch(() => ({}));
    if (detail?.id) return { detail, type: "series" };
  }
  if (tryMovie) {
    const detail = await tmdbGet(providerContext, `/movie/${tmdbId}`, {}).catch(() => ({}));
    if (detail?.id) return { detail, type: "movie" };
  }
  if (trySeries) {
    const detail = await tmdbGet(providerContext, `/tv/${tmdbId}`, {}).catch(() => ({}));
    if (detail?.id) return { detail, type: "series" };
  }
  return { detail: {}, type: "movie" };
}

export const getMeta = async function ({
  link,
  providerContext,
}: {
  link: string;
  providerContext: ProviderContext;
}): Promise<Info> {
  const tmdbId = extractTmdbId(link);
  const preferredType = extractType(link);

  let detail: any = {};
  let type: "movie" | "series" = "movie";

  if (tmdbId) {
    const result = await fetchDetail(providerContext, tmdbId, preferredType);
    detail = result.detail;
    type = result.type;
  }

  const title = String(detail?.title || detail?.name || "");
  const synopsis = String(detail?.overview || "");
  const image = imageFor(detail);
  const imdbId = String(detail?.imdb_id || "");
  const tags = (
    Array.isArray(detail?.genres) ? detail.genres : []
  )
    .map((g: any) => String(g?.name || ""))
    .filter(Boolean);
  const rating =
    detail?.vote_average !== undefined && detail?.vote_average !== null
      ? String(detail.vote_average)
      : "";
  const webUrl = link;

  const linkList: Link[] = [];
  const id = detail?.id || tmdbId || "";

  if (type === "movie") {
    linkList.push({
      title: "Movie",
      directLinks: [
        {
          title: "Play Movie",
          link: watchMovieUrl(id),
          type: "movie",
          image,
        },
      ],
    });
  } else {
    const seasons = Array.isArray(detail?.seasons) ? detail.seasons : [];
    seasons.forEach((season: any, index: number) => {
      const seasonNumber = season?.season_number;
      if (seasonNumber === undefined || seasonNumber === null) return;
      linkList.push({
        title: String(season?.name || `Season ${index + 1}`),
        episodesLink: watchTvUrl(id, seasonNumber),
      });
    });
    if (!linkList.length) {
      linkList.push({
        title: "Season 1",
        episodesLink: watchTvUrl(id, 1),
      });
    }
  }

  return {
    title,
    synopsis,
    image,
    imdbId,
    type,
    tags,
    rating,
    linkList,
    webUrl,
  };
};
