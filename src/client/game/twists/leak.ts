// src/client/game/twists/leak.ts — P1
// leak: after release, the level slowly drops (the session animates it from pour.ts:
// leakAmount). This file draws the drops escaping from a crack near the bottom.

import * as THREE from 'three';
import { twistSeed } from '../../../shared/pour';
import type { TwistContext, TwistVisual } from './types';

const DROP_COUNT = 6;
const DROP_RADIUS = 0.0022;
const DROP_EVERY = 0.12; // seconds between two drops
const FALL_DISTANCE = 0.12; // metres, then the drop restarts
const GRAVITY = 9.81;

export function createLeak({ glass, liquid, spec }: TwistContext): TwistVisual {
  // The crack: low on the side of the glass, at a seeded angle.
  const angle = twistSeed(spec, 'leak-angle') * Math.PI * 2;
  const crackLevel = 0.12;
  const r = glass.radiusAt(crackLevel) * 1.08;
  const crack = new THREE.Vector3(Math.cos(angle) * r, glass.levelToLocalY(crackLevel), Math.sin(angle) * r);

  const geometry = new THREE.SphereGeometry(DROP_RADIUS, 6, 5);
  const material = new THREE.MeshBasicMaterial({ color: 0xe9a11f });
  const drops = Array.from({ length: DROP_COUNT }, () => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    glass.root.add(mesh);
    return { mesh, speed: 0, active: false };
  });
  let spawnTimer = 0;
  let next = 0;

  return {
    update(dt, frame) {
      // Leaking only while the level is visibly going down, and while there is liquid above the crack.
      const leaking = frame.phase === 'settling' && liquid.level > crackLevel;
      if (leaking) {
        spawnTimer -= dt;
        if (spawnTimer <= 0) {
          spawnTimer = DROP_EVERY;
          const drop = drops[next]!;
          next = (next + 1) % DROP_COUNT;
          drop.active = true;
          drop.speed = 0;
          drop.mesh.position.copy(crack);
          drop.mesh.visible = true;
        }
      }
      for (const drop of drops) {
        if (!drop.active) continue;
        drop.speed += GRAVITY * dt;
        drop.mesh.position.y -= drop.speed * dt;
        if (drop.mesh.position.y < crack.y - FALL_DISTANCE) {
          drop.active = false;
          drop.mesh.visible = false;
        }
      }
    },
    dispose() {
      for (const drop of drops) drop.mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
