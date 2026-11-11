# Provider Candidate Rankings — Vega App

Sites checked for usable scraping APIs (catalog/posts/meta/stream). Ranked by ease of building a complete Vega provider.

## Rank 1 — flixer.gd (RECOMMENDED)

**API found: Yes**

- **Working base URL:** `https://plsdontscrapemelove.flixer.su/api/tmdb` (via `.su` mirror; `api.flixer.su` and `flixer.gd` itself return 404 for content paths)
- **Auth:** None required
- **Structure:** Full TMDB v3 clone — `{page, results[], total_pages, total_results}` with standard TMDB fields (`id`, `title`/`name`, `overview`, `poster_path`, `backdrop_path`, `genre_ids`, `vote_average`, `release_date`/`first_air_date`, `media_type`)
- **imdbId:** Available on `/movie/{id}` and `/tv/{id}` detail responses — good for Cinemeta enrichment
- **Endpoints verified:** `/trending/movie/week`, `/movie/popular`, `/tv/popular`, `/search/movie`, `/search/tv`, `/genre/movie/list`, `/discover/movie?with_genres=X`, `/movie/{id}`, `/tv/{id}`
- **Gap:** `stream.ts` — stream resolution requires WASM-derived HMAC crypto + AES decryption on `https://plsdontscrapemelove.flixer.su/api/tmdb/movie/{tmdbId}/images` — NOT possible in Vega sandbox (no WASM/WebAssembly, no third-party libs). flixer stream.ts cannot resolve playable URLs in Vega.
- **Verdict:** **Catalog/meta/search work; stream is NOT possible in Vega sandbox** due to WASM crypto requirement. Build as catalog/meta-only provider or skip for full end-to-end.

## Rank 2 — movy.sx

**API found: Yes**

- **Metadata API:** `https://db.wecollege.net/3` — TMDB v3 compatible, no auth
- **Stream API:** `https://api.wecollege.net` — city-named endpoints (`/<city>/sources`) but requires signed params + fixed token `b35ebba4`
- **imdbId:** Available on `/3/movie/{id}` details
- **Verified endpoints:** `/3/trending/movie/week`, `/3/movie/popular`, `/3/movie/{id}`, `/3/search/movie`, `/3/tv/{id}`
- **Gap:** Stream API signing not reverse-engineered (403 on bare calls). Metadata half is fully working.
- **Verdict:** **Highly suitable** for catalog/meta; stream would need the signing key reverse-engineered.

## Rank 3 — ghostflix.st

**API found: Yes**

- **Working base URL:** `https://ghostflix.st/api/tmdb` — TMDB-compatible proxy, no auth
- **imdbId:** Available on `/api/tmdb/movie/{id}` details
- **Verified endpoints:** `/api/tmdb/movie/popular`, `/api/tmdb/tv/popular`, `/api/tmdb/movie/{id}`, `/api/tmdb/tv/{id}`, `/api/tmdb/search/movie`, `/api/tmdb/search/tv`
- **Stream API:** `https://vidbolt.pro/api/resolve?type=movie&id={tmdbId}&season={N}&episode={N}` — NO auth required, returns m3u8 sources + VTT subtitles
- **Gap:** None — stream resolution works directly via vidbolt.pro API.
- **Verdict:** **Fully working** including stream resolution.

## Rank 4 — hexa.su

**API found: Partial (catalog/meta only)**

- **Working base URL:** `https://theemoviedb.hexa.su/api/tmdb` — TMDB proxy, no auth
- **imdbId:** Available on movie detail responses
- **Verified endpoints:** `/api/tmdb/movie/popular`, `/api/tmdb/movie/top_rated`, `/api/tmdb/movie/upcoming`, `/api/tmdb/movie/{id}`, `/api/tmdb/tv/popular`, `/api/tmdb/tv/{id}`, `/api/tmdb/search/movie`, `/api/tmdb/trending/all/movie`
- **Gap:** **No stream API found.** Probed `/source/`, `/stream/`, `/servers/`, `/video/`, `/player/`, `/watch/` on both `api.hexa.su` and `theemoviedb.hexa.su/api/tmdb` — all 404. Would need third-party embed scraping.
- **Verdict:** **Suitable for catalog/meta only.** Cannot build a complete provider without solving stream resolution separately.

## Not suitable (no API found / unreachable / blocked)

| Site | Reason |
|------|--------|
| cinejoy.pk | DDG-Guard bot protection; all paths return identical HTML shell; no JSON API |
| popcornmovies.st | Cloudflare "Just a moment" 403 on every path; unreachable |
| shuttletv.su | Connection refused on all ports; DNS resolves but TCP blocked |
| flystream.net | Anubis proof-of-work bot challenge on all content/API paths |
| vivarium.su | Only `/api/gate` (Cloudflare Turnstile CAPTCHA) exists; no content API |
| rivestream.app | Auth-gated backend (Firebase); no public scraping API; all gateway paths 404 |
| watch.corsflix.net | Unreachable (connection timeout); DNS resolves but no TCP connectivity |


## Stream Resolution Summary

| Site | Stream API | Auth | Vega-compatible? | Status |
|------|------------|------|------------------|--------|
| flixer.gd | plsdontscrapemelove.flixer.su/api/tmdb/{media}/{id}/images | WASM HMAC + AES | NO | Stream blocked |
| ghostflix.st | vidbolt.pro/api/resolve?type=...&id=... | None | YES | Working |


## Recommendation

Build the **ghostflix.st** provider first (Rank 3). It is fully working end-to-end: catalog/posts/meta via `https://ghostflix.st/api/tmdb` (no auth) plus stream resolution via `https://vidbolt.pro/api/resolve?type=...&id=...` (no auth required, returns m3u8 sources + VTT subtitles).

**flixer.gd** (Rank 1) is catalog/meta only: its stream requires WASM-derived HMAC + AES crypto that cannot run in the Vega sandbox. **movy.sx** (Rank 2) remains a fallback for catalog/meta if its stream signing is reverse-engineered.
