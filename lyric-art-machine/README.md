# Interpretive Art Machine

Link a song. The machine reads its lyrics, listens to the audio if you give it
any, and paints an image derived entirely from what it found — then tells you why
it looks the way it does.

No API keys. No image models. No cost per render. Every mark on the canvas is
computed from the text.

## Just open it

**[`interpretive-art-machine.html`](interpretive-art-machine.html)** — one
self-contained file. Double-click it, or drag it into a browser tab. Nothing to
install, no server, no build step. It works offline apart from the lyric lookup,
which needs a connection like anything else that fetches from the internet.

That file is generated from `src/`, so the two can't drift apart:

```bash
npm install
npm run standalone   # regenerates interpretive-art-machine.html
```

### Or run it as a project

```bash
npm run dev      # http://localhost:5173, hot reload
npm run build    # static bundle in dist/ (~49 KB, 19 KB gzipped)
```

Use this if you want to edit the lexicons or add a visual system. `dist/` drops
onto any static host.

---

## How it works

```
YouTube link
   └─ oEmbed  ──────────────► video title + channel
        └─ title parsing ───► artist / track guess
             └─ LRCLIB ─────► lyrics ──┐
             └─ lyrics.ovh ─► lyrics ──┤
             └─ paste box ──► lyrics ──┤
                                       ▼
                                   analyze()      measurements
                                       ▼
                                  interpret()     visual genome + written reading
                                       ▼
                                   render()       canvas
```

### 1. Acquisition (`src/lyrics/`)

`youtube.ts` pulls the video id out of any YouTube URL shape (watch, `youtu.be`,
shorts, embed, music), then fetches the title and channel via YouTube's public
**oEmbed** endpoint — no key, no quota. Parsing a title into artist and track is
the fiddly part: it strips the usual decoration (`(Official Video)`, `[HD]`,
`- Topic`, remaster tags) and handles reversed `Title - Artist` ordering.

`providers.ts` then tries **LRCLIB** first (best hit rate, reports what it
matched, permissive CORS) and **lyrics.ovh** second. Every failure path returns a
reason rather than throwing, because failure is common and needs to be a useful
state rather than a dead end. When both miss, the UI opens the paste box and
shows the trail of what was tried.

### 2. Analysis (`src/analysis/`)

`lexicons.ts` is hand-authored vocabulary: valence and arousal weights, twelve
thematic fields (love, loss, defiance, transcendence, nature, night, motion,
body, memory, city, water, fire), explicit color words, and pronoun buckets.

`analyze.ts` produces a neutral description of the song and knows nothing about
drawing:

| Measurement | Meaning |
|---|---|
| `valence` | −1 bleak … +1 radiant |
| `arousal` | 0 still … 1 violent |
| `repetition` | share of repeated whole lines — the structural signature of a chorus |
| `diversity` | vocabulary breadth |
| `rhyme` | end-of-line sound agreement |
| `inquiry` | share of lines that ask something |
| `voice` | confessional / address / collective / observed |
| `namedHues` | colors the lyrics state outright |
| `themes` | strength of each thematic field |
| `fingerprint` | FNV-1a hash of the text |

Two details worth noting. Charged words are sparse, so a raw average overreacts
to a handful of hits — a **confidence factor** scales thin readings back toward
neutral. And theme hits use `1 + log2(count)`, so a hook repeated twenty times
registers as emphasis without drowning out everything else.

### 3. Hearing (`src/audio/`) — optional

**A browser cannot extract audio from a YouTube embed.** The player is
cross-origin, so its stream can never be routed into Web Audio. Hearing a song
therefore means one of two things:

- **Drop an audio file** — works in every browser, fully offline, analyzes the
  whole track at once. This is the reliable path.
- **"Listen to a tab"** — `getDisplayMedia` tab capture while the song plays.
  Chrome and Edge only; Safari's screen capture carries no audio and Firefox's
  tab audio is unreliable.

Captured audio is recorded and pushed through the *same* offline pipeline as a
dropped file, so there is one implementation of listening rather than a second,
weaker real-time one.

Everything is decoded at 22.05 kHz — musical features live well below that, and
halving the rate halves the FFT work. Analysis runs as a generator across
animation frames so a long track never freezes the page.

Extracted with a hand-rolled FFT (`fft.ts`):

| Feature | Method |
|---|---|
| `tempo` | spectral-flux onset envelope → autocorrelation, weighted by a preference centred on 120 BPM |
| `pulseClarity` | peak prominence of that autocorrelation, in standard deviations |
| `keyIndex` / `mode` | chroma vector correlated against all 24 rotated Krumhansl-Schmuckler profiles |
| `energy` / `dynamicRange` | frame RMS in dB, mean and spread |
| `brightness` | spectral centroid, log-scaled |
| `roughness` | spectral flatness — tonal vs noisy/distorted |
| `stereoWidth` | L/R correlation, measured before downmix |
| `sections` | smoothed novelty curve over timbre + chroma |
| `arc` | loudness envelope across the track, 64 points |

The tempo preference weighting matters: raw autocorrelation peaks just as
happily at half or double the real tempo. Hard-folding into a fixed range fixes
the common case but corrupts genuinely slow music — a 70 BPM track came back as
140 until this was replaced with log-domain weighting.

### 4. Interpretation (`src/analysis/interpret.ts`)

Measurements become a **genome** — system, hue, harmony, density, turbulence,
gravity, weight, symmetry, grain — and a **written reading** explaining each
decision. The dominant theme picks the visual system; everything else bends its
parameters:

A **style** is an engine crossed with a treatment.

**21 engines** decide where forms go. Four of them — Aurora, Nebula, Rose
Window, Veil — are *atmospheric*: they build light in a volume around a
subject (a centre, a horizon, a curtain) rather than making texture
everywhere. Those are the machine's first choice. The all-over field engines
still exist and are still selectable, but they carry a low `preference` and the
machine rarely reaches for them, because handsome texture is still a picture of
nothing in particular.

The rest are Current, Terrain, Swarm, Columns, Radiance, Spiral, Orbits,
Bloom, Strata, Weave, Moiré, Fracture, Shatter, Lattice, Growth,
Constellation and Drift.

**14 treatments** decide how a mark is realized — Ink, Cross-hatch, Engraving,
Stipple, Sketch, Woodcut, Blueprint, Risograph, Screenprint, Wash, Neon,
Halftone, and the two atmospheric ones, **Aura** and **Smoke**. Aura and Smoke
force a dark ground: light in a volume needs a dark volume, and on pale stock
the glow has nothing to burn against.

Most treatments are **luminous** — additive on dark grounds, multiply on pale.
That single flag is where depth comes from, since overlapping marks accumulate
into light rather than stacking flat. It is the difference between a picture
that glows and one that sits on the page. Treatments run in two stages: a geometry stage that rewrites marks
(fills become hatching, a sketch redraws every line three times, riso splits
into offset passes) and a raster finish the plotter path skips entirely.

That crossing gives close to 300 combinations. **104 are named and catalogued** in
`catalog.ts`, chosen because the pairing produces something the engine alone
does not — Growth under Woodcut is not Growth under Engraving. Each declares
thematic affinity plus preferred energy and grit, so the machine picks one on
its own; the whole catalogue is browsable from a picker, and screen-only styles
are labelled.

Colors named in the lyrics override the thematic default — if a song says gold,
the picture is gold. Hue averaging is circular, so red and violet don't average
to green.

**When audio is present, the division of labour is deliberate: the lyrics decide
what the song is *about*, and the audio decides how it *moves*.**

- Musical **key** sets hue around the circle of fifths, so related keys look related
- **Mode** moves emotional valence — major lifts, minor darkens — scaled by key confidence
- **Energy, tempo, and onset density** largely replace the lyric energy estimate, because audio is simply better evidence for how hard a song hits
- **Pulse clarity** becomes compositional symmetry; a metronomic track is a symmetrical one
- **Roughness** coarsens grain; **loudness with narrow dynamics** thickens every mark
- The **loudness arc** shapes where the canvas gets busy — quiet intros thin out, loud passages churn

Audio can also **overrule the lyrics' choice of system**: calm, nostalgic words
set against violent music produce Fracture rather than Strata, and the written
reading says so explicitly.

### 5. Rendering (`src/art/`)

**Engines never touch a canvas.** They emit vector marks into a scene; the
painter turns those into pixels. Raster effects still apply after
rasterization, so nothing is lost on screen — but the geometry that made the
picture exists as data, which is what makes plotter output real rather than a
bitmap trace.

Rendering runs in four stages, all spread across animation frames in 12 ms
slices so the canvas visibly fills: build geometry, apply the treatment, paint,
finish.

### 6. Export (`src/art/svg.ts`)

There are two genuinely different jobs here, and one file served neither well,
so **Download SVG** has a mode:

- **Artwork** — a faithful vector copy of what is on screen, for opening in
  Inkscape and taking apart by hand. Keeps the ground, per-mark colour, mark
  opacity, and renders glows as SVG radial gradients in their own layer. Delete
  the Ground and Glow layers before plotting.
- **Plot** — what a pen can honestly draw. No ground, no glows, no opacity,
  fills converted to hatching, one colour per pen layer.

Both are in millimetres, clipped to the page, simplified, and grouped into
named Inkscape layers.

Three things a pen cannot do are handled at export rather than left to you:

- **It cannot fill.** Regions become hatching in plot mode.
- **It cannot draw off the paper.** Marks bleed past the canvas edge by design, so every path is Cohen–Sutherland clipped to the page first.
- **It has no opacity.** A mark at 5% alpha is a glow on screen and a full-strength scribble on paper. Plot mode drops marks below a visibility threshold, and enforces a **total line-length budget** — some compositions are hundreds of full-width strokes, none of them faint, which opacity culling alone cannot bound. Over budget, the faintest marks go first, which thins the picture the way squinting at it would.

The **Detail** control sets all three: point density, the faintness threshold,
and the length budget. Coarse turns a two-hour plot into a twenty-minute one.

Paper is A5/A4/A3/Letter/200 mm square, auto-oriented and scaled uniformly
inside a 12 mm margin — never distorted to fill the sheet. Before exporting,
the interface reports what the file contains and, in plot mode, roughly how
long it will take to draw.

**All colours are written as hex.** Canvas is happy with CSS Color Level 4's
space-separated `hsl(H S% L%)`, but Inkscape's parser is not — it fails
silently, and every path becomes invisible while still occupying its bounding
box. Hex is the one notation everything understands.

Note that a Blueprint plot inverts: bright lines on a dark ground become dark
lines on white paper, because the paper is the paper.

All randomness comes from a seeded `mulberry32` PRNG — `Math.random` appears
nowhere in the art pipeline. **The same lyrics always produce the same artwork**,
on any device. "New variation" folds a counter into the seed, so re-rolls are
reproducible too.

---

## On lyrics and copyright

Fetched lyrics are held in memory only for as long as it takes to measure them.
They are **never rendered to the page, never written into the artwork, and never
persisted**. What you see is the interpretation — themes, measurements, and the
frequency of individual signature words — not a transcript. That was a design
decision, not a limitation: the output is the reading.

## Verified

Driven in headless Chromium against the production build:

- all seven systems route from theme and render non-trivial output
- identical text renders a byte-identical canvas twice over (determinism)
- "New variation" produces a genuinely different image
- malformed URLs fail with a useful message rather than an exception
- typecheck clean under `strict` plus `noUncheckedIndexedAccess`

The standalone single-file build was verified separately over `file://` — all
seven systems render identically, determinism holds, and PNG export produces a
full-resolution file.

**Audio analysis was checked against ground truth**, not just executed. Four
WAVs were synthesized with known tempo, key, and timbre and pushed through the
real interface:

| Fixture | Tempo | Key |
|---|---|---|
| A minor, 120 BPM | 120 ✓ | A minor ✓ |
| C major, 90 BPM, bright | 90 ✓ | C major ✓ |
| F major, 160 BPM, noisy | 160 ✓ | F major ✓ |
| D minor, 70 BPM, swelling | 70 ✓ | D minor ✓ |

Section counts correctly returned 1 for constant-timbre fixtures and 6 for the
one with a real loudness swell. The system override was verified end to end
(calm lyrics + violent audio → Fracture; calm lyrics + gentle audio → Strata
unchanged), as was the no-audio path, which is unaffected.

**All 76 styles were rendered** in headless Chromium: none fail, none render
flat, no page errors, median 232 ms. Visual review caught three real faults,
since fixed — stipple decimated points twice over and so erased short marks
entirely (two styles rendered nearly blank), weave allowed a mesh fine enough to
grey into flat tone, and moiré stacked too many faint layers to read as
interference.

**SVG export was validated structurally**, across five styles and all five paper
sizes: correct millimetre dimensions, stroke-only output with no fills, Inkscape
layers present, and every coordinate inside the page margin. Exports were then
rendered back in a browser and compared against the screen originals. That pass
caught a stale-state bug: the SVG button stayed live during a re-render, so an
export mid-render could hand back the *previous* piece's geometry.

**Not verified:** tab capture via `getDisplayMedia`, which needs a real user
granting a share prompt and cannot be driven headlessly. Its decode-and-analyze
tail is the same verified code the file path uses; the capture and permission
handling in front of it is the untested part. And no plot has been drawn on real
hardware — the SVG is correct by inspection and renders faithfully, but your
plotter is the final word.

**Not verified from the build sandbox:** live calls to YouTube oEmbed, LRCLIB,
and lyrics.ovh — outbound requests to those hosts are blocked here, so the
auto-fetch path was exercised through its parsing and error handling rather than
against the real services. It runs in the browser from the user's own machine, so
it isn't affected by that restriction, but the first real link is worth a test.
The paste path is fully exercised end to end.

## Layout

```
src/
  lyrics/     acquisition — youtube.ts, providers.ts, index.ts
  audio/      fft.ts, features.ts, decode.ts, live.ts, types.ts
  analysis/   tokenize.ts, lexicons.ts, analyze.ts, interpret.ts
  art/        geometry.ts, catalog.ts, treatments.ts, painter.ts,
              renderer.ts, svg.ts, color.ts, rng.ts, engines/×17
  ui/app.ts   controller
```
