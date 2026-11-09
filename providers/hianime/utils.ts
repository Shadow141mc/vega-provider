import { ProviderContext } from "../types";

export const DEFAULT_BASE_URL = "https://hianime.at";

/** Working HiAnime mirrors. Stored in the provider settings as choices. */
export const KNOWN_DOMAINS = [
  "hianime.at",
  "hianime.lu",
  "hianime.tr",
  "hianime.gy",
  "hianime.ba",
  "hianimetv.bz",
  "hianime.ms",
];

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Resolve the active mirror (settings value wins over the default). */
export async function getBaseUrl(
  providerContext: ProviderContext,
): Promise<string> {
  try {
    const saved = await providerContext.kvStore?.get<string>("baseUrl");
    const value = String(saved || "").trim();
    if (value) {
      if (/^https?:\/\//i.test(value)) return value.replace(/\/+$/, "");
      if (/^[a-z0-9.-]+$/i.test(value)) return `https://${value}`;
    }
  } catch {
    // kvStore is unavailable in some sandboxes; keep the default mirror.
  }
  return DEFAULT_BASE_URL;
}

export async function getRestBase(
  providerContext: ProviderContext,
): Promise<string> {
  return `${await getBaseUrl(providerContext)}/api/theme/`;
}

/**
 * Common headers for every request to the site. The user agent override
 * matters: the Cloudflare/Fastly proxy serves a stripped page to unknown
 * clients in some regions.
 */
export function siteHeaders(
  baseUrl: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    "User-Agent": USER_AGENT,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: `${baseUrl}/`,
    ...extra,
  };
}

const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Small dependency-free base64 decoder. The provider sandbox does not always
 * expose atob(), and provider bundles must not pull in Node buffer helpers.
 */
export function decodeBase64(value: string): string {
  const input = String(value || "").replace(/[^A-Za-z0-9+/=]/g, "");
  let output = "";
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === "=") break;
    const index = BASE64_CHARS.indexOf(char);
    if (index < 0) continue;
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }

  return output;
}

/** Base64url variant used by the ZokoAnime player payloads. */
export function decodeBase64Url(value: string): string {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return decodeBase64(normalized);
}

/**
 * Decode a byte-string (code points 0-255, as produced by decodeBase64/XOR)
 * as UTF-8. Mirrors the player's `decodeURIComponent(escape(...))` trick
 * without using deprecated helpers.
 */
export function utf8DecodeByteString(data: string): string {
  let output = "";
  let i = 0;

  const next = (offset: number) =>
    data.charCodeAt(i + offset) !== undefined ? data.charCodeAt(i + offset) : 0;

  while (i < data.length) {
    const first = data.charCodeAt(i);
    if (isNaN(first)) break;

    if (first < 0x80) {
      output += String.fromCharCode(first);
      i += 1;
    } else if (first >= 0xc0 && first < 0xe0) {
      output += String.fromCodePoint(
        ((first & 0x1f) << 6) | (next(1) & 0x3f),
      );
      i += 2;
    } else if (first >= 0xe0 && first < 0xf0) {
      const codepoint =
        ((first & 0x0f) << 12) | ((next(1) & 0x3f) << 6) | (next(2) & 0x3f);
      output += String.fromCodePoint(codepoint);
      i += 3;
    } else if (first >= 0xf0 && first < 0xf8) {
      const codepoint =
        ((first & 0x07) << 18) |
        ((next(1) & 0x3f) << 12) |
        ((next(2) & 0x3f) << 6) |
        (next(3) & 0x3f);
      output += String.fromCodePoint(codepoint);
      i += 4;
    } else {
      output += "\ufffd";
      i += 1;
    }
  }

  return output;
}

const ZOKO_KEY = "otaku-embed-v1";

/**
 * The ZokoAnime embed (zokoanime.video) carries the whole player config,
 * including the direct HLS master URL, subtitle VTTs and intro/outro skip
 * times, as a base64+XOR obfuscated blob in `window.__P`. This mirrors the
 * site's own `deobfuscate()` from /core/obfuscate.js.
 */
export function decodeZokoPayload(html: string): any | null {
  const match = String(html || "").match(/__P\s*=\s*"([^"]+)"/);
  if (!match?.[1]) return null;

  const data = decodeBase64Url(match[1]);
  let result = "";
  for (let i = 0; i < data.length; i++) {
    result += String.fromCharCode(
      data.charCodeAt(i) ^ ZOKO_KEY.charCodeAt(i % ZOKO_KEY.length),
    );
  }

  try {
    return JSON.parse(utf8DecodeByteString(result));
  } catch {
    return null;
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "\u2026",
  laquo: "\u00ab",
  ldquo: "\u201c",
  lsquo: "\u2018",
  lt: "<",
  mdash: "\u2014",
  nbsp: " ",
  ndash: "\u2013",
  quot: '"',
  raquo: "\u00bb",
  rdquo: "\u201d",
  rsquo: "\u2019",
  sbquo: "\u201a",
  bdquo: "\u201e",
  times: "\u00d7",
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
};

/** Decode HTML entities used by site titles and descriptions. */
export function decodeEntities(value: string): string {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      try {
        return String.fromCodePoint(parseInt(code, 16));
      } catch {
        return _;
      }
    })
    .replace(/&#(\d+);/g, (_, code) => {
      try {
        return String.fromCodePoint(parseInt(code, 10));
      } catch {
        return _;
      }
    })
    .replace(/&([a-z][a-z0-9]+);/gi, (match, name) => {
      const decoded = NAMED_ENTITIES[String(name).toLowerCase()];
      return decoded === undefined ? match : decoded;
    });
}

/** Remove markup and normalize whitespace from a scraped text blob. */
export function stripHtml(value: string): string {
  return decodeEntities(String(value || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** Resolve protocol-relative and root-relative URLs against the site. */
export function normalizeUrl(value: string, baseUrl: string): string {
  let url = String(value || "").trim();
  url = url.replace(/\\\//g, "/");
  url = url.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"');
  url = url.replace(/^['"]|['"]$/g, "");
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${baseUrl}${url}`;
  return url;
}

/**
 * HiAnime list pages link some cards to theanime detail URL and others to the
 * watch URL. Vega consumes both through getMeta, but /watch/{slug} pages are
 * the canonical entry point (they carry the episode id), so normalize to them.
 */
export function watchUrlFromLink(value: string, baseUrl: string): string {
  const raw = normalizeUrl(value, baseUrl);
  const match = raw.match(/^https?:\/\/[^/]+\/(?:watch\/)?([a-z0-9-]+-\d+)(?:\?.*)?$/i);
  if (match) return `${baseUrl}/watch/${match[1]}`;
  return raw;
}

/** Map a subtitle label to a 2-letter language code for the Vega player. */
export function languageCode(label: string): string {
  const value = String(label || "").toLowerCase();

  const exact: Record<string, string> = {
    ar: "ar",
    ara: "ar",
    bn: "bn",
    chi: "zh",
    chn: "zh",
    de: "de",
    eng: "en",
    en: "en",
    es: "es",
    fra: "fr",
    fre: "fr",
    fr: "fr",
    ger: "de",
    hi: "hi",
    ita: "it",
    it: "it",
    ja: "ja",
    jpn: "ja",
    kor: "ko",
    pt: "pt",
    pl: "pl",
    ru: "ru",
    rus: "ru",
    spa: "es",
    tha: "th",
    vie: "vi",
    zh: "zh",
    zho: "zh",
  };
  if (exact[value]) return exact[value];

  const phrase: Array<[RegExp, string]> = [
    [/english|\ben\b/, "en"],
    [/japanese|\bja\b/, "ja"],
    [/hindi|\bhi\b/, "hi"],
    [/arab|\bar\b/, "ar"],
    [/spanish|\bes\b/, "es"],
    [/french|\bfr\b/, "fr"],
    [/german|\bde\b/, "de"],
    [/italian|\bit\b/, "it"],
    [/portug|brazil/, "pt"],
    [/russi/, "ru"],
    [/thai/, "th"],
    [/viet/, "vi"],
    [/indo/, "id"],
    [/polish|\bpl\b/, "pl"],
    [/benga/, "bn"],
    [/chin/, "zh"],
    [/korean/, "ko"],
  ];
  for (const [pattern, code] of phrase) {
    if (pattern.test(value)) return code;
  }
  return "en";
}
