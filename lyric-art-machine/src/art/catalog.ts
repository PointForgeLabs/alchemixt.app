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
}

export const STYLES: Style[] = [
  // ---- current -------------------------------------------------------------
  { key: 'riverrun', name: 'Riverrun', engine: 'current', treatment: 'ink', themes: ['water', 'motion'], energy: 0.5, grit: 0.3 },
  { key: 'undertow', name: 'Undertow', engine: 'current', treatment: 'wash', themes: ['water', 'loss'], energy: 0.3, grit: 0.2, bias: { density: 0.8 } },
  { key: 'slipstream', name: 'Slipstream', engine: 'current', treatment: 'neon', themes: ['motion', 'city'], energy: 0.8, grit: 0.5 },
  { key: 'silt', name: 'Silt', engine: 'current', treatment: 'engrave', themes: ['water', 'memory'], energy: 0.35, grit: 0.4 },
  { key: 'crosswind', name: 'Crosswind', engine: 'current', treatment: 'sketch', themes: ['motion', 'nature'], energy: 0.55, grit: 0.5 },
  { key: 'tidewrack', name: 'Tidewrack', engine: 'current', treatment: 'riso', themes: ['water', 'motion'], energy: 0.6, grit: 0.55 },

  // ---- terrain -------------------------------------------------------------
  { key: 'contour', name: 'Contour', engine: 'terrain', treatment: 'ink', themes: ['nature', 'memory'], energy: 0.35, grit: 0.25 },
  { key: 'survey', name: 'Survey', engine: 'terrain', treatment: 'blueprint', themes: ['nature', 'city'], energy: 0.4, grit: 0.3 },
  { key: 'seabed', name: 'Seabed', engine: 'terrain', treatment: 'engrave', themes: ['water', 'memory'], energy: 0.3, grit: 0.35 },
  { key: 'ridgeline', name: 'Ridgeline', engine: 'terrain', treatment: 'woodcut', themes: ['nature', 'defiance'], energy: 0.6, grit: 0.7 },
  { key: 'lowland', name: 'Lowland', engine: 'terrain', treatment: 'wash', themes: ['nature', 'loss'], energy: 0.25, grit: 0.2 },

  // ---- swarm ---------------------------------------------------------------
  { key: 'murmuration', name: 'Murmuration', engine: 'swarm', treatment: 'ink', themes: ['nature', 'motion'], energy: 0.55, grit: 0.35 },
  { key: 'hivemind', name: 'Hivemind', engine: 'swarm', treatment: 'stipple', themes: ['city', 'body'], energy: 0.5, grit: 0.45 },
  { key: 'panic', name: 'Panic', engine: 'swarm', treatment: 'sketch', themes: ['defiance', 'motion'], energy: 0.85, grit: 0.7, bias: { turbulence: 1.3 } },
  { key: 'shoal', name: 'Shoal', engine: 'swarm', treatment: 'riso', themes: ['water', 'nature'], energy: 0.45, grit: 0.4 },

  // ---- columns -------------------------------------------------------------
  { key: 'downpour', name: 'Downpour', engine: 'columns', treatment: 'ink', themes: ['water', 'loss'], energy: 0.5, grit: 0.35 },
  { key: 'curtainfall', name: 'Curtainfall', engine: 'columns', treatment: 'wash', themes: ['loss', 'night'], energy: 0.3, grit: 0.2 },
  { key: 'ticker', name: 'Ticker', engine: 'columns', treatment: 'neon', themes: ['city', 'motion'], energy: 0.75, grit: 0.5 },
  { key: 'reeds', name: 'Reeds', engine: 'columns', treatment: 'engrave', themes: ['nature', 'water'], energy: 0.3, grit: 0.3 },
  { key: 'staticfall', name: 'Static Fall', engine: 'columns', treatment: 'halftone', themes: ['city', 'night'], energy: 0.65, grit: 0.75 },

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
  { key: 'warpweft', name: 'Warp & Weft', engine: 'weave', treatment: 'ink', themes: ['memory', 'body'], energy: 0.4, grit: 0.3 },
  { key: 'sackcloth', name: 'Sackcloth', engine: 'weave', treatment: 'woodcut', themes: ['loss', 'defiance'], energy: 0.6, grit: 0.75 },
  { key: 'tartan', name: 'Tartan', engine: 'weave', treatment: 'riso', themes: ['memory', 'love'], energy: 0.5, grit: 0.45 },
  { key: 'gauze', name: 'Gauze', engine: 'weave', treatment: 'wash', themes: ['love', 'night'], energy: 0.25, grit: 0.2 },

  // ---- moire ---------------------------------------------------------------
  { key: 'interference', name: 'Interference', engine: 'moire', treatment: 'ink', themes: ['city', 'night'], energy: 0.55, grit: 0.4 },
  { key: 'beatfrequency', name: 'Beat Frequency', engine: 'moire', treatment: 'neon', themes: ['city', 'motion'], energy: 0.85, grit: 0.5 },
  { key: 'gridlock', name: 'Gridlock', engine: 'moire', treatment: 'blueprint', themes: ['city', 'defiance'], energy: 0.5, grit: 0.4 },

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
  { key: 'ashfall', name: 'Ashfall', engine: 'drift', treatment: 'ink', themes: ['loss', 'fire'], energy: 0.45, grit: 0.5 },
  { key: 'snowblind', name: 'Snowblind', engine: 'drift', treatment: 'stipple', themes: ['loss', 'night'], energy: 0.3, grit: 0.4 },
  { key: 'interferencefield', name: 'Signal Loss', engine: 'drift', treatment: 'halftone', themes: ['city', 'loss'], energy: 0.6, grit: 0.8 },
  { key: 'pollen', name: 'Pollen', engine: 'drift', treatment: 'wash', themes: ['nature', 'love'], energy: 0.3, grit: 0.25 },
  { key: 'chaff', name: 'Chaff', engine: 'drift', treatment: 'sketch', themes: ['defiance', 'motion'], energy: 0.7, grit: 0.65 },
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

    const score = themeScore * 2.4 + energyScore * 0.8 + gritScore * 0.5 + jitter;
    if (score > bestScore) {
      bestScore = score;
      best = style;
    }
  }

  return best;
}
