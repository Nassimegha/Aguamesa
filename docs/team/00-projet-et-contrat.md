# 00 : Projet, architecture et contrat (commun à tout le monde)

> Ce fichier est la référence partagée. Les sections 6 et 7 sont **obligatoires** : on ne les change qu'après avoir prévenu l'équipe.

---

## 1. Ce qu'on construit

**Aguamesa** est un café de minuit en 3D, joué dans un post Reddit.

- **Le geste :** appuyer pour verser, relâcher pour arrêter. Quelques gouttes tombent encore après le relâchement. Le but est d'arriver pile sur la ligne.
- **Le score :** 100 = parfait. Entre 1 et 99 selon la distance à la ligne. 0 si ça déborde. Les pourboires suivent le score.
- **Le Service du Jour :** chaque nuit à minuit (UTC), un nouveau post apparaît avec 5 clients et 5 verres, identiques pour tous les joueurs. On n'a **qu'un seul essai** par jour.
- **Les twists :** chope géante, dé à coudre, couches, mousse, glaçon, verre qui tourne, bateau qui penche, fuite, vapeur, ligne invisible.
- **La carte :** une île avec 6 lieux (Café, Plage, Chalet, Fête foraine, Bateau pirate, Château hanté). **On en polit 3**, et les 3 autres restent « verrouillés, bientôt ».
- **Le mode Niveaux :** 10 niveaux par lieu, de 1 à 3 étoiles, pour jouer en dehors du Service du Jour.
- **La série (streak) 🔥 :** chaque nuit jouée d'affilée ajoute +1. Elle est **visible partout** : un compteur qui brûle sur l'écran d'accueil, des traits à la craie sur l'ardoise derrière le comptoir, le flair Reddit et le commentaire partagé. Les clients la remarquent (« 12e nuit d'affilée ? Tu habites ici ! »).
  - **Paliers :** 3, 7, 14 et 30 nuits. Chaque palier donne une récompense : une déco pour le café (3), le verre doré (7), un badge de flair (14), et une enseigne néon à ton nom (30).
  - **Glaçon de série 🧊 :** on en gagne 1 toutes les 7 nuits (2 maximum). Il protège automatiquement une nuit manquée, pour que la série ne casse pas pour un oubli.
  - **Bonus de pourboires :** +1 % par nuit de série, jusqu'à +30 %. Le **score** reste le même pour le classement, seuls les pourboires changent.
  - **Série cassée :** pas d'écran triste. Le client dit « On repart à zéro ? », et la meilleure série reste affichée.
- **Côté Reddit :** la ligne de la foule (où les autres ont arrêté en moyenne), « tu as battu X % des joueurs », le partage en 1 clic dans les commentaires, un flair de serveur, et la boisson du jour choisie dans les commentaires.

### Règles du hackathon qui guident chaque décision

- Date limite : **8 décembre 2026, 18h PST = 9 décembre, 2h du matin au Maroc**. On soumet le 8 avant 14h.
- Ça doit tourner sur **Devvit Web**, dans un post Reddit, sur **mobile en premier**.
- Le jury note : **Delightful UX · Polish · Reddit-y · Daily Content**.
- Ce qu'il faut éviter : une interface qui fait « IA », un thème Reddit trop littéral, les clones.
- Le chargement doit prendre **moins de 2 secondes** sur un téléphone moyen. Chaque lieu doit peser **quelques Mo maximum**.

---

## 2. Le parcours unique (c'est aussi la démo)

1. Le joueur ouvre le post « Service de la nuit #24 » sur r/LastDropGame.
2. Le café s'allume. Le premier client arrive avec une chope géante.
3. Il appuie, le liquide monte, il relâche, et les dernières gouttes tombent.
4. Le serveur renvoie le score : **97**. La ligne de la foule apparaît : « la moyenne a arrêté ici ». Le client réagit (content, bof ou éclaboussé).
5. Il enchaîne les 5 verres et obtient un total, des pourboires et sa série 🔥12.
6. Il clique sur « Partager ». Le commentaire `☕ Nuit #24 🍺98 🧚100 👻71 ⛵88 🧙94 = 451 · 🔥12` apparaît sous le post.
7. Le lendemain à minuit, un nouveau post arrive tout seul.

Si ces 7 étapes marchent parfaitement, on a un jeu soumettable. Tout le reste est un bonus.

---

## 3. Architecture

```
 Blender (P2) ──► .glb compressés (assets/) ──┐
                                              ▼
 Post Reddit ──► client Three.js ── world/ (P2) : île, café, clients
                      │            ui/    (P2) : écrans, boutons
                      │            game/  (P1) : geste, liquide, twists
                      │
                      │ fetch /api/...  (contrat §6)
                      ▼
               serveur Devvit (P3) ── Redis : scores, séries, classements
                      │             └─ scheduler : post du jour à minuit
                      └── shared/pour.ts (P1) : recalcule le score
```

**Règle d'or :** le score est **toujours** recalculé côté serveur avec `src/shared/pour.ts`. Le client n'envoie que `holdMs`. Ça empêche la triche, et ça garantit que le même appui donne le même score partout.

---

## 4. Organisation du repo et propriété des fichiers

```
last-drop/
├── devvit.json                 P3
├── package.json, tsconfig.json P3 (squelette), tout le monde peut ajouter une dépendance en prévenant
├── src/
│   ├── shared/
│   │   ├── types.ts            P3 commite le §6.1 tel quel ; changement = prévenir l'équipe
│   │   └── pour.ts             P1 (formule du versement, utilisée par le client ET le serveur)
│   ├── client/
│   │   ├── main.ts             P3 (squelette), puis P2 (point d'entrée de la scène)
│   │   ├── api.ts              P3 (fonctions fetch typées)
│   │   ├── game/               P1
│   │   ├── world/              P2
│   │   └── ui/                 P2
│   └── server/                 P3
├── levels/                     P1 (fichiers JSON des niveaux)
├── content/                    P3 (fichiers JSON des Services du Jour)
├── assets/                     P2 (glb, textures, images, sons)
└── blender/                    P2 (fichiers .blend et scripts, ex. build_map.py)
```

---

## 5. Conventions

- **Langage :** TypeScript partout, en mode `strict`.
- **Branches :** `p1/...`, `p2/...` ou `p3/...`, par exemple `p1/geste-verser`. `main` doit **toujours** marcher.
- **Pull requests :** une PR par tâche, avec le titre `P1: ...`, `P2: ...` ou `P3: ...`, comme dans notre projet AMD. Elle doit être relue par **un autre membre** avant le merge.
- **Unités :** les temps sont en millisecondes (`holdMs`), et les niveaux de liquide sont entre 0 et 1 (`0` = fond du verre, `1` = bord).
- **Dates :** les jours sont au format `dayId = "2026-11-24"`, en UTC.
- **Gros fichiers :** pas de vidéos ni de .blend de plus de 20 Mo dans le repo. Partage-les sur Drive.

---

## 6. Le contrat

### 6.1 `src/shared/types.ts` (P3 le commite tel quel)

```ts
// ---------- glasses & levels ----------
export type GlassModel =
  | 'pint' | 'mug_giant' | 'thimble' | 'flute' | 'coconut' | 'teacup' | 'goblet' | 'tankard';

export type Twist =
  | 'none' | 'layers2' | 'layers3' | 'foam' | 'ice' | 'spin'
  | 'tilt' | 'leak' | 'steam' | 'hidden_line';

export type LocationId = 'cafe' | 'beach' | 'chalet' | 'fair' | 'pirate' | 'castle';

export interface GlassSpec {
  model: GlassModel;
  line: number;        // 0..1, la ligne cible
  flow: number;        // vitesse de remplissage, 1.0 = normal
  twist: Twist;
  customer: string;    // id du client, ex. "giant", "fairy" (correspond à char_<id>.glb)
}

export interface Level {
  id: string;          // "cafe-03"
  location: LocationId;
  glasses: GlassSpec[];            // 3 à 5 verres
  stars: [number, number, number]; // total minimum pour 1, 2, 3 étoiles
}

// ---------- daily service ----------
export interface DailyService {
  dayId: string;       // "2026-11-24"
  night: number;       // numéro de la nuit, ex. 24
  location: LocationId;
  glasses: GlassSpec[];  // toujours 5
  special?: 'blind_friday' | 'saturday_rush' | 'sunday_boss';
  drinkOfTheDay?: string;  // choisie dans les commentaires
}

// ---------- scoring ----------
export interface PourRequest { dayId: string; glassIndex: number; holdMs: number; }

export interface PourResult {
  score: number;         // 0..100
  level: number;         // niveau final 0..1 (après les gouttes)
  overflow: boolean;
  crowdLine: number;     // niveau moyen des joueurs pour ce verre, 0..1
  beatPercent: number;   // 0..100
}

export interface NightSummary {
  dayId: string;
  scores: number[];      // 5 scores
  total: number;
  tips: number;
  streak: number;
  streakMilestone?: 3 | 7 | 14 | 30;   // présent seulement la nuit où on atteint un palier
  freezeUsed: boolean;   // true si un glaçon a protégé la nuit d'hier
  rank: number;
  shareText: string;     // "☕ Nuit #24 🍺98 🧚100 👻71 ⛵88 🧙94 = 451 · 🔥12"
}

// ---------- player ----------
export interface PlayerState {
  username: string;
  serverLevel: number;
  streak: number;
  bestStreak: number;
  streakFreezes: number;           // glaçons de série, 0..2
  lastPlayedDayId: string | null;
  tips: number;
  stars: Record<string, number>;   // levelId -> 0..3
  collection: GlassModel[];
  decor: string[];                 // déco du café achetée
  playedToday: boolean[];          // 5 cases, true = verre déjà versé aujourd'hui
}

export interface LeaderboardRow { rank: number; username: string; total: number; streak: number; }
```

### 6.2 Les endpoints (serveur de P3)

| Méthode et chemin | Entrée | Sortie | Note |
|---|---|---|---|
| `GET /api/init` | — | `{ player: PlayerState, today: DailyService }` | appelé à l'ouverture du post |
| `POST /api/pour` | `PourRequest` | `PourResult` | **refusé si ce verre a déjà été joué aujourd'hui** |
| `POST /api/night/finish` | `{ dayId }` | `NightSummary` | après le 5e verre |
| `POST /api/share` | `{ dayId }` | `{ commentUrl }` | poste le commentaire au nom du joueur |
| `GET /api/leaderboard?scope=day\|all` | — | `LeaderboardRow[]` (top 50 + le joueur) | |
| `POST /api/level/complete` | `{ levelId, scores: number[] }` | `{ stars, player: PlayerState }` | mode Niveaux, recalcul serveur aussi |
| `POST /api/decor/buy` | `{ item }` | `PlayerState` | |

### 6.3 Les fichiers 3D (P2 → P1)

- Format **.glb compressé** (meshopt), un fichier par objet.
- Noms fixes : `glass_<model>.glb`, `char_<customer>.glb`, `loc_<location>.glb`, `island.glb`.
- Chaque verre contient deux objets vides (empties) : **`LIQUID_BOTTOM`** et **`LIQUID_TOP`**. P1 fait monter le liquide entre les deux. Le verre doit aussi contenir un mesh **`LIQUID_SHAPE`**, qui est la forme intérieure, pour que le liquide épouse le verre.
- Chaque client contient les animations **`idle`, `happy`, `meh`, `splashed`**.
- Échelle : 1 unité = 1 mètre. Le verre est posé sur l'origine, avec l'axe Y vers le haut.

---

## 7. La formule du versement (P1 la fournit, P3 l'utilise)

```ts
// src/shared/pour.ts  (P1)
import type { GlassSpec } from './types';

/** Niveau final (0..1+) après un appui de holdMs, gouttes de traîne comprises. Déterministe. */
export function finalLevel(spec: GlassSpec, holdMs: number): number;

/** Score 0..100 à partir du niveau final et de la ligne. */
export function scoreFor(spec: GlassSpec, level: number): number;

/** Raccourci pour le serveur. */
export function pour(spec: GlassSpec, holdMs: number): { level: number; score: number; overflow: boolean };
```

- **Aucun** `Math.random()` et aucune dépendance au temps réel dans ce fichier : seulement des calculs.
- Les twists aléatoires en apparence (fuite, vapeur) sont réglés par une graine fixe tirée de `dayId`, que P3 met dans `GlassSpec` si besoin.
- Le client utilise **la même fonction** pour l'animation, comme ça ce que le joueur voit correspond au score du serveur.

---

## 8. Lancer le projet en local

```bash
npm install
npm run dev        # devvit playtest sur le subreddit de test (P3 donne le nom)
npm run test       # tests de pour.ts et du serveur
```

Pour travailler sans Reddit, P1 et P2 utilisent `npm run dev:local`. Cette commande ouvre `src/client` dans Vite, avec un faux `/api` qui renvoie les exemples du §10.

---

## 9. Planning et points d'étape (heure du Maroc)

| Date | Point d'étape |
|---|---|
| Mer 19 nov | Squelette Devvit sur `main`, `types.ts` commité |
| Dim 23 nov | **Démo 1** : verser dans un verre sur Reddit, score serveur, décor du Café |
| Dim 30 nov | **Démo 2** : carte, 3 lieux jouables, Service du Jour automatique, classement, partage |
| Jeu 4 déc, 20h | **Gel des fonctions** : plus de nouvelles idées |
| Sam 6 déc | Playtest avec 20 à 50 personnes |
| Lun 8 déc, 14h | **Soumission** |

**Réunion courte tous les 2 jours** (15 min sur WhatsApp ou Discord) : ce que j'ai fini, ce que je fais, ce qui me bloque.

---

## 10. Exemples de données (pour les mocks)

### 10.1 `GET /api/init`
```json
{
  "player": { "username": "nassime", "serverLevel": 12, "streak": 12, "bestStreak": 15, "streakFreezes": 1, "lastPlayedDayId": "2026-11-23", "tips": 340,
              "stars": { "cafe-01": 3, "cafe-02": 2 }, "collection": ["pint", "thimble"],
              "decor": ["lamp_warm"], "playedToday": [false, false, false, false, false] },
  "today": { "dayId": "2026-11-24", "night": 24, "location": "cafe",
    "glasses": [
      { "model": "mug_giant", "line": 0.78, "flow": 1.0, "twist": "none",    "customer": "giant" },
      { "model": "thimble",   "line": 0.60, "flow": 0.6, "twist": "none",    "customer": "fairy" },
      { "model": "goblet",    "line": 0.70, "flow": 1.0, "twist": "steam",   "customer": "ghost" },
      { "model": "tankard",   "line": 0.82, "flow": 1.1, "twist": "tilt",    "customer": "pirate" },
      { "model": "flute",     "line": 0.65, "flow": 0.9, "twist": "layers2", "customer": "wizard" } ] }
}
```

### 10.2 `POST /api/pour`
```json
{ "dayId": "2026-11-24", "glassIndex": 0, "holdMs": 1840 }
→ { "score": 97, "level": 0.775, "overflow": false, "crowdLine": 0.71, "beatPercent": 82 }
```

---

## 11. Définition de « fini » (tout le projet)

- Les 7 étapes du §2 marchent sur un **vrai téléphone**, dans l'app Reddit.
- Chargement en moins de 2 secondes, et 50 FPS ou plus sur un téléphone moyen.
- 14 jours de Services du Jour sont prêts et le scheduler tourne seul.
- 3 lieux polis (Café, Plage, Chalet) et 3 lieux « bientôt ».
- Aucune erreur dans la console, et aucun texte d'interface qui fait « IA ».

## 12. Ce qu'on coupe en cas de retard (dans cet ordre)

1. Lieux 4, 5 et 6 jouables : on garde seulement « bientôt ».
2. Samedi rush et dimanche boss.
3. La collection de verres et la déco du café.
4. La boisson du jour.

**On ne coupe jamais :** le geste parfait, le Service du Jour, le score, la série et le partage, la ligne de la foule, et les 3 premiers lieux polis.
