# Interpretive Art Machine

Link a song. The machine reads its lyrics, measures what it finds, and paints an
image derived entirely from that reading — then tells you why it looks the way it does.

No API keys. No image models. No cost per render. Every mark on the canvas is
computed from the text.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static bundle in dist/
```

The build is a plain static site with no runtime dependencies (~49 KB, 19 KB gzipped).
Drop `dist/` on any static host.

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

### 3. Interpretation (`src/analysis/interpret.ts`)

Measurements become a **genome** — system, hue, harmony, density, turbulence,
gravity, weight, symmetry, grain — and a **written reading** explaining each
decision. The dominant theme picks the visual system; everything else bends its
parameters:

| Dominant field | System | What it does |
|---|---|---|
| motion, water | **Current** | particles traced through a noise field |
| transcendence, fire, love | **Radiance** | everything organized around a luminous center |
| memory, loss | **Strata** | horizontal bands, like sediment |
| defiance | **Fracture** | the plane broken and driven apart |
| night | **Constellation** | points of light, joined by faint lines |
| city | **Lattice** | a rigid grid made to carry something it wasn't built for |
| nature, body | **Growth** | branching forms grown until they run out of energy |

Colors named in the lyrics override the thematic default — if a song says gold,
the picture is gold. Hue averaging is circular, so red and violet don't average
to green.

### 4. Rendering (`src/art/`)

Systems are **generators** that yield progress, driven across animation frames in
12 ms slices, so the canvas visibly fills rather than appearing all at once. The
machine should look like it's working.

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
  analysis/   tokenize.ts, lexicons.ts, analyze.ts, interpret.ts
  art/        rng.ts, color.ts, renderer.ts, systems/×7
  ui/app.ts   controller
```
