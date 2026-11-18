# 01 : Brief P1 : gameplay (geste, liquide, twists, niveaux)

> **Colle ceci dans ton modèle d'IA, avec `00-projet-et-contrat.md` :**
>
> « Tu es mon binôme de programmation pour un hackathon de 3 semaines. Lis d'abord `00-projet-et-contrat.md`. C'est la spec commune, et son contrat (§6) et sa formule du versement (§7) sont obligatoires. Ensuite, lis ce brief : c'est ma partie. Travaille seulement sur les fichiers listés sous *Tu possèdes*. Fais les tâches dans l'ordre. Après chaque tâche, lance son critère d'acceptation et montre-moi le résultat avant de passer à la suite. Si quelque chose dans le contrat te semble faux ou manquant, dis-le-moi au lieu de le changer : je m'en occupe avec l'équipe. Garde un code simple et lisible, et vise d'abord le mobile : 60 FPS sur un téléphone moyen. »

**Responsable :** P1 : **Marwa**

**Ta mission :** rendre le geste de verser **parfait**. C'est lui qui fait gagner ou perdre le jeu. Appuyer, voir monter le liquide, relâcher, entendre les dernières gouttes, puis voir le score : chaque verre doit donner envie de recommencer. Tu possèdes aussi la formule du versement, que le serveur utilise pour vérifier les scores.

---

## Tu possèdes

```
src/shared/pour.ts                 (formule du §7, déterministe)
src/shared/pour.test.ts
src/client/game/input.ts           (appui/relâche, doigt et souris)
src/client/game/liquid.ts          (shader du liquide, surface qui bouge, couches, mousse)
src/client/game/glass.ts           (charge glass_<model>.glb, lit LIQUID_BOTTOM/TOP/SHAPE)
src/client/game/twists/*.ts        (un fichier par twist)
src/client/game/round.ts           (enchaîne 3 à 5 verres, appelle api.ts, déclenche les réactions)
src/client/game/levelPlayer.ts     (lit un fichier de levels/)
src/client/game/crowdLine.ts       (dessine la ligne de la foule)
src/client/game/audio.ts           (versement, « parfait », éclaboussure, vibration)
src/client/game/tutorial.ts        (main animée, sans texte)
levels/*.json                      (60 niveaux, 10 par lieu ; les 30 premiers d'abord)
```

**Ne touche pas :** `src/server/*`, `src/shared/types.ts` (sauf en prévenant), `src/client/world/*`, `src/client/ui/*`, `assets/*`, `devvit.json`, `content/*`.

## Tu dépends de

| De | Quoi | Quand |
|---|---|---|
| P3 | Squelette Devvit, `types.ts`, `api.ts` | Mer 19 nov |
| P2 | Premier `glass_pint.glb` avec les points du §6.3 (en attendant, utilise un cylindre Three.js) | Ven 21 nov |
| P2 | Les clients `char_*.glb` avec `idle/happy/meh/splashed` | Dim 30 nov |
| P3 | `crowdLine` et `beatPercent` réels dans `/api/pour` | Dim 30 nov |

## Les autres dépendent de toi

| Qui | Besoin | Pour |
|---|---|---|
| P3 | `pour.ts` figé et testé, pour recalculer les scores côté serveur | **Jeu 20 nov** |
| P2 | Des événements à écouter : `onPourStart`, `onPourEnd(result)`, `onNightEnd(summary)` pour lancer les réactions et les écrans | Dim 23 nov |
| P3 | Les 30 premiers niveaux, et la liste des twists faciles et durs, pour écrire 14 jours de contenu | Dim 30 nov |
| Équipe | Un verre agréable à verser pour la Démo 1 | **Dim 23 nov** |

---

## Tâche 1 : la formule du versement (mer 19 au jeu 20 nov)

1. Écris `finalLevel`, `scoreFor` et `pour` dans `src/shared/pour.ts`, comme au §7.
   - La vitesse de remplissage dépend de `flow` et de la forme du verre : une chope se remplit plus lentement en haut qu'une flûte.
   - Après le relâchement, quelques gouttes tombent encore. Ajoute une petite traîne fixe d'environ 120 ms × `flow`.
   - Score : 100 si `|level - line| < 0.005`, puis une baisse douce jusqu'à 1. Le score vaut 0 si `level > 1` (débordement).
2. Écris les tests dans `pour.test.ts` : même entrée, même sortie (1000 fois), score 100 sur la ligne, 0 au débordement, et aucun `Math.random`.

**Critère d'acceptation :** `npm run test` passe, et P3 peut importer `pour()` dans le serveur. **Ne change plus la formule après cette date sans prévenir P3.**

## Tâche 2 : le geste et le liquide (jeu 20 au dim 23 nov)

1. `input.ts` : `pointerdown` pour commencer, `pointerup`/`pointercancel` pour arrêter. Bloque le scroll et le zoom sur le canvas. Mesure `holdMs` avec `performance.now()`.
2. `glass.ts` : en attendant le .glb de P2, utilise un cylindre transparent.
3. `liquid.ts` : le liquide monte entre `LIQUID_BOTTOM` et `LIQUID_TOP`. Sa surface bouge un peu (shader de vague léger), avec un filet qui coule du haut.
4. L'animation utilise **`finalLevel()`**, pour que l'écran montre exactement le score du serveur.

**Critère d'acceptation :** sur un vrai téléphone, appuyer, relâcher et voir le score prend moins de 3 secondes. Le niveau à l'écran correspond au `level` renvoyé par le serveur, au pixel près.

## Tâche 3 : la manche de 5 verres et le lecteur de niveaux (dim 23 au mer 26 nov)

1. `round.ts` : lit `today.glasses`, affiche un verre, envoie `POST /api/pour`, déclenche `onPourEnd`, puis passe au verre suivant. Après le 5e, appelle `/api/night/finish`.
2. `levelPlayer.ts` : même logique avec un fichier `levels/cafe-03.json`, en appelant `/api/level/complete`.
3. Les étoiles : 1, 2 ou 3 selon `stars` dans le niveau.

**Critère d'acceptation :** une nuit complète se joue de bout en bout sur Reddit, et un niveau donne le bon nombre d'étoiles.

## Tâche 4 : les twists (mer 26 nov au mar 2 déc)

Fais-les dans cet ordre, un fichier chacun. Chaque twist doit rester **déterministe** dans `pour.ts`.

1. Tailles (`mug_giant`, `thimble`) : seulement `flow` et la forme du verre.
2. `layers2` / `layers3` : 2 ou 3 lignes, il faut s'arrêter à chacune (plusieurs appuis, la somme compte).
3. `foam` : la mousse monte plus vite que le liquide, puis redescend.
4. `ice` : un glaçon tombe et fait monter le niveau d'un coup.
5. `spin` : le verre tourne, et la ligne est parfois cachée derrière.
6. `tilt` : le bateau penche, et la surface du liquide penche aussi.
7. `leak` : le niveau baisse lentement après le relâchement.
8. `steam` : la vapeur cache le haut du verre.
9. `hidden_line` : la ligne disparaît dès qu'on commence à verser.

**Critère d'acceptation :** chaque twist a un niveau de test dans `levels/test-<twist>.json`, et les tests de `pour.ts` le couvrent.

## Tâche 5 : sons, vibration et ligne de la foule (dim 30 nov au mer 3 déc)

1. `audio.ts` : le son du versement monte en hauteur avec le niveau. Ajoute un éclat clair pour « parfait », une éclaboussure pour le débordement, et `navigator.vibrate(30)` au relâchement.
2. `crowdLine.ts` : une ligne pointillée douce au niveau `crowdLine`, avec un petit texte animé « 82 % battus ».

**Critère d'acceptation :** les sons marchent sur iPhone (déverrouillés au premier appui) et sur Android.

## Tâche 6 : tutoriel et réglage de la difficulté (mer 3 au jeu 4 déc, avant le gel)

1. `tutorial.ts` : une main animée appuie puis relâche, **sans aucun texte**. Elle n'apparaît que la première fois.
2. Joue 5 nuits d'affilée et ajuste `flow` et `line` pour qu'un bon joueur fasse environ 85 de moyenne.
3. Termine les 30 niveaux des 3 premiers lieux.

---

## Ton planning

| Semaine | Tâches |
|---|---|
| 1 (17 au 23 nov) | 1, 2 |
| 2 (24 au 30 nov) | 3, début de la 4 |
| 3 (1er au 4 déc) | fin de la 4, puis 5 et 6 |
| Après le gel | seulement des corrections |

## Pièges

- **Le geste sur mobile :** sans `touch-action: none` sur le canvas, Reddit fait défiler la page au lieu de verser.
- **La latence :** n'attends pas la réponse du serveur pour finir l'animation. Le client calcule le même résultat avec `pour.ts`. La réponse du serveur ne sert qu'à afficher la ligne de la foule.
- **Le shader trop lourd :** reste sur un seul shader de liquide simple. Évite la vraie physique des fluides.
- **iOS et le son :** l'audio doit être lancé pendant un geste de l'utilisateur, sinon il reste muet.
