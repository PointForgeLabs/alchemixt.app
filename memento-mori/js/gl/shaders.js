// The skull is a signed distance field assembled from ~60 anatomical primitives
// and raymarched into a floating-point G-buffer. Everything the line extractor
// needs -- depth, surface normal, physically plausible luminance, ambient
// occlusion, and a per-region "form parameterisation" that engraving lines
// follow -- comes out of this single pass.
//
// Model space is millimetres. The origin sits on the midline at the midpoint of
// the two orbital centres. +x = subject's left, +y = up, +z = anterior.
//
// Landmarks the construction is pinned to (mm):
//   bregma           (0,   83, -18)     gnathion   (0, -108,  38)
//   glabella         (0,   16,  44)     pogonion   (0,  -99,  46)
//   orbital centre  (+-31,  0,  30)     gonion   (+-46,  -96, -18)
//   nasospinale      (0,  -44,  46)     condyle  (+-53,  -21, -38)
//   upper incisal    (0,  -62,  49)     porion   (+-52,  -16, -46)
//   opisthocranion   (0,   22,-138)     mastoid  (+-45,  -47, -50)

export const VERT_SRC = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

/* ---------------------------------------------------------- primitives --- */

const PRIMITIVES = `
float sdSphere(vec3 p, float r) { return length(p) - r; }

float sdEllipsoid(vec3 p, vec3 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / max(k1, 1e-6);
}

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdRoundBox(vec3 p, vec3 b, float r) { return sdBox(p, max(b - r, vec3(0.001))) - r; }

float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

float sdRoundCone(vec3 p, vec3 a, vec3 b, float ra, float rb) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h) - mix(ra, rb, h);
}

vec3 bez(vec3 a, vec3 b, vec3 c, float t) {
  float s = 1.0 - t;
  return s * s * a + 2.0 * s * t * b + t * t * c;
}

// Tube of elliptical cross-section swept along a quadratic Bezier. Evaluated in
// a space scaled by 1/aniso so the round cross-section becomes an ellipse; the
// result is rescaled by min(aniso) to stay a conservative bound.
float sdBezTube(vec3 p, vec3 a, vec3 b, vec3 c, float r0, float r1, vec3 aniso) {
  vec3 ps = p / aniso;
  float d = 1e9;
  vec3 prev = a / aniso;
  for (int i = 1; i <= 5; i++) {
    float t = float(i) / 5.0;
    vec3 cur = bez(a, b, c, t) / aniso;
    d = min(d, sdRoundCone(ps, prev, cur,
                           mix(r0, r1, (float(i) - 1.0) / 5.0), mix(r0, r1, t)));
    prev = cur;
  }
  return d * min(aniso.x, min(aniso.y, aniso.z));
}

// Smooth one-sided ramp, a C1 stand-in for max(x, 0). Using a hard max here
// leaves a visible crease across the forehead where the shear kicks in.
float sramp(float x, float w) { return 0.5 * (x + sqrt(x * x + w * w)); }

float smin(float a, float b, float k) {
  k = max(k, 1e-4);
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float smax(float a, float b, float k) {
  k = max(k, 1e-4);
  float h = clamp(0.5 - 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) + k * h * (1.0 - h);
}

float ssub(float a, float b, float k) { return smax(a, -b, k); }

// Union carrying the id of whichever component is genuinely nearer, so regions
// stay crisply labelled even where the surfaces blend.
vec2 uni(vec2 a, vec2 b, float k) {
  return vec2(smin(a.x, b.x, k), a.x < b.x ? a.y : b.y);
}

// Subtraction that hands the freshly cut surface to the cutter's region.
vec2 cut(vec2 a, float b, float k, float id) {
  return vec2(ssub(a.x, b, k), (b < k * 1.5) ? id : a.y);
}

float hash13(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x),
                 mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x),
                 mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y),
             f.z) * 2.0 - 1.0;
}

float fbm3(vec3 p, int oct) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 4; i++) {
    if (i >= oct) break;
    s += a * vnoise(p);
    n += a;
    a *= 0.5;
    p *= 2.03;
  }
  return s / max(n, 1e-5);
}
`;

/* --------------------------------------------------------------- skull --- */

const SKULL = `
const float R_VAULT   = 1.0;
const float R_FRONTAL = 2.0;
const float R_TEMPORAL= 3.0;
const float R_ORBIT   = 4.0;
const float R_NASAL   = 5.0;
const float R_MAXILLA = 6.0;
const float R_ZYGO    = 7.0;
const float R_TEETH_U = 8.0;
const float R_TEETH_L = 9.0;
const float R_MANDIBLE= 10.0;
const float R_RAMUS   = 11.0;
const float R_BASE    = 12.0;

uniform float uCraniumW, uCraniumH, uCraniumL;
uniform float uBrow, uCheek, uJawWidth, uJawDrop, uJawPresent;
uniform float uNasalW, uNasalH, uOrbitSize, uOrbitDepth;
uniform float uTeethMissing, uTeethWear, uErosion, uAsymmetry, uSeed;

// Dental arch geometry, shared by the alveolar ridges and the tooth banks so the
// crowns cannot drift out of their sockets.
const float ARCH_A = 31.0, ARCH_B = 40.0, ARCH_CZ = 9.0;   // upper
const float LOW_B = 38.0, LOW_CZ = 7.0;                    // lower
const float GUM_U = -52.0, GUM_L = -73.0;                  // alveolar margins
const vec3  ORBIT_C = vec3(31.0, 0.0, 30.0);
const vec3  VAULT_C = vec3(0.0, 26.0, -42.0);

vec3 archPoint(float t, float a, float b, float cz, float y) {
  return vec3(sin(t) * a, y, cz + cos(t) * b);
}

// Half-widths and crown heights walking back from the central incisor.
float toothWidth(int i) {
  if (i == 0) return 4.3;
  if (i == 1) return 3.4;
  if (i == 2) return 3.9;
  if (i == 3) return 3.4;
  if (i == 4) return 3.3;
  if (i == 5) return 5.2;
  if (i == 6) return 5.0;
  return 4.4;
}

float toothCrown(int i) {
  if (i == 0) return 10.5;
  if (i == 1) return 9.0;
  if (i == 2) return 10.8;
  if (i == 3) return 8.0;
  if (i == 4) return 7.6;
  return 7.0;
}

// Arc distance from the midline to the centre of tooth i, as an arch angle.
float toothAngle(int i, float a) {
  float s = 0.0;
  for (int k = 0; k < 8; k++) {
    if (k > i) break;
    s += (k == i) ? toothWidth(k) : toothWidth(k) * 2.0;
  }
  return s / max(a * 1.06, 1e-3);
}

float toothPresent(int i, float side, float bank) {
  float h = hash13(vec3(float(i) * 3.7 + bank * 11.0, side * 5.1 + 2.0, uSeed * 0.017 + 1.0));
  return h < uTeethMissing ? 0.0 : 1.0;
}

// One tooth in its own frame: x along the arch, y vertical, z outward.
// dir = -1 for the upper bank (crowns hang down), +1 for the lower.
float sdTooth(vec3 p, int i, float dir) {
  float w = toothWidth(i);
  float h = toothCrown(i) * mix(1.0, 0.58, uTeethWear);
  float thick = (i < 3) ? 3.2 : 4.7;
  vec3 q = p;
  q.y -= dir * h * 0.5;
  float taper = 1.0 - 0.24 * clamp(dir * q.y / max(h, 1e-3) + 0.5, 0.0, 1.0);
  float d = sdRoundBox(q, vec3(w * taper, h * 0.5, thick * taper), 1.1);
  if (i == 2) {
    d = smin(d, sdRoundCone(p, vec3(0.0), vec3(0.0, dir * h * 1.04, 0.4),
                            w * 0.72, 0.5), 1.6);
  } else if (i >= 5) {
    for (int c = 0; c < 4; c++) {
      float sx = (c == 0 || c == 3) ? -1.0 : 1.0;
      float sz = (c < 2) ? -1.0 : 1.0;
      d = smin(d, sdSphere(p - vec3(sx * w * 0.5, dir * h * 0.96, sz * thick * 0.48), 2.0), 1.6);
    }
  } else if (i >= 3) {
    d = smin(d, sdSphere(p - vec3(0.0, dir * h * 0.96, -thick * 0.5), 1.9), 1.5);
    d = smin(d, sdSphere(p - vec3(0.0, dir * h * 0.96, thick * 0.5), 1.9), 1.5);
  } else {
    // Faint incisal groove between the mamelons, worn away with age.
    d = ssub(d, sdBox(p - vec3(0.0, dir * h * 1.12, 0.0),
                      vec3(w * 1.5, h * 0.22, thick * 0.16)), 0.7);
  }
  return d;
}

// A bank of teeth on an elliptical arch. Only the three nearest are evaluated,
// located by inverting the arch parameterisation.
float sdToothBank(vec3 p, float a, float b, float cz, float gumY, float dir, float bank) {
  float t = atan(p.x / max(a, 1e-3), (p.z - cz) / max(b, 1e-3));
  float side = t < 0.0 ? -1.0 : 1.0;
  int guess = int(clamp(floor(abs(t) * a * 1.06 / 8.0), 0.0, 7.0));
  float d = 1e9;
  for (int k = -1; k <= 1; k++) {
    int i = guess + k;
    if (i < 0 || i > 7) continue;
    if (toothPresent(i, side, bank) < 0.5) continue;
    float ang = toothAngle(i, a) * side;
    vec3 c = archPoint(ang, a, b, cz, gumY);
    vec3 outward = normalize(vec3(sin(ang) * b, 0.0, cos(ang) * a));
    vec3 along = normalize(vec3(cos(ang) * a, 0.0, -sin(ang) * b));
    vec3 q = p - c;
    vec3 lp = vec3(dot(q, along), q.y, dot(q, outward));
    lp.z -= dir * lp.y * 0.10;         // anterior teeth lean forward
    d = min(d, sdTooth(lp, i, dir));
  }
  return d;
}

// The alveolar process: the bony ridge the teeth are socketed in. Front ~150
// degrees of the arch only.
float sdArchRidge(vec3 p, float a, float b, float cz, float y, float r) {
  vec3 q = vec3(p.x, p.y - y, p.z - cz);
  float ring = (length(vec2(q.x / max(a, 1e-3), q.z / max(b, 1e-3))) - 1.0) * min(a, b);
  // Keep the arch forward of the last molar and let it fade, not cliff, behind.
  return smax(length(vec2(ring, q.y)) - r, -q.z - b * 0.45, 6.0);
}

vec2 mapSkull(vec3 p, out vec4 form) {
  // Gentle asymmetry before mirroring: real skulls are never even.
  p.x += uAsymmetry * 3.2 * fbm3(p * 0.012 + vec3(uSeed * 0.3), 2);

  vec3 m = vec3(abs(p.x), p.y, p.z);
  float side = p.x < 0.0 ? -1.0 : 1.0;

  /* ---- cranial vault ------------------------------------------------- */
  vec3 vr = vec3(72.0 * uCraniumW, 58.0 * uCraniumH, 86.0 * uCraniumL);
  vec3 vp = p - VAULT_C;
  vp.z += 0.30 * sramp(vp.y - 4.0, 9.0);             // receding frontal squama
  vp.y += 0.30 * sramp(-vp.z - 5.0, 14.0);           // occiput drops away behind
  vp.x *= 1.0 + 0.05 * smoothstep(10.0, 45.0, vp.y); // parietal flattening
  vec2 res = vec2(sdEllipsoid(vp, vr), R_VAULT);

  // Occipital protuberance and the nuchal shelf beneath it.
  res = uni(res, vec2(sdEllipsoid(p - vec3(0.0, 4.0, -122.0), vec3(25.0, 19.0, 13.0)), R_BASE), 16.0);

  /* ---- upper facial mass --------------------------------------------- */
  // The block the orbits and nasal aperture are carved out of. Without it there
  // is simply no bone at orbital height for the sockets to be cut from.
  res = uni(res, vec2(sdRoundBox(p - vec3(0.0, -2.0, 26.0), vec3(45.0, 26.0, 14.0), 11.0), R_FRONTAL), 12.0);

  // Frontal eminences and glabella.
  // Kept clear of the midline so the mirror seam reads as a metopic ridge
  // rather than a crease.
  res = uni(res, vec2(sdEllipsoid(m - vec3(24.0, 38.0, 27.0), vec3(21.0, 22.0, 16.0)), R_FRONTAL), 20.0);
  res = uni(res, vec2(sdEllipsoid(p - vec3(0.0, 14.0, 38.0), vec3(13.0, 12.0, 9.0)), R_FRONTAL), 14.0);

  // Superciliary arch, swept from the glabella out over each orbit.
  if (sdBox(m - vec3(24.0, 12.0, 34.0), vec3(30.0, 16.0, 18.0)) < 6.0) {
    res = uni(res, vec2(sdBezTube(m,
        vec3(2.0, 15.0, 41.0), vec3(22.0, 18.0, 40.0), vec3(45.0, 8.0, 25.0),
        6.4 * uBrow, 4.4 * uBrow, vec3(1.0, 0.82, 1.0)), R_FRONTAL), 7.0);
  }

  // Mastoid process: tucked behind the ear, barely wider than the wall it hangs
  // off. Oversized here it reads as a detached lump in profile.
  res = uni(res, vec2(sdRoundCone(m, vec3(40.0, -24.0, -48.0), vec3(38.0, -44.0, -44.0), 8.0, 3.5), R_BASE), 8.0);

  /* ---- mid-face ------------------------------------------------------ */
  // Maxillary body. Its lower limit is the alveolar margin: any lower and it
  // swallows the tooth crowns.
  res = uni(res, vec2(sdEllipsoid(p - vec3(0.0, -27.0, 24.0), vec3(41.0, 23.0, 25.0)), R_MAXILLA), 15.0);
  res = uni(res, vec2(sdArchRidge(p, ARCH_A, ARCH_B, ARCH_CZ, GUM_U + 9.0, 9.0), R_MAXILLA), 8.0);
  res = uni(res, vec2(sdRoundBox(p - vec3(0.0, -40.0, 12.0), vec3(24.0, 3.0, 28.0), 2.0), R_MAXILLA), 8.0);

  // Zygomatic bone and its frontal process (the lateral orbital margin).
  res = uni(res, vec2(sdEllipsoid(m - vec3(48.0 * uCheek, -14.0, 23.0), vec3(13.0, 16.0, 14.0)), R_ZYGO), 12.0);
  res = uni(res, vec2(sdRoundBox(m - vec3(47.0, 6.0, 24.0), vec3(4.5, 14.0, 8.0), 3.0), R_ZYGO), 8.0);

  // Nasal bones: the tent above the aperture.
  res = uni(res, vec2(sdBezTube(p,
      vec3(0.0, 10.0, 38.0), vec3(0.0, 0.0, 48.0), vec3(0.0, -17.0, 49.0),
      5.2, 7.2, vec3(1.0, 1.0, 0.68)), R_NASAL), 7.0);

  /* ---- mandible ------------------------------------------------------ */
  // Body, alveolar part and ramus are separate pieces that must actually meet:
  // an arch alone stops at the last molar and leaves the jaw in two halves.
  if (uJawPresent > 0.5) {
    vec3 pivot = vec3(0.0, -23.0, -34.0);
    float ja = radians(uJawDrop);
    vec3 jp = p - pivot;
    jp = vec3(jp.x, jp.y * cos(ja) - jp.z * sin(ja), jp.y * sin(ja) + jp.z * cos(ja)) + pivot;

    if (sdBox(jp - vec3(0.0, -62.0, 8.0), vec3(56.0, 48.0, 54.0)) < 8.0) {
      vec3 jm = vec3(abs(jp.x), jp.y, jp.z);
      float jw = uJawWidth;

      // Alveolar part, on the same ellipse the lower teeth are placed on.
      vec2 jaw = vec2(sdArchRidge(jp, 29.0 * jw, LOW_B, LOW_CZ, GUM_L - 8.0, 8.5), R_MANDIBLE);
      // Body: a deep tube from the symphysis back to each gonial angle.
      jaw = uni(jaw, vec2(sdBezTube(jm,
          vec3(0.0, -88.0, 43.0), vec3(28.0 * jw, -90.0, 14.0), vec3(44.0 * jw, -92.0, -14.0),
          13.0, 11.0, vec3(0.55, 1.0, 0.85)), R_MANDIBLE), 7.0);
      // Mental protuberance.
      jaw = uni(jaw, vec2(sdEllipsoid(jp - vec3(0.0, -96.0, 41.0), vec3(15.0, 11.0, 9.0)), R_MANDIBLE), 12.0);
      // Gonial angle.
      jaw = uni(jaw, vec2(sdEllipsoid(jm - vec3(45.0 * jw, -90.0, -16.0), vec3(6.0, 11.0, 12.0)), R_MANDIBLE), 9.0);

      // Ramus: a flat blade rising from the angle to the joint.
      vec3 rp = jm - vec3(46.0 * jw, -58.0, -22.0);
      rp.yz = mat2(0.988, -0.156, 0.156, 0.988) * rp.yz;
      jaw = uni(jaw, vec2(sdRoundBox(rp, vec3(4.0, 30.0, 15.0), 3.5), R_RAMUS), 8.0);
      // Coronoid process and condyle, with the mandibular notch left between.
      jaw = uni(jaw, vec2(sdRoundCone(jm, vec3(45.0 * jw, -34.0, -8.0), vec3(44.0 * jw, -16.0, -4.0), 7.0, 2.2), R_RAMUS), 6.0);
      jaw = uni(jaw, vec2(sdRoundCone(jm, vec3(42.0 * jw, -24.0, -34.0), vec3(54.0 * jw, -22.0, -34.0), 5.8, 4.8), R_RAMUS), 5.0);

      if (sdBox(jp - vec3(0.0, -68.0, 10.0), vec3(36.0, 16.0, 44.0)) < 6.0) {
        jaw = uni(jaw, vec2(sdToothBank(jp, 29.0 * jw, LOW_B, LOW_CZ, GUM_L, 1.0, 1.0), R_TEETH_L), 0.8);
      }
      res = uni(res, jaw, 0.8);
    }
  }

  // Upper teeth.
  if (sdBox(p - vec3(0.0, -58.0, 14.0), vec3(38.0, 16.0, 44.0)) < 6.0) {
    res = uni(res, vec2(sdToothBank(p, ARCH_A, ARCH_B, ARCH_CZ, GUM_U, -1.0, 0.0), R_TEETH_U), 0.8);
  }

  // Temporal fossa: a shallow, crisply bounded panel shaved off each temple --
  // 5mm deep, not a scooped bowl. This is what gives the zygomatic arch a real
  // slot to bridge rather than merging into the wall.
  res = cut(res, sdEllipsoid(m - vec3(63.0, 2.0, -8.0), vec3(7.0, 30.0, 34.0)), 2.5, R_TEMPORAL);

  // Zygomatic arch: a thin blade bridging the fossa out to the ear. Blended
  // tightly so the slot behind it survives.
  if (sdBox(m - vec3(58.0, -10.0, -8.0), vec3(22.0, 22.0, 42.0)) < 8.0) {
    res = uni(res, vec2(sdBezTube(m,
        vec3(48.0 * uCheek, -10.0, 21.0),
        vec3(78.0 * uCheek, -6.0, -8.0),
        vec3(53.0, -14.0, -42.0),
        5.6, 5.0, vec3(0.46, 1.0, 1.0)), R_ZYGO), 2.0);
  }

  /* ---- carved cavities ----------------------------------------------- */
  // Orbits: a shallow socket for the crisp rim, plus a deep cone behind it so
  // the sockets read as genuine voids. The cone is kept lateral of x=19 so the
  // interorbital pillar and the nasal bridge survive.
  {
    vec3 op = m - ORBIT_C;
    op.xz = mat2(0.94, -0.34, 0.34, 0.94) * op.xz;   // orbital axis, outward
    op.yz = mat2(0.99, 0.14, -0.14, 0.99) * op.yz;   // and slightly up
    res = cut(res, sdEllipsoid(op, vec3(20.0, 17.5, 22.0) * uOrbitSize), 1.6, R_ORBIT);
    res = cut(res, sdRoundCone(m, vec3(32.0, 0.0, 32.0),
                               vec3(26.0, -4.0, -6.0 - 22.0 * uOrbitDepth), 13.0, 4.0), 4.0, R_ORBIT);
  }

  // Nasal aperture: piriform, narrow under the nasal bones and flaring to the
  // base, with the septum standing inside it.
  {
    float y0 = -13.0, y1 = -44.0 * uNasalH;
    float t = clamp((p.y - y0) / (y1 - y0), 0.0, 1.0);
    float halfW = mix(4.5, 14.0 * uNasalW, smoothstep(0.0, 0.85, t));
    res = cut(res, sdRoundBox(vec3(p.x, p.y - (y0 + y1) * 0.5, p.z - 43.0),
                              vec3(halfW, abs(y1 - y0) * 0.5, 17.0), 2.5), 1.3, R_NASAL);
    // A deeper chamber behind the opening, stopping short of the palate. Without
    // it the aperture is a shallow dish and never reads as a void.
    res = cut(res, sdRoundBox(p - vec3(0.0, -22.0, 10.0), vec3(11.0, 16.0, 22.0), 4.0), 2.0, R_NASAL);
    // Septum standing in the opening, and the anterior nasal spine below it.
    res = uni(res, vec2(sdRoundBox(p - vec3(0.0, -25.0, 33.0), vec3(1.4, 19.0, 11.0), 1.2), R_NASAL), 2.0);
    res = uni(res, vec2(sdRoundCone(p, vec3(0.0, -44.0 * uNasalH, 44.0),
                                    vec3(0.0, -39.0 * uNasalH, 50.0), 3.0, 1.0), R_NASAL), 2.0);
  }

  // Nuchal plane: flattens the underside of the occiput. Bounded well behind the
  // jaw so it cannot reach the mandible or the mastoid.
  res = cut(res, sdEllipsoid(p - vec3(0.0, -56.0, -88.0), vec3(56.0, 30.0, 44.0)), 8.0, R_BASE);

  // External auditory meatus and the infraorbital foramen.
  res.x = ssub(res.x, sdCapsule(m, vec3(38.0, -16.0, -46.0), vec3(58.0, -16.0, -46.0), 4.2), 1.2);
  res.x = ssub(res.x, sdSphere(m - vec3(26.0, -22.0, 42.0), 2.0), 0.7);

  /* ---- surface character --------------------------------------------- */
  // Bone is not a smooth manifold. A low-frequency swell plus fine pitting give
  // the hatching something to bite on -- but only just: at plotting scale a
  // heavy hand here turns into speckle, not texture.
  float coarse = fbm3(p * 0.035 + vec3(uSeed * 0.11), 3);
  float fine = fbm3(p * 0.22 + vec3(uSeed * 0.23), 2);
  res.x -= coarse * (0.15 + 0.70 * uErosion);
  res.x += max(0.0, -fine - 0.15) * (0.04 + 1.10 * uErosion);

  /* ---- form parameterisation ----------------------------------------- */
  // Each region carries its own surface coordinates, in millimetres of arc
  // length, so engraving lines flow with the anatomy instead of across it.
  float id = res.y;
  vec2 uv;
  if (id == R_ORBIT) {
    vec3 q = (m - ORBIT_C) / vec3(1.0, 0.88, 1.5);
    uv = vec2(atan(q.y, q.x) * 13.0, length(q) * 1.6);
  } else if (id == R_TEETH_U || id == R_TEETH_L) {
    // Vertical strokes down each crown.
    uv = vec2(p.y, atan(p.x / ARCH_A, (p.z - ARCH_CZ) / ARCH_B) * ARCH_A * 1.06);
  } else if (id == R_NASAL) {
    // Rings driving back into the aperture, which is what reads as depth.
    vec3 q = (p - vec3(0.0, -26.0, 40.0)) / vec3(1.0, 1.3, 1.0);
    uv = vec2(atan(q.y, q.x) * 11.0, length(q) * 1.5);
  } else if (id == R_MAXILLA || id == R_ZYGO) {
    // Meridians, not parallels: the cheek and maxilla want strokes sweeping down
    // from the orbital margin to the alveolus. Latitude lines everywhere makes
    // the whole skull read as a wireframe globe.
    vec3 q = normalize((p - vec3(0.0, -30.0, -6.0)) / vec3(56.0, 46.0, 52.0));
    uv = vec2(asin(clamp(q.y, -1.0, 1.0)) * 46.0, atan(q.x, q.z) * 44.0);
  } else if (id == R_RAMUS) {
    vec3 q = normalize((p - vec3(0.0, -60.0, -18.0)) / vec3(46.0, 40.0, 40.0));
    uv = vec2(asin(clamp(q.y, -1.0, 1.0)) * 40.0, atan(q.x, q.z) * 40.0);
  } else if (id == R_MANDIBLE) {
    vec3 q = normalize((p - vec3(0.0, -78.0, -4.0)) / vec3(48.0, 40.0, 44.0));
    uv = vec2(atan(q.x, q.z) * 40.0, asin(clamp(q.y, -1.0, 1.0)) * 40.0);
  } else {
    vec3 q = normalize((p - VAULT_C) / vr);
    uv = vec2(atan(q.x, q.z) * 62.0, asin(clamp(q.y, -1.0, 1.0)) * 58.0);
  }
  form = vec4(uv, id, coarse);
  return res;
}

float map(vec3 p) {
  vec4 f;
  return mapSkull(p, f).x;
}
`;

/* --------------------------------------------------------------- march --- */

const MARCH = `
uniform mat3 uModelToWorld;
uniform vec3 uCamPos, uCamRight, uCamUp, uCamFwd;
uniform float uFocal, uAspect;
uniform vec2 uResolution, uTileOrigin;
uniform vec3 uLightDir;
uniform float uLightSoft, uFill, uRim, uAoStrength, uShadow;
uniform float uExposure, uContrast, uGammaP, uCavity;
uniform float uNear, uFar;

vec3 toModel(vec3 v) { return v * uModelToWorld; }   // world -> model (R transpose)
vec3 toWorld(vec3 v) { return uModelToWorld * v; }

// Normal and Laplacian (a mean-curvature proxy) from one shared set of taps.
// The tap radius doubles as a low-pass: too tight and the curvature term picks
// up the surface noise and stains the whole cranium with blotches.
vec4 normalAndCurv(vec3 p, float d0) {
  const float h = 1.1;
  vec2 k = vec2(1.0, -1.0);
  float a = map(p + k.xyy * h);
  float b = map(p + k.yyx * h);
  float c = map(p + k.yxy * h);
  float e = map(p + k.xxx * h);
  vec3 n = normalize(k.xyy * a + k.yyx * b + k.yxy * c + k.xxx * e);
  float lap = (a + b + c + e - 4.0 * d0) / (h * h);
  return vec4(n, lap);
}

// The sample radius has to reach across the cavities that actually matter --
// orbits, nasal aperture, temporal fossa, under the jaw. A few millimetres of
// reach only finds surface pitting and leaves the sockets reading mid-grey.
float calcAo(vec3 p, vec3 n) {
  float occ = 0.0, sca = 1.0;
  for (int i = 0; i < 6; i++) {
    float h = 1.5 + 22.0 * float(i) / 5.0;
    occ += (h - map(p + n * h)) * sca;
    sca *= 0.88;
  }
  return clamp(1.0 - 0.85 * occ / 40.0, 0.0, 1.0);
}

float softShadow(vec3 p, vec3 l) {
  float res = 1.0, t = 1.4;
  for (int i = 0; i < 28; i++) {
    float h = map(p + l * t);
    res = min(res, h / (uLightSoft * t * 0.02 + 0.06));
    t += clamp(h, 0.9, 14.0);
    if (res < 0.004 || t > 250.0) break;
  }
  return clamp(res * 0.5 + 0.5, 0.0, 1.0);
}

// Bone: a warm, weakly translucent dielectric. Wrapped diffuse plus a broad low
// specular reads far more like the real thing than pure Lambert, and cavity
// darkening from curvature is what makes sutures and the orbital rim sing.
float shade(vec3 p, vec3 nw, vec3 rdw, float ao, float curv, float mottle) {
  vec3 l = normalize(uLightDir);
  float wrap = clamp((dot(nw, l) + 0.34) / 1.34, 0.0, 1.0);
  float sh = uShadow > 0.001 ? mix(1.0, softShadow(p, toModel(l)), uShadow) : 1.0;

  float key = wrap * sh;
  float fill = (0.5 + 0.5 * nw.y) * ao * uFill;
  float bounce = clamp(-nw.y, 0.0, 1.0) * 0.16 * ao;
  float cav = clamp(1.0 - uCavity * clamp(curv * 4.0, 0.0, 1.5), 0.04, 1.0);

  vec3 h = normalize(l - rdw);
  float spec = pow(clamp(dot(nw, h), 0.0, 1.0), 22.0) * 0.15 * sh;
  float rim = pow(clamp(1.0 + dot(rdw, nw), 0.0, 1.0), 2.6) * uRim;

  float lum = (key * 0.92 + fill + bounce) * (0.86 + mottle * 0.09) * cav + spec + rim;
  lum = pow(clamp(lum * uExposure, 0.0, 1.8), uGammaP);
  return clamp((lum - 0.5) * uContrast + 0.5, 0.0, 1.0);
}

layout(location = 0) out vec4 oGeo;    // depth01, world normal
layout(location = 1) out vec4 oTone;   // luminance, ao, formU, formV
layout(location = 2) out vec4 oMeta;   // regionId, curvature, n.v, hit
layout(location = 3) out vec4 oPos;    // model-space hit position, coarse noise

void main() {
  vec2 uv = (uTileOrigin + gl_FragCoord.xy) / uResolution;
  vec2 sc = uv * 2.0 - 1.0;

  vec3 rdW = normalize(uCamFwd * uFocal + uCamRight * sc.x * uAspect + uCamUp * sc.y);
  vec3 roM = toModel(uCamPos);
  vec3 rdM = toModel(rdW);

  oGeo = vec4(0.0);
  oTone = vec4(1.0, 1.0, 0.0, 0.0);
  oMeta = vec4(0.0);
  oPos = vec4(0.0);

  // Skip empty page fast with a bounding-sphere test.
  float b = dot(roM, rdM), c = dot(roM, roM) - 215.0 * 215.0;
  float disc = b * b - c;
  if (disc < 0.0) return;
  float sq = sqrt(disc);
  float t = max(-b - sq, 0.1);
  float tMax = -b + sq + 4.0;

  float d = 0.0;
  bool hit = false;
  for (int i = 0; i < 160; i++) {
    d = map(roM + rdM * t);
    if (d < 0.04) { hit = true; break; }
    t += d * 0.85;
    if (t > tMax) break;
  }
  if (!hit) return;

  vec3 p = roM + rdM * t;
  vec4 form;
  vec2 r = mapSkull(p, form);
  vec4 nc = normalAndCurv(p, r.x);
  vec3 nw = normalize(toWorld(nc.xyz));
  vec3 rdw = normalize(toWorld(rdM));
  float ao = mix(1.0, calcAo(p, nc.xyz), uAoStrength);
  float lum = shade(p, nw, rdw, ao, nc.w, form.w);

  oGeo = vec4(clamp((t - uNear) / (uFar - uNear), 0.0, 1.0), nw);
  oTone = vec4(lum, ao, form.x, form.y);
  oMeta = vec4(form.z, clamp(nc.w * 6.0, -4.0, 4.0), abs(dot(nw, rdw)), 1.0);
  // Model position lets the CPU place sutures and cracks as exact 3D surface
  // markings; occlusion then comes free, since only visible points are here.
  oPos = vec4(p, form.w);
}
`;

export function buildFragSrc() {
  return `#version 300 es
precision highp float;
${PRIMITIVES}
${SKULL}
${MARCH}
`;
}
