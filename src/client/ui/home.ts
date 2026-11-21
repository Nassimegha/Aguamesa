// P2 (Nassime) : écran d'accueil (brief 02 Tâche 5).
// Deux façons de jouer, bien séparées pour les joueurs comme pour le jury :
//   - le gros bouton : la vraie nuit (Tonight's Shift, lieu 6 de la carte), 1 essai par
//     nuit, score serveur, série 🔥 et classement ;
//   - Free Play : la carte, lieux 1 à 5, parties illimitées pour s'entraîner et tout découvrir.
import { mountScreen, type Screen } from './screen';
import { createStreakWidget } from './streak';
import type { PlayerState } from '../../shared/types';

export interface HomeActions {
  onServir(): void;
  onLevels(): void;
  /** Free Play: opens the island map (locations 1-5 replay without limit). */
  onCarte(): void;
  onClassement(): void;
  onEtagere(): void;
}

export interface HomeOptions {
  /** Where tonight's real shift takes place, e.g. "Haunted Castle". */
  shiftPlace?: string;
}

export function showHome(player: PlayerState, actions: HomeActions, options: HomeOptions = {}): Screen {
  const done = player.playedToday.length > 0 && player.playedToday.every(Boolean);
  const started = player.playedToday.some(Boolean);
  const where = options.shiftPlace ? `${options.shiftPlace} · ` : '';
  const screen = mountScreen(
    `
    <div class="home">
      <div class="home__top"></div>
      <div class="home__title">Aguamesa</div>
      <div class="home__tagline">A midnight café. One glass at a time.</div>
      <button class="btn btn--primary home__servir" data-servir>${
        done ? "See Tonight's Results" : started ? "Finish Tonight's Shift" : "Start Tonight's Shift"
      }</button>
      <div class="home__caption">${
        done
          ? 'Shift served! The next one opens at midnight (UTC).'
          : `${where}1 try per night · grows your 🔥 streak · counts for the leaderboard`
      }</div>
      <button class="btn home__free" data-carte>🎮 Free Play <span>· unlimited, 5 places</span></button>
      <button class="btn home__levels" data-levels>⭐ Levels</button>
      <div class="home__row">
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
  screen.el.querySelector('[data-levels]')?.addEventListener('click', actions.onLevels);
  screen.el.querySelector('[data-carte]')?.addEventListener('click', actions.onCarte);
  screen.el.querySelector('[data-classement]')?.addEventListener('click', actions.onClassement);
  screen.el.querySelector('[data-etagere]')?.addEventListener('click', actions.onEtagere);

  return screen;
}
