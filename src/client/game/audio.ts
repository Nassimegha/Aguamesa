// src/client/game/audio.ts — P1
// Sounds and vibration for the pour (01 Task 5). Every sound is SYNTHESISED with the
// Web Audio API: nothing to download (keeps the post under 2 s to load), no audio files.
//
//   pour    : a stream of filtered noise whose pitch RISES as the glass fills
//             (like a real glass: the air column above the liquid gets shorter).
//   drops   : 3 little "plinks" when the last drops land.
//   perfect : a clear two-note chime when the score is 100.
//   splash  : a noisy splash when the glass overflows.
//   release : navigator.vibrate(30) (Android; iPhones have no vibration API in the browser).
//
// iOS / Chrome rule (01 "Pièges"): audio can only start inside a user gesture. We listen
// for the first tap / click / key anywhere on the page and unlock the audio there.

import type { PourOutcome } from './pourSession';

/** What the pour session calls. Every method is safe to call even when audio is locked or muted. */
export interface PourSound {
  /** The finger went down. */
  pourStart(): void;
  /** Every frame while pouring: the level shown (0..1+). Drives the pitch. */
  pourLevel(level: number): void;
  /** The finger went up: stops the stream, vibrates, plays the last drops. */
  pourStop(level: number): void;
  /** The score is known: chime for a perfect, splash for an overflow. */
  result(outcome: Pick<PourOutcome, 'score' | 'overflow'>): void;
}

export interface GameAudio extends PourSound {
  /** true once the browser allowed sound (after the first gesture). */
  readonly unlocked: boolean;
  readonly muted: boolean;
  setMuted(muted: boolean): void;
  /** Stops everything and removes the unlock listeners. */
  dispose(): void;
}

export interface GameAudioOptions {
  /** Main volume 0..1. Default 0.8. */
  volume?: number;
  /** Called with the name of every sound played (for tests and debugging). */
  onPlay?(name: 'pour' | 'drop' | 'perfect' | 'splash' | 'vibrate'): void;
}

// --- tuning ----------------------------------------------------------------------------
const POUR_PITCH_EMPTY = 380; // Hz, bandpass centre for an empty glass
const POUR_PITCH_FULL = 1900; // Hz, for a full glass
const POUR_VOLUME = 0.35;
const FADE_SECONDS = 0.06;
const DROP_DELAYS = [0.25, 0.31, 0.38]; // seconds after release (matches the falling drops)
const VIBRATE_MS = 30;
const MUTE_KEY = 'aguamesa.muted';

/** Bandpass frequency for a level: rises faster near the top, like a real glass. Exported for tests. */
export function pourPitch(level: number): number {
  const l = Math.min(Math.max(level, 0), 1);
  return POUR_PITCH_EMPTY + (POUR_PITCH_FULL - POUR_PITCH_EMPTY) * l ** 1.6;
}

/** Pitch of a drop "plink": higher when the glass is fuller. Exported for tests. */
export function dropPitch(level: number): number {
  return 900 + 900 * Math.min(Math.max(level, 0), 1);
}

type AudioContextClass = typeof AudioContext;

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false; // private mode / storage blocked: not muted
  }
}

function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // storage blocked: the setting just won't be remembered
  }
}

export function createGameAudio(options: GameAudioOptions = {}): GameAudio {
  const volume = options.volume ?? 0.8;
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let muted = readMuted();
  let unlocked = false;

  // The stream currently playing (null when not pouring).
  let stream: { source: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;

  // --- unlock on the first gesture ------------------------------------------------
  const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;

  function ensureContext(): AudioContext | null {
    if (ctx) return ctx;
    const Ctor: AudioContextClass | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextClass }).webkitAudioContext;
    if (!Ctor) return null; // very old browser: the game works silently
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);
    noise = makeNoise(ctx);
    return ctx;
  }

  function unlock(): void {
    const c = ensureContext();
    if (!c) return;
    if (c.state === 'suspended') void c.resume().catch(() => {});
    // iOS needs a sound to actually start inside the gesture: play 1 silent sample.
    const silent = c.createBufferSource();
    silent.buffer = c.createBuffer(1, 1, c.sampleRate);
    silent.connect(c.destination);
    silent.start();
    if (c.state === 'running') {
      unlocked = true;
      for (const type of GESTURES) window.removeEventListener(type, unlock, true);
    } else {
      void c.resume().then(() => {
        unlocked = c.state === 'running';
        if (unlocked) for (const type of GESTURES) window.removeEventListener(type, unlock, true);
      }, () => {});
    }
  }
  // Capture phase: runs before any other handler, so the very first tap unlocks.
  for (const type of GESTURES) window.addEventListener(type, unlock, true);

  /** The context, only if sound can play right now. */
  function live(): AudioContext | null {
    if (muted || !ctx || ctx.state !== 'running' || !master) return null;
    return ctx;
  }

  // --- sounds -----------------------------------------------------------------------
  function pourStart(): void {
    if (!unlocked) unlock(); // pointerdown on a mouse is a valid gesture: try now too
    stopStream(0);
    const c = live();
    if (!c || !noise || !master) return;
    const source = c.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 6;
    filter.frequency.value = pourPitch(0);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, c.currentTime);
    gain.gain.linearRampToValueAtTime(POUR_VOLUME, c.currentTime + FADE_SECONDS);
    source.connect(filter).connect(gain).connect(master);
    source.start();
    stream = { source, filter, gain };
    options.onPlay?.('pour');
  }

  function pourLevel(level: number): void {
    const c = live();
    if (!c || !stream) return;
    // Smooth glide to the new pitch (no clicks), plus a little gurgle.
    const gurgle = 1 + 0.04 * Math.sin(c.currentTime * 31);
    stream.filter.frequency.setTargetAtTime(pourPitch(level) * gurgle, c.currentTime, 0.03);
  }

  function stopStream(fadeSeconds: number): void {
    if (!stream) return;
    const { source, gain } = stream;
    stream = null;
    const c = ctx;
    if (!c) return;
    const end = c.currentTime + fadeSeconds;
    gain.gain.cancelScheduledValues(c.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, c.currentTime);
    gain.gain.linearRampToValueAtTime(0, end);
    source.stop(end + 0.01);
  }

  function pourStop(level: number): void {
    stopStream(FADE_SECONDS);
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(VIBRATE_MS);
      options.onPlay?.('vibrate');
    }
    const c = live();
    if (!c || !master) return;
    for (const delay of DROP_DELAYS) plink(c, master, c.currentTime + delay, dropPitch(level));
    options.onPlay?.('drop');
  }

  function result(outcome: Pick<PourOutcome, 'score' | 'overflow'>): void {
    const c = live();
    if (!c || !master) return;
    if (outcome.overflow) {
      splash(c, master, noise!);
      options.onPlay?.('splash');
    } else if (outcome.score === 100) {
      chime(c, master);
      options.onPlay?.('perfect');
    }
  }

  return {
    get unlocked() {
      return unlocked;
    },
    get muted() {
      return muted;
    },
    setMuted(value: boolean) {
      muted = value;
      saveMuted(value);
      if (value) stopStream(FADE_SECONDS);
      if (master && ctx) master.gain.setTargetAtTime(value ? 0 : volume, ctx.currentTime, 0.02);
    },
    pourStart,
    pourLevel,
    pourStop,
    result,
    dispose() {
      stopStream(0);
      for (const type of GESTURES) window.removeEventListener(type, unlock, true);
      void ctx?.close().catch(() => {});
      ctx = null;
    },
  };
}

// --- sound recipes (each one is a few oscillators / noise + envelopes) -------------------

/** 1 second of white noise, generated once. Deterministic (no Math.random). */
function makeNoise(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x2f6b9a1d;
  for (let i = 0; i < data.length; i++) {
    // xorshift32: a tiny pseudo-random generator, good enough for noise
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    data[i] = ((seed >>> 0) / 4294967296) * 2 - 1;
  }
  return buffer;
}

/** A short drop: a sine that bends down quickly. */
function plink(ctx: AudioContext, out: AudioNode, at: number, pitch: number): void {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(pitch * 1.4, at);
  osc.frequency.exponentialRampToValueAtTime(pitch, at + 0.05);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.18, at + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
  osc.connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + 0.13);
}

/** "Perfect!": two bright bell-like notes (E6 then B6), with a soft overtone each. */
function chime(ctx: AudioContext, out: AudioNode): void {
  const notes: [number, number][] = [
    [1318.5, 0],
    [1975.5, 0.09],
  ];
  for (const [freq, delay] of notes) {
    for (const [mult, level] of [
      [1, 0.22],
      [2.76, 0.05], // bell overtone
    ] as const) {
      const at = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(level, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
      osc.connect(gain).connect(out);
      osc.start(at);
      osc.stop(at + 0.95);
    }
  }
}

/** Overflow: a burst of noise whose brightness falls, like liquid hitting the counter. */
function splash(ctx: AudioContext, out: AudioNode, noise: AudioBuffer): void {
  const at = ctx.currentTime;
  const source = ctx.createBufferSource();
  source.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(5000, at);
  filter.frequency.exponentialRampToValueAtTime(300, at + 0.45);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.5, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
  source.connect(filter).connect(gain).connect(out);
  source.start(at);
  source.stop(at + 0.52);
}
