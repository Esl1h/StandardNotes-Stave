import { type Engine } from '../core/engine';
import { abcEngine } from './abc';
import { alphaTexEngine } from './alphatex';
import { chordProEngine } from './chordpro';

/**
 * The notation engines, in the order they are offered and tried by
 * detection. The only file that lists them (docs/adr/0009).
 */
export const ENGINES: Engine[] = [abcEngine, alphaTexEngine, chordProEngine];

export const engineById = (id: string): Engine | undefined =>
  ENGINES.find((engine) => engine.id === id);

/**
 * The engine whose syntax the text is written in; for text that matches
 * none (an empty note, plain prose), the default engine, or the first one.
 */
export const detectEngine = (src: string, defaultId = ''): Engine | undefined =>
  ENGINES.find((engine) => engine.detect(src)) ?? engineById(defaultId) ?? ENGINES[0];
