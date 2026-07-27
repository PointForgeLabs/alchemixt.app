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
import { render, type RenderHandle, type RenderResult } from '../art/renderer';
import { DEFAULT_PLOT_OPTIONS, toPlotterSvg, type PaperKey } from '../art/svg';
import { STYLES } from '../art/catalog';
import { ENGINE_BY_KEY } from '../art/engines';
import { TREATMENT_BY_KEY } from '../art/treatments';
import { decodeBlob, decodeFile } from '../audio/decode';
import { extractFeatures } from '../audio/features';
import { captureTabAudio, tabCaptureSupported, type CaptureSession } from '../audio/live';
import type { AudioFeatures } from '../audio/types';

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

/**
 * Drives a generator-based analysis across animation frames, so a long track
 * doesn't lock the page while it's being listened to.
 */
function runProgressively<T>(
  iterator: Generator<{ progress: number; stage: string }, T, unknown>,
  onProgress: (progress: number, stage: string) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const step = (): void => {
      try {
        const deadline = performance.now() + 14;
        let result = iterator.next();
        while (!result.done && performance.now() < deadline) {
          result = iterator.next();
        }
        if (result.done) {
          resolve(result.value);
          return;
        }
        onProgress(result.value.progress, result.value.stage);
        requestAnimationFrame(step);
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Audio analysis failed.'));
      }
    };
    requestAnimationFrame(step);
  });
}

export function mountApp(): void {
  const form = must<HTMLFormElement>('intake-form');
  const urlInput = must<HTMLInputElement>('url-input');
  const interpretButton = must<HTMLButtonElement>('interpret-button');
  const statusEl = must<HTMLParagraphElement>('status');
  const fallback = must<HTMLDetailsElement>('fallback');
  const lyricsInput = must<HTMLTextAreaElement>('lyrics-input');
  const readPasted = must<HTMLButtonElement>('read-pasted');

  const dropZone = must<HTMLElement>('drop-zone');
  const audioInput = must<HTMLInputElement>('audio-input');
  const chooseAudio = must<HTMLButtonElement>('choose-audio');
  const listenTab = must<HTMLButtonElement>('listen-tab');
  const audioStatus = must<HTMLParagraphElement>('audio-status');
  const audioProgress = must<HTMLElement>('audio-progress');
  const audioProgressBar = must<HTMLElement>('audio-progress-bar');
  const heardBlock = must<HTMLElement>('heard-block');
  const audioMetrics = must<HTMLElement>('audio-metrics');
  const heardNotes = must<HTMLUListElement>('heard-notes');

  const readingEl = must<HTMLElement>('reading');
  const nowReading = must<HTMLElement>('now-reading');
  const verdictEl = must<HTMLElement>('verdict');
  const systemName = must<HTMLElement>('system-name');
  const systemDescription = must<HTMLElement>('system-description');
  const treatmentName = must<HTMLElement>('treatment-name');
  const treatmentDescription = must<HTMLElement>('treatment-description');
  const plotFlag = must<HTMLElement>('plot-flag');
  const styleSelect = must<HTMLSelectElement>('style-select');
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
  const downloadSvg = must<HTMLButtonElement>('download-svg');
  const paperSelect = must<HTMLSelectElement>('paper-select');
  const detailSelect = must<HTMLSelectElement>('detail-select');
  const plotStats = must<HTMLElement>('plot-stats');
  const formatSelect = must<HTMLSelectElement>('format');
  const plate = must<HTMLElement>('plate');

  let subject: Subject | null = null;
  let activeRender: RenderHandle | null = null;
  let inFlight: AbortController | null = null;
  /** Persists across songs: audio, once heard, keeps informing the picture. */
  let audio: AudioFeatures | null = null;
  let capture: CaptureSession | null = null;
  /** Geometry from the most recent render — what the plotter would draw. */
  let lastRender: RenderResult | null = null;

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

  function renderAudioPanel(features: AudioFeatures | null, reading: ReturnType<typeof explain>): void {
    if (!features) {
      heardBlock.hidden = true;
      return;
    }

    const entries: [string, string, string?][] = [
      ['Tempo', features.tempo > 0 ? String(Math.round(features.tempo)) : '—', features.tempo > 0 ? 'bpm' : undefined],
      ['Key', features.keyConfidence > 0.28 ? features.keyName : 'unsettled'],
      ['Loudness', `${Math.round(features.energy * 100)}%`],
      ['Dynamics', `${Math.round(features.dynamicRange * 100)}%`],
      ['Brightness', `${Math.round(features.brightness * 100)}%`],
      ['Roughness', `${Math.round(features.roughness * 100)}%`],
      ['Pulse', `${Math.round(features.pulseClarity * 100)}%`],
      ['Sections', String(features.sections)],
    ];

    audioMetrics.replaceChildren();
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
      audioMetrics.append(wrapper);
    }

    heardNotes.replaceChildren();
    for (const note of reading.heardNotes) {
      const li = document.createElement('li');
      li.textContent = note;
      heardNotes.append(li);
    }

    heardBlock.hidden = false;
  }

  function renderReading(analysis: SongAnalysis, genome: ArtGenome, current: Subject): void {
    const reading = explain(analysis, genome, audio);

    nowReading.replaceChildren();
    const label = document.createElement('strong');
    label.textContent = current.title;
    nowReading.append(label);
    if (current.attribution) {
      nowReading.append(document.createTextNode(` — ${current.attribution}`));
    }
    nowReading.append(document.createElement('br'));
    nowReading.append(document.createTextNode(current.sourceLabel));
    if (audio) {
      nowReading.append(document.createElement('br'));
      nowReading.append(
        document.createTextNode(
          `Heard ${Math.round(audio.duration)}s of audio via ${audio.source === 'tab' ? 'tab capture' : 'file'}`,
        ),
      );
    }

    verdictEl.textContent = reading.verdict;
    systemName.textContent = reading.styleLabel;
    systemDescription.textContent = reading.systemDescription;
    treatmentName.textContent = reading.treatmentLabel;
    treatmentDescription.textContent = reading.treatmentDescription;
    plotFlag.textContent = reading.plottable
      ? 'Plotter-safe — this style is drawn entirely in strokes.'
      : 'Screen only — this style depends on glow or screening a pen cannot draw.';
    plotFlag.classList.toggle('is-plottable', reading.plottable);

    notesEl.replaceChildren();
    for (const note of reading.notes) {
      const li = document.createElement('li');
      li.textContent = note;
      notesEl.append(li);
    }

    renderAudioPanel(audio, reading);
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

    const genome = interpret(subject.analysis, audio, subject.variation, styleSelect.value || undefined);
    const format = FORMATS[(formatSelect.value as FormatKey)] ?? FORMATS.portrait;

    renderReading(subject.analysis, genome, subject);

    frameEmpty.hidden = true;
    progress.hidden = false;
    progressBar.style.width = '0%';
    canvas.classList.remove('is-visible');
    revariate.disabled = true;
    download.disabled = true;
    // Both exports must go dead for the duration of the render, or a click
    // mid-render would hand back the previous piece's geometry.
    downloadSvg.disabled = true;
    lastRender = null;
    plotStats.textContent = '';

    plate.replaceChildren();
    const plateTitle = document.createElement('strong');
    plateTitle.textContent = subject.title;
    plate.append(plateTitle);
    plate.append(
      document.createTextNode(
        ` · ${genome.style} · ${format.label} · ${genome.heard ? 'heard + read' : 'read only'}` +
          ` · seed ${genome.seed.toString(16)}` +
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

    void activeRender.done.then((result) => {
      lastRender = result;
      progress.hidden = true;
      revariate.disabled = false;
      download.disabled = false;
      downloadSvg.disabled = false;
      styleSelect.disabled = false;
      describePlot();
    }).catch((error: unknown) => {
      progress.hidden = true;
      setStatus(error instanceof Error ? error.message : 'Rendering failed.', 'error');
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

  // ---------------------------------------------------------------- styles

  // Grouped by engine so the list reads as a catalogue rather than 76 flat rows.
  {
    const byEngine = new Map<string, typeof STYLES>();
    for (const style of STYLES) {
      const bucket = byEngine.get(style.engine) ?? [];
      bucket.push(style);
      byEngine.set(style.engine, bucket);
    }
    for (const [engineKey, styles] of byEngine) {
      const group = document.createElement('optgroup');
      group.label = ENGINE_BY_KEY.get(engineKey)?.label ?? engineKey;
      for (const style of styles) {
        const option = document.createElement('option');
        option.value = style.key;
        const treatment = TREATMENT_BY_KEY.get(style.treatment);
        // Mark screen-only styles so the plotter case is obvious at a glance.
        option.textContent = `${style.name} · ${treatment?.label ?? style.treatment}${
          treatment?.plottable ? '' : ' (screen)'
        }`;
        group.append(option);
      }
      styleSelect.append(group);
    }
  }

  styleSelect.addEventListener('change', () => {
    if (subject) paint();
  });

  // ---------------------------------------------------------------- audio

  function setAudioStatus(message: string, tone: 'idle' | 'working' | 'error' = 'idle'): void {
    audioStatus.textContent = message;
    audioStatus.classList.toggle('working', tone === 'working');
    audioStatus.classList.toggle('error', tone === 'error');
  }

  function setAudioBusy(busy: boolean): void {
    chooseAudio.disabled = busy;
    if (busy) listenTab.disabled = true;
    else listenTab.disabled = !tabCaptureSupported();
    audioProgress.hidden = !busy;
    if (busy) audioProgressBar.style.width = '0%';
  }

  /** Shared tail of both audio paths: analyze, store, and repaint if we can. */
  async function ingestAudio(buffer: AudioBuffer, source: 'file' | 'tab'): Promise<void> {
    const features = await runProgressively(extractFeatures(buffer, source), (progress, stage) => {
      audioProgressBar.style.width = `${Math.round(progress * 100)}%`;
      setAudioStatus(`${stage}…`, 'working');
    });

    audio = features;
    setAudioStatus(
      `Heard ${Math.round(features.duration)}s${features.tempo > 0 ? ` · ${Math.round(features.tempo)} BPM` : ''}` +
        `${features.keyConfidence > 0.28 ? ` · ${features.keyName}` : ''}. ` +
        (subject ? 'Repainting with sound.' : 'Now add a song link or lyrics.'),
    );

    // Audio alone can't make a picture — the lyrics choose the visual system.
    if (subject) paint();
  }

  function handleAudioError(error: unknown): void {
    const message = error instanceof Error ? error.message : 'Could not read that audio.';
    setAudioStatus(message, 'error');
  }

  async function ingestFile(file: File): Promise<void> {
    setAudioBusy(true);
    setAudioStatus('Decoding…', 'working');
    try {
      const buffer = await decodeFile(file);
      await ingestAudio(buffer, 'file');
    } catch (error) {
      handleAudioError(error);
    } finally {
      setAudioBusy(false);
    }
  }

  chooseAudio.addEventListener('click', () => audioInput.click());

  audioInput.addEventListener('change', () => {
    const file = audioInput.files?.[0];
    if (file) void ingestFile(file);
    // Reset so choosing the same file twice still fires a change event.
    audioInput.value = '';
  });

  for (const eventName of ['dragenter', 'dragover'] as const) {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.add('is-dragging');
    });
  }
  for (const eventName of ['dragleave', 'dragend'] as const) {
    dropZone.addEventListener(eventName, () => dropZone.classList.remove('is-dragging'));
  }
  dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropZone.classList.remove('is-dragging');
    const file = event.dataTransfer?.files?.[0];
    if (file) void ingestFile(file);
  });

  // The browser blocks navigation-by-drop only inside the zone, so stop the
  // page from replacing itself when a file lands anywhere else.
  window.addEventListener('dragover', (event) => event.preventDefault());
  window.addEventListener('drop', (event) => event.preventDefault());

  listenTab.disabled = !tabCaptureSupported();
  if (!tabCaptureSupported()) {
    listenTab.title = 'Tab audio capture needs Chrome or Edge.';
  }

  listenTab.addEventListener('click', () => {
    // Second click stops an in-progress capture.
    if (capture) {
      capture.stop();
      capture = null;
      listenTab.textContent = 'Listen to a tab';
      setAudioStatus('Finishing the recording…', 'working');
      return;
    }

    void (async () => {
      try {
        const session = await captureTabAudio();
        capture = session;
        listenTab.textContent = 'Stop listening';
        setAudioStatus('Listening — play the song, then press stop.', 'working');

        session.onEnded(() => {
          capture = null;
          listenTab.textContent = 'Listen to a tab';
        });

        const blob = await session.result;
        capture = null;
        listenTab.textContent = 'Listen to a tab';

        setAudioBusy(true);
        setAudioStatus('Decoding what it heard…', 'working');
        const buffer = await decodeBlob(blob);
        await ingestAudio(buffer, 'tab');
      } catch (error) {
        capture = null;
        listenTab.textContent = 'Listen to a tab';
        handleAudioError(error);
      } finally {
        setAudioBusy(false);
      }
    })();
  });

  // ---------------------------------------------------------------- plotting

  function currentPlotOptions() {
    return {
      ...DEFAULT_PLOT_OPTIONS,
      paper: paperSelect.value as PaperKey,
      tolerance: Number(detailSelect.value) || DEFAULT_PLOT_OPTIONS.tolerance,
    };
  }

  function buildPlot(): { svg: string; summary: string } | null {
    if (!lastRender) return null;
    const format = FORMATS[(formatSelect.value as FormatKey)] ?? FORMATS.portrait;
    const { svg, stats } = toPlotterSvg(
      lastRender.marks,
      format.width,
      format.height,
      lastRender.palette,
      currentPlotOptions(),
      `${subject?.title ?? 'Untitled'} — ${lastRender.style.name}`,
    );

    const minutes = stats.estimatedMinutes;
    const time = minutes < 1
      ? 'under a minute'
      : minutes < 90
        ? `~${Math.round(minutes)} min`
        : `~${(minutes / 60).toFixed(1)} hr`;

    const summary =
      `${stats.paths.toLocaleString()} paths · ${stats.pens} pen${stats.pens === 1 ? '' : 's'} · ` +
      `${stats.drawLength.toFixed(1)} m of line · ${time} to plot` +
      (stats.dropped > 0 ? ` · ${stats.dropped.toLocaleString()} specks dropped` : '');

    return { svg, summary };
  }

  /** Shows what a plot would cost without making the user export to find out. */
  function describePlot(): void {
    const plot = buildPlot();
    if (!plot) {
      plotStats.textContent = '';
      return;
    }
    const warning = lastRender && !lastRender.treatment.plottable
      ? ' — this style is screen-only, so the plot will be its line skeleton without the glow or screening'
      : '';
    plotStats.textContent = `Plot: ${plot.summary}${warning}`;
  }

  for (const control of [paperSelect, detailSelect]) {
    control.addEventListener('change', describePlot);
  }

  downloadSvg.addEventListener('click', () => {
    const plot = buildPlot();
    if (!plot) return;
    const name = (subject?.title ?? 'interpretation')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'interpretation';

    const blob = new Blob([plot.svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}-${lastRender?.style.key ?? 'plot'}.svg`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
