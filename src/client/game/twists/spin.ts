// src/client/game/twists/spin.ts — P1
// spin: the glass turns slowly, and the line is only an arc on one side of it, so it is
// sometimes hidden behind the glass. Visual only: the score is the base formula.

import * as THREE from 'three';
import { twistSeed } from '../../../shared/pour';
import type { TwistContext, TwistVisual } from './types';

const ARC_ANGLE = Math.PI * 0.7; // the line covers ~126° of the glass
const MIN_SPEED = 0.7; // rad/s
const MAX_SPEED = 1.3;
const HIDDEN_OPACITY = 0.08;

export function createSpin({ glass, spec, camera }: TwistContext): TwistVisual {
  // Seeded speed and direction: the same glass always spins the same way.
  const seed = twistSeed(spec, 'spin');
  const speed = (MIN_SPEED + (MAX_SPEED - MIN_SPEED) * seed) * (seed < 0.5 ? 1 : -1);
  const startAngle = glass.root.rotation.y;

  // Replace the full ring by an arc centred on +x (local), same size and position.
  const ring = glass.lineMeshes[0];
  const originalGeometry = ring?.geometry;
  const arcGeometry = new THREE.TorusGeometry(1, 0.0011, 6, 32, ARC_ANGLE);
  arcGeometry.rotateZ(-ARC_ANGLE / 2); // centre the arc on +x
  arcGeometry.rotateX(Math.PI / 2);
  if (ring) ring.geometry = arcGeometry;

  const arcDirection = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  const center = new THREE.Vector3();

  return {
    update(dt) {
      glass.root.rotation.y += speed * dt;
      if (!ring || !camera) return;
      // Fade the arc when it faces away from the player (behind the glass).
      glass.root.getWorldPosition(center);
      arcDirection.set(1, 0, 0).applyQuaternion(glass.root.getWorldQuaternion(new THREE.Quaternion()));
      toCamera.subVectors(camera.getWorldPosition(new THREE.Vector3()), center).setY(0).normalize();
      const facing = arcDirection.setY(0).normalize().dot(toCamera); // 1 = towards the player
      const opacity = HIDDEN_OPACITY + (1 - HIDDEN_OPACITY) * THREE.MathUtils.smoothstep(facing, -0.2, 0.5);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.95 * opacity;
    },
    dispose() {
      glass.root.rotation.y = startAngle;
      if (ring && originalGeometry) ring.geometry = originalGeometry;
      arcGeometry.dispose();
    },
  };
}
