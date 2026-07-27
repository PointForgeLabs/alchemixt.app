# Memento Mori

A generative memento mori plate generator that outputs clean single-stroke
vectors for a pen plotter. Lives at `/memento-mori/` — a static page with no
build step and no dependencies.

The skull is not traced artwork or a photograph. It is modelled in 3D, lit, and
then cut into line work.

## How it works

### 1. The skull is a signed distance field

`js/gl/shaders.js` builds the skull from roughly sixty anatomical primitives,
pinned to real landmark coordinates in millimetres — bregma, glabella, nasion,
gonion, porion, prosthion, gnathion. Model space is millimetres, origin on the
midline at the midpoint of the two orbital centres, +x to the subject's left,
+y up, +z anterior.

What is actually modelled, and why each piece exists:

| Structure | Construction |
|---|---|
| Cranial vault | Ellipsoid with a sheared frontal squama (receding forehead) and a drooping occiput, both via a C¹ smooth ramp so no crease shows |
| Upper facial mass | A rounded block; without it there is no bone at orbital height for the sockets to be carved from |
| Orbits | Shallow socket for a crisp rim, plus a deep cone behind it so they read as voids. The cone stays lateral of x = 19 so the interorbital pillar survives |
| Nasal aperture | Piriform opening, narrow under the nasal bones and flaring to the base, with a septum standing in it and a deeper chamber behind that stops short of the palate |
| Zygomatic arches | Thin elliptical-section blades bridging a genuinely excavated temporal fossa, so there is a real slot behind them |
| Teeth | 32 individually shaped and placed crowns — incisors with a chisel edge, pointed canines, cusped premolars and molars — on a shared elliptical arch, with wear and loss as parameters |
| Mandible | Alveolar arch, a body tube running from the symphysis to each gonial angle, ramus blade, coronoid process and condyle with the mandibular notch between; hinged about the condylar axis |
| Detail | Brow ridge, frontal eminences, mastoid processes, ear canals, infraorbital foramina, temporal line |

The field is raymarched into four floating-point render targets: depth and world
normal; lit luminance, ambient occlusion and two surface coordinates; region id,
curvature and facing ratio; and model-space hit position.

Shading is a wrapped-diffuse bone model with a soft-shadowed key, a sky fill, a
ground bounce, a broad low specular, and curvature-driven cavity darkening. The
occlusion sample radius reaches ~24 mm, which is what makes the sockets, the
nasal cavity and the temporal fossa read dark rather than mid-grey.

### 2. Line work is extracted from the buffers, not from a raster image

- **Contours** (`js/art/edges.js`) — a Canny pipeline over a composite of depth
  breaks, normal creases and region boundaries. Deliberately *not* over
  luminance: the lines that describe a form are geometric, and brightness edges
  move when you move the light.
- **Engraving** (`js/art/isolines.js`) — the primary strokes are isolines of a
  per-region surface parameterisation, so they wrap the cranium as parallels,
  ring the orbits concentrically, sweep down the cheek as meridians, drive back
  into the nasal aperture, and run vertically over each tooth crown. Cells
  spanning two regions or a silhouette are refused; where the surface turns away
  and lines would crowd past the pen's resolution, levels are dropped by a
  dithered parity so density thins out raggedly instead of along a straight seam.
- **Tone** (`js/art/hatch.js`) — a pen has one width, so tone can only come from
  coverage. Four passes each own a window of the tonal range, and every stroke is
  walked and broken into dashes whose duty cycle tracks the local ink demand.
  Light areas become sparse ticks, mid-tones broken lines, darks solid — the way
  an engraver builds a ramp with a single burin.
- **Sutures and cracks** (`js/art/features.js`) — traced as zero sets of scalar
  functions of the *model-space* position the raymarch hands back. Sagittal,
  coronal, lambdoid, squamosal, zygomaticomaxillary, temporozygomatic and
  internasal seams, each interdigitated with two octaves of noise. Because they
  are traced in model space, they wrap the form correctly and occlusion is free:
  only visible surface points exist in the buffer.
- **Stipple** (`js/art/stipple.js`) — dart throwing with a rejection radius
  proportional to 1/√ink, which is the relationship that makes a stipple read as
  an even ramp rather than as clumps.

### 3. Output

`js/plot/` welds strokes that share endpoints, reorders them by
nearest-neighbour with free path reversal, then runs windowed 2-opt and or-opt
passes to shorten pen-up travel. Then:

- **SVG** — real millimetres with a matching `viewBox`, one Inkscape layer per
  pass, named `1-Contour`, `2-Sutures & cracks` and so on. The AxiDraw extension
  reads that leading number for per-layer pen height and speed.
- **G-code** — `G21`/`G90`, Z-lift or M280 servo, per-layer comments, origin at
  bottom-left.
- **HPGL** — `IN`/`SP`/`PU`/`PD`, one pen per layer.
- **PNG proof** — the preview, or the underlying 3D render if you would rather
  trace or halftone it yourself.

Every plate is a pure function of its seed and settings. The **Link** button
encodes the entire state into the URL, so a plate you liked can always be
brought back exactly.

## Plotting notes

- Set **Pen width** to your actual pen and keep **Engraving pitch** at roughly
  2–3× it. Tighter and the passes merge into solid black on paper even though the
  preview looks fine.
- **Layers → Split by tone** gives a three-pen plate: line and detail, engraving,
  shading.
- **Render detail** drives the raster resolution feeding the extractor. The
  default is tuned for ~3.4 pixels per line pitch; raise it for large paper.
- Check **Travel** to see the pen-up moves before committing an hour of plotting
  to a bad ordering.

## Development

```
node dev/shoot.mjs probe out/           # G-buffer inspection sheet
node dev/shoot.mjs probe out/ '{"yaw":-90,"erosion":0}'
node dev/shoot.mjs plate out/ '{"page":"a5"}'   # full plate, PNG + SVG
node dev/sweep.mjs presets             # every style preset
node dev/sweep.mjs layouts             # frames, vignettes, motifs
node dev/sweep.mjs ui                  # the app shell
node dev/targets.mjs                   # all 18 render-target configurations
node dev/tiling.mjs                    # tiled vs untiled, byte for byte
node dev/contextloss.mjs               # driver-reset diagnosis and recovery
node dev/regression.mjs                # allocations that stop working mid-render
node dev/checks.mjs                    # 19 awkward parameter combinations
node dev/bundle.mjs out.html           # single-file build for file://
```

The probe sheet renders the raw G-buffer — luminance, normal, depth, region,
form field, occlusion — side by side, which is the fastest way to see whether an
anatomy change did what you intended before the line stage hides it.

Renders run on the GPU in a normal browser. Under headless SwiftShader expect
several seconds for a small raster; use `renderScale` around 0.4–0.5 when
iterating.

## Layout

```
index.html            page shell
css/app.css
js/params.js          the parameter schema — single source of truth
js/ui.js              panel built from the schema, URL state
js/main.js            render scheduling, exports
js/preview.js         pen-simulated canvas preview
js/rng.js             seeded PRNG and noise
js/geom.js            polyline geometry: clip, simplify, chain, resample
js/gl/shaders.js      the skull SDF and the raymarch pass
js/gl/renderer.js     WebGL2 host, banded rendering, camera
js/art/fields.js      G-buffer sampling and the tone model
js/art/isolines.js    marching-squares tracer for engraving
js/art/edges.js       contour extraction
js/art/features.js    sutures and cracks
js/art/hatch.js       tonal modulation, straight hatch
js/art/stipple.js     weighted stippling
js/art/strokefont.js  single-stroke engraving roman
js/art/ornament.js    frames, vignettes, botanicals, motifs
js/art/compose.js     assembles the plate
js/plot/optimize.js   travel optimisation and statistics
js/plot/exporters.js  SVG, G-code, HPGL
dev/                  headless render harnesses
```

## Requirements

WebGL2 with `EXT_color_buffer_float` (or `EXT_color_buffer_half_float`). That
covers current desktop and mobile browsers; the app reports a clear error rather
than degrading if it is missing.

### Driver watchdogs

The raymarch is expensive per pixel, and an operating system will reset the GPU
driver if a single draw call runs too long — about two seconds on Windows (TDR).
That would be survivable except for one trap: **once the context is lost,
`checkFramebufferStatus` returns `FRAMEBUFFER_UNSUPPORTED` for every check, at
every size and every format.** A driver reset is therefore indistinguishable from
an unsupported pixel format unless `isContextLost()` is consulted, and it will
happily send you looking for a formats problem that does not exist.

So the renderer:

- caps the pixels in one draw (`DEFAULT_TILE_PIXELS`), tiling the raster in
  columns as well as bands, and calibrates that budget from a measured tile to
  target ~120 ms per draw;
- checks `isContextLost()` before blaming the framebuffer configuration;
- rebuilds itself once and retries when the context is lost, halving the tile
  budget, rather than surfacing a dead renderer;
- searches tile sizes with a descending ladder rather than a bisection, because
  a bisection assumes one monotonic size threshold and can conclude nothing works
  while never trying sizes that do;
- grows the budget by at most 2× at a time, and falls back to the last tile size
  that actually drew if a larger one is refused — allocations really do stop
  succeeding part-way through a render, and growth must never break a render that
  was already working.

`dev/regression.mjs` reproduces that last signature directly: allocation that
succeeds and is then refused, which is the failure mode a naive "find the limit
once" search cannot survive.

The stats panel shows the active configuration and tile size. If you see a driver
reset repeatedly, lower **Render detail** or raise **Engraving pitch** — both cut
the per-plate pixel count.

`dev/contextloss.mjs` forces a real context loss with `WEBGL_lose_context` and
asserts both the diagnosis and the recovery, because this failure mode is
otherwise impossible to test on hardware that never trips its watchdog.
