// src/client/game/input.ts — P1
// "Press to pour, release to stop" for finger, mouse, pen and keyboard (Space).
//
// Mobile pitfalls handled here (01 "Pièges"):
//   - Without `touch-action: none` on the canvas, Reddit scrolls the page instead of pouring.
//   - Long-press opens a context menu / text selection / iOS callout: all blocked.
//   - Pinch / double-tap zoom: blocked.
//   - A finger that slides off the canvas, a phone call, or switching apps must still
//     END the pour (otherwise the liquid would keep flowing forever).
//
// holdMs is measured with performance.now(), as the brief requires.

export interface HoldInputCallbacks {
  /** The player just pressed. Called once per hold. */
  onPress(): void;
  /** The player released (or the hold was interrupted). `holdMs` = time since onPress. */
  onRelease(holdMs: number): void;
}

export interface HoldInput {
  /** true between onPress and onRelease. */
  readonly isHolding: boolean;
  /** Milliseconds since the press, or 0 when not holding. Use it to animate while holding. */
  heldMs(): number;
  /** Ignore presses (e.g. while the result is shown). Ending a hold in progress still works. */
  setEnabled(enabled: boolean): void;
  /** Ends the current hold now, as if the player released (e.g. the glass overflowed). */
  forceRelease(): void;
  /** Removes every listener and restores the element's styles. */
  dispose(): void;
}

/** Styles that stop the browser from scrolling, zooming or selecting when the player holds. */
const NO_GESTURE_STYLES: Record<string, string> = {
  'touch-action': 'none',
  'user-select': 'none',
  '-webkit-user-select': 'none',
  '-webkit-touch-callout': 'none',
  '-webkit-tap-highlight-color': 'transparent',
};

export function createHoldInput(element: HTMLElement, callbacks: HoldInputCallbacks): HoldInput {
  let enabled = true;
  let holding = false;
  let pressedAt = 0;
  /** Which pointer started the hold (-1 = keyboard). Other fingers are ignored. */
  let activePointerId: number | null = null;

  // --- styles -----------------------------------------------------------------
  const previousStyles = new Map<string, string>();
  for (const [prop, value] of Object.entries(NO_GESTURE_STYLES)) {
    previousStyles.set(prop, element.style.getPropertyValue(prop));
    element.style.setProperty(prop, value);
  }

  // --- start / end ----------------------------------------------------------------
  function press(pointerId: number): void {
    if (!enabled || holding) return;
    holding = true;
    activePointerId = pointerId;
    pressedAt = performance.now();
    callbacks.onPress();
  }

  function release(): void {
    if (!holding) return;
    const holdMs = performance.now() - pressedAt;
    holding = false;
    activePointerId = null;
    callbacks.onRelease(holdMs);
  }

  // --- pointer (finger, mouse, pen) --------------------------------------------
  function onPointerDown(event: PointerEvent): void {
    if (!event.isPrimary) return; // a second finger does not start a new pour
    if (event.pointerType === 'mouse' && event.button !== 0) return; // left button only
    event.preventDefault();
    // Keep receiving pointerup even if the finger slides off the canvas.
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      // Some old browsers throw for synthetic pointers: not a problem, pointerup still arrives.
    }
    press(event.pointerId);
  }

  function onPointerEnd(event: PointerEvent): void {
    if (event.pointerId !== activePointerId) return;
    release();
  }

  // --- keyboard (desktop / accessibility): hold Space --------------------------
  function onKeyDown(event: KeyboardEvent): void {
    if (event.code !== 'Space') return;
    event.preventDefault(); // Space would scroll the page
    if (event.repeat) return; // key auto-repeat is not a new press
    press(-1);
  }

  function onKeyUp(event: KeyboardEvent): void {
    if (event.code !== 'Space' || activePointerId !== -1) return;
    event.preventDefault();
    release();
  }

  // --- interruptions: app switch, phone call, tab hidden ----------------------
  function onVisibilityChange(): void {
    if (document.hidden) release();
  }

  // --- block the browser's own gestures on the element -------------------------
  const block = (event: Event): void => event.preventDefault();

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointerup', onPointerEnd);
  element.addEventListener('pointercancel', onPointerEnd);
  element.addEventListener('lostpointercapture', onPointerEnd);
  element.addEventListener('contextmenu', block); // Android long-press menu
  element.addEventListener('touchstart', block, { passive: false }); // iOS scroll / zoom
  element.addEventListener('touchmove', block, { passive: false });
  element.addEventListener('dblclick', block); // double-tap zoom
  element.addEventListener('gesturestart', block); // iOS pinch (Safari only event)
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return {
    get isHolding() {
      return holding;
    },
    heldMs() {
      return holding ? performance.now() - pressedAt : 0;
    },
    setEnabled(value: boolean) {
      enabled = value;
    },
    forceRelease: release,
    dispose() {
      release();
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointerup', onPointerEnd);
      element.removeEventListener('pointercancel', onPointerEnd);
      element.removeEventListener('lostpointercapture', onPointerEnd);
      element.removeEventListener('contextmenu', block);
      element.removeEventListener('touchstart', block);
      element.removeEventListener('touchmove', block);
      element.removeEventListener('dblclick', block);
      element.removeEventListener('gesturestart', block);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      for (const [prop, value] of previousStyles) {
        if (value) element.style.setProperty(prop, value);
        else element.style.removeProperty(prop);
      }
    },
  };
}
