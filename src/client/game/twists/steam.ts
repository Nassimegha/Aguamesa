// src/client/game/twists/steam.ts — P1
// steam: soft clouds of vapour drift up and hide the top of the glass (and often the line).
// Visual only: the score is the base formula.

import * as THREE from 'three';
import { twistSeed } from '../../../shared/pour';
import { RENDER_ORDER } from '../glass';
import type { TwistContext, TwistVisual } from './types';

const PUFF_COUNT = 7;
const RISE_SECONDS = 2.4; // time for a puff to go from bottom to top of the steam zone
const STEAM_FROM = 0.6; // the steam hides from 60 % of the glass height...
const STEAM_TO = 1.25; // ...to a bit above the rim

/** A soft white disc, drawn once on a small canvas. */
function makePuffTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createSteam({ glass, spec }: TwistContext): TwistVisual {
  const texture = makePuffTexture();
  const width = glass.radiusAt(1) * 2.6;
  const fromY = glass.levelToLocalY(STEAM_FROM);
  const toY = glass.levelToLocalY(STEAM_TO);

  const puffs = Array.from({ length: PUFF_COUNT }, (_, i) => {
    // One small material per puff, so each one can fade on its own (7 materials: cheap).
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.renderOrder = RENDER_ORDER.line + 1; // drawn after the line: it hides it
    glass.root.add(sprite);
    const seed = twistSeed(spec, `steam-${i}`);
    return { sprite, material, offset: i / PUFF_COUNT, x: (seed - 0.5) * width * 0.5, wobble: seed * 6.28 };
  });

  return {
    update(_dt, frame) {
      for (const puff of puffs) {
        const k = (frame.time / RISE_SECONDS + puff.offset) % 1; // 0 → 1, then loops
        const y = fromY + (toY - fromY) * k;
        const scale = width * (0.7 + 0.5 * k);
        puff.sprite.position.set(puff.x + Math.sin(frame.time * 1.3 + puff.wobble) * width * 0.08, y, 0.002);
        puff.sprite.scale.set(scale, scale, 1);
        puff.material.opacity = 0.85 * Math.sin(Math.PI * k); // fade in at the bottom, out at the top
      }
    },
    dispose() {
      for (const puff of puffs) {
        puff.sprite.removeFromParent();
        puff.material.dispose();
      }
      texture.dispose();
    },
  };
}
