import { Catalog } from "../types";

export const catalog: Catalog[] = [
  { title: "Trending Movies", filter: "trending/movie/week" },
  { title: "Popular Movies", filter: "movie/popular" },
  { title: "Top Rated Movies", filter: "movie/top_rated" },
  { title: "Now Playing Movies", filter: "movie/now_playing" },
  { title: "Upcoming Movies", filter: "movie/upcoming" },
  { title: "Trending TV", filter: "trending/tv/week" },
  { title: "Popular TV", filter: "tv/popular" },
  { title: "Top Rated TV", filter: "tv/top_rated" },
  { title: "Airing Today", filter: "tv/airing_today" },
  { title: "On the Air", filter: "tv/on_the_air" },
];

export const genres: Catalog[] = [];
