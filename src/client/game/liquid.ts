// src/client/game/liquid.ts — P1
// The liquid inside a glass: ONE light shader, no fluid physics (01 "Pièges").
//
// How it works (cheap and mobile-friendly):
//   1. We reuse the glass's LIQUID_SHAPE mesh (the inside of the glass).
//   2. The fragment shader DISCARDS every pixel above the liquid surface.
//   3. Through that cut you see the inside of the far wall (its back faces). We paint
//      back faces in a light "surface" colour, so they read as the flat top of the liquid.
//   4. The surface height gets a small sine wave while pouring, which fades out after,
//      so at rest the surface is EXACTLY at the level computed by pour.ts.
//   5. A thin stream falls from above while the finger is down, then a few drops.
//
// Everything is driven from outside: call setLevel() / setPouring() and update(dt) each frame.

import * as THREE from 'three';
import { RENDER_ORDER, type Glass } from './glass';

export interface LiquidColors {
  /** Colour at the bottom of the glass. */
  deep: THREE.ColorRepresentation;
  /** Colour just under the surface. */
  body: THREE.ColorRepresentation;
  /** The top surface (and the meniscus band). */
  surface: THREE.ColorRepresentation;
}

/** Default: warm amber, like the placeholder in P2's glasses. */
export const AMBER: LiquidColors = { deep: 0x9a4a08, body: 0xe9a11f, surface: 0xffe3a3 };

export interface Liquid {
  /** The last level given to setLevel(). */
  readonly level: number;
  /** Level shown on screen: 0 = LIQUID_BOTTOM, 1 = LIQUID_TOP. Values above 1 are drawn at 1. */
  setLevel(level: number): void;
  /** Stream on while the finger is down; turning it off releases the last drops. */
  setPouring(pouring: boolean): void;
  /** Tilts the surface (for the tilt twist later): slope in x and z, in level units per metre. */
  setTilt(slopeX: number, slopeZ: number): void;
  setColors(colors: LiquidColors): void;
  /** Call every frame with the frame time in seconds. */
  update(deltaSeconds: number): void;
  /** Puts back the original material and removes the stream. */
  dispose(): void;
}

// --- tuning ---------------------------------------------------------------------------
const WAVE_MAX = 0.0016; // metres: ripple height while pouring (~1 % of a pint)
const WAVE_FADE_PER_SECOND = 2.2; // how fast the ripples calm down after release
const STREAM_HEIGHT = 0.28; // metres above the rim where the stream starts
const STREAM_RADIUS = 0.0032; // metres
const STREAM_THIN_SECONDS = 0.12; // the stream thins out over the drip time (≈ DRIP_MS)
const DROP_COUNT = 3;
const DROP_RADIUS = 0.0028;
const DROP_INTERVAL = 0.05; // seconds between two drops
const GRAVITY = 9.81;

const vertexShader = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uSurfaceY;   // world height of the calm surface
  uniform float uBottomY;    // world height of level 0
  uniform vec2  uCenter;     // world x/z of the glass axis
  uniform vec2  uTilt;       // surface slope (x, z)
  uniform float uWave;       // ripple height in metres
  uniform float uTime;
  uniform vec3  uDeep;
  uniform vec3  uBody;
  uniform vec3  uSurface;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  float surfaceHeight(vec2 xz) {
    vec2 p = xz - uCenter;
    float ripple = sin(p.x * 95.0 + uTime * 7.0) * 0.6 + sin(p.y * 80.0 - uTime * 5.3) * 0.4;
    return uSurfaceY + dot(uTilt, p) + ripple * uWave;
  }

  void main() {
    float s = surfaceHeight(vWorldPos.xz);
    if (vWorldPos.y > s) discard;

    vec3 color;
    if (!gl_FrontFacing) {
      // Seen through the cut: this is the top of the liquid.
      color = uSurface;
    } else {
      float h = clamp((vWorldPos.y - uBottomY) / max(s - uBottomY, 1e-4), 0.0, 1.0);
      color = mix(uDeep, uBody, h);
      // Soft rim light on the edges, so the liquid looks round.
      vec3 viewDir = normalize(cameraPosition - vWorldPos);
      float rim = pow(1.0 - abs(dot(normalize(vWorldNormal), viewDir)), 2.0);
      color += rim * 0.22;
      // Bright meniscus band just under the surface: makes the level easy to read.
      color = mix(color, uSurface, smoothstep(s - 0.0035, s, vWorldPos.y) * 0.65);
    }
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

export function createLiquid(glass: Glass, colors: LiquidColors = AMBER): Liquid {
  const mesh = glass.liquidShape;
  const originalMaterial = mesh.material;

  const uniforms = {
    uSurfaceY: { value: 0 },
    uBottomY: { value: 0 },
    uCenter: { value: new THREE.Vector2() },
    uTilt: { value: new THREE.Vector2() },
    uWave: { value: 0 },
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color() },
    uBody: { value: new THREE.Color() },
    uSurface: { value: new THREE.Color() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide, // back faces are the visible surface
  });
  mesh.material = material;
  mesh.renderOrder = RENDER_ORDER.liquid;

  // --- stream and drops (children of the glass root, in root-local units) ------------
  const streamMaterial = new THREE.MeshBasicMaterial();
  // Unit cylinder hanging DOWN from y = 0 to y = -1, scaled every frame.
  const streamGeometry = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
  streamGeometry.translate(0, -0.5, 0);
  const stream = new THREE.Mesh(streamGeometry, streamMaterial);
  stream.name = 'POUR_STREAM';
  stream.renderOrder = RENDER_ORDER.liquid;
  stream.visible = false;
  glass.root.add(stream);

  const dropGeometry = new THREE.SphereGeometry(DROP_RADIUS, 8, 6);
  const drops = Array.from({ length: DROP_COUNT }, () => {
    const drop = new THREE.Mesh(dropGeometry, streamMaterial);
    drop.visible = false;
    drop.renderOrder = RENDER_ORDER.liquid;
    glass.root.add(drop);
    return { mesh: drop, delay: 0, speed: 0, active: false };
  });

  const topY = glass.levelToLocalY(1);
  const streamStartY = topY + STREAM_HEIGHT;

  let level = 0;
  let pouring = false;
  let wave = 0;
  let streamThickness = 0; // 0..1
  let time = 0;
  const tilt = new THREE.Vector2();
  const worldPoint = new THREE.Vector3();

  function setColors(c: LiquidColors): void {
    uniforms.uDeep.value.set(c.deep);
    uniforms.uBody.value.set(c.body);
    uniforms.uSurface.value.set(c.surface);
    streamMaterial.color.set(c.body);
  }
  setColors(colors);

  function startDrops(): void {
    drops.forEach((drop, i) => {
      drop.active = true;
      drop.delay = i * DROP_INTERVAL;
      drop.speed = 0;
      drop.mesh.position.set(0, streamStartY, 0);
      drop.mesh.visible = false;
    });
  }

  function update(deltaSeconds: number): void {
    const dt = Math.min(deltaSeconds, 0.1); // a hidden tab can give a huge dt: ignore it
    time += dt;

    // Ripples: full while pouring, then calm down smoothly to exactly 0.
    wave = pouring ? 1 : wave * Math.exp(-WAVE_FADE_PER_SECOND * dt);
    if (wave < 0.01) wave = 0;

    // Stream: full while pouring, thins out after release.
    streamThickness = pouring ? 1 : Math.max(0, streamThickness - dt / STREAM_THIN_SECONDS);

    const shown = Math.min(Math.max(level, 0), 1);
    const surfaceLocalY = glass.levelToLocalY(shown);

    // Uniforms are in world space so the glass can be placed anywhere in the scene.
    glass.root.updateWorldMatrix(true, false);
    const rootScale = glass.root.getWorldScale(worldPoint).y;
    glass.root.localToWorld(worldPoint.set(0, surfaceLocalY, 0));
    uniforms.uSurfaceY.value = worldPoint.y;
    uniforms.uCenter.value.set(worldPoint.x, worldPoint.z);
    glass.root.localToWorld(worldPoint.set(0, glass.levelToLocalY(0), 0));
    uniforms.uBottomY.value = worldPoint.y;
    uniforms.uWave.value = WAVE_MAX * wave * rootScale;
    uniforms.uTilt.value.copy(tilt).multiplyScalar(glass.levelToLocalY(1) - glass.levelToLocalY(0));
    uniforms.uTime.value = time;

    mesh.visible = level > 0;

    // Stream from above the rim down to the surface.
    stream.visible = streamThickness > 0;
    if (stream.visible) {
      const r = STREAM_RADIUS * streamThickness * (1 + Math.sin(time * 40) * 0.08);
      stream.position.set(0, streamStartY, 0);
      stream.scale.set(r, streamStartY - surfaceLocalY, r);
    }

    // Falling drops after release: simple gravity, they vanish when they hit the surface.
    for (const drop of drops) {
      if (!drop.active) continue;
      if (drop.delay > 0) {
        drop.delay -= dt;
        continue;
      }
      drop.mesh.visible = true;
      drop.speed += GRAVITY * dt;
      drop.mesh.position.y -= drop.speed * dt;
      if (drop.mesh.position.y <= surfaceLocalY) {
        drop.active = false;
        drop.mesh.visible = false;
      }
    }
  }

  return {
    get level() {
      return level;
    },
    setLevel(value: number) {
      level = Number.isFinite(value) ? value : 0;
    },
    setPouring(value: boolean) {
      if (pouring && !value) startDrops();
      pouring = value;
    },
    setTilt(slopeX: number, slopeZ: number) {
      tilt.set(slopeX, slopeZ);
    },
    setColors,
    update,
    dispose() {
      mesh.material = originalMaterial;
      stream.removeFromParent();
      for (const drop of drops) drop.mesh.removeFromParent();
      material.dispose();
      streamMaterial.dispose();
      streamGeometry.dispose();
      dropGeometry.dispose();
    },
  };
}
