// src/client/game/twists/foam.ts — P1
// foam: a white foam band rises faster than the liquid, then settles to a small head.
// If the foam goes over the rim, it's an overflow (shared/pour.ts: foamAt, FOAM_HEAD).

import { AMBER, type LiquidColors } from '../liquid';
import type { TwistContext, TwistVisual } from './types';

/** A beer-like colour, so the foam reads clearly. */
const BEER: LiquidColors = { deep: 0x7a3b05, body: 0xd98a12, surface: 0xffe3a3 };

export function createFoam({ liquid }: TwistContext): TwistVisual {
  liquid.setColors(BEER);
  return {
    update(_dt, frame) {
      liquid.setFoam(frame.level > 0 ? frame.foam : 0);
    },
    dispose() {
      liquid.setFoam(0);
      liquid.setColors(AMBER);
    },
  };
}
