import createLegacyRuntime from '../legacy/create-runtime';
import type { LegacySimulation } from '../legacy/runtime-types';
export { createRandom } from '../kernel/random';
export { createEventEngine } from '../kernel/events';
export type { LegacySimulation, LegacyLife, LifeOptions } from '../legacy/runtime-types';

/**
 * One runtime per life/session. The returned TL compatibility surface is temporary;
 * each call owns its content maps, mutable state and random generator.
 */
export function createSimulation(): LegacySimulation {
  return createLegacyRuntime() as LegacySimulation;
}
