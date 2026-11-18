// src/client/game/twists/index.ts — P1
// Picks the visual for a glass's twist. One file per twist (01 Task 4).
// Glass sizes (mug_giant, thimble) are not a twist: only flow + shape, in shared/pour.ts.

import { createFoam } from './foam';
import { createHiddenLine } from './hiddenLine';
import { createIce } from './ice';
import { createLayers } from './layers';
import { createLeak } from './leak';
import { createSpin } from './spin';
import { createSteam } from './steam';
import { createTilt } from './tilt';
import { NO_TWIST, type TwistContext, type TwistVisual } from './types';

export type { PourPhase, TwistContext, TwistFrame, TwistVisual } from './types';

export function createTwistVisual(context: TwistContext): TwistVisual {
  switch (context.spec.twist) {
    case 'layers2':
    case 'layers3':
      return createLayers(context);
    case 'foam':
      return createFoam(context);
    case 'ice':
      return createIce(context);
    case 'spin':
      return createSpin(context);
    case 'tilt':
      return createTilt(context);
    case 'leak':
      return createLeak(context);
    case 'steam':
      return createSteam(context);
    case 'hidden_line':
      return createHiddenLine(context);
    case 'none':
      return NO_TWIST;
  }
}
