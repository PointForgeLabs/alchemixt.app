/**
 * The reading stage: lyrics in, measurements out.
 *
 * Nothing here knows anything about drawing. It produces a neutral description
 * of the song — how warm it is, how loud, what it keeps circling back to — and
 * `interpret.ts` is what turns that into a picture.
 */

import { tokenize, type TokenStream } from './tokenize';
import {
  AROUSAL,
  COLOR_WORDS,
  PRONOUNS,
  STOPWORDS,
  THEMES,
  VALENCE,
  type ThemeKey,
} from './lexicons';

export interface ThemeScore {
  key: ThemeKey;
  label: string;
  gloss: string;
  /** 0..1, normalized against the strongest theme in this song. */
  strength: number;
  /** Raw share of content words that hit this field. */
  share: number;
  /** The actual words that triggered it, most frequent first. */
  hits: string[];
}

export interface SongAnalysis {
  /** -1 (bleak) .. +1 (radiant) */
  valence: number;
  /** 0 (still) .. 1 (violent) */
  arousal: number;
  /** 0..1 — how much the song repeats itself. Chorus-heavy pop runs high. */
  repetition: number;
  /** 0..1 — vocabulary breadth. Dense wordy writing runs high. */
  diversity: number;
  /** Average words per line. */
  lineDensity: number;
  /** 0..1 — end-of-line sound agreement. */
  rhyme: number;
  /** 0..1 — proportion of lines that ask something. */
  inquiry: number;
  /** Which person the song speaks in. */
  voice: 'confessional' | 'address' | 'collective' | 'observed';
  /** Hue angles (0-360) explicitly named in the lyrics, most frequent first. */
  namedHues: number[];
  themes: ThemeScore[];
  /** Most distinctive content words, most frequent first. */
  signature: { word: string; count: number }[];
  wordCount: number;
  lineCount: number;
  /** Stable fingerprint of the text — same lyrics always yield the same artwork. */
  fingerprint: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Averages the charged words but lets volume matter: a song with four grief
 * words in twenty lines reads darker than one with four in two hundred.
 */
function chargedAverage(stream: TokenStream, lexicon: Record<string, number>): {
  mean: number;
  coverage: number;
} {
  let sum = 0;
  let hits = 0;
  for (const w of stream.words) {
    const score = lexicon[w];
    if (score !== undefined) {
      sum += score;
      hits += 1;
    }
  }
  if (hits === 0) return { mean: 0, coverage: 0 };
  return { mean: sum / hits, coverage: hits / Math.max(1, stream.words.length) };
}

function scoreThemes(stream: TokenStream): ThemeScore[] {
  const contentTotal = Math.max(
    1,
    stream.words.filter((w) => !STOPWORDS.has(w)).length,
  );

  const scored = THEMES.map((theme) => {
    const set = new Set(theme.words);
    const hitCounts = new Map<string, number>();
    let total = 0;
    for (const [word, count] of stream.counts) {
      if (!set.has(word)) continue;
      // Repeats count, but with diminishing returns — a hook that says "fire"
      // twenty times shouldn't drown out everything else.
      total += 1 + Math.log2(count);
      hitCounts.set(word, count);
    }
    const hits = [...hitCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([w]) => w);
    return { theme, total, share: total / contentTotal, hits };
  });

  const peak = Math.max(...scored.map((s) => s.total), 0);

  return scored
    .map(({ theme, total, share, hits }) => ({
      key: theme.key,
      label: theme.label,
      gloss: theme.gloss,
      strength: peak > 0 ? total / peak : 0,
      share,
      hits: hits.slice(0, 8),
    }))
    .sort((a, b) => b.strength - a.strength);
}

/** Repetition measured on whole lines — the structural signature of a chorus. */
function repetitionRatio(stream: TokenStream): number {
  if (stream.lines.length < 2) return 0;
  const seen = new Map<string, number>();
  for (const line of stream.lines) {
    const key = line.words.join(' ');
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const repeated = [...seen.values()].reduce((acc, n) => acc + (n > 1 ? n : 0), 0);
  return clamp(repeated / stream.lines.length, 0, 1);
}

/** Crude but effective: do line endings agree in their final vowel-plus-tail? */
function rhymeDensity(stream: TokenStream): number {
  const endings = stream.lines
    .map((l) => l.words[l.words.length - 1])
    .filter((w): w is string => Boolean(w))
    .map((w) => {
      const m = /[aeiouy][a-z]*$/.exec(w);
      return m ? m[0] : w.slice(-2);
    });
  if (endings.length < 2) return 0;

  const buckets = new Map<string, number>();
  for (const e of endings) buckets.set(e, (buckets.get(e) ?? 0) + 1);
  const paired = [...buckets.values()].reduce((acc, n) => acc + (n > 1 ? n : 0), 0);
  return clamp(paired / endings.length, 0, 1);
}

function detectVoice(stream: TokenStream): SongAnalysis['voice'] {
  const tally = { first: 0, second: 0, collective: 0, third: 0 };
  for (const w of stream.words) {
    if (PRONOUNS.first.has(w)) tally.first += 1;
    else if (PRONOUNS.second.has(w)) tally.second += 1;
    else if (PRONOUNS.collective.has(w)) tally.collective += 1;
    else if (PRONOUNS.third.has(w)) tally.third += 1;
  }
  const entries: [SongAnalysis['voice'], number][] = [
    ['confessional', tally.first],
    ['address', tally.second],
    ['collective', tally.collective * 1.4], // rarer, so weight it up when present
    ['observed', tally.third],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  const top = entries[0];
  return top && top[1] > 0 ? top[0] : 'confessional';
}

function namedHues(stream: TokenStream): number[] {
  const found: { hue: number; count: number }[] = [];
  for (const [word, count] of stream.counts) {
    const hue = COLOR_WORDS[word];
    if (hue !== undefined) found.push({ hue, count });
  }
  return found.sort((a, b) => b.count - a.count).map((f) => f.hue);
}

function signatureWords(stream: TokenStream): { word: string; count: number }[] {
  return [...stream.counts.entries()]
    .filter(([w, c]) => !STOPWORDS.has(w) && w.length > 2 && c > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([word, count]) => ({ word, count }));
}

/** FNV-1a over the normalized text. Deterministic across sessions and machines. */
function fingerprint(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function analyze(rawLyrics: string): SongAnalysis {
  const stream = tokenize(rawLyrics);

  const valenceRead = chargedAverage(stream, VALENCE);
  const arousalRead = chargedAverage(stream, AROUSAL);

  // Charged words are sparse, so a raw mean overreacts to a handful of hits.
  // Confidence scales the reading back toward neutral when coverage is thin.
  const valenceConfidence = clamp(valenceRead.coverage / 0.05, 0, 1);
  const arousalConfidence = clamp(arousalRead.coverage / 0.04, 0, 1);

  const lineDensity =
    stream.lines.length > 0 ? stream.words.length / stream.lines.length : 0;

  // Short, clipped lines read as urgent; long ones as discursive. Nudges arousal
  // when the lexicon has little to say.
  const cadenceEnergy = clamp((9 - lineDensity) / 9, -0.5, 0.5);

  const uniqueWords = stream.counts.size;
  const diversity = stream.words.length > 0
    ? clamp(uniqueWords / Math.sqrt(stream.words.length * 2), 0, 1)
    : 0;

  const questions = stream.lines.filter((l) => l.text.includes('?')).length;

  return {
    valence: clamp(valenceRead.mean * valenceConfidence * 1.25, -1, 1),
    arousal: clamp(
      0.35 + (arousalRead.mean - 0.35) * arousalConfidence + cadenceEnergy * 0.25,
      0,
      1,
    ),
    repetition: repetitionRatio(stream),
    diversity,
    lineDensity,
    rhyme: rhymeDensity(stream),
    inquiry: stream.lines.length > 0 ? questions / stream.lines.length : 0,
    voice: detectVoice(stream),
    namedHues: namedHues(stream),
    themes: scoreThemes(stream),
    signature: signatureWords(stream),
    wordCount: stream.words.length,
    lineCount: stream.lines.length,
    fingerprint: fingerprint(stream.words.join(' ')),
  };
}
