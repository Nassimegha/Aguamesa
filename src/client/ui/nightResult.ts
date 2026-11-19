// P2 (Nassime) : écrans de fin de service.
// - showNightResult : la vraie nuit (Tonight's Shift) : 5 scores, total sur 500, pourboires,
//   série 🔥, rang, « Share ». Puis « Keep playing » : on n'est jamais bloqué jusqu'au
//   lendemain, on continue en Free Play.
// - showPracticeResult : une partie Free Play (lieux 1 à 5) : même bilan, « Play Again »
//   illimité, sans toucher au serveur, à la série ni au classement.
import { mountScreen, header, bindBack, type Screen } from './screen';
import { createStreakWidget } from './streak';
import type { NightSummary } from './contractTypesTemp';

export interface NightResultActions {
  onShare(): void;
  onClose(): void;
  /** Keep playing after the real shift: Free Play (unlimited, not counted). */
  onPlayMore?(): void;
}

function scoreClass(score: number): string {
  if (score === 0) return 'score-chip--overflow';
  if (score >= 95) return 'score-chip--perfect';
  if (score >= 70) return 'score-chip--good';
  return 'score-chip--meh';
}

function chips(scores: number[]): string {
  return scores
    .map((s, i) => `<div class="score-chip ${scoreClass(s)}">${s === 0 ? '💦' : s}<small>Glass ${i + 1}</small></div>`)
    .join('');
}

export function showNightResult(summary: NightSummary, actions: NightResultActions): Screen {
  const screen = mountScreen(
    `
    ${header("Tonight's Shift", actions.onClose)}
    <div class="card night-result">
      <div class="night-result__total">${summary.total}<span>/500</span></div>
      <div class="score-row">${chips(summary.scores)}</div>
      <div class="night-result__stats">
        <div>💰 <b>${summary.tips}</b> tips</div>
        <div class="night-result__streak"></div>
        <div>🏅 Rank <b>#${summary.rank}</b></div>
      </div>
      ${summary.freezeUsed ? '<div class="night-result__note">🧊 A streak freeze saved last night.</div>' : ''}
      <button class="btn btn--primary night-result__share" data-share>Share</button>
      ${
        actions.onPlayMore
          ? `<button class="btn night-result__more" data-more>🎮 Keep playing · Free Play</button>
             <div class="night-result__hint">Tonight's score is saved. Your next real shift opens at midnight (UTC).
             Until then, replay as much as you like in the 5 other places.</div>`
          : ''
      }
    </div>
    `,
    'night-result-screen',
  );

  const streakWidget = createStreakWidget(summary.streak, 0);
  screen.el.querySelector('.night-result__streak')!.appendChild(streakWidget.el);

  if (summary.streakMilestone) {
    setTimeout(() => streakWidget.playMilestone(summary.streakMilestone!), 400);
  }
  if (summary.freezeUsed) {
    setTimeout(() => streakWidget.playFreezeUsed(), 1200);
  }

  screen.el.querySelector('[data-share]')?.addEventListener('click', actions.onShare);
  if (actions.onPlayMore) screen.el.querySelector('[data-more]')?.addEventListener('click', actions.onPlayMore);
  bindBack(screen, actions.onClose);

  return screen;
}

// ---------------------------------------------------------------------------
// Free Play
// ---------------------------------------------------------------------------

export interface PracticeView {
  place: string;
  scores: number[];
  total: number;
  /** What this total would earn in a real shift (same formula as the server). */
  tips: number;
  streak: number;
  /** Where the real shift takes place, e.g. "Haunted Castle". */
  realPlace: string;
}

export interface PracticeActions {
  onReplay(): void;
  onMap(): void;
  onHome(): void;
}

export function showPracticeResult(view: PracticeView, actions: PracticeActions): Screen {
  const max = view.scores.length * 100;
  const screen = mountScreen(
    `
    ${header(`Free Play · ${view.place}`, actions.onHome)}
    <div class="card night-result">
      <div class="practice-badge">FREE PLAY · UNLIMITED</div>
      <div class="night-result__total">${view.total}<span>/${max}</span></div>
      <div class="score-row">${chips(view.scores)}</div>
      <div class="night-result__stats">
        <div>💰 ≈ <b>${view.tips}</b> tips in a real shift</div>
        <div class="night-result__streak"></div>
      </div>
      <div class="night-result__note">This round doesn't change your 🔥 streak or the leaderboard.
        Only <b>Tonight's Shift</b> at the ${view.realPlace} counts: one try per night, scored by the server,
        +1 🔥 for every night in a row.</div>
      <button class="btn btn--primary night-result__share" data-replay>↻ Play Again</button>
      <button class="btn night-result__more" data-map>🗺️ Choose another place</button>
    </div>
    `,
    'night-result-screen',
  );
  const streakWidget = createStreakWidget(view.streak, 0);
  screen.el.querySelector('.night-result__streak')!.appendChild(streakWidget.el);
  screen.el.querySelector('[data-replay]')?.addEventListener('click', actions.onReplay);
  screen.el.querySelector('[data-map]')?.addEventListener('click', actions.onMap);
  bindBack(screen, actions.onHome);
  return screen;
}
