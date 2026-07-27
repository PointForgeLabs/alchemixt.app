/**
 * YouTube link handling.
 *
 * Two jobs: pull the video id out of whatever URL shape the user pasted, and
 * turn the video title into a usable artist/track guess. The second job is the
 * hard one — YouTube titles are decorated with everything under the sun.
 */

export interface VideoRef {
  id: string;
  url: string;
}

export interface VideoMeta {
  id: string;
  url: string;
  /** Raw video title as YouTube reports it. */
  title: string;
  /** Channel name — often the artist, on official uploads. */
  author: string;
  thumbnail: string;
}

export interface TrackGuess {
  artist: string;
  track: string;
  /** How much to trust the split. Low confidence means show the paste box early. */
  confidence: number;
}

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Accepts watch URLs, youtu.be, shorts, embeds, music.youtube.com, or a bare id. */
export function parseVideoRef(input: string): VideoRef | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (ID_RE.test(trimmed)) {
    return { id: trimmed, url: `https://www.youtube.com/watch?v=${trimmed}` };
  }

  let url: URL;
  try {
    url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '');
  let id: string | null = null;

  if (host === 'youtu.be') {
    id = url.pathname.slice(1).split('/')[0] ?? null;
  } else if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
    const v = url.searchParams.get('v');
    if (v) {
      id = v;
    } else {
      const segments = url.pathname.split('/').filter(Boolean);
      // /shorts/<id>, /embed/<id>, /live/<id>, /v/<id>
      if (segments.length >= 2 && ['shorts', 'embed', 'live', 'v'].includes(segments[0] as string)) {
        id = segments[1] as string;
      }
    }
  }

  if (!id || !ID_RE.test(id)) return null;
  return { id, url: `https://www.youtube.com/watch?v=${id}` };
}

/** Decoration that appears in video titles but never in a track name. */
const NOISE_PATTERNS: RegExp[] = [
  /\b(official|officiel)\s*(music\s*)?(video|audio|visualizer|lyric\s*video|version|hd|4k)\b/gi,
  /\b(music\s*video|lyric[s]?\s*video|audio\s*only|visuali[sz]er)\b/gi,
  /\b(hd|hq|4k|8k|1080p|720p|remaster(ed)?(\s*\d{4})?)\b/gi,
  /\b(with\s*)?lyrics\b/gi,
  /\b(full\s*(album|song|version))\b/gi,
  /\b(live\s*(at|from|in|on)\s*[^)\]]*)/gi,
  /\bfeat\.?\b|\bft\.?\b/gi,
];

function stripDecorations(text: string): string {
  let out = text;
  // Strip bracketed groups whose contents are decoration rather than title.
  out = out.replace(/[([{]([^)\]}]*)[)\]}]/g, (match, inner: string) => {
    const looksLikeNoise = NOISE_PATTERNS.some((re) => {
      re.lastIndex = 0;
      return re.test(inner);
    });
    return looksLikeNoise ? ' ' : match;
  });
  for (const re of NOISE_PATTERNS) {
    re.lastIndex = 0;
    out = out.replace(re, ' ');
  }
  return out.replace(/[|｜]/g, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s\-–—:,]+|[\s\-–—:,]+$/g, '').trim();
}

/** Channel suffixes that mean "this is the artist's channel", not part of a name. */
const CHANNEL_SUFFIX_RE = /\s*[-–—]?\s*(vevo|official|music|records|topic|tv|channel)\s*$/i;

function cleanChannel(author: string): string {
  let out = author.trim();
  // "Artist - Topic" is YouTube's auto-generated music channel format.
  for (let i = 0; i < 2; i += 1) out = out.replace(CHANNEL_SUFFIX_RE, '').trim();
  return out;
}

/**
 * Splits "Artist - Title" out of a video title, falling back to the channel
 * name when the title carries no separator.
 */
export function guessTrack(meta: VideoMeta): TrackGuess {
  const cleanedTitle = stripDecorations(meta.title);
  const channel = cleanChannel(meta.author);

  // Prefer the first dash-like separator that has text on both sides.
  const separators = [' - ', ' – ', ' — ', ' -- ', ': '];
  for (const sep of separators) {
    const index = cleanedTitle.indexOf(sep);
    if (index <= 0) continue;
    const left = cleanedTitle.slice(0, index).trim();
    const right = cleanedTitle.slice(index + sep.length).trim();
    if (!left || !right) continue;

    // If the channel matches the right-hand side, the order is reversed
    // ("Title - Artist"), which some uploads do.
    const reversed = channel && right.toLowerCase().includes(channel.toLowerCase());
    return {
      artist: reversed ? right : left,
      track: reversed ? left : right,
      confidence: 0.85,
    };
  }

  // Quoted title with the channel as artist: Artist "Track"
  const quoted = /["“]([^"”]{2,})["”]/.exec(cleanedTitle);
  if (quoted?.[1] && channel) {
    return { artist: channel, track: quoted[1].trim(), confidence: 0.7 };
  }

  if (channel && cleanedTitle) {
    return { artist: channel, track: cleanedTitle, confidence: 0.5 };
  }

  return { artist: '', track: cleanedTitle || meta.title, confidence: 0.2 };
}

interface OEmbedResponse {
  title?: unknown;
  author_name?: unknown;
  thumbnail_url?: unknown;
}

/**
 * Fetches title and channel via YouTube's public oEmbed endpoint. No API key,
 * no quota. It can still fail — private videos, region blocks, or a browser
 * extension blocking the request — so callers must handle null.
 */
export async function fetchVideoMeta(ref: VideoRef, signal?: AbortSignal): Promise<VideoMeta | null> {
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(ref.url)}&format=json`;
  try {
    const response = await fetch(endpoint, { signal });
    if (!response.ok) return null;
    const data = (await response.json()) as OEmbedResponse;
    const title = typeof data.title === 'string' ? data.title : '';
    if (!title) return null;
    return {
      id: ref.id,
      url: ref.url,
      title,
      author: typeof data.author_name === 'string' ? data.author_name : '',
      thumbnail:
        typeof data.thumbnail_url === 'string'
          ? data.thumbnail_url
          : `https://i.ytimg.com/vi/${ref.id}/hqdefault.jpg`,
    };
  } catch {
    return null;
  }
}
