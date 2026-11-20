// Shown when a 3D load fails (island map, location decor, model): a message plus a
// way back, so the user is never stuck on a black screen. Same building blocks
// as the other screens (screen.ts): full-screen overlay over the canvas, paper
// card, the shared .btn styles.
import { bindBack, header, mountScreen, type Screen } from './screen';

export interface LoadErrorActions {
  onHome(): void;
  onRetry?(): void;
  onMap?(): void;
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function showLoadError(title: string, message: string, actions: LoadErrorActions): Screen {
  // Home is the only way back when there is no retry: make it primary then.
  const homeCls = actions.onRetry ? 'btn night-result__more' : 'btn btn--primary night-result__share';
  const screen = mountScreen(
    `
    ${header(esc(title), actions.onHome)}
    <div class="card night-result">
      <div class="night-result__note">\u26A0\uFE0F ${esc(message)}</div>
      <div class="night-result__hint">Check your connection and try again. Your streak and scores are safe.</div>
      ${actions.onRetry ? '<button class="btn btn--primary night-result__share" data-retry>\u21BB Try Again</button>' : ''}
      ${actions.onMap ? '<button class="btn night-result__more" data-map>\u{1F5FA}\uFE0F Back to Map</button>' : ''}
      <button class="${homeCls}" data-home>\u2302 Back to Home</button>
    </div>
    `,
    'night-result-screen',
  );
  if (actions.onRetry) screen.el.querySelector('[data-retry]')?.addEventListener('click', actions.onRetry);
  if (actions.onMap) screen.el.querySelector('[data-map]')?.addEventListener('click', actions.onMap);
  screen.el.querySelector('[data-home]')?.addEventListener('click', actions.onHome);
  bindBack(screen, actions.onHome);
  return screen;
}
