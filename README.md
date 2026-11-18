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
npm install          # installe les dépendances
npm run dev:local    # ouvre le client dans Vite, sans Reddit
npm run test         # lance les tests (src/**/*.test.ts), dont la formule du versement
```

La formule du versement est dans [src/shared/pour.ts](src/shared/pour.ts) : `pour(spec, holdMs)` renvoie `{ level, score, overflow }`. Le client et le serveur utilisent la même fonction (contrat §7).
