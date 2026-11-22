# Aguamesa

A daily 3D pouring game for Reddit (Devvit Web): press to pour, release to stop, and fill the glass exactly to the line. Every night, five strange customers walk up to the counter with five tricky glasses — the same night for everyone. Keep your 🔥 streak alive, climb the leaderboard, watch the crowd line, and share your score in the comments.

Built for the **Reddit Game of the Day Hackathon 2026** (repo `Nassimegha/Aguamesa`). Demo 1: Monday 23 November 2026.

## The game

You are the night-shift bartender of a wandering bar with six locations: the Midnight Café, the Beach Bar, the Mountain Chalet, the Funfair, the Pirate Ship, and the Haunted Castle. Each location has its own 3D counter, its own chalkboard specials, and 30 regular customers.

- **Tonight's Shift (the real game).** One try per night, at the location the server announces. The server re-scores every pour, grows your streak, ranks you on the daily and all-time leaderboards, and writes your share text.
- **Free Play.** Unlimited practice games at the other locations: same rules, same scoring formula, nothing sent to the server, streak and leaderboard untouched.
- **Levels.** Ten levels per location with 1–3 star thresholds (P1's `levels/`).
- **Visit.** Walk into any location from the island map (`?visit=<location>` deep-links it) and meet its 30 customers without spending the night's try.

The pour itself is one gesture with real physics behind it: glass size, target line, flow speed, and twists (foam, steam, ice, hidden line, layered cocktails…). The scoring formula lives in [src/shared/pour.ts](src/shared/pour.ts) — `pour(spec, holdMs)` returns `{ level, score, overflow }`, and the client and the server run the same function (contract §7).

## How the daily night works

One night per date, identical for every player (contract §1):

1. **Publish.** Every day at 00:00 UTC the `daily-night` scheduler task (see [devvit.json](devvit.json)) calls `publishNight()`, which creates the night's post in the subreddit. Publishing is idempotent — one post per day. Moderators can also publish immediately from the subreddit menu ("Publier la nuit maintenant"). Each post pins its `dayId` in post data and is titled `Service de la nuit #N`.
2. **Authored days first.** Hand-written nights live in [content/days/](content/days/) as `DailyService` JSON (currently 2026-11-24 plus 2026-12-01 to 2026-12-14). If the day has a file, that file is the night.
3. **Seeded fallback otherwise.** If there is no file for the date, the seeded generator ([src/server/fallback.ts](src/server/fallback.ts)) builds the night from the `dayId` alone: no `Math.random`, no `Date.now()`. Same `dayId` → identical location, guests, glasses, lines, flows, and twists on every call; different dates deal different nights. The location is picked first from all six, then 5 guests (7 on Saturdays) are drawn without duplicates from that location's 30-customer roster, using the same seeded shuffle the client shows — so the guests the server names are the guests you see.
4. **Play.** Opening the post calls `GET /init`, which resolves the post's `dayId` to the authored day or to that same seeded fallback (`resolvePostDay()`). Publishing and playing can never disagree: a 23 November post plays the 23 November night, never another date's.
5. **The week has specials.** Friday is blind (every line hides once you pour), Saturday is rush (7 glasses instead of 5), Sunday ends with a 3-layer boss cocktail. Monday–Thursday are normal nights. Authored files and the generator both follow the weekday calendar ([src/server/calendar.ts](src/server/calendar.ts)).
6. **Drink of the day.** Players suggest drinks with `!boisson` comments; moderators validate the top pick from the post menu ("Choisir la boisson du jour"), and it carries over to the next night.
7. **Finish.** `POST /night/finish` totals the five (or seven) server-verified pours, applies the streak (with freezes and 3/7/14/30 milestones), awards tips, updates ranks, and returns the share text (`☕ Nuit #24 🍺98 … = 451 · 🔥12`), which `POST /share` posts as a comment once per night.

## Run it

You need **Node.js 24 or newer** ([nodejs.org](https://nodejs.org), or `winget install OpenJS.NodeJS.LTS` on Windows).

```bash
npm install
```

| Command | What it does |
|---|---|
| `npm run dev` | Live dev server on Reddit (`devvit playtest`, needs a Reddit login). |
| `npm run dev:local` | Local Vite only, no Reddit: the client uses the fake `/api` ([mockApi.ts](src/client/mockApi.ts)) — the fast loop for gameplay and 3D work. |
| `npm run build` | Production build (client + server) with `vite build`. |
| `npm run test` | Everything: TypeScript check plus all unit tests (including the pour formula). |
| `npm run test:types` | TypeScript check across the project (`tsc --build`). |
| `npm run test:unit` | Unit tests only (`node --test` over `src/**/*.test.ts`). |
| `npm run test -- my-file-name` | Unit tests filtered to one file. |
| `npm run lint` | ESLint over `src/`. |
| `npm run levels` | Regenerate P1's 30 tuned levels into `levels/` from the design tables. |
| `npm run login` | Connect the Devvit CLI to your Reddit account. |
| `npm run deploy` / `npm run launch` | Publish the app (`devvit upload` / `publish`) — check with P3 first. |

## Who owns what

Start here: **[docs/team/README.md](docs/team/README.md)** — team split, milestones, and your brief. The full game design is in [docs/last-drop-projet.md](docs/last-drop-projet.md), and the frozen client/server contract both sides code against is `docs/team/00-projet-et-contrat.md` §6 (types: [src/shared/types.ts](src/shared/types.ts)).

| Area | Owner |
|---|---|
| `src/client/game/`, `src/shared/pour.ts`, `levels/` | P1 — Gameplay (pour formula, round flow, twists, levels) |
| `src/client/world/`, `src/client/ui/`, `assets/`, `blender/` | P2 — 3D world and interface (locations, customers, map, screens) |
| `src/server/`, `src/shared/types.ts`, `src/shared/guests.ts`, `content/`, `devvit.json` | P3 — Reddit and server (daily posts, scoring, streaks, leaderboards, share) |

Stack: Three.js + Vite on the client (two entry points — `splash.html` inline in the feed, `game.html` expanded), Hono on the Devvit Web serverless backend with Redis, shared TypeScript types and pour/guest logic in `src/shared/`.

## Submission facts

- Devvit app name: `aguamesa` (see `name` in [devvit.json](devvit.json)).
- Development subreddit: `r/aguamesa_dev` (see `dev.subreddit` in [devvit.json](devvit.json)).
