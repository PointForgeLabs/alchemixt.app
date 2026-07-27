/**
 * The style catalogue.
 *
 * A style is an engine crossed with a treatment, given a name and a set of
 * affinities. Crossing 17 engines with 12 treatments gives 204 combinations;
 * these are the ones worth having, chosen because the pairing produces
 * something the engine alone does not.
 *
 * Each style declares which thematic fields it suits and what musical
 * temperament it wants, so the machine can pick one on its own — but the whole
 * list is browsable, because the point of a catalogue is being able to look
 * through it.
 */

import type { ThemeKey } from '../analysis/lexicons';

export interface StyleBias {
  density?: number;
  turbulence?: number;
  weight?: number;
  symmetry?: number;
  gravity?: number;
}

export interface Style {
  key: string;
  name: string;
  engine: string;
  treatment: string;
  /** Thematic fields this style suits. */
  themes: ThemeKey[];
  /** Preferred energy, 0..1. Distance from the song's energy costs points. */
  energy: number;
  /** Preferred roughness/noisiness, 0..1. */
  grit: number;
  /** Multipliers applied to the genome before rendering. */
  bias?: StyleBias;
  /**
   * How readily the machine reaches for this style, 0..1.5, default 1.
   * All-over pattern engines sit lower: they make handsome texture but a
   * picture of nothing in particular, and a song deserves a subject.
   */
  preference?: number;
}

export const STYLES: Style[] = [
  // ---- current -------------------------------------------------------------
  { key: 'riverrun', name: 'Riverrun', engine: 'current', treatment: 'ink', themes: ['water', 'motion'], energy: 0.5, grit: 0.3, preference: 0.45 },
  { key: 'undertow', name: 'Undertow', engine: 'current', treatment: 'wash', themes: ['water', 'loss'], energy: 0.3, grit: 0.2, bias: { density: 0.8 }, preference: 0.45 },
  { key: 'slipstream', name: 'Slipstream', engine: 'current', treatment: 'neon', themes: ['motion', 'city'], energy: 0.8, grit: 0.5, preference: 0.45 },
  { key: 'silt', name: 'Silt', engine: 'current', treatment: 'engrave', themes: ['water', 'memory'], energy: 0.35, grit: 0.4, preference: 0.45 },
  { key: 'crosswind', name: 'Crosswind', engine: 'current', treatment: 'sketch', themes: ['motion', 'nature'], energy: 0.55, grit: 0.5, preference: 0.45 },
  { key: 'tidewrack', name: 'Tidewrack', engine: 'current', treatment: 'riso', themes: ['water', 'motion'], energy: 0.6, grit: 0.55, preference: 0.45 },

  // ---- terrain -------------------------------------------------------------
  { key: 'contour', name: 'Contour', engine: 'terrain', treatment: 'ink', themes: ['nature', 'memory'], energy: 0.35, grit: 0.25, preference: 0.6 },
  { key: 'survey', name: 'Survey', engine: 'terrain', treatment: 'blueprint', themes: ['nature', 'city'], energy: 0.4, grit: 0.3, preference: 0.6 },
  { key: 'seabed', name: 'Seabed', engine: 'terrain', treatment: 'engrave', themes: ['water', 'memory'], energy: 0.3, grit: 0.35, preference: 0.6 },
  { key: 'ridgeline', name: 'Ridgeline', engine: 'terrain', treatment: 'woodcut', themes: ['nature', 'defiance'], energy: 0.6, grit: 0.7, preference: 0.6 },
  { key: 'lowland', name: 'Lowland', engine: 'terrain', treatment: 'wash', themes: ['nature', 'loss'], energy: 0.25, grit: 0.2, preference: 0.6 },

  // ---- swarm ---------------------------------------------------------------
  { key: 'murmuration', name: 'Murmuration', engine: 'swarm', treatment: 'ink', themes: ['nature', 'motion'], energy: 0.55, grit: 0.35, preference: 0.55 },
  { key: 'hivemind', name: 'Hivemind', engine: 'swarm', treatment: 'stipple', themes: ['city', 'body'], energy: 0.5, grit: 0.45, preference: 0.55 },
  { key: 'panic', name: 'Panic', engine: 'swarm', treatment: 'sketch', themes: ['defiance', 'motion'], energy: 0.85, grit: 0.7, bias: { turbulence: 1.3 }, preference: 0.55 },
  { key: 'shoal', name: 'Shoal', engine: 'swarm', treatment: 'riso', themes: ['water', 'nature'], energy: 0.45, grit: 0.4, preference: 0.55 },

  // ---- columns -------------------------------------------------------------
  { key: 'downpour', name: 'Downpour', engine: 'columns', treatment: 'ink', themes: ['water', 'loss'], energy: 0.5, grit: 0.35, preference: 0.6 },
  { key: 'curtainfall', name: 'Curtainfall', engine: 'columns', treatment: 'wash', themes: ['loss', 'night'], energy: 0.3, grit: 0.2, preference: 0.6 },
  { key: 'ticker', name: 'Ticker', engine: 'columns', treatment: 'neon', themes: ['city', 'motion'], energy: 0.75, grit: 0.5, preference: 0.6 },
  { key: 'reeds', name: 'Reeds', engine: 'columns', treatment: 'engrave', themes: ['nature', 'water'], energy: 0.3, grit: 0.3, preference: 0.6 },
  { key: 'staticfall', name: 'Static Fall', engine: 'columns', treatment: 'halftone', themes: ['city', 'night'], energy: 0.65, grit: 0.75, preference: 0.6 },

  // ---- radiance ------------------------------------------------------------
  { key: 'monstrance', name: 'Monstrance', engine: 'radiance', treatment: 'ink', themes: ['transcendence', 'fire'], energy: 0.55, grit: 0.3 },
  { key: 'annunciation', name: 'Annunciation', engine: 'radiance', treatment: 'engrave', themes: ['transcendence', 'love'], energy: 0.45, grit: 0.3 },
  { key: 'corona', name: 'Corona', engine: 'radiance', treatment: 'neon', themes: ['fire', 'transcendence'], energy: 0.85, grit: 0.5 },
  { key: 'reliquary', name: 'Reliquary', engine: 'radiance', treatment: 'woodcut', themes: ['transcendence', 'defiance'], energy: 0.7, grit: 0.8 },
  { key: 'aureole', name: 'Aureole', engine: 'radiance', treatment: 'wash', themes: ['love', 'transcendence'], energy: 0.35, grit: 0.2 },
  { key: 'sunprint', name: 'Sunprint', engine: 'radiance', treatment: 'screenprint', themes: ['fire', 'love'], energy: 0.7, grit: 0.5 },

  // ---- spiral --------------------------------------------------------------
  { key: 'obsession', name: 'Obsession', engine: 'spiral', treatment: 'ink', themes: ['love', 'memory'], energy: 0.5, grit: 0.3 },
  { key: 'vertigo', name: 'Vertigo', engine: 'spiral', treatment: 'sketch', themes: ['night', 'body'], energy: 0.6, grit: 0.55 },
  { key: 'groove', name: 'Groove', engine: 'spiral', treatment: 'engrave', themes: ['memory', 'city'], energy: 0.45, grit: 0.35 },
  { key: 'whirlpool', name: 'Whirlpool', engine: 'spiral', treatment: 'neon', themes: ['water', 'night'], energy: 0.75, grit: 0.45 },

  // ---- orbits --------------------------------------------------------------
  { key: 'orrery', name: 'Orrery', engine: 'orbits', treatment: 'ink', themes: ['transcendence', 'night'], energy: 0.4, grit: 0.25 },
  { key: 'ephemeris', name: 'Ephemeris', engine: 'orbits', treatment: 'blueprint', themes: ['night', 'memory'], energy: 0.35, grit: 0.3 },
  { key: 'resonance', name: 'Resonance', engine: 'orbits', treatment: 'neon', themes: ['transcendence', 'city'], energy: 0.8, grit: 0.45 },
  { key: 'spirograph', name: 'Spirograph', engine: 'orbits', treatment: 'riso', themes: ['love', 'motion'], energy: 0.55, grit: 0.45 },

  // ---- bloom ---------------------------------------------------------------
  { key: 'roe', name: 'Roe', engine: 'bloom', treatment: 'ink', themes: ['body', 'nature'], energy: 0.45, grit: 0.3 },
  { key: 'culture', name: 'Culture', engine: 'bloom', treatment: 'stipple', themes: ['body', 'nature'], energy: 0.4, grit: 0.4 },
  { key: 'foam', name: 'Foam', engine: 'bloom', treatment: 'wash', themes: ['water', 'love'], energy: 0.3, grit: 0.2 },
  { key: 'cobble', name: 'Cobble', engine: 'bloom', treatment: 'woodcut', themes: ['city', 'nature'], energy: 0.6, grit: 0.75 },

  // ---- strata --------------------------------------------------------------
  { key: 'sediment', name: 'Sediment', engine: 'strata', treatment: 'ink', themes: ['memory', 'loss'], energy: 0.35, grit: 0.3 },
  { key: 'corestack', name: 'Core Sample', engine: 'strata', treatment: 'hatch', themes: ['memory', 'nature'], energy: 0.4, grit: 0.4 },
  { key: 'exposure', name: 'Exposure', engine: 'strata', treatment: 'riso', themes: ['memory', 'love'], energy: 0.5, grit: 0.5 },
  { key: 'horizonband', name: 'Horizon Band', engine: 'strata', treatment: 'screenprint', themes: ['loss', 'memory'], energy: 0.55, grit: 0.5 },
  { key: 'seam', name: 'Seam', engine: 'strata', treatment: 'engrave', themes: ['loss', 'city'], energy: 0.35, grit: 0.35 },

  // ---- weave ---------------------------------------------------------------
  { key: 'warpweft', name: 'Warp & Weft', engine: 'weave', treatment: 'ink', themes: ['memory', 'body'], energy: 0.4, grit: 0.3, preference: 0.45 },
  { key: 'sackcloth', name: 'Sackcloth', engine: 'weave', treatment: 'woodcut', themes: ['loss', 'defiance'], energy: 0.6, grit: 0.75, preference: 0.45 },
  { key: 'tartan', name: 'Tartan', engine: 'weave', treatment: 'riso', themes: ['memory', 'love'], energy: 0.5, grit: 0.45, preference: 0.45 },
  { key: 'gauze', name: 'Gauze', engine: 'weave', treatment: 'wash', themes: ['love', 'night'], energy: 0.25, grit: 0.2, preference: 0.45 },

  // ---- moire ---------------------------------------------------------------
  { key: 'interference', name: 'Interference', engine: 'moire', treatment: 'ink', themes: ['city', 'night'], energy: 0.55, grit: 0.4, preference: 0.4 },
  { key: 'beatfrequency', name: 'Beat Frequency', engine: 'moire', treatment: 'neon', themes: ['city', 'motion'], energy: 0.85, grit: 0.5, preference: 0.4 },
  { key: 'gridlock', name: 'Gridlock', engine: 'moire', treatment: 'blueprint', themes: ['city', 'defiance'], energy: 0.5, grit: 0.4, preference: 0.4 },

  // ---- fracture ------------------------------------------------------------
  { key: 'faultline', name: 'Fault Line', engine: 'fracture', treatment: 'ink', themes: ['defiance', 'loss'], energy: 0.75, grit: 0.5 },
  { key: 'blockcut', name: 'Block Cut', engine: 'fracture', treatment: 'woodcut', themes: ['defiance', 'fire'], energy: 0.9, grit: 0.85 },
  { key: 'shardprint', name: 'Shard Print', engine: 'fracture', treatment: 'screenprint', themes: ['defiance', 'city'], energy: 0.8, grit: 0.6 },
  { key: 'cleave', name: 'Cleave', engine: 'fracture', treatment: 'hatch', themes: ['defiance', 'body'], energy: 0.7, grit: 0.55 },

  // ---- shatter -------------------------------------------------------------
  { key: 'impact', name: 'Impact', engine: 'shatter', treatment: 'ink', themes: ['defiance', 'fire'], energy: 0.85, grit: 0.6 },
  { key: 'windscreen', name: 'Windscreen', engine: 'shatter', treatment: 'sketch', themes: ['defiance', 'motion'], energy: 0.8, grit: 0.7 },
  { key: 'starburst', name: 'Starburst', engine: 'shatter', treatment: 'neon', themes: ['fire', 'night'], energy: 0.9, grit: 0.55 },

  // ---- lattice -------------------------------------------------------------
  { key: 'tenement', name: 'Tenement', engine: 'lattice', treatment: 'ink', themes: ['city', 'memory'], energy: 0.55, grit: 0.4 },
  { key: 'schematic', name: 'Schematic', engine: 'lattice', treatment: 'blueprint', themes: ['city', 'transcendence'], energy: 0.45, grit: 0.35 },
  { key: 'circuitboard', name: 'Circuit Board', engine: 'lattice', treatment: 'neon', themes: ['city', 'motion'], energy: 0.8, grit: 0.5 },
  { key: 'newsprint', name: 'Newsprint', engine: 'lattice', treatment: 'halftone', themes: ['city', 'loss'], energy: 0.6, grit: 0.7 },
  { key: 'quarter', name: 'Quarter', engine: 'lattice', treatment: 'engrave', themes: ['city', 'memory'], energy: 0.45, grit: 0.4 },

  // ---- growth --------------------------------------------------------------
  { key: 'thicket', name: 'Thicket', engine: 'growth', treatment: 'ink', themes: ['nature', 'body'], energy: 0.5, grit: 0.35 },
  { key: 'herbarium', name: 'Herbarium', engine: 'growth', treatment: 'engrave', themes: ['nature', 'memory'], energy: 0.35, grit: 0.3 },
  { key: 'nerve', name: 'Nerve', engine: 'growth', treatment: 'neon', themes: ['body', 'night'], energy: 0.75, grit: 0.5 },
  { key: 'bramble', name: 'Bramble', engine: 'growth', treatment: 'sketch', themes: ['nature', 'defiance'], energy: 0.6, grit: 0.6 },
  { key: 'rootstock', name: 'Rootstock', engine: 'growth', treatment: 'woodcut', themes: ['nature', 'loss'], energy: 0.65, grit: 0.8 },

  // ---- constellation -------------------------------------------------------
  { key: 'starchart', name: 'Star Chart', engine: 'constellation', treatment: 'ink', themes: ['night', 'transcendence'], energy: 0.3, grit: 0.25 },
  { key: 'planisphere', name: 'Planisphere', engine: 'constellation', treatment: 'blueprint', themes: ['night', 'memory'], energy: 0.3, grit: 0.3 },
  { key: 'deepfield', name: 'Deep Field', engine: 'constellation', treatment: 'neon', themes: ['night', 'transcendence'], energy: 0.5, grit: 0.35 },
  { key: 'nightgarden', name: 'Night Garden', engine: 'constellation', treatment: 'stipple', themes: ['night', 'nature'], energy: 0.35, grit: 0.4 },

  // ---- drift ---------------------------------------------------------------
  { key: 'ashfall', name: 'Ashfall', engine: 'drift', treatment: 'ink', themes: ['loss', 'fire'], energy: 0.45, grit: 0.5, preference: 0.5 },
  { key: 'snowblind', name: 'Snowblind', engine: 'drift', treatment: 'stipple', themes: ['loss', 'night'], energy: 0.3, grit: 0.4, preference: 0.5 },
  { key: 'interferencefield', name: 'Signal Loss', engine: 'drift', treatment: 'halftone', themes: ['city', 'loss'], energy: 0.6, grit: 0.8, preference: 0.5 },
  { key: 'pollen', name: 'Pollen', engine: 'drift', treatment: 'wash', themes: ['nature', 'love'], energy: 0.3, grit: 0.25, preference: 0.5 },
  { key: 'chaff', name: 'Chaff', engine: 'drift', treatment: 'sketch', themes: ['defiance', 'motion'], energy: 0.7, grit: 0.65, preference: 0.5 },
  // ---- aurora --------------------------------------------------------------
  { key: 'northernlight', name: 'Northern Light', engine: 'aurora', treatment: 'aura', themes: ['transcendence', 'night'], energy: 0.45, grit: 0.25, preference: 1.35 },
  { key: 'solarwind', name: 'Solar Wind', engine: 'aurora', treatment: 'neon', themes: ['motion', 'transcendence'], energy: 0.75, grit: 0.4, preference: 1.3 },
  { key: 'hanginglight', name: 'Hanging Light', engine: 'aurora', treatment: 'smoke', themes: ['loss', 'night'], energy: 0.3, grit: 0.3, preference: 1.3 },
  { key: 'seafire', name: 'Sea Fire', engine: 'aurora', treatment: 'wash', themes: ['water', 'love'], energy: 0.4, grit: 0.25, preference: 1.25 },

  // ---- nebula --------------------------------------------------------------
  { key: 'stellarnursery', name: 'Stellar Nursery', engine: 'nebula', treatment: 'aura', themes: ['night', 'transcendence'], energy: 0.4, grit: 0.3, preference: 1.35 },
  { key: 'darkmatter', name: 'Dark Matter', engine: 'nebula', treatment: 'smoke', themes: ['night', 'loss'], energy: 0.3, grit: 0.35, preference: 1.3 },
  { key: 'ionstorm', name: 'Ion Storm', engine: 'nebula', treatment: 'neon', themes: ['fire', 'defiance'], energy: 0.8, grit: 0.5, preference: 1.25 },
  { key: 'emberfield', name: 'Ember Field', engine: 'nebula', treatment: 'ink', themes: ['fire', 'memory'], energy: 0.5, grit: 0.4, preference: 1.2 },

  // ---- rose window ---------------------------------------------------------
  { key: 'rosewindow', name: 'Rose Window', engine: 'rose', treatment: 'aura', themes: ['transcendence', 'love'], energy: 0.5, grit: 0.3, preference: 1.4 },
  { key: 'sanctuary', name: 'Sanctuary', engine: 'rose', treatment: 'ink', themes: ['transcendence', 'memory'], energy: 0.45, grit: 0.3, preference: 1.3 },
  { key: 'kaleidoscope', name: 'Kaleidoscope', engine: 'rose', treatment: 'riso', themes: ['love', 'body'], energy: 0.6, grit: 0.45, preference: 1.25 },
  { key: 'reredos', name: 'Reredos', engine: 'rose', treatment: 'woodcut', themes: ['transcendence', 'defiance'], energy: 0.7, grit: 0.75, preference: 1.2 },
  { key: 'compassrose', name: 'Compass Rose', engine: 'rose', treatment: 'engrave', themes: ['motion', 'memory'], energy: 0.4, grit: 0.35, preference: 1.15 },

  // ---- veil ----------------------------------------------------------------
  { key: 'farshore', name: 'Far Shore', engine: 'veil', treatment: 'smoke', themes: ['loss', 'water'], energy: 0.25, grit: 0.25, preference: 1.35 },
  { key: 'firstlight', name: 'First Light', engine: 'veil', treatment: 'aura', themes: ['transcendence', 'memory'], energy: 0.35, grit: 0.25, preference: 1.35 },
  { key: 'longview', name: 'Long View', engine: 'veil', treatment: 'wash', themes: ['memory', 'nature'], energy: 0.3, grit: 0.2, preference: 1.3 },
  { key: 'duststorm', name: 'Dust Storm', engine: 'veil', treatment: 'ink', themes: ['motion', 'loss'], energy: 0.55, grit: 0.5, preference: 1.2 },

  // ---- atmospheric passes over the original engines -------------------------
  { key: 'thurible', name: 'Thurible', engine: 'radiance', treatment: 'smoke', themes: ['transcendence', 'memory'], energy: 0.4, grit: 0.35, preference: 1.3 },
  { key: 'sunstruck', name: 'Sunstruck', engine: 'radiance', treatment: 'aura', themes: ['fire', 'love'], energy: 0.6, grit: 0.3, preference: 1.4 },
  { key: 'deepwater', name: 'Deep Water', engine: 'constellation', treatment: 'aura', themes: ['night', 'water'], energy: 0.35, grit: 0.3, preference: 1.35 },
  { key: 'wakefield', name: 'Wake', engine: 'constellation', treatment: 'smoke', themes: ['loss', 'night'], energy: 0.3, grit: 0.3, preference: 1.25 },
  { key: 'shockwave', name: 'Shockwave', engine: 'shatter', treatment: 'aura', themes: ['defiance', 'fire'], energy: 0.85, grit: 0.55, preference: 1.25 },
  { key: 'stormglass', name: 'Storm Glass', engine: 'fracture', treatment: 'smoke', themes: ['defiance', 'loss'], energy: 0.7, grit: 0.5, preference: 1.2 },
  { key: 'oldgrowth', name: 'Old Growth', engine: 'growth', treatment: 'smoke', themes: ['nature', 'memory'], energy: 0.4, grit: 0.35, preference: 1.25 },
  { key: 'phosphor', name: 'Phosphor', engine: 'growth', treatment: 'aura', themes: ['body', 'nature'], energy: 0.55, grit: 0.35, preference: 1.25 },
  { key: 'reliquarylight', name: 'Reliquary Light', engine: 'strata', treatment: 'aura', themes: ['memory', 'transcendence'], energy: 0.4, grit: 0.3, preference: 1.2 },
  { key: 'gravitywell', name: 'Gravity Well', engine: 'orbits', treatment: 'aura', themes: ['transcendence', 'night'], energy: 0.45, grit: 0.3, preference: 1.25 },
  { key: 'seaglass', name: 'Sea Glass', engine: 'bloom', treatment: 'aura', themes: ['water', 'love'], energy: 0.4, grit: 0.3, preference: 1.2 },
];

export const STYLE_BY_KEY = new Map(STYLES.map((s) => [s.key, s]));

/**
 * Scores every style against the song and returns the best fit.
 *
 * Theme affinity dominates — what a song is about should decide the shape of
 * the picture. Energy and grit break the resulting ties, which is what stops
 * every defiant song from getting the same treatment.
 */
export function chooseStyle(
  themes: { key: ThemeKey; strength: number }[],
  energy: number,
  grit: number,
  seed: number,
): Style {
  const strengthByTheme = new Map<ThemeKey, number>();
  for (const theme of themes) strengthByTheme.set(theme.key, theme.strength);

  let best: Style = STYLES[0] as Style;
  let bestScore = -Infinity;

  for (let i = 0; i < STYLES.length; i += 1) {
    const style = STYLES[i] as Style;

    let themeScore = 0;
    style.themes.forEach((key, index) => {
      // The style's first-listed theme is what it is really for.
      const weight = index === 0 ? 1 : 0.55;
      themeScore += (strengthByTheme.get(key) ?? 0) * weight;
    });

    const energyScore = 1 - Math.abs(style.energy - energy);
    const gritScore = 1 - Math.abs(style.grit - grit);

    // A small deterministic wobble so songs that score alike don't all land on
    // whichever style happens to be first in the list.
    const jitter = (((seed ^ Math.imul(i + 1, 0x9e3779b9)) >>> 0) / 0xffffffff) * 0.18;

    // Preference is deliberately weighty. Without it the pattern engines win
    // constantly on theme alone, and every song comes back as texture.
    const preference = style.preference ?? 1;
    const score = themeScore * 2.4 + energyScore * 0.8 + gritScore * 0.5 + jitter
      + (preference - 1) * 2.2;
    if (score > bestScore) {
      bestScore = score;
      best = style;
    }
  }

  return best;
}
