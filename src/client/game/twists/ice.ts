// src/client/game/twists/ice.ts — P1
// ice: when the liquid reaches a seeded level, an ice cube drops in and the level jumps
// by ICE_RISE (shared/pour.ts: iceTrigger, ICE_RISE). If the player stops before, the cube
// still falls right after release, so the final level always includes it.

import * as THREE from 'three';
import { RENDER_ORDER } from '../glass';
import type { TwistContext, TwistVisual } from './types';

const FALL_HEIGHT = 0.12; // metres above the surface where the cube appears
const GRAVITY = 9.81;

export function createIce({ glass }: TwistContext): TwistVisual {
  // Cube sized to the glass: about 45 % of the inner width.
  const size = glass.radiusAt(0.5) * 0.9;
  const geometry = new THREE.BoxGeometry(size, size, size);
  const material = new THREE.MeshStandardMaterial({
    color: 0xe8f6ff,
    transparent: true,
    opacity: 0.75,
    roughness: 0.1,
    metalness: 0,
  });
  const cube = new THREE.Mesh(geometry, material);
  cube.name = 'ICE_CUBE';
  cube.visible = false;
  cube.renderOrder = RENDER_ORDER.glass;
  glass.root.add(cube);

  let dropped = false;
  let speed = 0;
  let landed = false;

  return {
    update(dt, frame) {
      if (frame.iceIn && !dropped) {
        dropped = true;
        cube.visible = true;
        cube.position.set(size * 0.15, glass.levelToLocalY(Math.min(frame.level, 1)) + FALL_HEIGHT, 0);
        cube.rotation.set(0.4, 0.7, 0.2);
      }
      if (!dropped) return;
      // The cube floats with ~70 % of it under the surface.
      const floatY = glass.levelToLocalY(Math.min(frame.level, 1)) - size * 0.2;
      if (!landed) {
        speed += GRAVITY * dt;
        cube.position.y -= speed * dt;
        if (cube.position.y <= floatY) landed = true;
      } else {
        // Gentle bob on the surface.
        cube.position.y = floatY + Math.sin(frame.time * 3) * size * 0.04;
        cube.rotation.y += dt * 0.3;
      }
    },
    dispose() {
      cube.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
