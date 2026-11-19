// P2 (Nassime) : la série visible (brief 02 Tâche 5 bis).
// Une flamme qui grandit avec streak, les glaçons de série (0 à 2), une courte
// animation de palier (streakMilestone) et un toast « Ta série est sauvée »
// quand freezeUsed est vrai (contrat 00 §1, §6.1 NightSummary).

export interface StreakWidget {
  readonly el: HTMLDivElement;
  playMilestone(milestone: 3 | 7 | 14 | 30): void;
  playFreezeUsed(): void;
  dispose(): void;
}

const MILESTONE_REWARD_LABEL: Record<3 | 7 | 14 | 30, string> = {
  3: 'a new café decoration',
  7: 'the golden glass',
  14: 'a flair badge',
  30: 'a neon sign with your name',
};

export function createStreakWidget(streak: number, streakFreezes: number): StreakWidget {
  const el = document.createElement('div');
  el.className = 'streak-widget';
  render();

  function flameSize(n: number): string {
    if (n >= 14) return 'streak-widget__flame--big';
    if (n >= 7) return 'streak-widget__flame--medium';
    return 'streak-widget__flame--small';
  }

  function render(): void {
    const freezeDots = Array.from({ length: 2 }, (_, i) =>
      `<span class="streak-widget__freeze ${i < streakFreezes ? '' : 'streak-widget__freeze--empty'}">🧊</span>`,
    ).join('');
    el.innerHTML = `
      <span class="streak-widget__flame ${flameSize(streak)}">🔥</span>
      <span class="streak-widget__count">${streak}</span>
      <span class="streak-widget__freezes">${freezeDots}</span>
    `;
  }

  function playMilestone(milestone: 3 | 7 | 14 | 30): void {
    const toast = document.createElement('div');
    toast.className = 'streak-toast';
    toast.innerHTML = `
      <div class="streak-toast__title">🔥 ${milestone} nights!</div>
      <div class="streak-toast__body">Reward unlocked:${MILESTONE_REWARD_LABEL[milestone]}</div>
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('streak-toast--in'));
    setTimeout(() => {
      toast.classList.remove('streak-toast--in');
      setTimeout(() => toast.remove(), 400);
    }, 2600);
  }

  function playFreezeUsed(): void {
    const toast = document.createElement('div');
    toast.className = 'streak-toast streak-toast--freeze';
    toast.innerHTML = `
      <div class="streak-toast__title">🧊 Your streak is safe</div>
      <div class="streak-toast__body">A streak freeze covered last night.</div>
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('streak-toast--in'));
    setTimeout(() => {
      toast.classList.remove('streak-toast--in');
      setTimeout(() => toast.remove(), 400);
    }, 2600);
  }

  function dispose(): void {
    el.remove();
  }

  return { el, playMilestone, playFreezeUsed, dispose };
}

/** Phrase du premier client qui remarque la série (brief 02 Tâche 5 bis §5). */
export function streakLine(streak: number): string | null {
  if (streak >= 30) return `Night ${streak}? You basically live here.`;
  if (streak >= 14) return `${streak} nights in a row… you're practically family.`;
  if (streak >= 7) return `${streak} nights straight? Not bad at all.`;
  if (streak >= 3) return `${streak} nights running. I've seen worse habits.`;
  return null;
}
