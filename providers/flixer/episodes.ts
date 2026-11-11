import { EpisodeLink, ProviderContext } from "../types";
import {
  tmdbGet,
  imageFor,
  extractTmdbId,
  watchTvUrl,
} from "./utils";

function parseSeasonLink(url: string): { tmdbId: string | null; season: number | null } {
  const value = String(url || "");
  const match = value.match(/\/watch\/tv\/(\d+)\/(\d+)(?:\/|\?|$)/i);
  if (match) return { tmdbId: match[1], season: Number(match[2]) };
  const tmdbId = extractTmdbId(value);
  return { tmdbId, season: null };
}

export const getEpisodes = async function ({
  url,
  providerContext,
}: {
  url: string;
  providerContext: ProviderContext;
}): Promise<EpisodeLink[]> {
  const { tmdbId, season } = parseSeasonLink(url);
  if (!tmdbId || season === null) return [];

  const data = await tmdbGet(
    providerContext,
    `/tv/${tmdbId}/season/${season}`,
    {},
  ).catch(() => ({ episodes: [] }));

  const episodes = Array.isArray(data?.episodes) ? data.episodes : [];
  const seen = new Set<string>();
  const result: EpisodeLink[] = [];

  episodes.forEach((ep: any, index: number) => {
    const epNumber = ep?.episode_number;
    if (epNumber === undefined || epNumber === null) return;
    const link = watchTvUrl(tmdbId, season, epNumber);
    if (!link || seen.has(link)) return;
    seen.add(link);
    result.push({
      title: String(ep?.name || `Episode ${epNumber}`),
      link,
      description: String(ep?.overview || "") || undefined,
      image: imageFor(ep) || undefined,
    });
  });

  return result;
};
