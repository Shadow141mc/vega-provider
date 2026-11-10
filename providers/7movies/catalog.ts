/**
 * Every filter is passed straight to the site's /api/discover endpoint:
 *   - no `type` param  -> movies (the API default)
 *   - `type=tv`        -> TV shows
 *   - `genre`          -> TMDB genre id
 *   - `sort`           -> rated | newest | oldest | gems (popular = default)
 */
export const catalog = [
  { title: "Trending Movies", filter: "sort=popular" },
  { title: "Top Rated Movies", filter: "sort=rated" },
  { title: "Newest Movies", filter: "sort=newest" },
  { title: "Classic Movies", filter: "sort=oldest" },
  { title: "Hidden Gems", filter: "sort=gems" },
  { title: "Popular TV Shows", filter: "type=tv" },
  { title: "Top Rated TV Shows", filter: "type=tv&sort=rated" },
  { title: "Newest TV Shows", filter: "type=tv&sort=newest" },
];

export const genres = [
  // Movies
  { title: "Action", filter: "genre=28" },
  { title: "Adventure", filter: "genre=12" },
  { title: "Animation", filter: "genre=16" },
  { title: "Comedy", filter: "genre=35" },
  { title: "Crime", filter: "genre=80" },
  { title: "Documentary", filter: "genre=99" },
  { title: "Drama", filter: "genre=18" },
  { title: "Family", filter: "genre=10751" },
  { title: "Fantasy", filter: "genre=14" },
  { title: "Horror", filter: "genre=27" },
  { title: "Mystery", filter: "genre=9648" },
  { title: "Romance", filter: "genre=10749" },
  { title: "Sci-Fi", filter: "genre=878" },
  { title: "Thriller", filter: "genre=53" },
  { title: "War", filter: "genre=10752" },
  { title: "Western", filter: "genre=37" },
  // TV shows (TMDB uses a different genre set for TV)
  { title: "TV Action & Adventure", filter: "type=tv&genre=10759" },
  { title: "TV Comedy", filter: "type=tv&genre=35" },
  { title: "TV Crime", filter: "type=tv&genre=80" },
  { title: "TV Drama", filter: "type=tv&genre=18" },
  { title: "TV Kids", filter: "type=tv&genre=10762" },
  { title: "TV Mystery", filter: "type=tv&genre=9648" },
  { title: "TV Sci-Fi & Fantasy", filter: "type=tv&genre=10765" },
  { title: "TV Reality", filter: "type=tv&genre=10764" },
];
