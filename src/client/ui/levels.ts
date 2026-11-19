// P2 (Nassime) : mode Niveaux (00 §1 « 10 niveaux par lieu, de 1 à 3 étoiles »).
// - showLevelSelect : la grille cafe-01..cafe-10, étoiles gagnées (PlayerState.stars),
//   seuils 1★/2★/3★ (Level.stars), niveau suivant débloqué dès 1 étoile.
// - showLevelResult : le bilan du niveau (score de chaque verre, total, 1 à 3 étoiles
//   qui apparaissent une par une, Replay / Next Level).
import { mountScreen, header, bindBack, type Screen } from './screen';

export interface LevelCard {
  id: string;
  num: number;
  /** Best stars so far, 0..3. */
  stars: number;
  /** [1★, 2★, 3★] total thresholds. */
  thresholds: [number, number, number];
  glasses: number;
  locked: boolean;
}

export interface LevelSelectActions {
  onPlay(id: string): void;
  onClose(): void;
  /** Switch to another location's levels (tabs). */
  onTab?(location: string): void;
}

export interface LevelTab {
  id: string;
  label: string;
  active: boolean;
}

function starRow(n: number, cls = 'lvl-stars'): string {
  return `<span class="${cls}">${[0, 1, 2].map((i) => `<span class="lvl-star ${i < n ? 'lvl-star--on' : ''}">★</span>`).join('')}</span>`;
}

export function showLevelSelect(title: string, cards: LevelCard[], actions: LevelSelectActions, tabs: LevelTab[] = []): Screen {
  const total = cards.reduce((s, c) => s + c.stars, 0);
  const tabsHtml = tabs.length
    ? `<div class="leaderboard__tabs lvl-tabs">${tabs
        .map((t) => `<button class="btn leaderboard__tab ${t.active ? 'leaderboard__tab--on' : ''}" data-tab="${t.id}">${t.label}</button>`)
        .join('')}</div>`
    : '';
  const html = cards
    .map(
      (c) => `
      <button class="lvl-card ${c.locked ? 'lvl-card--locked' : ''} ${c.stars === 3 ? 'lvl-card--gold' : ''}"
        data-level="${c.id}" ${c.locked ? 'disabled aria-label="Level ' + c.num + ', locked"' : `aria-label="Level ${c.num}, ${c.stars} of 3 stars"`}>
        <span class="lvl-card__num">${c.locked ? '🔒' : c.num}</span>
        ${starRow(c.stars)}
        <span class="lvl-card__meta">${c.locked ? 'Earn 1★ on ' + (c.num - 1) : `${c.glasses} glasses · ★${c.thresholds[0]}`}</span>
      </button>`,
    )
    .join('');

  const screen = mountScreen(
    `
    ${header(title, actions.onClose)}
    <div class="card lvl-select">
      ${tabsHtml}
      <div class="lvl-select__total">★ ${total} / ${cards.length * 3}</div>
      <div class="lvl-grid">${html}</div>
      <div class="lvl-select__hint">Hit the line on every glass. More total points, more stars.</div>
    </div>
    `,
    'levels-screen',
  );
  screen.el.querySelectorAll<HTMLButtonElement>('[data-level]').forEach((b) =>
    b.addEventListener('click', () => {
      if (!b.disabled) actions.onPlay(b.dataset.level!);
    }),
  );
  screen.el.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      if (!b.classList.contains('leaderboard__tab--on')) actions.onTab?.(b.dataset.tab!);
    }),
  );
  bindBack(screen, actions.onClose);
  return screen;
}

export interface LevelResultView {
  num: number;
  scores: number[];
  total: number;
  stars: 0 | 1 | 2 | 3;
  thresholds: [number, number, number];
  bestBefore: number;
  hasNext: boolean;
  nextUnlocked: boolean;
}

export interface LevelResultActions {
  onReplay(): void;
  onNext(): void;
  onClose(): void;
}

function chipClass(s: number): string {
  if (s === 0) return 'score-chip--overflow';
  if (s >= 95) return 'score-chip--perfect';
  if (s >= 70) return 'score-chip--good';
  return 'score-chip--meh';
}

const VERDICT = ['So close! Try again.', 'Nice pouring!', 'Great shift!', 'Flawless. Legendary barista!'];

export function showLevelResult(view: LevelResultView, actions: LevelResultActions): Screen {
  const max = view.scores.length * 100;
  const chips = view.scores
    .map((s, i) => `<div class="score-chip ${chipClass(s)}" style="animation-delay:${0.1 + i * 0.12}s">${s === 0 ? '💦' : s}<small>Glass ${i + 1}</small></div>`)
    .join('');
  const bar = (t: number): string => `<span class="lvl-bar__tick" style="left:${(t / max) * 100}%"><b>★</b>${t}</span>`;
  const newBest = view.stars > view.bestBefore;

  const screen = mountScreen(
    `
    <div class="card lvl-result" role="dialog" aria-label="Level ${view.num} complete">
      <div class="lvl-result__title">Level ${view.num}</div>
      <div class="lvl-result__stars">
        ${[0, 1, 2]
          .map((i) => `<span class="lvl-big-star ${i < view.stars ? 'lvl-big-star--on' : ''}" style="animation-delay:${0.6 + i * 0.35}s">★</span>`)
          .join('')}
      </div>
      <div class="lvl-result__verdict">${VERDICT[view.stars]}${newBest ? ' <span class="lvl-new">New best!</span>' : ''}</div>
      <div class="night-result__total">${view.total}<span>/${max}</span></div>
      <div class="lvl-bar">
        <span class="lvl-bar__fill" style="width:${Math.min(100, (view.total / max) * 100)}%"></span>
        ${view.thresholds.map(bar).join('')}
      </div>
      <div class="score-row">${chips}</div>
      <div class="lvl-result__actions">
        <button class="btn" data-replay>↻ Replay</button>
        ${view.hasNext ? `<button class="btn btn--primary" data-next ${view.nextUnlocked ? '' : 'disabled'}>Next Level ▸</button>` : ''}
      </div>
      <button class="btn btn--ghost lvl-result__back" data-back>All levels</button>
    </div>
    `,
    'lvl-result-screen',
  );
  screen.el.querySelector('[data-replay]')?.addEventListener('click', actions.onReplay);
  screen.el.querySelector('[data-next]')?.addEventListener('click', actions.onNext);
  bindBack(screen, actions.onClose);
  return screen;
}
