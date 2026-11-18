// src/client/game/twists/hiddenLine.ts — P1
// hidden_line: the line is visible at first, and disappears as soon as the player starts
// pouring. It comes back once the score is known, so the player sees how close they were.
// Visual only: the score is the base formula.

import type { TwistContext, TwistVisual } from './types';

export function createHiddenLine({ glass }: TwistContext): TwistVisual {
  return {
    onPourStart() {
      glass.setLineVisible(false);
    },
    update(_dt, frame) {
      if (frame.phase === 'done') glass.setLineVisible(true);
    },
    dispose() {
      glass.setLineVisible(true);
    },
  };
}
