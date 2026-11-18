// TEMPORAIRE : src/shared/types.ts n'existe pas encore sur main (c'est le
// fichier de P3, 00 §6.1 ; Mohamed l'a déjà sur sa branche task1-skeleton,
// identique à ce qui suit). Dès qu'il est fusionné, remplacer les imports
// de ce fichier par `from '../../shared/types'` dans les écrans ci-contre.
export type GlassModel =
  | 'pint' | 'mug_giant' | 'thimble' | 'flute' | 'coconut' | 'teacup' | 'goblet' | 'tankard';

export interface NightSummary {
  dayId: string;
  scores: number[];
  total: number;
  tips: number;
  streak: number;
  streakMilestone?: 3 | 7 | 14 | 30;
  freezeUsed: boolean;
  rank: number;
  shareText: string;
}

export interface PlayerState {
  username: string;
  serverLevel: number;
  streak: number;
  bestStreak: number;
  streakFreezes: number;
  lastPlayedDayId: string | null;
  tips: number;
  stars: Record<string, number>;
  collection: GlassModel[];
  decor: string[];
  playedToday: boolean[];
}

export interface LeaderboardRow {
  rank: number;
  username: string;
  total: number;
  streak: number;
}
