// src/client/game/twists/layers.ts — P1
// layers2 / layers3: 2 or 3 lines, one press per line. Each press pours a new colour,
// so the player sees the layers stack up. Lines already done are dimmed.
// Score: shared/pour.ts (pourSequence, average of the layers).

import { layerLines } from '../../../shared/pour';
import { LAYER_COLORS } from '../liquid';
import type { TwistContext, TwistVisual } from './types';

const DONE_LINE_OPACITY = 0.3;

export function createLayers({ glass, liquid, spec }: TwistContext): TwistVisual {
  const lines = layerLines(spec);
  glass.setLines(lines);
  let shownPresses = -1;

  return {
    update(_dt, frame) {
      // The colour boundaries are the levels where the previous presses stopped.
      // While pouring press k, the liquid above layerLevels[k-1] has colour k.
      const done = frame.layerLevels.length;
      if (done === shownPresses) return;
      shownPresses = done;
      liquid.setLayers(frame.layerLevels.slice(0, lines.length - 1), LAYER_COLORS);
      lines.forEach((_, i) => glass.setLineOpacity(i, i < done ? DONE_LINE_OPACITY : 1));
    },
    dispose() {
      liquid.setLayers([], []);
      glass.setLine(spec.line);
    },
  };
}
