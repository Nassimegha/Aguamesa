# 03 : Brief P3 : Reddit, serveur et contenu (Devvit, Redis, Service du Jour)

> **Colle ceci dans ton modèle d'IA, avec `00-projet-et-contrat.md` :**
>
> « Tu es mon binôme pour un hackathon Reddit de 3 semaines, sur Devvit Web. Lis d'abord `00-projet-et-contrat.md`. C'est la spec commune, et son contrat (§6) est obligatoire : c'est moi qui commite `types.ts`. Ensuite, lis ce brief : c'est ma partie (serveur, Redis, scheduler, classements, fonctions Reddit, contenu). Travaille seulement sur les fichiers listés sous *Tu possèdes*. Fais les tâches dans l'ordre. Après chaque tâche, lance son critère d'acceptation et montre-moi le résultat. Vérifie toujours la doc Devvit actuelle avant d'utiliser une API, au lieu de deviner. Le score se calcule **uniquement** sur le serveur, avec `src/shared/pour.ts`. »

**Responsable :** P3 : **Mohamed**

**Ta mission :** faire de Last Drop un vrai jeu **quotidien** et **Reddit-y**. Un nouveau post chaque nuit, tout seul. Des scores qu'on ne peut pas tricher. Un classement, une série, un flair, et un partage en commentaire qui donne envie aux autres de jouer. Tu possèdes le squelette dont tout le monde a besoin, et les 14 jours de contenu.

---

## Tu possèdes

```
devvit.json, package.json, tsconfig.json, vite config  (squelette)
src/shared/types.ts                (commité tel quel depuis 00 §6.1)
src/client/main.ts                 (squelette seulement, P2 le reprend ensuite)
src/client/api.ts                  (fonctions fetch typées pour chaque endpoint du §6.2)
src/client/mockApi.ts              (faux /api pour npm run dev:local, avec les exemples du §10)
src/server/index.ts                (routes)
src/server/redis.ts                (clés et accès)
src/server/daily.ts                (Service du Jour, scheduler)
src/server/score.ts                (appelle pour.ts, un seul essai par verre)
src/server/streak.ts, src/server/leaderboard.ts, crowd.ts, share.ts, flair.ts, drink.ts
src/server/*.test.ts
content/days/2026-MM-DD.json       (Services du Jour, au format DailyService)
r/LastDropGame (ou le nom choisi)  : subreddit de test, puis subreddit public de démo
```

**Ne touche pas :** `src/shared/pour.ts` (P1), `src/client/game/*`, `src/client/world/*`, `src/client/ui/*` (après le squelette), `assets/*`, `levels/*`.

## Tu dépends de

| De | Quoi | Quand |
|---|---|---|
| P1 | `pour.ts` figé et testé | Jeu 20 nov |
| P1 | 30 niveaux et la liste des twists faciles et durs, pour écrire le contenu | Dim 30 nov |
| P2 | L'écran de résultat, qui appelle `/api/share` | Dim 30 nov |

## Les autres dépendent de toi

| Qui | Besoin | Pour |
|---|---|---|
| Tout le monde | Squelette Devvit sur `main`, avec `types.ts`, `api.ts` et `mockApi.ts` | **Mer 19 nov, 20h** |
| P1 | `/api/pour` réel avec un seul essai | Dim 23 nov |
| P1, P2 | `crowdLine`, `beatPercent`, classement, partage | **Dim 30 nov** |
| Pitch | Un post public de démo qui marche, et 20 à 50 testeurs | Sam 6 déc |

---

## Tâche 1 : le squelette (mar 18 au mer 19 nov, objectif 20h)

1. Crée l'app Devvit Web et le subreddit de test. Le post doit ouvrir une page plein écran avec un canvas Three.js vide.
2. Commite `types.ts` **tel quel** depuis 00 §6.1.
3. `api.ts` : une fonction typée par endpoint. `mockApi.ts` renvoie les exemples du §10, et `npm run dev:local` l'utilise.
4. Ajoute toutes les routes du §6.2, qui renvoient pour l'instant les exemples du §10. Comme ça, P1 et P2 ont un vrai serveur tout de suite.
5. Invite les deux autres membres comme développeurs de l'app.

**Critère d'acceptation :** les 3 membres lancent `npm run dev` et voient le post sur le subreddit de test, depuis leur téléphone.

## Tâche 2 : Redis et le score vérifié (jeu 20 au dim 23 nov)

1. `redis.ts` : les clés, par exemple `player:{user}`, `day:{dayId}:pours:{user}`, `day:{dayId}:glass:{i}:levels` (un sorted set des niveaux), `lb:day:{dayId}`, `lb:all` et `streak:{user}`.
2. `score.ts` : `POST /api/pour` relit le `GlassSpec` du jour, appelle `pour()` de P1, et enregistre le résultat. **Si ce verre a déjà été joué, renvoie l'ancien résultat sans recalculer.**
3. `/api/init` : charge le joueur, crée son profil la première fois, et calcule `playedToday`.

**Critère d'acceptation :** les tests montrent que le même `holdMs` donne le même score que dans le client. Un deuxième essai sur le même verre ne change rien. La Démo 1 marche avec le vrai score.

## Tâche 3 : le Service du Jour (dim 23 au mer 26 nov)

1. `daily.ts` : une tâche du scheduler Devvit, à **00:00 UTC** chaque jour. Elle lit `content/days/<dayId>.json`, crée le post « Service de la nuit #N » et l'épingle. S'il n'y a pas de fichier pour ce jour, elle génère une nuit à partir d'une graine `dayId` (secours).
2. `streak.ts`, la série (règles en 00 §1) :
   - Si `lastPlayedDayId` = hier : +1.
   - S'il manque une seule nuit et que `streakFreezes > 0` : on retire un glaçon, +1, et `freezeUsed = true`.
   - Sinon : on revient à 1. `bestStreak` garde le record.
   - +1 glaçon toutes les 7 nuits (2 maximum). `streakMilestone` est renvoyé à 3, 7, 14 et 30, et la récompense est ajoutée au joueur.
   - Le bonus de pourboires (+1 % par nuit, 30 % maximum) ne touche pas le score du classement.
   - Ajoute un classement « plus longues séries » dans `leaderboard.ts`.
3. `/api/night/finish` : total, pourboires, série, rang et `shareText`.

**Critère d'acceptation :** en avançant la date de test, 3 posts sont créés tout seuls, chacun avec ses 5 verres. Une série de 3 nuits affiche 🔥3. Une nuit sautée avec un glaçon garde la série, et sans glaçon elle revient à 1. Les tests couvrent les 4 cas (suite, glaçon, cassée, palier).

## Tâche 4 : classements, ligne de la foule, partage et flair (mer 26 au dim 30 nov)

1. `leaderboard.ts` : le classement du jour et de tous les temps, avec le top 50 plus le rang du joueur.
2. `crowd.ts` : `crowdLine` est la moyenne des niveaux pour ce verre, et `beatPercent` la part des joueurs qui ont fait pire. Tant qu'il y a moins de 5 joueurs, renvoie une valeur de départ fixée dans le contenu.
3. `share.ts` : `/api/share` poste le commentaire `shareText` **au nom du joueur**, une seule fois par nuit.
4. `flair.ts` : met à jour le flair du joueur, par exemple « ☕ Serveur Nv. 12 · 🔥 12 nuits ». À partir de 14 nuits, ajoute le badge de palier.

**Critère d'acceptation :** en Démo 2, 3 comptes jouent la même nuit et voient le même classement, une ligne de la foule cohérente et leur commentaire sous le post.

## Tâche 5 : le calendrier et le contenu (dim 30 nov au mar 2 déc)

1. Le calendrier de la semaine : **vendredi à l'aveugle** (`hidden_line` sur tous les verres), **samedi rush** (7 verres), **dimanche boss** (un cocktail en 3 couches).
2. `drink.ts` : la boisson du jour est le commentaire le plus voté de la veille qui commence par `!boisson`. Un mod la valide avant qu'elle soit utilisée.
3. Écris **14 jours** dans `content/days/`, du 1er au 14 décembre, avec P1 pour l'équilibre. La difficulté monte doucement pendant la semaine.

**Critère d'acceptation :** les 14 fichiers passent la validation de type, et chaque jour a été joué une fois par un membre.

## Tâche 6 : testeurs et finitions serveur (mer 3 au jeu 4 déc, avant le gel)

1. Poste sur r/Devvit et partage avec des amis pour réunir 20 à 50 testeurs (Tâche 1 du fichier pitch, à lancer **dès la semaine 1**).
2. Ajoute une limite de requêtes simple, et vérifie qu'il n'y a aucune erreur dans les logs Devvit pendant une nuit de test.
3. Prépare le subreddit public de démo, avec la bannière et la description de P2.

---

## Ton planning

| Semaine | Tâches |
|---|---|
| 1 (17 au 23 nov) | 1, 2, plus le post de recrutement de testeurs |
| 2 (24 au 30 nov) | 3, 4 |
| 3 (1er au 4 déc) | 5, 6 |
| Après le gel | listing de l'app, post public, corrections serveur |

## Pièges

- **Le fuseau horaire :** le Service du Jour change à minuit **UTC**, soit 0h ou 1h au Maroc selon la saison. Écris-le dans le post.
- **Le double essai :** sans verrou, deux appuis rapides peuvent enregistrer deux scores. Utilise une écriture Redis atomique (par exemple `SETNX` sur la clé du verre).
- **Le partage :** poster un commentaire au nom du joueur demande sa permission dans Devvit. Vérifie la doc actuelle tôt, dès la semaine 2.
- **Le scheduler en test :** n'attends pas minuit. Ajoute une commande de menu pour les mods, « Publier la nuit maintenant ».
