// P2 (Nassime) : HUD pendant le service (Service du Jour et Niveaux).
// En haut : où on en est (« Glass 2/5 », nuit ou niveau, objectif). Après chaque verre :
// le score (Perfect / Great / Good / Spilled), puis « Beat 82% of players » et l'écart avec
// la ligne de la foule quand le serveur répond (PourResult.crowdLine, beatPercent).
// Les pourboires du verre suivent le score avec la même règle que le serveur ; le total
// officiel de la nuit reste NightSummary.tips. En mode Niveaux il n'y a pas de pourboires.

export interface Hud {
  setGlass(index: number, count: number): void;
  showPour(score: number, overflow: boolean): void;
  showServer(info: { beatPercent: number; crowdLine: number; level: number }): void;
  dispose(): void;
}

function verdict(score: number, overflow: boolean): { text: string; cls: string } {
  if (overflow) return { text: 'Spilled!', cls: 'hud-pop--spill' };
  if (score >= 98) return { text: 'Perfect!', cls: 'hud-pop--perfect' };
  if (score >= 90) return { text: 'Great', cls: 'hud-pop--great' };
  if (score >= 70) return { text: 'Good', cls: 'hud-pop--good' };
  return { text: 'Close', cls: 'hud-pop--meh' };
}

/**
 * Same rule as the server (src/server/night.ts): tips = 30% of the score, +1% per streak
 * night (max +30%). Per-glass rounding can differ by 1 from the night total the server sends.
 */
export function tipFor(score: number, streak: number): number {
  return Math.round(score * 0.3 * (1 + Math.min(Math.max(streak, 0), 30) / 100));
}

export function createHud(label: string, goal?: string, streak = 0, showTips = true): Hud {
  const el = document.createElement('div');
  el.className = 'hud';
  el.innerHTML = `
    <div class="hud__bar">
      <span class="hud__label">${label}</span>
      <span class="hud__glass" data-glass></span>
      ${goal ? `<span class="hud__goal">${goal}</span>` : ''}
    </div>
    <div class="hud__hint" data-hint>Hold to pour · release on the line</div>
    <div class="hud-pop" data-pop aria-live="polite"></div>`;
  document.body.appendChild(el);
  const glassEl = el.querySelector<HTMLElement>('[data-glass]')!;
  const pop = el.querySelector<HTMLElement>('[data-pop]')!;
  const hint = el.querySelector<HTMLElement>('[data-hint]')!;
  let hideTimer = 0;
  let sum = 0;

  function setGlass(index: number, count: number): void {
    glassEl.textContent = `Glass ${index + 1}/${count}`;
    pop.classList.remove('hud-pop--in');
  }

  function showPour(score: number, overflow: boolean): void {
    hint.style.opacity = '0';
    const v = verdict(score, overflow);
    const tip = tipFor(score, streak);
    sum += score;
    pop.className = `hud-pop ${v.cls}`;
    const tipText = showTips ? `${tip > 0 ? `+${tip} 💰 tips` : 'no tip'} · ` : '';
    pop.innerHTML = `<b class="hud-pop__score">${score}</b><span class="hud-pop__verdict">${v.text}</span>
      <span class="hud-pop__tip">${tipText}total ${sum}</span>
      <span class="hud-pop__crowd" data-crowd></span>`;
    requestAnimationFrame(() => pop.classList.add('hud-pop--in'));
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => pop.classList.remove('hud-pop--in'), 3400);
  }

  function showServer(info: { beatPercent: number; crowdLine: number; level: number }): void {
    const crowd = pop.querySelector<HTMLElement>('[data-crowd]');
    if (!crowd) return;
    const diff = Math.round((info.level - info.crowdLine) * 100);
    const rel = diff === 0 ? 'right on the crowd line' : `${Math.abs(diff)}% ${diff > 0 ? 'above' : 'below'} the crowd`;
    crowd.textContent = `Beat ${Math.round(info.beatPercent)}% of players · ${rel}`;
  }

  function dispose(): void {
    clearTimeout(hideTimer);
    el.remove();
  }

  return { setGlass, showPour, showServer, dispose };
}
