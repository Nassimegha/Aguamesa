// P2 (Nassime) : écran de classement (brief 02 Tâche 5).
// Du jour et de tous les temps (contrat 00 §6.2 : GET /api/leaderboard?scope=).
import { mountScreen, header, bindBack, type Screen } from './screen';
import type { LeaderboardRow } from '../../shared/types';

export interface LeaderboardData {
  day: LeaderboardRow[];
  all: LeaderboardRow[];
  currentUsername: string;
}

export interface LeaderboardActions {
  onClose(): void;
}

function renderRows(rows: LeaderboardRow[], currentUsername: string): string {
  if (rows.length === 0) {
    return '<div class="leaderboard__empty">Nobody has played yet tonight. Be the first.</div>';
  }
  return rows
    .map(
      (r) => `
      <div class="leaderboard__row ${r.username === currentUsername ? 'leaderboard__row--me' : ''}">
        <span class="leaderboard__rank">#${r.rank}</span>
        <span class="leaderboard__name">${r.username}</span>
        <span class="leaderboard__streak">🔥${r.streak}</span>
        <span class="leaderboard__total">${r.total}</span>
      </div>`,
    )
    .join('');
}

export function showLeaderboard(data: LeaderboardData, actions: LeaderboardActions): Screen {
  const screen = mountScreen(
    `
    ${header('Leaderboard', actions.onClose)}
    <div class="card leaderboard">
      <div class="leaderboard__tabs">
        <button class="btn leaderboard__tab leaderboard__tab--on" data-tab="day">Tonight</button>
        <button class="btn leaderboard__tab" data-tab="all">All Time</button>
      </div>
      <div class="leaderboard__list" data-list>${renderRows(data.day, data.currentUsername)}</div>
    </div>
    `,
    'leaderboard-screen',
  );

  const list = screen.el.querySelector('[data-list]') as HTMLDivElement;
  const tabs = screen.el.querySelectorAll('.leaderboard__tab');
  tabs.forEach((tab) =>
    tab.addEventListener('click', () => {
      const scope = (tab as HTMLElement).dataset.tab as 'day' | 'all';
      tabs.forEach((t) => t.classList.toggle('leaderboard__tab--on', t === tab));
      list.innerHTML = renderRows(data[scope], data.currentUsername);
    }),
  );

  bindBack(screen, actions.onClose);
  return screen;
}
