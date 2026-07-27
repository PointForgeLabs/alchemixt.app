/** Every structural engine, gathered. */

import { ATMOSPHERIC_ENGINES } from './atmospheric';
import { BROKEN_ENGINES } from './broken';
import { FIELD_ENGINES } from './fields';
import { LAYERED_ENGINES } from './layered';
import { ORGANIC_ENGINES } from './organic';
import { RADIAL_ENGINES } from './radial';
import type { EngineDef } from './types';

export type { Engine, EngineDef, EngineEnv } from './types';

export const ENGINES: EngineDef[] = [
  ...ATMOSPHERIC_ENGINES,
  ...FIELD_ENGINES,
  ...RADIAL_ENGINES,
  ...LAYERED_ENGINES,
  ...BROKEN_ENGINES,
  ...ORGANIC_ENGINES,
];

export const ENGINE_BY_KEY = new Map(ENGINES.map((e) => [e.key, e]));
