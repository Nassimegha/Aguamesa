// P2 (Nassime) : écran de résultat du Service du Jour (brief 02 Tâche 5).
// 5 scores, total sur 500, pourboires, série 🔥, bouton « Partager ».
import { mountScreen, header, bindBack, type Screen } from './screen';
import { createStreakWidget } from './streak';
import type { NightSummary } from './contractTypesTemp';

export interface NightResultActions {
  onShare(): void;
  onClose(): void;
}

function scoreClass(score: number): string {
  if (score === 0) return 'score-chip--overflow';
  if (score >= 95) return 'score-chip--perfect';
  if (score >= 70) return 'score-chip--good';
  return 'score-chip--meh';
}

export function showNightResult(summary: NightSummary, actions: NightResultActions): Screen {
  const scoreChips = summary.scores
    .map((s, i) => `<div class="score-chip ${scoreClass(s)}">${s === 0 ? '💦' : s}<small>Glass ${i + 1}</small></div>`)
    .join('');

  const screen = mountScreen(
    `
    ${header("Tonight's Shift", actions.onClose)}
    <div class="card night-result">
      <div class="night-result__total">${summary.total}<span>/500</span></div>
      <div class="score-row">${scoreChips}</div>
      <div class="night-result__stats">
        <div>💰 <b>${summary.tips}</b> tips</div>
        <div class="night-result__streak"></div>
        <div>🏅 Rank <b>#${summary.rank}</b></div>
      </div>
      ${summary.freezeUsed ? '<div class="night-result__note">🧊 A streak freeze saved last night.</div>' : ''}
      <button class="btn btn--primary night-result__share" data-share>Share</button>
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
  bindBack(screen, actions.onClose);

  return screen;
}
