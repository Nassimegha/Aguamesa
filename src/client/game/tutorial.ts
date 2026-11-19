// src/client/game/tutorial.ts — P1
// First-time tutorial (01 Task 6.1): an animated hand presses on the glass, a ring fills
// while it holds, then it lifts. NO text at all. Shown only the first time: it disappears
// as soon as the player presses, and is remembered on this device.

import type * as THREE from 'three';
import type { Glass } from './glass';

export const TUTORIAL_SEEN_KEY = 'aguamesa.tutorialSeen';

/** Length of one loop of the animation, in seconds. */
export const LOOP_SECONDS = 2.8;

/** Where the hand is at time t (seconds), for one loop. Pure: tested in tutorial.test.ts. */
export interface HandPose {
  /** Vertical offset in px (positive = lower). */
  y: number;
  /** 1 = normal, < 1 = pressing. */
  scale: number;
  handOpacity: number;
  /** 0..1: how much of the "hold" ring is filled. */
  ring: number;
  ringOpacity: number;
  /** true between the press and the release. */
  pressed: boolean;
}

const clamp01 = (x: number): number => Math.min(Math.max(x, 0), 1);
const ease = (x: number): number => {
  const k = clamp01(x);
  return k * k * (3 - 2 * k);
};

/**
 * The timeline of one loop:
 *   0.00-0.35 hand slides in        0.35-0.50 presses down
 *   0.50-1.70 holds, the ring fills  1.70-1.90 lifts (release)
 *   1.90-2.40 fades out              2.40-2.80 pause
 */
export function handPose(t: number): HandPose {
  const s = ((t % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS;
  const enter = ease(s / 0.35);
  const press = ease((s - 0.35) / 0.15);
  const hold = clamp01((s - 0.5) / 1.2);
  const lift = ease((s - 1.7) / 0.2);
  const fade = ease((s - 1.9) / 0.5);

  const pressed = s >= 0.42 && s < 1.75;
  return {
    y: 40 * (1 - enter) - 12 * lift,
    scale: 1 - 0.12 * press + 0.12 * lift,
    handOpacity: enter * (1 - fade),
    ring: s < 0.5 ? 0 : s < 1.7 ? hold : 1,
    ringOpacity: s < 0.4 ? 0 : (1 - fade) * (s < 1.7 ? 1 : 1 - 0.5 * lift),
    pressed,
  };
}

type SeenStorage = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): SeenStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // storage blocked: the tutorial shows each session, that's fine
  }
}

export function hasSeenTutorial(storage: SeenStorage | null = defaultStorage()): boolean {
  try {
    return storage?.getItem(TUTORIAL_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markTutorialSeen(storage: SeenStorage | null = defaultStorage()): void {
  try {
    storage?.setItem(TUTORIAL_SEEN_KEY, '1');
  } catch {
    // storage blocked: nothing to remember
  }
}

/** Screen position (CSS px, relative to the canvas) of the middle of a glass. */
export function glassScreenPoint(
  glass: Glass,
  camera: THREE.Camera,
  canvas: HTMLElement,
  level = 0.45,
): { x: number; y: number } {
  // position.clone() is just a cheap way to get a new Vector3 (this file only imports Three's types).
  const point = glass.root.localToWorld(glass.root.position.clone().set(0, glass.levelToLocalY(level), 0));
  point.project(camera);
  const rect = canvas.getBoundingClientRect();
  return { x: rect.left + ((point.x + 1) / 2) * rect.width, y: rect.top + ((1 - point.y) / 2) * rect.height };
}

export interface TutorialOptions {
  /** The element the player presses on: the first press there dismisses the tutorial. */
  inputElement: HTMLElement;
  /** Where to put the fingertip (CSS px, page coordinates). Default: centre of inputElement. */
  anchor?: () => { x: number; y: number };
  /** Where to add the overlay. Default: document.body. */
  container?: HTMLElement;
  /** Show it even if it was already seen (dev / "replay tutorial" button). */
  force?: boolean;
  storage?: SeenStorage | null;
}

export interface Tutorial {
  /** Hides it now and remembers it was seen. */
  dismiss(): void;
}

// A simple pointing hand, drawn in SVG (fingertip at the top-centre, at x=34, y=4).
const HAND_SVG = `
<svg viewBox="0 0 68 92" width="68" height="92" aria-hidden="true">
  <path d="M28 10c0-4 3-7 6-7s6 3 6 7v30l3-1c3 0 6 2 6 5v2l3-1c3 0 6 2 6 5v2l2-.5c3 0 5 2 5 5v14
           c0 12-9 21-21 21h-6c-8 0-14-4-18-10L6 64c-2-3-1-6 1-8 3-2 6-1 8 1l6 7V10z"
        fill="#fff8ec" stroke="#2a1d14" stroke-width="3" stroke-linejoin="round"/>
  <path d="M40 42v12M49 47v8M58 52v6" stroke="#2a1d14" stroke-width="2.5" stroke-linecap="round" fill="none"/>
</svg>`;

const RING_RADIUS = 26;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/**
 * Shows the tutorial if this player never saw it (or if `force`). Returns null when it is
 * not shown. It removes itself on the first press on `inputElement`.
 */
export function showTutorialIfFirstTime(options: TutorialOptions): Tutorial | null {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  if (!options.force && hasSeenTutorial(storage)) return null;

  const container = options.container ?? document.body;
  const overlay = document.createElement('div');
  overlay.setAttribute('role', 'img');
  overlay.setAttribute('aria-label', 'Hold to pour, release to stop'); // for screen readers only
  Object.assign(overlay.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '0',
    height: '0',
    pointerEvents: 'none', // the player's press goes through to the canvas
    zIndex: '20',
  });
  overlay.innerHTML = `
    <svg width="80" height="80" viewBox="0 0 80 80" style="position:absolute;left:-40px;top:-40px;overflow:visible" aria-hidden="true">
      <circle cx="40" cy="40" r="${RING_RADIUS}" fill="rgba(255,241,201,0.12)" stroke="rgba(255,241,201,0.35)" stroke-width="4"/>
      <circle class="fill" cx="40" cy="40" r="${RING_RADIUS}" fill="none" stroke="#fff1c9" stroke-width="4"
              stroke-linecap="round" transform="rotate(-90 40 40)"
              stroke-dasharray="${RING_LENGTH}" stroke-dashoffset="${RING_LENGTH}"/>
    </svg>
    <div class="hand" style="position:absolute;left:-34px;top:-4px;transform-origin:34px 4px;filter:drop-shadow(0 4px 6px rgba(0,0,0,.45))">${HAND_SVG}</div>`;
  container.appendChild(overlay);

  const ringSvg = overlay.querySelector('svg') as SVGSVGElement;
  const ringFill = overlay.querySelector('.fill') as SVGCircleElement;
  const hand = overlay.querySelector('.hand') as HTMLDivElement;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const anchor =
    options.anchor ??
    (() => {
      const r = options.inputElement.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height * 0.6 };
    });

  let frame = 0;
  const start = performance.now();
  function animate(now: number): void {
    const { x, y } = anchor();
    overlay.style.transform = `translate(${x}px, ${y}px)`;
    // Reduced motion: a still hand, pressing, with a full ring.
    const pose = reducedMotion ? handPose(1.2) : handPose((now - start) / 1000);
    hand.style.opacity = String(pose.handOpacity);
    hand.style.transform = `translateY(${pose.y}px) scale(${pose.scale})`;
    ringSvg.style.opacity = String(pose.ringOpacity);
    ringFill.setAttribute('stroke-dashoffset', String(RING_LENGTH * (1 - pose.ring)));
    frame = requestAnimationFrame(animate);
  }
  frame = requestAnimationFrame(animate);

  let done = false;
  function dismiss(): void {
    if (done) return;
    done = true;
    cancelAnimationFrame(frame);
    options.inputElement.removeEventListener('pointerdown', dismiss);
    window.removeEventListener('keydown', onKey);
    overlay.style.transition = 'opacity 0.2s';
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 220);
    markTutorialSeen(storage);
  }
  const onKey = (event: KeyboardEvent): void => {
    if (event.code === 'Space') dismiss();
  };
  options.inputElement.addEventListener('pointerdown', dismiss);
  window.addEventListener('keydown', onKey);

  return { dismiss };
}
