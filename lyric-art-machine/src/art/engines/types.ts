/**
 * What an engine is given, and what it is expected to produce.
 *
 * Engines are structural: they decide where forms go. They know nothing about
 * color, medium, or pixels — that is the treatment's and the painter's job.
 */

import type { ArtGenome } from '../../analysis/interpret';
import type { Scene } from '../geometry';
import type { Rng } from '../rng';

export interface EngineEnv {
  width: number;
  height: number;
  /** Shortest edge — express sizes in this so formats stay consistent. */
  unit: number;
  scene: Scene;
  rng: Rng;
  noise: (x: number, y: number) => number;
  genome: ArtGenome;
  /** Song loudness at position t (0..1). Always 1 when no audio was heard. */
  arcAt: (t: number) => number;
}

/** Yields progress 0..1 so a dense engine can paint visibly rather than block. */
export type Engine = (env: EngineEnv) => Generator<number, void, unknown>;

export interface EngineDef {
  key: string;
  label: string;
  description: string;
  run: Engine;
}
