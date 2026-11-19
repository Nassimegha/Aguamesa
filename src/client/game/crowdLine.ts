// src/client/game/crowdLine.ts — P1
// The crowd line (01 Task 5.2): after the server answers, a soft dotted ring appears on the
// glass at `crowdLine` (where the other players stopped on average), with a small animated
// label "82 % battus" that counts up from 0.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RENDER_ORDER, type Glass } from './glass.ts';

export interface CrowdLineData {
  /** Average level of the players for this glass, 0..1 (PourResult.crowdLine). */
  crowdLine: number;
  /** 0..100 (PourResult.beatPercent). */
  beatPercent: number;
}

export interface CrowdLine {
  /** Call every frame. */
  update(deltaSeconds: number): void;
  dispose(): void;
}

// --- tuning ----------------------------------------------------------------------------
const DASHES = 28;
const DASH_FILL = 0.55; // part of each dash slot that is drawn (the rest is the gap)
const RADIUS_FACTOR = 1.13; // just outside the target line (1.1), so both stay readable
const THICKNESS = 0.0009;
const COLOR = 0x9fd8ff; // cool blue: clearly different from the warm target line
const FADE_IN_SECONDS = 0.35;
const COUNT_UP_SECONDS = 0.8;
const LABEL_HEIGHT = 0.026; // metres

/** The label text. A no-break space keeps "82 %" together, French style. Exported for tests. */
export function beatLabel(percent: number): string {
  const p = Math.round(Math.min(Math.max(percent, 0), 100));
  return `Beat ${p}%`;
}

/** Ring of short dashes, radius 1, lying flat (in the x/z plane). */
function makeDashedRing(): THREE.BufferGeometry {
  const slot = (Math.PI * 2) / DASHES;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < DASHES; i++) {
    const dash = new THREE.TorusGeometry(1, THICKNESS, 4, 3, slot * DASH_FILL);
    dash.rotateZ(i * slot);
    parts.push(dash);
  }
  const ring = mergeGeometries(parts)!;
  for (const part of parts) part.dispose();
  ring.rotateX(Math.PI / 2);
  return ring;
}

/** Draws the label on a small canvas, used as a sprite texture. */
function makeLabel(): { sprite: THREE.Sprite; draw(text: string): void; dispose(): void } {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(LABEL_HEIGHT * 4, LABEL_HEIGHT, 1); // keep the canvas 4:1 ratio
  sprite.renderOrder = RENDER_ORDER.line + 2;

  return {
    sprite,
    draw(text: string) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Soft pill behind the text, so it reads on any background.
      ctx.fillStyle = 'rgba(20, 16, 28, 0.72)';
      ctx.beginPath();
      ctx.roundRect(4, 8, canvas.width - 8, canvas.height - 16, 24);
      ctx.fill();
      ctx.fillStyle = '#cfeaff';
      ctx.font = '600 30px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1);
      texture.needsUpdate = true;
    },
    dispose() {
      texture.dispose();
      material.dispose();
    },
  };
}

export interface CrowdLineOptions {
  /** If given, the label slides left when it would go off the right edge of the screen. */
  camera?: THREE.Camera;
}

/** How far from the screen edge the label must stay (in NDC: -1 = left edge, 1 = right edge). */
const SCREEN_EDGE = 0.94;

export function showCrowdLine(glass: Glass, data: CrowdLineData, options: CrowdLineOptions = {}): CrowdLine {
  const level = Math.min(Math.max(data.crowdLine, 0), 1);
  const radius = glass.radiusAt(level) * RADIUS_FACTOR;
  const y = glass.levelToLocalY(level);

  const geometry = makeDashedRing();
  const material = new THREE.MeshBasicMaterial({
    color: COLOR,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
  });
  const ring = new THREE.Mesh(geometry, material);
  ring.name = 'CROWD_LINE';
  ring.renderOrder = RENDER_ORDER.line;
  ring.position.y = y;
  ring.scale.set(radius, 1, radius);
  glass.root.add(ring);

  // The label hangs in the scene (not on the glass), to the right of the glass: it must not
  // turn with the spin twist or rock with the tilt twist.
  const label = makeLabel();
  const host = glass.root.parent ?? glass.root;
  glass.root.updateWorldMatrix(true, false);
  const labelWorld = glass.root.localToWorld(new THREE.Vector3(0, y, 0));
  labelWorld.x += (radius + LABEL_HEIGHT * 2.3) * glass.root.getWorldScale(new THREE.Vector3()).x;
  label.sprite.position.copy(host.worldToLocal(labelWorld.clone()));
  label.sprite.material.opacity = 0;
  host.add(label.sprite);

  /**
   * Slides the label left until its right edge is on screen (phones are narrow). If it then
   * overlaps the glass, it moves just below the dotted ring so the ring stays visible.
   */
  const edge = new THREE.Vector3();
  const baseX = label.sprite.position.x;
  const baseY = label.sprite.position.y;
  function keepOnScreen(): void {
    const camera = options.camera;
    if (!camera) return;
    const scale = glass.root.getWorldScale(edge).x;
    const halfWidth = (label.sprite.scale.x / 2) * scale;
    for (let step = 0; step < 12; step++) {
      label.sprite.getWorldPosition(edge);
      edge.x += halfWidth;
      if (edge.project(camera).x <= SCREEN_EDGE) break;
      label.sprite.position.x -= halfWidth * 0.25;
    }
    const slid = baseX - label.sprite.position.x;
    const overlapsGlass = slid > (LABEL_HEIGHT * 2.3 - label.sprite.scale.x / 2) * scale;
    label.sprite.position.y = overlapsGlass ? baseY - LABEL_HEIGHT * 0.9 * scale : baseY;
  }

  let time = 0;
  let shownPercent = -1;

  return {
    update(deltaSeconds: number) {
      keepOnScreen();
      time += Math.min(deltaSeconds, 0.1);
      const fade = Math.min(time / FADE_IN_SECONDS, 1);
      material.opacity = 0.85 * fade;
      label.sprite.material.opacity = fade;
      // The ring "breathes" in from slightly wider, then settles.
      const grow = 1 + 0.15 * (1 - fade) ** 2;
      ring.scale.set(radius * grow, 1, radius * grow);
      // Count up with an ease-out, and redraw only when the number changes.
      const k = Math.min(time / COUNT_UP_SECONDS, 1);
      const percent = Math.round(data.beatPercent * (1 - (1 - k) ** 3));
      if (percent !== shownPercent) {
        shownPercent = percent;
        label.draw(beatLabel(percent));
      }
    },
    dispose() {
      ring.removeFromParent();
      label.sprite.removeFromParent();
      geometry.dispose();
      material.dispose();
      label.dispose();
    },
  };
}
