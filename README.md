# Aguamesa

Un jeu quotidien en 3D pour Reddit (Devvit Web) : on appuie pour verser, on relâche pour s'arrêter, et il faut remplir le verre pile jusqu'à la ligne. Chaque nuit, 5 clients bizarres arrivent avec 5 verres piégés, les mêmes pour tout le monde. Il y a une série 🔥, un classement, la ligne de la foule et un partage en commentaire.

Projet pour le **Reddit Game of the Day Hackathon 2026**. Soumission prévue le lundi 8 décembre avant 14h (heure du Maroc).

## Pour l'équipe

Commence ici : **[docs/team/README.md](docs/team/README.md)**. Tu y trouveras la répartition P1 / P2 / P3, les points d'étape et ton brief.

| Dossier | Qui |
|---|---|
| `src/client/game/`, `src/shared/pour.ts`, `levels/` | P1 : Gameplay |
| `src/client/world/`, `src/client/ui/`, `assets/`, `blender/` | P2 : Monde 3D et interface |
| `src/server/`, `src/shared/types.ts`, `content/`, `devvit.json` | P3 : Reddit et serveur |

Le document complet du jeu est dans [docs/last-drop-projet.md](docs/last-drop-projet.md).

## Lancer le projet

Il faut **Node.js 24 ou plus récent** ([nodejs.org](https://nodejs.org), ou `winget install OpenJS.NodeJS.LTS` sur Windows).

```bash
npm install
```

## Commandes

- `npm run dev` : lance un serveur de développement live sur Reddit (vrai Devvit, demande une connexion Reddit).
- `npm run dev:local` : lance juste Vite en local, sans Reddit, avec le faux `/api` (`mockApi.ts`) — pratique pour avancer vite sans attendre la connexion.
- `npm run build` : build client + serveur.
- `npm run login` : connecte la CLI à ton compte Reddit.
- `npm run test` : lance tous les tests (dont la formule du versement).
- `npm run test:types` : vérifie les types TypeScript sur tout le projet.
- `npm run deploy` / `npm run launch` : publication (voir avec P3 avant d'y toucher).

La formule du versement est dans [src/shared/pour.ts](src/shared/pour.ts) : `pour(spec, holdMs)` renvoie `{ level, score, overflow }`. Le client et le serveur utilisent la même fonction (contrat §7).
