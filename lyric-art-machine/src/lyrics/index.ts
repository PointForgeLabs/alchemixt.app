/**
 * Acquisition orchestration: link in, lyrics out — or a clear explanation of
 * why not, so the paste box is an obvious next step rather than a dead end.
 */

import { fromLrclib, fromLyricsOvh, type LyricsResult } from './providers';
import { fetchVideoMeta, guessTrack, parseVideoRef, type TrackGuess, type VideoMeta } from './youtube';

export type { LyricsResult } from './providers';
export type { VideoMeta, TrackGuess } from './youtube';

export interface AcquisitionSuccess {
  ok: true;
  meta: VideoMeta | null;
  guess: TrackGuess | null;
  lyrics: LyricsResult;
}

export interface AcquisitionFailure {
  ok: false;
  meta: VideoMeta | null;
  guess: TrackGuess | null;
  /** Human-readable trail of what was tried, shown to the user. */
  attempts: string[];
  reason: string;
}

export type Acquisition = AcquisitionSuccess | AcquisitionFailure;

export interface AcquireOptions {
  signal?: AbortSignal;
  onStatus?: (message: string) => void;
}

export async function acquire(input: string, options: AcquireOptions = {}): Promise<Acquisition> {
  const { signal, onStatus } = options;
  const attempts: string[] = [];

  const ref = parseVideoRef(input);
  if (!ref) {
    return {
      ok: false,
      meta: null,
      guess: null,
      attempts,
      reason: "That doesn't look like a YouTube link. Paste a watch, youtu.be, or shorts URL.",
    };
  }

  onStatus?.('Reading the video…');
  const meta = await fetchVideoMeta(ref, signal);
  if (!meta) {
    attempts.push('YouTube would not return the video title (private, deleted, or blocked).');
    return {
      ok: false,
      meta: null,
      guess: null,
      attempts,
      reason: 'Could not read that video. Paste the lyrics below and the machine will read them directly.',
    };
  }

  const guess = guessTrack(meta);
  attempts.push(
    `Read the video as “${guess.track}”${guess.artist ? ` by ${guess.artist}` : ''}.`,
  );

  onStatus?.('Looking for the words…');
  const lrclib = await fromLrclib(guess.artist, guess.track, signal);
  if (lrclib.ok) return { ok: true, meta, guess, lyrics: lrclib.result };
  attempts.push(lrclib.reason);

  const ovh = await fromLyricsOvh(guess.artist, guess.track, signal);
  if (ovh.ok) return { ok: true, meta, guess, lyrics: ovh.result };
  attempts.push(ovh.reason);

  // Last try: some titles hide the real track name behind extra punctuation, so
  // search on the bare title with no artist at all.
  if (guess.confidence < 0.85 || guess.artist) {
    onStatus?.('Trying the title on its own…');
    const bare = await fromLrclib('', guess.track, signal);
    if (bare.ok) return { ok: true, meta, guess, lyrics: bare.result };
    attempts.push(bare.reason);
  }

  return {
    ok: false,
    meta,
    guess,
    attempts,
    reason: 'No lyrics database had this one. Paste the words below and the machine will read them directly.',
  };
}
