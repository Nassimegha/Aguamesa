// src/client/game/twists/tilt.ts — P1
// tilt: the boat rocks, so the glass tilts left and right. The liquid surface stays flat
// in the world (liquid.ts works in world space), so it looks tilted inside the glass.
// Score: the glass spills TILT_MARGIN below the rim (shared/pour.ts: overflowLimit).

import { twistSeed } from '../../../shared/pour';
import type { TwistContext, TwistVisual } from './types';

const MAX_ANGLE = 0.13; // radians (~7.5°)
const PERIOD_SECONDS = 2.6;

export function createTilt({ glass, spec }: TwistContext): TwistVisual {
  const phase = twistSeed(spec, 'tilt') * Math.PI * 2;
  const start = { x: glass.root.rotation.x, z: glass.root.rotation.z };

  return {
    update(_dt, frame) {
      const t = (frame.time / PERIOD_SECONDS) * Math.PI * 2 + phase;
      glass.root.rotation.z = start.z + MAX_ANGLE * Math.sin(t);
      glass.root.rotation.x = start.x + MAX_ANGLE * 0.35 * Math.sin(t * 0.5);
    },
    dispose() {
      glass.root.rotation.x = start.x;
      glass.root.rotation.z = start.z;
    },
  };
}
