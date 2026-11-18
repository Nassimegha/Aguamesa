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
      <div class="home__tagline">Un café de minuit. Un verre à la fois.</div>
      <button class="btn btn--primary home__servir" data-servir>Servir</button>
      <div class="home__row">
        <button class="btn home__secondary" data-carte>🗺️ Carte</button>
        <button class="btn home__secondary" data-classement>🏆 Classement</button>
        <button class="btn home__secondary" data-etagere>🍺 Étagère</button>
      </div>
      <div class="home__footer">☕ Serveur Nv. ${player.serverLevel} · ${player.tips} pourboires</div>
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
