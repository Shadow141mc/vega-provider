import { EpisodeLink, ProviderContext } from "../types";
import {
  getBaseUrl,
  getRestBase,
  normalizeUrl,
  siteHeaders,
  stripHtml,
} from "./utils";

/**
 * The site episode list AJAX returns every episode in one HTML response, even
 * for shows with 1000+ episodes (the browser paginates client-side).
 */
export const getEpisodes = async function ({
  url,
  providerContext,
}: {
  url: string;
  providerContext: ProviderContext;
}): Promise<EpisodeLink[]> {
  const { axios, cheerio } = providerContext;
  const baseUrl = await getBaseUrl(providerContext);

  // The episodesLink is the numeric anime id (see meta.ts).
  const animeId = String(url || "").trim().replace(/\D+$/, "");
  if (!animeId) return [];

  const restBase = await getRestBase(providerContext);
  const response = await axios.get(`${restBase}episode/list/${animeId}`, {
    headers: siteHeaders(baseUrl),
  });
  const html = String(response?.data?.html || response?.data || "");
  if (!html) return [];

  const $ = cheerio.load(html);
  const episodes: EpisodeLink[] = [];
  const seen = new Set<string>();
  let index = 0;

  $(".ep-item").each((_, element) => {
    const id = String($(element).attr("data-id") || "").trim();
    if (!id || seen.has(id)) return;
    seen.add(id);

    const numberRaw = String($(element).attr("data-number") || "").trim();
    const number = Number(numberRaw);
    const epAnchor = $(element).find(".ep-name").first();
    let name = stripHtml(epAnchor.attr("title") || epAnchor.text());
    if (!name) name = `Episode ${numberRaw || index + 1}`;
    if (!/^\d+(\.\d+)?$/.test(name.replace(/^Episode\s*/i, ""))) {
      // Named episodes like "Turning Point": keep the number prefix for the UI.
      name = `${numberRaw || index + 1}: ${name}`;
    }

    index += 1;

    const href = String($(element).attr("href") || "").trim();
    const fallbackLink = href
      ? normalizeUrl(href, baseUrl)
      : `${baseUrl}/watch/?ep=${id}`;
    // The anchor href already carries ?ep=<id>; strip anything else.
    const link = fallbackLink.replace(/\?ep=[^&]+/, `?ep=${id}`);
    if (!/\?ep=\d+/.test(link)) return;

    episodes.push({
      title: name,
      link,
    });
  });

  return episodes;
};
