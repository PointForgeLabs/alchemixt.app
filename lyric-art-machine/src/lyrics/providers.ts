/**
 * Lyric providers.
 *
 * Two public, key-free, CORS-friendly sources are tried in order. Both can fail
 * for perfectly ordinary reasons — an obscure track, a rate limit, an offline
 * service — so every path here returns a result object rather than throwing,
 * and the caller always has the paste box to fall back on.
 *
 * Fetched text is used as analysis input only. It is held in memory for the
 * length of the session, never persisted, and never rendered back to the page.
 */

export interface LyricsResult {
  text: string;
  /** Which service answered. */
  source: 'lrclib' | 'lyrics.ovh' | 'pasted';
  /** What the provider believes the track is, when it reports it. */
  matchedArtist?: string;
  matchedTrack?: string;
}

export type ProviderOutcome =
  | { ok: true; result: LyricsResult }
  | { ok: false; reason: string };

const TIMEOUT_MS = 9000;

/** fetch with a timeout, since a hung provider shouldn't hang the machine. */
async function fetchWithTimeout(url: string, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = (): void => controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    return await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Strips timestamp tags so synced lyrics can be analyzed as plain text. */
function stripTimestamps(text: string): string {
  return text.replace(/\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/g, '').trim();
}

interface LrclibEntry {
  id?: unknown;
  trackName?: unknown;
  artistName?: unknown;
  plainLyrics?: unknown;
  syncedLyrics?: unknown;
  instrumental?: unknown;
}

/**
 * LRCLIB — community lyrics database, no key, permissive CORS. Best hit rate of
 * the free options, and it reports what it matched so we can show the user.
 */
export async function fromLrclib(
  artist: string,
  track: string,
  signal?: AbortSignal,
): Promise<ProviderOutcome> {
  const query = [artist, track].filter(Boolean).join(' ').trim();
  if (!query) return { ok: false, reason: 'No artist or track to search for.' };

  const url = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
  try {
    const response = await fetchWithTimeout(url, signal);
    if (!response.ok) return { ok: false, reason: `LRCLIB returned ${response.status}.` };

    const entries = (await response.json()) as unknown;
    if (!Array.isArray(entries) || entries.length === 0) {
      return { ok: false, reason: 'LRCLIB had no match for that title.' };
    }

    for (const raw of entries as LrclibEntry[]) {
      if (raw.instrumental === true) continue;
      const plain = typeof raw.plainLyrics === 'string' ? raw.plainLyrics : '';
      const synced = typeof raw.syncedLyrics === 'string' ? raw.syncedLyrics : '';
      const text = plain.trim() || stripTimestamps(synced);
      if (text.length < 40) continue;

      return {
        ok: true,
        result: {
          text,
          source: 'lrclib',
          matchedArtist: typeof raw.artistName === 'string' ? raw.artistName : undefined,
          matchedTrack: typeof raw.trackName === 'string' ? raw.trackName : undefined,
        },
      };
    }
    return { ok: false, reason: 'LRCLIB matched the title but had no lyrics text.' };
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === 'AbortError';
    return { ok: false, reason: aborted ? 'LRCLIB request timed out.' : 'Could not reach LRCLIB.' };
  }
}

interface LyricsOvhResponse {
  lyrics?: unknown;
  error?: unknown;
}

/** lyrics.ovh — needs a confident artist/track split, so it runs second. */
export async function fromLyricsOvh(
  artist: string,
  track: string,
  signal?: AbortSignal,
): Promise<ProviderOutcome> {
  if (!artist || !track) {
    return { ok: false, reason: 'lyrics.ovh needs both an artist and a track name.' };
  }

  const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(track)}`;
  try {
    const response = await fetchWithTimeout(url, signal);
    if (!response.ok) return { ok: false, reason: `lyrics.ovh returned ${response.status}.` };

    const data = (await response.json()) as LyricsOvhResponse;
    const text = typeof data.lyrics === 'string' ? data.lyrics.trim() : '';
    if (text.length < 40) return { ok: false, reason: 'lyrics.ovh had no usable text.' };

    return { ok: true, result: { text, source: 'lyrics.ovh', matchedArtist: artist, matchedTrack: track } };
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === 'AbortError';
    return { ok: false, reason: aborted ? 'lyrics.ovh request timed out.' : 'Could not reach lyrics.ovh.' };
  }
}
