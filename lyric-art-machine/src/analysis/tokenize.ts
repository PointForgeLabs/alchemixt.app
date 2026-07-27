/**
 * Turning a block of lyrics into countable structure.
 *
 * Lyric sheets in the wild are messy: section markers like [Chorus], stray
 * annotations, curly apostrophes, blank-line padding. This normalizes all of
 * that before any measuring happens.
 */

export interface Line {
  /** Normalized text of the line, lowercased. */
  text: string;
  /** Word tokens in the line. */
  words: string[];
  /** Section marker this line sits under, if the sheet had them ("chorus", "verse 2"). */
  section: string | null;
}

export interface TokenStream {
  lines: Line[];
  words: string[];
  /** word -> occurrence count */
  counts: Map<string, number>;
  /** Section markers found in the sheet, in order. */
  sections: string[];
}

const SECTION_RE = /^\s*[\[({]\s*([^\])}]{1,40}?)\s*[\])}]\s*$/;

/** Lines that are pure annotation noise rather than sung text. */
const NOISE_RE = /^\s*(\d+\s*(embed|contributors?)|you might also like|see .+ live|get tickets.*)\s*$/i;

function normalizeApostrophes(input: string): string {
  return input.replace(/[‘’ʼ′]/g, "'").replace(/[“”]/g, '"');
}

/**
 * Splits into words. Keeps internal apostrophes so contractions survive as one
 * token, then strips the apostrophe so "don't" and "dont" count together.
 */
export function words(text: string): string[] {
  return normalizeApostrophes(text)
    .toLowerCase()
    .split(/[^a-z']+/)
    .map((w) => w.replace(/'/g, ''))
    .filter((w) => w.length > 0);
}

export function tokenize(raw: string): TokenStream {
  const lines: Line[] = [];
  const sections: string[] = [];
  let currentSection: string | null = null;

  for (const rawLine of normalizeApostrophes(raw).split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (NOISE_RE.test(trimmed)) continue;

    const marker = SECTION_RE.exec(trimmed);
    if (marker?.[1]) {
      currentSection = marker[1].toLowerCase();
      sections.push(currentSection);
      continue;
    }

    const w = words(trimmed);
    if (w.length === 0) continue;
    lines.push({ text: trimmed.toLowerCase(), words: w, section: currentSection });
  }

  const allWords = lines.flatMap((l) => l.words);
  const counts = new Map<string, number>();
  for (const w of allWords) counts.set(w, (counts.get(w) ?? 0) + 1);

  return { lines, words: allWords, counts, sections };
}
