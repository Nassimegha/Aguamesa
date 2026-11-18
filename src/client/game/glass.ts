// src/client/game/glass.ts — P1
// Loads glass_<model>.glb (made by P2) and reads the 3 markers from contract 00 §6.3:
//   LIQUID_BOTTOM (empty)  : level 0
//   LIQUID_TOP    (empty)  : level 1 (the rim)
//   LIQUID_SHAPE  (mesh)   : the inside of the glass, so the liquid takes its shape
// If the .glb is missing or broken, falls back to a simple transparent cylinder with the
// same markers, so gameplay never blocks on assets (01 Task 2.2).
//
// Also draws the target line: a thin glowing ring around the glass at `line`.

import * as THREE from 'three';
import type { GlassModel } from '../../shared/types';

export interface Glass {
  readonly model: GlassModel;
  /** Add this to the scene. Move / rotate this, never the children. */
  readonly root: THREE.Group;
  /** The inside shape. liquid.ts replaces its material with the liquid shader. */
  readonly liquidShape: THREE.Mesh;
  /** true if the real .glb failed and we are showing the fallback cylinder. */
  readonly isFallback: boolean;
  /** Height (in root-local units) of a level: 0 = LIQUID_BOTTOM, 1 = LIQUID_TOP. Linear. */
  levelToLocalY(level: number): number;
  /** Inner radius (root-local units) of the glass at a level, measured from LIQUID_SHAPE. */
  radiusAt(level: number): number;
  /** Moves the target line to `level` (0..1). Same as setLines([level]). */
  setLine(level: number): void;
  /** Several target lines (layers twist), bottom to top. */
  setLines(levels: readonly number[]): void;
  /** Dims line `index` (e.g. a layer already poured): 1 = bright, 0 = invisible. */
  setLineOpacity(index: number, opacity: number): void;
  /** Shows or hides all the target lines (tutorial, hidden_line twist...). */
  setLineVisible(visible: boolean): void;
  /** The line meshes (for twists that restyle them, e.g. spin). */
  readonly lineMeshes: readonly THREE.Mesh[];
  dispose(): void;
}

/** A loader that returns the glb scene, e.g. GameScene.loadGLB from world/scene.ts. */
export type GlbLoader = (url: string) => Promise<THREE.Group>;

export const DEFAULT_GLASS_BASE_URL = '/assets/models/';

/** Number of slices used to measure the radius of LIQUID_SHAPE along its height. */
const PROFILE_SLICES = 24;

/** The line ring sits on the outside of the glass wall: a bit wider than the liquid. */
const LINE_RADIUS_FACTOR = 1.1;
const LINE_THICKNESS = 0.0011; // metres
const LINE_COLOR = 0xfff1c9;

/** Draw order: liquid first, then glass, then the line on top (all inside one glass). */
export const RENDER_ORDER = { liquid: 1, glass: 2, line: 3 } as const;

export async function loadGlass(
  loadGLB: GlbLoader,
  model: GlassModel,
  baseUrl: string = DEFAULT_GLASS_BASE_URL,
): Promise<Glass> {
  try {
    const root = await loadGLB(`${baseUrl}glass_${model}.glb`);
    return buildGlass(model, root, false);
  } catch (error) {
    console.warn(`glass_${model}.glb unavailable, using the fallback cylinder`, error);
    return buildGlass(model, createFallbackGlass(), true);
  }
}

/** Wraps an already-loaded glass scene. Throws if a marker is missing. Exported for tests/tools. */
export function buildGlass(model: GlassModel, root: THREE.Group, isFallback: boolean): Glass {
  root.updateMatrixWorld(true);

  const bottom = root.getObjectByName('LIQUID_BOTTOM');
  const top = root.getObjectByName('LIQUID_TOP');
  const shape = root.getObjectByName('LIQUID_SHAPE');
  if (!bottom || !top || !(shape instanceof THREE.Mesh)) {
    if (isFallback) throw new Error('fallback glass is missing its markers'); // should never happen
    console.warn(`glass_${model}.glb is missing LIQUID_BOTTOM / LIQUID_TOP / LIQUID_SHAPE, using the fallback`);
    return buildGlass(model, createFallbackGlass(), true);
  }

  // Marker heights in the root's own coordinates (independent of where the glass is placed).
  const toRootLocal = (obj: THREE.Object3D): THREE.Vector3 =>
    root.worldToLocal(obj.getWorldPosition(new THREE.Vector3()));
  const bottomY = toRootLocal(bottom).y;
  const topY = toRootLocal(top).y;
  const height = topY - bottomY;
  if (!(height > 0)) throw new Error(`glass_${model}: LIQUID_TOP must be above LIQUID_BOTTOM`);

  const profile = measureRadiusProfile(root, shape, bottomY, height);

  // Everything except the liquid is "glass": draw it after the liquid.
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj !== shape) obj.renderOrder = RENDER_ORDER.glass;
  });
  shape.renderOrder = RENDER_ORDER.liquid;

  function levelToLocalY(level: number): number {
    return bottomY + level * height;
  }

  function radiusAt(level: number): number {
    const x = Math.min(Math.max(level, 0), 1) * (PROFILE_SLICES - 1);
    const i = Math.min(Math.floor(x), PROFILE_SLICES - 2);
    const t = x - i;
    return profile[i]! * (1 - t) + profile[i + 1]! * t;
  }

  // --- target lines ---------------------------------------------------------------
  // Unit ring (radius 1), shared by every line; scaled to the glass radius in setLines().
  const lineGeometry = new THREE.TorusGeometry(1, LINE_THICKNESS, 6, 64);
  lineGeometry.rotateX(Math.PI / 2);
  const lines: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>[] = [];
  let linesVisible = true;

  function setLines(levels: readonly number[]): void {
    // Create missing rings, hide extra ones.
    while (lines.length < levels.length) {
      const material = new THREE.MeshBasicMaterial({
        color: LINE_COLOR,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        toneMapped: false,
      });
      const ring = new THREE.Mesh(lineGeometry, material);
      ring.name = `TARGET_LINE_${lines.length}`;
      ring.renderOrder = RENDER_ORDER.line;
      root.add(ring);
      lines.push(ring);
    }
    lines.forEach((ring, i) => {
      const level = levels[i];
      ring.visible = level !== undefined && linesVisible;
      if (level === undefined) return;
      const r = radiusAt(level) * LINE_RADIUS_FACTOR;
      ring.position.set(0, levelToLocalY(level), 0);
      ring.scale.set(r, 1, r); // x/z only, so the tube keeps its thickness vertically
      ring.material.opacity = 0.95;
      ring.userData.active = true;
    });
    lines.slice(levels.length).forEach((ring) => (ring.userData.active = false));
  }
  setLines([0.7]);

  return {
    model,
    root,
    liquidShape: shape,
    isFallback,
    levelToLocalY,
    radiusAt,
    setLine: (level: number) => setLines([level]),
    setLines,
    setLineOpacity(index: number, opacity: number) {
      const ring = lines[index];
      if (ring) ring.material.opacity = 0.95 * opacity;
    },
    setLineVisible(visible: boolean) {
      linesVisible = visible;
      for (const ring of lines) ring.visible = visible && ring.userData.active === true;
    },
    get lineMeshes() {
      return lines;
    },
    dispose() {
      root.removeFromParent();
      lineGeometry.dispose();
      for (const ring of lines) ring.material.dispose();
      root.traverse((obj) => {
        if (obj instanceof THREE.Mesh) obj.geometry.dispose();
      });
    },
  };
}

/**
 * Measures how wide LIQUID_SHAPE is at PROFILE_SLICES heights, in root-local units.
 * Reads the mesh vertices once at load (a few hundred vertices: instant).
 */
function measureRadiusProfile(
  root: THREE.Group,
  shape: THREE.Mesh,
  bottomY: number,
  height: number,
): number[] {
  const profile = new Array<number>(PROFILE_SLICES).fill(0);
  const positions = shape.geometry.getAttribute('position');
  // Matrix from the mesh's own space to the root's space.
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(shape.matrixWorld);
  const v = new THREE.Vector3();
  let maxRadius = 0;

  for (let i = 0; i < positions.count; i++) {
    v.fromBufferAttribute(positions, i).applyMatrix4(toRoot); // handles quantized (normalized) data
    const r = Math.hypot(v.x, v.z);
    maxRadius = Math.max(maxRadius, r);
    const level = (v.y - bottomY) / height;
    const slice = Math.round(Math.min(Math.max(level, 0), 1) * (PROFILE_SLICES - 1));
    profile[slice] = Math.max(profile[slice]!, r);
  }

  // Slices with no vertex (e.g. a straight wall with only top and bottom rings): interpolate
  // between the nearest measured neighbours, or use the widest radius if nothing is known.
  const known = profile.map((r, i) => (r > 0 ? i : -1)).filter((i) => i >= 0);
  if (known.length === 0) return profile.fill(maxRadius || 0.03);
  for (let i = 0; i < PROFILE_SLICES; i++) {
    if (profile[i]! > 0) continue;
    const below = [...known].reverse().find((k) => k < i);
    const above = known.find((k) => k > i);
    if (below === undefined) profile[i] = profile[above!]!;
    else if (above === undefined) profile[i] = profile[below]!;
    else {
      const t = (i - below) / (above - below);
      profile[i] = profile[below]! * (1 - t) + profile[above]! * t;
    }
  }
  return profile;
}

/** Plain transparent pint-sized cylinder with the §6.3 markers. Used only if the .glb fails. */
function createFallbackGlass(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'glass_fallback';
  const radius = 0.035;
  const bottomY = 0.006;
  const topY = 0.148;

  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0xd9eef5,
    transparent: true,
    opacity: 0.22,
    roughness: 0.05,
    metalness: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius + 0.003, radius, topY + 0.002, 32, 1, true), glassMaterial);
  body.name = 'GlassBody';
  body.position.y = (topY + 0.002) / 2;
  root.add(body);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, bottomY, 32), glassMaterial);
  base.position.y = bottomY / 2;
  root.add(base);

  const shape = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.94, radius * 0.94, topY - bottomY, 32, 4),
    new THREE.MeshBasicMaterial(),
  );
  shape.name = 'LIQUID_SHAPE';
  shape.position.y = (topY + bottomY) / 2;
  root.add(shape);

  const bottom = new THREE.Object3D();
  bottom.name = 'LIQUID_BOTTOM';
  bottom.position.y = bottomY;
  root.add(bottom);

  const top = new THREE.Object3D();
  top.name = 'LIQUID_TOP';
  top.position.y = topY;
  root.add(top);

  return root;
}
