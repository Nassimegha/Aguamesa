# Briefs d'équipe : Aguamesa (Reddit Game of the Day Hackathon)

**Ce qu'on construit :** Aguamesa, un jeu quotidien sur Reddit (Devvit Web). On appuie pour verser, on relâche pour s'arrêter, et il faut remplir le verre jusqu'à la ligne. Chaque nuit, 5 clients bizarres arrivent avec 5 verres piégés, identiques pour tout le monde. Les pourboires font le score, le café grandit, et la série (streak) 🔥 récompense chaque nuit jouée d'affilée, avec des paliers et des glaçons qui la protègent. On voit le tout en 3D légère : une île en Blender, exportée en .glb, affichée avec Three.js.

**Ce que le jury note :** Delightful UX · Polish · Reddit-y · Daily Content. Il évite : une interface qui fait « IA », un thème Reddit trop littéral, les clones, les platformers, les shooters et le trivia.

## Comment utiliser ces fichiers

1. Écris ton nom dans le tableau ci-dessous et fais un commit.
2. Donne **deux fichiers** à ton modèle d'IA : `00-projet-et-contrat.md` (toujours) et **ton propre brief**. Chaque brief commence par un prompt prêt à coller.
3. Travaille seulement sur les fichiers listés sous *Tu possèdes* dans ton brief. Si tu as besoin d'un changement dans le fichier d'un autre, demande-lui sur le groupe.
4. Le contrat (00 §6) est obligatoire. Pour le changer, préviens l'équipe, et mets à jour `src/shared/types.ts` dans le même commit.
5. Merge sur `main` à chaque point d'étape (00 §9), au moins une fois par jour, et fais souvent des pull.

## La répartition en 3 parties

Les trois membres construisent jusqu'au **gel des fonctions, le jeudi 4 décembre à 20h**. Le pitch et la soumission ne font pas partie de cette répartition (voir la fin de cette page).

| Rôle | Brief | Possède | Nom |
|---|---|---|---|
| **P1 : Gameplay** | [01-gameplay.md](01-gameplay.md) | `src/client/game/` (geste, verre et liquide, twists, lecteur de niveaux, étoiles, sons, tutoriel), `src/shared/pour.ts` (la formule du versement), `levels/` || **Marwa** |
| **P2 : Monde 3D et interface** | [02-monde-3d-et-ui.md](02-monde-3d-et-ui.md) | `assets/` (tous les .glb, images, sons d'ambiance), `blender/`, `src/client/world/` (carte, décors, clients), `src/client/ui/` (écrans, boutons) || **Nassime** |
| **P3 : Reddit, serveur et contenu** | [03-reddit-et-serveur.md](03-reddit-et-serveur.md) | `devvit.json`, `src/server/` (API, Redis, scheduler, classements, flair, commentaires), `src/shared/types.ts`, `content/` (les Services du Jour), le subreddit de test || **Mohamed** |

**Comment les morceaux se connectent :** le scheduler de P3 crée chaque nuit le post du Service du Jour → le client de P2 affiche le café et les clients → le moteur de P1 fait verser le joueur et envoie `holdMs` → le serveur de P3 recalcule le score avec `pour.ts` de P1, puis renvoie la ligne de la foule → P1 la dessine et P2 affiche l'écran de résultat et le partage.

## Points d'étape (heure du Maroc)

| Quand | Quoi | Qui |
|---|---|---|
| **Mer 19 nov, 20h** | Squelette Devvit sur `main` : un post qui ouvre une page Three.js vide, `types.ts` commité | P3 |
| Jeu 20 nov | `pour.ts` figé et testé (même `holdMs`, même score) | P1 |
| Ven 21 nov | Premier verre `.glb` avec `LIQUID_BOTTOM`/`LIQUID_TOP`, décor du Café en brouillon | P2 |
| **Dim 23 nov, 20h** | **Démo 1** : verser dans un verre sur Reddit, avec score serveur et décor du Café | tous |
| Mer 26 nov | Scheduler qui publie le Service du Jour tout seul | P3 |
| **Dim 30 nov, 20h** | **Démo 2** : carte, 3 lieux jouables, classement, partage en commentaire | tous |
| Mar 2 déc | 14 jours de contenu prêts dans `content/` | P3 |
| **Jeu 4 déc, 20h** | **Gel des fonctions** | tous |
| Sam 6 déc | Playtest avec 20 à 50 personnes, corrections | tous |
| **Lun 8 déc, 14h** | **Soumission** sur Devpost (date limite réelle : 9 déc à 2h) | une personne, vérifié par les 3 |

## Après le gel : pitch et soumission

Une personne prend [plus-tard-pitch-et-soumission.md](plus-tard-pitch-et-soumission.md) le jeudi 4 décembre à 20h. Elle prépare la vidéo de démo, les captures, l'image de couverture, la page Devpost, le listing de l'app et le post public. La soumission doit être faite **le lundi 8 décembre avant 14h**.

**Une exception, dès cette semaine :** quelqu'un poste sur r/Devvit pour recruter des testeurs (Tâche 1 de ce fichier). Il faut du temps pour réunir 20 à 50 joueurs.
