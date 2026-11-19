// P2 (Nassime) : écran d'accueil (brief 02 Tâche 5).
// Un seul gros bouton « Servir », en 1 tap depuis le post Reddit. La carte et
// le classement restent accessibles mais plus discrets.
import { mountScreen, type Screen } from './screen';
import { createStreakWidget } from './streak';
import type { PlayerState } from './contractTypesTemp';

export interface HomeActions {
  onServir(): void;
  onCarte(): void;
  onClassement(): void;
  onEtagere(): void;
}

export function showHome(player: PlayerState, actions: HomeActions): Screen {
  const screen = mountScreen(
    `
    <div class="home">
      <div class="home__top"></div>
      <div class="home__title">Aguamesa</div>
      <div class="home__tagline">A midnight café. One glass at a time.</div>
      <button class="btn btn--primary home__servir" data-servir>Start Tonight's Shift</button>
      <div class="home__row">
        <button class="btn home__secondary" data-carte>🗺️ Map</button>
        <button class="btn home__secondary" data-classement>🏆 Leaderboard</button>
        <button class="btn home__secondary" data-etagere>🍺 Shelf</button>
      </div>
      <div class="home__footer">☕ Server Lv. ${player.serverLevel} · ${player.tips} tips</div>
    </div>
    `,
    'home-screen',
  );

  const streakWidget = createStreakWidget(player.streak, player.streakFreezes);
  streakWidget.el.classList.add('home__streak');
  screen.el.querySelector('.home__top')!.appendChild(streakWidget.el);

  screen.el.querySelector('[data-servir]')?.addEventListener('click', actions.onServir);
  screen.el.querySelector('[data-carte]')?.addEventListener('click', actions.onCarte);
  screen.el.querySelector('[data-classement]')?.addEventListener('click', actions.onClassement);
  screen.el.querySelector('[data-etagere]')?.addEventListener('click', actions.onEtagere);

  return screen;
}
