import { Info, Link, ProviderContext } from "../types";
import { apiHeaders, getBaseUrl, stripHtml } from "./utils";

interface TmdbCredit {
  name?: string;
}

interface TmdbSeason {
  season_number?: number;
  name?: string;
  episode_count?: number;
}

interface TmdbDetail {
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  imdb_id?: string | null;
  vote_average?: number;
  genres?: Array<{ name?: string }>;
  credits?: { cast?: TmdbCredit[] };
  seasons?: TmdbSeason[];
}

const IMAGE_BASE = "https://image.tmdb.org/t/p";

/** Posts link to `/movie/{id}` or `/tv/{id}` (TMDB ids). */
function parseContentLink(link: string): { kind: string; id: string } | null {
  const match = String(link || "").match(/\/(movie|tv)\/(\d+)/);
  if (!match) return null;
  return { kind: match[1], id: match[2] };
}

export const getMeta = async function ({
  link,
  providerContext,
}: {
  link: string;
  providerContext: ProviderContext;
}): Promise<Info> {
  const { axios } = providerContext;
  const baseUrl = await getBaseUrl(providerContext);

  const parsed = parseContentLink(link);
  if (!parsed) {
    throw new Error(`7Movies: unsupported content link "${link}".`);
  }
  const { kind, id } = parsed;
  const isMovie = kind === "movie";

  // The site proxies TMDB's detail endpoint (movies include imdb_id and
  // recommendations; TV includes the season list the player needs).
  const response = await axios.get(
    `${baseUrl}/api/tmdb?path=/${kind}/${id}`,
    { headers: apiHeaders(baseUrl) },
  );
  const data: TmdbDetail = response?.data || {};
  if (!data.title && !data.name) {
    throw new Error(`7Movies: no metadata found for ${kind}/${id}.`);
  }

  const title =
    stripHtml(String((isMovie ? data.title : data.name) || "")) || "Unknown";
  const synopsis = stripHtml(String(data.overview || ""));
  const posterPath = String(data.poster_path || "");
  const image = posterPath ? `${IMAGE_BASE}/w500${posterPath}` : "";

  const tags = (data.genres || [])
    .map(genre => stripHtml(String(genre?.name || "")))
    .filter(Boolean);
  const cast = (data.credits?.cast || [])
    .map(person => stripHtml(String(person?.name || "")))
    .filter(Boolean)
    .slice(0, 15);

  const rating =
    typeof data.vote_average === "number" && data.vote_average > 0
      ? String(Math.round(data.vote_average * 10) / 10)
      : undefined;

  const linkList: Link[] = [];

  if (isMovie) {
    linkList.push({
      title: "Movie",
      directLinks: [
        {
          title,
          link: `/movie/${id}`,
          type: "movie",
        },
      ],
    });
  } else {
    // Seasons resolve lazily: each entry points at /tv/{id}/season/{n},
    // which episodes.ts fetches when the user opens the season.
    const seasons = (data.seasons || [])
      .filter(season => Number(season?.season_number) >= 1)
      .filter(season => Number(season?.episode_count) > 0)
      .sort(
        (a, b) => Number(a.season_number) - Number(b.season_number),
      );

    if (seasons.length) {
      for (const season of seasons) {
        const seasonNumber = Number(season.season_number);
        linkList.push({
          title:
            stripHtml(String(season.name || "")) || `Season ${seasonNumber}`,
          episodesLink: `/tv/${id}/season/${seasonNumber}`,
        });
      }
    } else {
      // Defensive fallback when TMDB omits the season list.
      linkList.push({
        title: "Season 1",
        episodesLink: `/tv/${id}/season/1`,
      });
    }
  }

  return {
    title,
    synopsis,
    image,
    // The TMDB proxy does not expose TV external_ids and the site pages
    // carry no IMDb link, so only movies get an imdb id here.
    imdbId: isMovie ? String(data.imdb_id || "") : "",
    tmdbId: id,
    type: isMovie ? "movie" : "series",
    tags: tags.length ? tags : undefined,
    cast: cast.length ? cast : undefined,
    rating,
    linkList,
    webUrl: `${baseUrl}/${kind}/${id}`,
  };
};
