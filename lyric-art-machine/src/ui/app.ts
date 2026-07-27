/**
 * Application controller: wires the intake form to the analysis pipeline and
 * the canvas, and renders the machine's written reading.
 *
 * Lyric text lives in this module's memory for exactly as long as the session
 * needs it to compute an analysis. It is never written to the DOM, never
 * persisted, and never drawn into the artwork.
 */

import { analyze, type SongAnalysis } from '../analysis/analyze';
import { explain, interpret, type ArtGenome } from '../analysis/interpret';
import { acquire, type LyricsResult, type TrackGuess, type VideoMeta } from '../lyrics';
import { render, type RenderHandle } from '../art/renderer';

type FormatKey = 'portrait' | 'square' | 'landscape' | 'poster';

const FORMATS: Record<FormatKey, { width: number; height: number; label: string }> = {
  portrait: { width: 1400, height: 1750, label: '4:5' },
  square: { width: 1600, height: 1600, label: '1:1' },
  landscape: { width: 1920, height: 1280, label: '3:2' },
  poster: { width: 1400, height: 2100, label: '2:3' },
};

function must<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

interface Subject {
  analysis: SongAnalysis;
  /** Display name for the piece — never the lyrics themselves. */
  title: string;
  attribution: string;
  sourceLabel: string;
  variation: number;
}

export function mountApp(): void {
  const form = must<HTMLFormElement>('intake-form');
  const urlInput = must<HTMLInputElement>('url-input');
  const interpretButton = must<HTMLButtonElement>('interpret-button');
  const statusEl = must<HTMLParagraphElement>('status');
  const fallback = must<HTMLDetailsElement>('fallback');
  const lyricsInput = must<HTMLTextAreaElement>('lyrics-input');
  const readPasted = must<HTMLButtonElement>('read-pasted');

  const readingEl = must<HTMLElement>('reading');
  const nowReading = must<HTMLElement>('now-reading');
  const verdictEl = must<HTMLElement>('verdict');
  const systemName = must<HTMLElement>('system-name');
  const systemDescription = must<HTMLElement>('system-description');
  const notesEl = must<HTMLUListElement>('notes');
  const themesEl = must<HTMLUListElement>('themes');
  const metricsEl = must<HTMLElement>('metrics');
  const signatureEl = must<HTMLUListElement>('signature');

  const canvas = must<HTMLCanvasElement>('canvas');
  const frameEmpty = must<HTMLElement>('frame-empty');
  const progress = must<HTMLElement>('progress');
  const progressBar = must<HTMLElement>('progress-bar');
  const revariate = must<HTMLButtonElement>('revariate');
  const download = must<HTMLButtonElement>('download');
  const formatSelect = must<HTMLSelectElement>('format');
  const plate = must<HTMLElement>('plate');

  let subject: Subject | null = null;
  let activeRender: RenderHandle | null = null;
  let inFlight: AbortController | null = null;

  // ---------------------------------------------------------------- status

  function setStatus(message: string, tone: 'idle' | 'working' | 'error' = 'idle'): void {
    statusEl.textContent = message;
    statusEl.classList.toggle('working', tone === 'working');
    statusEl.classList.toggle('error', tone === 'error');
  }

  function setBusy(busy: boolean): void {
    interpretButton.disabled = busy;
    readPasted.disabled = busy;
    interpretButton.textContent = busy ? 'Reading…' : 'Interpret';
  }

  // ---------------------------------------------------------------- reading

  function renderThemes(analysis: SongAnalysis): void {
    themesEl.replaceChildren();
    const visible = analysis.themes.filter((t) => t.strength > 0.06).slice(0, 6);

    if (visible.length === 0) {
      const li = document.createElement('li');
      li.className = 'theme-hits';
      li.textContent = 'No thematic field registered strongly enough to name.';
      themesEl.append(li);
      return;
    }

    visible.forEach((theme, index) => {
      const li = document.createElement('li');
      li.className = index === 0 ? 'theme-row' : 'theme-row is-secondary';

      const head = document.createElement('div');
      head.className = 'theme-head';
      const name = document.createElement('span');
      name.className = 'theme-name';
      name.textContent = theme.label;
      const value = document.createElement('span');
      value.className = 'theme-value';
      value.textContent = `${Math.round(theme.strength * 100)}`;
      head.append(name, value);

      const track = document.createElement('div');
      track.className = 'theme-track';
      const fill = document.createElement('span');
      fill.className = 'theme-fill';
      fill.style.width = `${Math.round(theme.strength * 100)}%`;
      track.append(fill);

      li.append(head, track);

      if (theme.hits.length > 0) {
        const hits = document.createElement('div');
        hits.className = 'theme-hits';
        hits.textContent = theme.hits.slice(0, 6).join(' · ');
        li.append(hits);
      }

      themesEl.append(li);
    });
  }

  function renderMetrics(analysis: SongAnalysis, genome: ArtGenome): void {
    const entries: [string, string, string?][] = [
      ['Valence', analysis.valence.toFixed(2), analysis.valence >= 0 ? 'warm' : 'dark'],
      ['Energy', analysis.arousal.toFixed(2)],
      ['Repetition', `${Math.round(analysis.repetition * 100)}%`],
      ['Vocabulary', `${Math.round(analysis.diversity * 100)}%`],
      ['Rhyme', `${Math.round(analysis.rhyme * 100)}%`],
      ['Words', String(analysis.wordCount)],
      ['Lines', String(analysis.lineCount)],
      ['Hue', `${Math.round(genome.baseHue)}°`],
    ];

    metricsEl.replaceChildren();
    for (const [label, value, suffix] of entries) {
      const wrapper = document.createElement('div');
      wrapper.className = 'metric';
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      if (suffix) {
        const note = document.createElement('span');
        note.textContent = suffix;
        dd.append(note);
      }
      wrapper.append(dt, dd);
      metricsEl.append(wrapper);
    }
  }

  function renderReading(analysis: SongAnalysis, genome: ArtGenome, current: Subject): void {
    const reading = explain(analysis, genome);

    nowReading.replaceChildren();
    const label = document.createElement('strong');
    label.textContent = current.title;
    nowReading.append(label);
    if (current.attribution) {
      nowReading.append(document.createTextNode(` — ${current.attribution}`));
    }
    nowReading.append(document.createElement('br'));
    nowReading.append(document.createTextNode(current.sourceLabel));

    verdictEl.textContent = reading.verdict;
    systemName.textContent = reading.systemLabel;
    systemDescription.textContent = reading.systemDescription;

    notesEl.replaceChildren();
    for (const note of reading.notes) {
      const li = document.createElement('li');
      li.textContent = note;
      notesEl.append(li);
    }

    renderThemes(analysis);
    renderMetrics(analysis, genome);

    signatureEl.replaceChildren();
    for (const { word, count } of analysis.signature) {
      const li = document.createElement('li');
      li.textContent = word;
      const b = document.createElement('b');
      b.textContent = String(count);
      li.append(b);
      signatureEl.append(li);
    }

    readingEl.hidden = false;
  }

  // ---------------------------------------------------------------- canvas

  function paint(): void {
    if (!subject) return;

    activeRender?.cancel();

    const genome = interpret(subject.analysis, subject.variation);
    const format = FORMATS[(formatSelect.value as FormatKey)] ?? FORMATS.portrait;

    renderReading(subject.analysis, genome, subject);

    frameEmpty.hidden = true;
    progress.hidden = false;
    progressBar.style.width = '0%';
    canvas.classList.remove('is-visible');
    revariate.disabled = true;
    download.disabled = true;

    plate.replaceChildren();
    const plateTitle = document.createElement('strong');
    plateTitle.textContent = subject.title;
    plate.append(plateTitle);
    plate.append(
      document.createTextNode(
        ` · ${genome.system} · ${format.label} · seed ${genome.seed.toString(16)}` +
          (subject.variation > 0 ? ` · var ${subject.variation}` : ''),
      ),
    );

    activeRender = render(canvas, genome, {
      width: format.width,
      height: format.height,
      onProgress: (p) => {
        progressBar.style.width = `${Math.round(p * 100)}%`;
      },
    });

    canvas.classList.add('is-visible');

    void activeRender.done.then(() => {
      progress.hidden = true;
      revariate.disabled = false;
      download.disabled = false;
    });
  }

  /**
   * Entry point for both paths (fetched and pasted). Takes the raw text,
   * measures it, and hands off to the renderer — the text itself stops here.
   */
  function readLyrics(text: string, descriptor: Omit<Subject, 'analysis' | 'variation'>): boolean {
    const analysis = analyze(text);

    if (analysis.wordCount < 20) {
      setStatus(
        'That is too little text to interpret — the machine needs a full lyric sheet to measure.',
        'error',
      );
      return false;
    }

    subject = { ...descriptor, analysis, variation: 0 };
    paint();
    return true;
  }

  function describeSource(lyrics: LyricsResult, guess: TrackGuess | null): string {
    if (lyrics.source === 'pasted') return 'Read from pasted text';
    const matched =
      lyrics.matchedTrack && lyrics.matchedArtist
        ? `${lyrics.matchedTrack} — ${lyrics.matchedArtist}`
        : guess
          ? `${guess.track}${guess.artist ? ` — ${guess.artist}` : ''}`
          : 'match';
    return `Matched “${matched}” via ${lyrics.source}`;
  }

  function titleFor(meta: VideoMeta | null, guess: TrackGuess | null, lyrics: LyricsResult): string {
    if (lyrics.matchedTrack) return lyrics.matchedTrack;
    if (guess?.track) return guess.track;
    if (meta?.title) return meta.title;
    return 'Untitled';
  }

  // ---------------------------------------------------------------- events

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = urlInput.value.trim();
    if (!value) {
      setStatus('Paste a YouTube link first.', 'error');
      return;
    }

    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;

    setBusy(true);
    setStatus('Reading the video…', 'working');

    void acquire(value, {
      signal: controller.signal,
      onStatus: (message) => setStatus(message, 'working'),
    })
      .then((outcome) => {
        if (controller.signal.aborted) return;

        if (!outcome.ok) {
          // Failure is expected often enough that it needs to be a useful
          // state, not an error: show the trail and open the paste box.
          setStatus(outcome.reason, 'error');
          fallback.open = true;
          if (outcome.guess?.track) {
            lyricsInput.placeholder = `Paste the lyrics to “${outcome.guess.track}” here…`;
          }
          return;
        }

        const ok = readLyrics(outcome.lyrics.text, {
          title: titleFor(outcome.meta, outcome.guess, outcome.lyrics),
          attribution: outcome.lyrics.matchedArtist ?? outcome.guess?.artist ?? '',
          sourceLabel: describeSource(outcome.lyrics, outcome.guess),
        });
        if (ok) setStatus('Interpretation complete.');
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setStatus('Something went wrong reaching the lyric services. Try pasting the words instead.', 'error');
          fallback.open = true;
        }
      })
      .finally(() => {
        if (inFlight === controller) {
          inFlight = null;
          setBusy(false);
        }
      });
  });

  readPasted.addEventListener('click', () => {
    const text = lyricsInput.value.trim();
    if (!text) {
      setStatus('Paste some lyrics first.', 'error');
      return;
    }

    // If a link is also present, use it for the plate — it's the better title.
    const ref = urlInput.value.trim();
    const ok = readLyrics(text, {
      title: ref ? 'Pasted lyrics' : 'Untitled',
      attribution: '',
      sourceLabel: 'Read from pasted text',
    });
    if (ok) setStatus('Interpretation complete.');
  });

  revariate.addEventListener('click', () => {
    if (!subject) return;
    subject.variation += 1;
    paint();
  });

  formatSelect.addEventListener('change', () => {
    if (subject) paint();
  });

  download.addEventListener('click', () => {
    if (!subject) return;
    const safeName = subject.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'interpretation';

    canvas.toBlob((blob) => {
      if (!blob) {
        setStatus('The browser would not export this canvas.', 'error');
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${safeName}-${subject?.variation ?? 0}.png`;
      link.click();
      // Give the download a tick to start before releasing the blob.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  });
}
