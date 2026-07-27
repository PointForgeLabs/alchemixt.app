// WebGL2 host for the raymarch pass. Renders the skull into float render targets
// and hands the CPU a set of Float32 fields.
//
// Almost everything below the drawing itself exists because GPU drivers disagree
// about what they will accept. The render-target format, the number of
// attachments, how their storage is allocated, and how many pixels may be drawn
// in one call are all negotiated at runtime rather than assumed -- see
// TARGET_CONFIGS and DEFAULT_TILE_PIXELS. The single nastiest trap is that a lost
// context reports FRAMEBUFFER_UNSUPPORTED for every framebuffer check, which is
// indistinguishable from an unsupported pixel format unless isContextLost() is
// consulted first.

import { VERT_SRC, buildFragSrc } from './shaders.js';

/* -------------------------------------------------------------- camera --- */

function mul3(a, b) {
  // Row-major 3x3 multiply, a then b applied as (a * b).
  const o = new Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return o;
}

const rad = (d) => (d * Math.PI) / 180;

/** Model -> world rotation, row-major, applied as Rz(roll) * Rx(pitch) * Ry(yaw). */
export function buildRotation(yawDeg, pitchDeg, rollDeg) {
  const cy = Math.cos(rad(yawDeg)), sy = Math.sin(rad(yawDeg));
  const cx = Math.cos(rad(pitchDeg)), sx = Math.sin(rad(pitchDeg));
  const cz = Math.cos(rad(rollDeg)), sz = Math.sin(rad(rollDeg));
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const Rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  const Rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  return mul3(Rz, mul3(Rx, Ry));
}

/**
 * The camera the shader reconstructs per pixel, mirrored on the CPU so 3D
 * feature curves (sutures, cracks) project to exactly the same pixels.
 */
export function makeCamera({ width, height, framingMm, perspective, targetY = -14 }) {
  const dist = 420 + (1 - perspective) * 2100;
  const focal = (2 * dist) / Math.max(framingMm, 1);   // 1 / tan(fovY/2)
  const aspect = width / height;
  const pos = [0, targetY, dist];
  const fwd = [0, 0, -1], right = [1, 0, 0], up = [0, 1, 0];
  return {
    pos, fwd, right, up, focal, aspect, dist, width, height,
    near: Math.max(dist - 320, 1),
    far: dist + 320,
  };
}

/** Project a world-space point to CPU pixel coordinates (row 0 = top). */
export function projectWorld(cam, wp) {
  const vx = wp[0] - cam.pos[0], vy = wp[1] - cam.pos[1], vz = wp[2] - cam.pos[2];
  const z = vx * cam.fwd[0] + vy * cam.fwd[1] + vz * cam.fwd[2];
  if (z <= 1e-3) return null;
  const rx = vx * cam.right[0] + vy * cam.right[1] + vz * cam.right[2];
  const ry = vx * cam.up[0] + vy * cam.up[1] + vz * cam.up[2];
  const scx = (cam.focal * rx) / (cam.aspect * z);
  const scy = (cam.focal * ry) / z;
  return {
    x: ((scx + 1) / 2) * cam.width,
    y: (1 - (scy + 1) / 2) * cam.height,
    t: Math.hypot(vx, vy, vz),
  };
}

export function rotateModelToWorld(rot, p) {
  return [
    rot[0] * p[0] + rot[1] * p[1] + rot[2] * p[2],
    rot[3] * p[0] + rot[4] * p[1] + rot[5] * p[2],
    rot[6] * p[0] + rot[7] * p[1] + rot[8] * p[2],
  ];
}

/* ------------------------------------------------------------ renderer --- */

const UNIFORM_NAMES = [
  'uCraniumW', 'uCraniumH', 'uCraniumL', 'uBrow', 'uCheek', 'uJawWidth', 'uJawDrop',
  'uJawPresent', 'uNasalW', 'uNasalH', 'uOrbitSize', 'uOrbitDepth', 'uTeethMissing',
  'uTeethWear', 'uErosion', 'uAsymmetry', 'uSeed', 'uModelToWorld', 'uCamPos',
  'uCamRight', 'uCamUp', 'uCamFwd', 'uFocal', 'uAspect', 'uResolution', 'uTileOrigin',
  'uLightDir', 'uLightSoft', 'uFill', 'uRim', 'uAoStrength', 'uShadow', 'uExposure',
  'uContrast', 'uGammaP', 'uCavity', 'uNear', 'uFar',
];

/**
 * Render-target configurations, tried in order.
 *
 * The shader writes four outputs, and there is no single allocation recipe that
 * every driver accepts. Real GPUs return FRAMEBUFFER_UNSUPPORTED (0x8CDD) for
 * combinations they advertise as supported, so three independent axes are all
 * treated as negotiable:
 *
 *  storage     Renderbuffers first. These attachments are only ever drawn to and
 *              read back with readPixels -- never sampled -- so a renderbuffer is
 *              both the correct choice and the one with the fewest completeness
 *              rules attached to it. Immutable (texStorage2D) and mutable
 *              (texImage2D) textures follow, because some drivers reject one
 *              float path while accepting the other.
 *  format      RGBA32F before RGBA16F. Half-float quantises the surface
 *              parameterisation -- a couple of hundred millimetres of arc length --
 *              to roughly an eighth of a millimetre, a visible fraction of the
 *              engraving pitch.
 *  attachments Four at once, or two with the shader run twice (outputs 0-1 then
 *              2-3). Halves the attachment pressure; costs a second march.
 */
/**
 * Pixels allowed in a single draw call.
 *
 * This is the defence against a driver watchdog reset. Windows gives a draw call
 * about two seconds before it resets the GPU (TDR); a lost context then reports
 * FRAMEBUFFER_UNSUPPORTED for every framebuffer check at every size, which looks
 * exactly like an unsupported format and is why this took so long to find. One
 * full-width band of a large plate is ~90k pixels of extremely heavy raymarching
 * -- comfortably over budget on integrated graphics. The renderer starts
 * conservatively and calibrates upward from a measured tile.
 */
const DEFAULT_TILE_PIXELS = 8192;       // e.g. 128 x 64 -- deliberately timid
const MAX_TILE_PIXELS = 262144;
// Allocated once and never changed; the effective tile lives inside it.
const ALLOC_TILE_PIXELS = 32768;
const TARGET_TILE_MS = 120;             // well inside any watchdog budget

function contextLostError() {
  return new Error(
    'The GPU driver reset and the WebGL context was lost.\n\n' +
    'This usually means a single draw call ran long enough for the operating ' +
    'system to restart the graphics driver. The renderer has reduced its tile ' +
    'size; press Render again and it will retry with smaller draws.\n\n' +
    'If it keeps happening, lower "Render detail" or raise "Engraving pitch".'
  );
}

const STORAGE_KINDS = [
  { id: 'RB', label: 'renderbuffer' },
  { id: 'TS', label: 'texStorage' },
  { id: 'TI', label: 'texImage' },
];

const TARGET_CONFIGS = [];
for (const float of [true, false]) {
  for (const { attachments, passes } of [
    { attachments: 4, passes: 1 }, { attachments: 2, passes: 2 }, { attachments: 1, passes: 4 },
  ]) {
    for (const storage of STORAGE_KINDS) {
      TARGET_CONFIGS.push({
        float, attachments, passes, storage: storage.id,
        id: `${attachments} × RGBA${float ? 32 : 16}F` +
            `${passes > 1 ? `, ${passes} passes` : ''} (${storage.label})`,
        short: `${storage.id}/${float ? 32 : 16}F/${attachments}x${passes}`,
      });
    }
  }
}

export class SkullRenderer {
  constructor(opts = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 8;
    this.canvas.height = 8;
    const gl = this.canvas.getContext('webgl2', {
      antialias: false, depth: false, stencil: false,
      preserveDrawingBuffer: false, powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is required. Try a current desktop browser.');
    this.gl = gl;

    // A driver reset (Windows TDR, typically) loses the context. Calling
    // preventDefault lets the browser restore it, but every GL object is gone,
    // so the app discards this renderer and builds a fresh one.
    this.contextLost = false;
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
    }, false);

    this.floatExt = gl.getExtension('EXT_color_buffer_float');
    this.halfExt = gl.getExtension('EXT_color_buffer_half_float');
    if (!this.floatExt && !this.halfExt) {
      throw new Error('Floating-point render targets are required (EXT_color_buffer_float).');
    }

    const maxDraw = gl.getParameter(gl.MAX_DRAW_BUFFERS);
    const maxColour = gl.getParameter(gl.MAX_COLOR_ATTACHMENTS);
    this.configs = TARGET_CONFIGS.filter((c) => {
      if (c.float && !this.floatExt) return false;
      // Two-pass mode addresses attachment points 2 and 3 on its second pass.
      return c.passes * c.attachments <= Math.min(maxDraw, maxColour);
    });
    if (!this.configs.length) {
      throw new Error(
        `This GPU exposes only ${maxDraw} draw buffers and ${maxColour} colour ` +
        `attachments, which is below what WebGL2 guarantees.`
      );
    }
    // Setting window.__MM_TARGETS to a configuration index starts the ladder
    // lower down, which is the only way to exercise the fallbacks on a GPU that
    // happily accepts the first one.
    const forced = Number(globalThis.__MM_TARGETS);
    this.startIndex = Number.isInteger(forced) && forced >= 0 && forced < this.configs.length
      ? forced : 0;
    this.configIndex = this.startIndex;
    this.config = null;
    this.alloc = null;
    this.tilePixels = Math.max(4096, Number(opts.tileBudget) || DEFAULT_TILE_PIXELS);
    this.debugInfo = this._describeGpu();

    this.program = this._buildProgram();
    this.loc = {};
    for (const n of UNIFORM_NAMES) this.loc[n] = gl.getUniformLocation(this.program, n);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.fbos = [];
    this.textures = [];
    this.renderbuffers = [];
    this.drawLists = [];
    this.tileW = 0;
    this.tileH = 0;

    // Probe the whole matrix small and cheap, before anything depends on it.
    // Configurations the driver refuses at 64x64 are dropped, so the first real
    // render does not waste attempts on them; the record is kept either way,
    // because "refused at every size" and "refused only when large" are
    // different faults and the error message should be able to tell them apart.
    this.probe = this._probeMatrix(64, 64);
    const viable = this.configs.filter((c) => this.probe[c.short] === 'ok');
    if (viable.length) this.configs = viable;
    this.startIndex = Math.min(this.startIndex, this.configs.length - 1);
    this.configIndex = this.startIndex;

    // Claim the render targets now, while allocation demonstrably works, and
    // never reallocate them again.
    this._allocateOnce();
  }

  _probeMatrix(w, h) {
    const gl = this.gl;
    const out = {};
    for (const cfg of this.configs) {
      let status;
      try {
        status = this._tryBuild(cfg, w, h);
      } catch (err) {
        status = -1;
      }
      while (gl.getError() !== gl.NO_ERROR) { /* drain */ }
      out[cfg.short] = status === gl.FRAMEBUFFER_COMPLETE ? 'ok'
        : status === -3 ? 'capped'
        : status === -2 ? 'storage'
        : status === -1 ? 'threw'
        : `0x${status.toString(16)}`;
      this._releaseTargets();
    }
    return out;
  }

  _buildProgram() {
    const gl = this.gl;
    const compile = (type, src, label) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s) || '';
        const lines = src.split('\n');
        const detail = [...log.matchAll(/:(\d+):/g)]
          .slice(0, 6)
          .map((m) => `  ${m[1]}: ${lines[+m[1] - 1] ?? ''}`)
          .join('\n');
        throw new Error(`${label} shader failed:\n${log}\n${detail}`);
      }
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT_SRC, 'vertex'));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, buildFragSrc(), 'fragment'));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(`Program link failed: ${gl.getProgramInfoLog(p)}`);
    }
    return p;
  }

  _describeGpu() {
    const gl = this.gl;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const get = (p) => { try { return gl.getParameter(p); } catch { return '?'; } };
    return {
      renderer: dbg ? get(dbg.UNMASKED_RENDERER_WEBGL) : get(gl.RENDERER),
      vendor: dbg ? get(dbg.UNMASKED_VENDOR_WEBGL) : get(gl.VENDOR),
      maxDrawBuffers: get(gl.MAX_DRAW_BUFFERS),
      maxColorAttachments: get(gl.MAX_COLOR_ATTACHMENTS),
      maxTextureSize: get(gl.MAX_TEXTURE_SIZE),
      maxRenderbufferSize: get(gl.MAX_RENDERBUFFER_SIZE),
      float32: !!this.floatExt,
      float16: !!this.halfExt,
      floatBlend: !!gl.getExtension('EXT_float_blend'),
    };
  }

  _releaseTargets() {
    const gl = this.gl;
    for (const f of this.fbos || []) gl.deleteFramebuffer(f);
    for (const t of this.textures || []) gl.deleteTexture(t);
    for (const r of this.renderbuffers || []) gl.deleteRenderbuffer(r);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.fbos = [];
    this.textures = [];
    this.renderbuffers = [];
    this.drawLists = [];
    this.tileW = 0;
    this.tileH = 0;
  }

  /**
   * Try to allocate one configuration at this size. Returns the framebuffer
   * status so the caller can report why a configuration was rejected.
   */
  _tryBuild(cfg, w, h) {
    const gl = this.gl;
    // A lost context reports FRAMEBUFFER_UNSUPPORTED for every check, at every
    // size and format. Catch it here or it masquerades as an unsupported
    // configuration and sends the search off in entirely the wrong direction.
    if (gl.isContextLost()) return -4;
    // Test hook: pretend the driver refuses anything wider than this, so the
    // tiling path can be exercised on hardware that has no such limit.
    const cap = Number(globalThis.__MM_MAX_TILE_WIDTH);
    if (Number.isFinite(cap) && cap > 0 && w > cap) return -3;
    // Test hook reproducing the nastiest reported signature: allocations that
    // succeed at first and are refused later, so a size proven to work stops
    // working mid-render.
    const after = globalThis.__MM_CAP_AFTER;
    if (after && (this._buildCount || 0) >= after.builds && w > after.width) return -3;
    const fmt = cfg.float ? gl.RGBA32F : gl.RGBA16F;
    const attachFns = [];

    for (let i = 0; i < cfg.attachments; i++) {
      if (cfg.storage === 'RB') {
        const rb = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
        gl.renderbufferStorage(gl.RENDERBUFFER, fmt, w, h);
        this.renderbuffers.push(rb);
        attachFns.push((slot) => gl.framebufferRenderbuffer(
          gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + slot, gl.RENDERBUFFER, rb));
      } else {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        if (cfg.storage === 'TS') {
          gl.texStorage2D(gl.TEXTURE_2D, 1, fmt, w, h);
        } else {
          gl.texImage2D(gl.TEXTURE_2D, 0, fmt, w, h, 0, gl.RGBA, gl.FLOAT, null);
        }
        // NEAREST and CLAMP_TO_EDGE: a float texture is not filterable without
        // OES_texture_float_linear, and the default REPEAT wrap is a completeness
        // hazard some drivers report as an unsupported framebuffer.
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this.textures.push(tex);
        attachFns.push((slot) => gl.framebufferTexture2D(
          gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + slot, gl.TEXTURE_2D, tex, 0));
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    if (gl.getError() !== gl.NO_ERROR) return -2;   // storage allocation refused

    // One framebuffer per pass. ES 3.0 requires drawBuffers[i] to be either NONE
    // or COLOR_ATTACHMENTi exactly, so pass 1 has to hang the same attachments
    // off points 2 and 3 rather than remapping the shader's outputs.
    for (let p = 0; p < cfg.passes; p++) {
      const fbo = gl.createFramebuffer();
      this.fbos.push(fbo);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      const list = new Array(p * cfg.attachments).fill(gl.NONE);
      for (let k = 0; k < cfg.attachments; k++) {
        const slot = p * cfg.attachments + k;
        attachFns[k](slot);
        list.push(gl.COLOR_ATTACHMENT0 + slot);
      }
      gl.drawBuffers(list);
      this.drawLists.push(list);
      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (status !== gl.FRAMEBUFFER_COMPLETE) return status;
    }
    this._buildCount = (this._buildCount || 0) + 1;
    return gl.FRAMEBUFFER_COMPLETE;
  }

  /**
   * Walk the configuration ladder at one tile size. Leaves the winner allocated
   * and returns its index, or -1 with nothing allocated.
   */
  _allocateAny(w, h, rejected) {
    const gl = this.gl;
    for (let i = this.startIndex; i < this.configs.length; i++) {
      const cfg = this.configs[i];
      let status;
      try {
        status = this._tryBuild(cfg, w, h);
      } catch (err) {
        status = -1;
        if (rejected) rejected.push(`${cfg.short}: threw ${err.message}`);
      }
      // A rejected configuration leaves the error flag set; drain it so the next
      // attempt is not diagnosed with a stale error.
      while (gl.getError() !== gl.NO_ERROR) { /* drain */ }

      if (status === gl.FRAMEBUFFER_COMPLETE) {
        this.config = cfg;
        this.configIndex = i;
        this.tileW = w;
        this.tileH = h;
        return i;
      }
      if (status === -4) { this.contextLost = true; return -4; }
      if (rejected) {
        if (status === -3) rejected.push(`${cfg.short}: width capped (test hook)`);
        else if (status === -2) rejected.push(`${cfg.short}: storage refused`);
        else if (status >= 0) rejected.push(`${cfg.short}: 0x${status.toString(16)}`);
      }
      this._releaseTargets();
    }
    return -1;
  }

  /**
   * Allocate the render targets exactly once, at construction.
   *
   * This is the whole point of the redesign. Reallocating targets at render time
   * -- which the previous design did on every plate-size change and every
   * calibration retune -- fails outright on some drivers once rendering has
   * begun: allocations that succeeded a moment earlier start returning
   * FRAMEBUFFER_UNSUPPORTED at every size and format, with isContextLost() still
   * reporting false. Rather than keep trying to characterise that, nothing is
   * ever reallocated. One buffer is claimed while we know allocation works, and
   * it is kept for the life of the context.
   *
   * A smaller tile costs nothing: both glViewport and readPixels address a
   * sub-rectangle of the attachment, so any effective tile up to the allocated
   * size can be used, changed freely, and tuned per render without touching a
   * single GL object.
   */
  _allocateOnce() {
    const candidates = [];
    for (const [w, h] of [
      [512, 64], [384, 64], [256, 64], [192, 64], [128, 64], [96, 64], [64, 64],
      [64, 32], [48, 32], [32, 32], [32, 16], [16, 16], [8, 8],
    ]) {
      if (w * h <= ALLOC_TILE_PIXELS) candidates.push([w, h]);
    }
    const rejected = [];
    for (const [w, h] of candidates) {
      if (this._allocateAny(w, h, rejected.length < 18 ? rejected : null) >= 0) {
        this.alloc = { w, h };
        return;
      }
      if (this.contextLost) break;
    }
    const d = this.debugInfo;
    throw new Error(
      `Could not allocate any render target.\n\n` +
      `Tried: ${candidates.map(([w, h]) => `${w}x${h}`).join(', ')}\n` +
      `First-size failures: ${rejected.join('; ')}\n\n` +
      `GPU: ${d.vendor} / ${d.renderer}\n` +
      `Limits: draw buffers ${d.maxDrawBuffers}, colour attachments ${d.maxColorAttachments}, ` +
      `max texture ${d.maxTextureSize}, max renderbuffer ${d.maxRenderbufferSize}, ` +
      `float32 ${d.float32}, float16 ${d.float16}\n` +
      `contextLost ${this.gl.isContextLost()}\n\n` +
      `64x64 probe: ${Object.entries(this.probe).map(([k, v]) => `${k}:${v}`).join(' ')}`
    );
  }

  /**
   * Pick the effective tile for this render. Pure arithmetic against the
   * already-allocated buffer -- no GL calls, so it cannot fail.
   */
  _chooseTile(width, height, bandRows) {
    const h = Math.max(8, Math.min(this.alloc.h, bandRows, height));
    const w = Math.max(8, Math.min(this.alloc.w, width, Math.floor(this.tilePixels / h)));
    return { tileW: w, tileH: h, tiled: w < width || h < height };
  }

  /**
   * Render the G-buffer. Returns Float32 fields sized width*height with row 0 at
   * the top, matching page coordinates.
   *
   * @param {object} o.params  flattened parameter object
   * @param {function} o.onProgress  called with 0..1 between bands
   */
  async render({ width, height, params, bandRows = 96, onProgress }) {
    const gl = this.gl;
    const cam = makeCamera({
      width, height,
      framingMm: params.framingMm,
      perspective: params.perspective,
      targetY: params.targetY ?? -14,
    });
    const rot = buildRotation(params.yaw, params.pitch, params.roll);

    if (gl.isContextLost()) { this.contextLost = true; throw contextLostError(); }
    const tile = this._chooseTile(width, height, bandRows);

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    const u = this.loc;
    const az = rad(params.lightAzimuth), el = rad(params.lightElevation);
    const lightDir = [
      Math.cos(el) * Math.sin(az),
      Math.sin(el),
      Math.cos(el) * Math.cos(az),
    ];

    gl.uniform1f(u.uCraniumW, params.craniumW);
    gl.uniform1f(u.uCraniumH, params.craniumH);
    gl.uniform1f(u.uCraniumL, params.craniumL);
    gl.uniform1f(u.uBrow, params.brow);
    gl.uniform1f(u.uCheek, params.cheek);
    gl.uniform1f(u.uJawWidth, params.jawWidth);
    gl.uniform1f(u.uJawDrop, params.jawDrop);
    gl.uniform1f(u.uJawPresent, params.jawPresent ? 1 : 0);
    gl.uniform1f(u.uNasalW, params.nasalW);
    gl.uniform1f(u.uNasalH, params.nasalH);
    gl.uniform1f(u.uOrbitSize, params.orbitSize);
    gl.uniform1f(u.uOrbitDepth, params.orbitDepth);
    gl.uniform1f(u.uTeethMissing, params.teethMissing);
    gl.uniform1f(u.uTeethWear, params.teethWear);
    gl.uniform1f(u.uErosion, params.erosion);
    gl.uniform1f(u.uAsymmetry, params.asymmetry);
    gl.uniform1f(u.uSeed, params.seedNum);
    // GLSL mat3 uniforms are column-major; our rot is row-major.
    gl.uniformMatrix3fv(u.uModelToWorld, false, new Float32Array([
      rot[0], rot[3], rot[6], rot[1], rot[4], rot[7], rot[2], rot[5], rot[8],
    ]));
    gl.uniform3fv(u.uCamPos, cam.pos);
    gl.uniform3fv(u.uCamRight, cam.right);
    gl.uniform3fv(u.uCamUp, cam.up);
    gl.uniform3fv(u.uCamFwd, cam.fwd);
    gl.uniform1f(u.uFocal, cam.focal);
    gl.uniform1f(u.uAspect, cam.aspect);
    gl.uniform2f(u.uResolution, width, height);
    gl.uniform3fv(u.uLightDir, lightDir);
    gl.uniform1f(u.uLightSoft, params.lightSoft);
    gl.uniform1f(u.uFill, params.fill);
    gl.uniform1f(u.uRim, params.rim);
    gl.uniform1f(u.uAoStrength, params.ao);
    gl.uniform1f(u.uShadow, params.shadow);
    gl.uniform1f(u.uExposure, params.exposure);
    gl.uniform1f(u.uContrast, params.contrast);
    gl.uniform1f(u.uGammaP, params.gamma);
    gl.uniform1f(u.uCavity, params.cavity);
    gl.uniform1f(u.uNear, cam.near);
    gl.uniform1f(u.uFar, cam.far);

    const n = width * height;
    const fields = {
      width, height, cam, rot,
      targetConfig: `${this.config.id} · ${tile.tileW}×${tile.tileH} tiles ` +
        `in ${this.alloc.w}×${this.alloc.h}`,
      depth: new Float32Array(n),
      nx: new Float32Array(n), ny: new Float32Array(n), nz: new Float32Array(n),
      lum: new Float32Array(n), ao: new Float32Array(n),
      formU: new Float32Array(n), formV: new Float32Array(n),
      region: new Float32Array(n), curv: new Float32Array(n),
      ndotv: new Float32Array(n), mask: new Uint8Array(n),
      px: new Float32Array(n), py: new Float32Array(n), pz: new Float32Array(n),
      mottle: new Float32Array(n),
    };

    // Sized by the allocation, since the tile may address only part of it.
    const scratch = new Float32Array(this.alloc.w * this.alloc.h * 4);
    const cols = Math.ceil(width / tile.tileW);
    const rows = Math.ceil(height / tile.tileH);
    const total = cols * rows;
    let done = 0;
    let lastYield = performance.now();

    const { attachments, passes } = this.config;
    let slowestTile = 0;
    for (let ry = 0; ry < rows; ry++) {
      const y0 = ry * tile.tileH;           // GL rows, measured from the bottom
      const th = Math.min(tile.tileH, height - y0);
      for (let rx = 0; rx < cols; rx++) {
        const x0 = rx * tile.tileW;
        const tw = Math.min(tile.tileW, width - x0);
        gl.uniform2f(u.uTileOrigin, x0, y0);
        const tileStart = performance.now();

        // In two-attachment mode the scene is marched once per pass, each pass
        // keeping a different half of the shader's outputs.
        for (let pass = 0; pass < passes; pass++) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[pass]);
          gl.drawBuffers(this.drawLists[pass]);
          gl.viewport(0, 0, tw, th);
          gl.drawArrays(gl.TRIANGLES, 0, 3);

          for (let k = 0; k < attachments; k++) {
            const slot = pass * attachments + k;
            gl.readBuffer(gl.COLOR_ATTACHMENT0 + slot);
            gl.readPixels(0, 0, tw, th, gl.RGBA, gl.FLOAT, scratch);
            this._scatter(fields, scratch, width, height, x0, y0, tw, th, slot);
          }
        }
        // Tile timing feeds the *next* render, never this one. Retuning mid-render
        // used to restart it, which meant reallocating -- the one operation this
        // design exists to avoid.
        slowestTile = Math.max(slowestTile, performance.now() - tileStart);
        done++;
        if (onProgress) onProgress(done / total);
        // Yield so the page stays responsive and the driver can breathe -- but
        // on time, not per tile. A width-limited driver can turn one plate into
        // several hundred tiles, and a frame each would cost seconds of pure
        // waiting.
        if (performance.now() - lastYield > 24) {
          await new Promise((r) => requestAnimationFrame(r));
          lastYield = performance.now();
        }
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);
    if (gl.isContextLost()) {
      this.contextLost = true;
      // Smaller draws next time; no reallocation is involved either way.
      this.tilePixels = Math.max(4096, Math.floor(this.tilePixels / 3));
      throw contextLostError();
    }

    // Aim the next render at TARGET_TILE_MS per draw, clamped to what is
    // allocated. Pure bookkeeping -- it changes only how the buffer is addressed.
    if (slowestTile > 0) {
      const px = tile.tileW * tile.tileH * passes;
      const scaled = Math.round((px * TARGET_TILE_MS) / slowestTile);
      const cap = this.alloc.w * this.alloc.h;
      this.tilePixels = Math.max(4096, Math.min(cap, MAX_TILE_PIXELS, scaled));
    }
    return fields;
  }

  /**
   * Copy one tile of one attachment into the CPU fields, flipping to y-down.
   * The readback is packed at the tile's width, not the image's, so the source
   * stride is `tw` while the destination stride stays `width`.
   */
  _scatter(f, buf, width, height, glX0, glY0, tw, th, attachment) {
    for (let j = 0; j < th; j++) {
      const dstRow = height - 1 - (glY0 + j);
      if (dstRow < 0) continue;
      let si = j * tw * 4;
      let di = dstRow * width + glX0;
      if (attachment === 0) {
        for (let x = 0; x < tw; x++, si += 4, di++) {
          f.depth[di] = buf[si];
          f.nx[di] = buf[si + 1];
          f.ny[di] = buf[si + 2];
          f.nz[di] = buf[si + 3];
        }
      } else if (attachment === 1) {
        for (let x = 0; x < tw; x++, si += 4, di++) {
          f.lum[di] = buf[si];
          f.ao[di] = buf[si + 1];
          f.formU[di] = buf[si + 2];
          f.formV[di] = buf[si + 3];
        }
      } else if (attachment === 2) {
        for (let x = 0; x < tw; x++, si += 4, di++) {
          f.region[di] = buf[si];
          f.curv[di] = buf[si + 1];
          f.ndotv[di] = buf[si + 2];
          f.mask[di] = buf[si + 3] > 0.5 ? 1 : 0;
        }
      } else {
        for (let x = 0; x < tw; x++, si += 4, di++) {
          f.px[di] = buf[si];
          f.py[di] = buf[si + 1];
          f.pz[di] = buf[si + 2];
          f.mottle[di] = buf[si + 3];
        }
      }
    }
  }

  dispose() {
    this._releaseTargets();
    this.gl.deleteProgram(this.program);
  }
}
