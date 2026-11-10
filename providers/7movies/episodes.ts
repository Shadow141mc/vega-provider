import { EpisodeLink, ProviderContext } from "../types";
import { apiHeaders, getBaseUrl, stripHtml } from "./utils";

interface TmdbEpisode {
  episode_number?: number;
  name?: string;
  overview?: string;
  still_path?: string | null;
}

const IMAGE_BASE = "https://image.tmdb.org/t/p";

/**
 * The episodesLink is the site's own season path: `/tv/{id}/season/{n}`.
 * One API call returns every episode of that season.
 */
export const getEpisodes = async function ({
  url,
  providerContext,
}: {
  url: string;
  providerContext: ProviderContext;
}): Promise<EpisodeLink[]> {
  const { axios } = providerContext;
  const baseUrl = await getBaseUrl(providerContext);

  const match = String(url || "").match(/\/tv\/(\d+)\/season\/(\d+)/);
  if (!match) return [];
  const [, id, seasonNumber] = match;

  const response = await axios.get(
    `${baseUrl}/api/tv/${id}/season/${seasonNumber}`,
    { headers: apiHeaders(baseUrl) },
  );

  const episodes: TmdbEpisode[] = Array.isArray(response?.data?.episodes)
    ? response.data.episodes
    : [];

  return episodes
    .map(episode => {
      const number = Number(episode?.episode_number);
      if (!number) return null;

      const name = stripHtml(String(episode?.name || ""));
      const still = String(episode?.still_path || "");

      return {
        title: name ? `${number}: ${name}` : `Episode ${number}`,
        link: `/tv/${id}/${seasonNumber}/${number}`,
        description: stripHtml(String(episode?.overview || "")) || undefined,
        image: still ? `${IMAGE_BASE}/w300${still}` : undefined,
      } as EpisodeLink;
    })
    .filter((episode: EpisodeLink | null): episode is EpisodeLink => !!episode);
};
