# 02 : Brief P2 : monde 3D et interface (Blender, décors, clients, écrans)

> **Colle ceci dans ton modèle d'IA, avec `00-projet-et-contrat.md` :**
>
> « Tu es mon binôme pour un hackathon de 3 semaines. Lis d'abord `00-projet-et-contrat.md`. C'est la spec commune, et les règles des fichiers 3D (§6.3) sont obligatoires. Ensuite, lis ce brief : c'est ma partie (Blender, Three.js côté monde, interface). Travaille seulement sur les fichiers listés sous *Tu possèdes*. Fais les tâches dans l'ordre et montre-moi une capture après chaque tâche. Tout doit être léger et pensé pour le mobile : chaque lieu pèse quelques Mo maximum et se charge en moins de 2 secondes. Le style est low-poly, chaud, dessiné à la main. Il ne doit jamais faire « généré par IA ». »

**Responsable :** P2 : **Nassime**

**Ta mission :** faire qu'on ait envie de rester dans le café. Le jury note le **Polish** et la **Delightful UX** : c'est toi qui les portes. L'île au coucher du soleil, le comptoir chaud, des clients qui réagissent, et des écrans propres qui ne ressemblent pas à un template.

**Point de départ :** le test de la carte marche déjà. `build_map.py` dans Blender 5.2 donne `island-opt.glb` (1,5 Mo), qui tourne à 50-60 FPS. Ces fichiers sont sur le PC de Nassime, dans `Desktop\claude\last-drop-map-test\`. Copie-les dans `blender/` et `assets/`.

---

## Tu possèdes

```
blender/                          (fichiers .blend, build_map.py et autres scripts)
assets/models/island.glb
assets/models/loc_<location>.glb   (cafe, beach, chalet, puis versions « bientôt » des 3 autres)
assets/models/glass_<model>.glb    (8 verres, avec LIQUID_BOTTOM / LIQUID_TOP / LIQUID_SHAPE)
assets/models/char_<customer>.glb  (3 clients par lieu, animations idle/happy/meh/splashed)
assets/textures/, assets/ui/, assets/audio/ambient/
src/client/world/scene.ts          (caméra, lumières, rendu, chargement des .glb)
src/client/world/map.ts            (carte de l'île, choix du lieu, lieux verrouillés)
src/client/world/location.ts       (décor du comptoir pour chaque lieu)
src/client/world/customers.ts      (arrivée des clients, réactions branchées sur les événements de P1)
src/client/world/decor.ts          (déco du café achetée avec les pourboires)
src/client/world/streakBoard.ts    (ardoise de la série derrière le comptoir)
src/client/ui/streak.ts            (compteur 🔥, animations de palier et de glaçon)
src/client/ui/*.ts + styles.css    (accueil, carte, résultat de la nuit, classement, étagère, boutons)
```

**Ne touche pas :** `src/client/game/*`, `src/shared/*`, `src/server/*`, `devvit.json`, `levels/*`, `content/*`.

## Tu dépends de

| De | Quoi | Quand |
|---|---|---|
| P3 | Squelette Devvit et `api.ts` | Mer 19 nov |
| P1 | Les événements `onPourStart`, `onPourEnd(result)`, `onNightEnd(summary)` | Dim 23 nov |
| P3 | `/api/leaderboard` et `/api/share` réels (en attendant, utilise les exemples du §10) | Dim 30 nov |

## Les autres dépendent de toi

| Qui | Besoin | Pour |
|---|---|---|
| P1 | `glass_pint.glb` avec les 3 points du §6.3 | **Ven 21 nov** |
| Équipe | Décor du Café pour la Démo 1 | **Dim 23 nov** |
| P1 | Les 8 verres | Mer 26 nov |
| P1, P3 | La carte et les 3 lieux jouables, plus 9 clients | **Dim 30 nov** |
| Pitch | Captures et rendus propres pour la vidéo et la couverture | Jeu 4 déc |

---

## Tâche 1 : la scène et le premier verre (mer 19 au ven 21 nov)

1. `scene.ts` : un renderer Three.js avec `GLTFLoader` et `MeshoptDecoder`. Le pixel ratio est limité à 2, et la lumière est chaude, façon soirée.
2. Modélise `glass_pint` dans Blender : un verre transparent, plus les empties `LIQUID_BOTTOM` et `LIQUID_TOP` et le mesh `LIQUID_SHAPE` (l'intérieur du verre).
3. Exporte en .glb, puis compresse avec `gltf-transform optimize --compress meshopt`.

**Critère d'acceptation :** P1 charge `glass_pint.glb` et trouve les 3 objets par leur nom. Le fichier pèse moins de 200 Ko.

## Tâche 2 : le décor du Café (ven 21 au dim 23 nov)

1. `loc_cafe.glb` : la vue depuis le comptoir, avec des étagères, des lampes et une fenêtre qui donne sur la nuit. Cuis la lumière (light baking) dans Blender pour que le mobile n'ait presque rien à calculer.
2. `location.ts` : place le décor, la caméra et l'emplacement du verre.

**Critère d'acceptation :** le Café s'affiche en moins de 2 secondes sur un téléphone, à 50 FPS ou plus, et pèse moins de 3 Mo.

## Tâche 3 : les verres et les clients (dim 23 au mer 26 nov)

1. Les 8 verres de `GlassModel` (§6.1), tous avec les 3 points.
2. 3 clients pour le Café (géant, fée, fantôme), en low-poly. Chacun a 4 animations : `idle`, `happy`, `meh` et `splashed`. Utilise Mixamo, ou des animations simples codées dans Blender.
3. `customers.ts` : le client entre, attend, puis réagit sur `onPourEnd` selon le score (≥ 95 → `happy`, débordement → `splashed`, sinon `meh`).

**Critère d'acceptation :** une nuit complète montre 5 arrivées et 5 réactions sans saccade.

## Tâche 4 : la carte et les lieux 2 et 3 (mer 26 au dim 30 nov)

1. Retouche `island.glb` à la main. Corrige le château trop sombre au coucher du soleil, et ajoute les panneaux des 6 lieux.
2. `map.ts` : on touche un lieu pour y entrer. Les lieux 4, 5 et 6 affichent un cadenas et « bientôt », avec une jolie image.
3. `loc_beach.glb` et `loc_chalet.glb`, avec 3 clients chacun (6 de plus).
   - **Le Chalet regarde la montagne, pas la plage.** Sur la carte, sa façade (porte, fenêtres, balcon) est tournée vers le sommet enneigé. C'est déjà corrigé dans `build_map.py` : `yaw` vise `PEAK`, et la caméra du Chalet est placée côté mer pour que la montagne remplisse le fond.
   - Dans la vue du comptoir, la grande fenêtre derrière le barman montre **les sommets enneigés et la cascade**, jamais la mer.

**Critère d'acceptation :** la Démo 2 montre la carte, puis on entre dans les 3 lieux, et chaque lieu reste sous 3 Mo.

## Tâche 5 : l'interface (en parallèle, premier jet dès la semaine 1, final le mer 3 déc)

Écrans à faire : **accueil**, **carte**, **résultat de la nuit** (5 scores, total, pourboires, série 🔥, bouton « Partager »), **classement** (du jour et de tous les temps), **étagère de collection**.

- Style : papier, craie, néon doux de café. Pas de dégradés violets, pas de cartes génériques, pas d'emojis en guise d'icônes principales.
- Les boutons font au moins 48 px, pour le pouce.
- Les textes sont courts et drôles. Exemple : « Le fantôme est trempé. Il reviendra. »

**Critère d'acceptation :** une personne qui n'a jamais vu le jeu trouve « Jouer », « Partager » et « Classement » sans aide, sur un téléphone.

## Tâche 5 bis : la série visible (mer 26 au dim 30 nov)

1. `ui/streak.ts` : sur l'accueil, une flamme avec le nombre de nuits qui grandit avec la série (petite à 1, grande à 14 et plus). Affiche aussi les glaçons 🧊 disponibles (0 à 2).
2. Quand `streakMilestone` arrive : une courte animation de palier, puis la récompense apparaît dans le café.
3. Quand `freezeUsed` est vrai : un glaçon fond à l'écran avec « Ta série est sauvée ».
4. `world/streakBoard.ts` : une ardoise derrière le comptoir, avec un trait à la craie par nuit (groupés par 5). Il y en a une dans chaque lieu.
5. Une phrase du premier client qui parle de la série, par exemple « 12e nuit ? Tu habites ici ! ».

**Critère d'acceptation :** avec les exemples du §10, la flamme, l'ardoise, le palier 7 et le glaçon s'affichent sur mobile sans saccade.

## Tâche 6 : la déco du café et l'optimisation (mar 2 au jeu 4 déc, avant le gel)

1. `decor.ts` : les lampes, plantes, chat et guirlandes achetés avec les pourboires apparaissent dans le Café.
2. Passe d'optimisation sur tous les .glb : textures en KTX2 ou WebP, meshopt, et pas plus de 50 000 triangles par lieu.
3. Mesure sur un téléphone moyen : temps de chargement et FPS. Note les résultats dans `blender/PERF.md`.

---

## Ton planning

| Semaine | Tâches |
|---|---|
| 1 (17 au 23 nov) | 1, 2, premier jet de la 5 |
| 2 (24 au 30 nov) | 3, 4, 5 bis |
| 3 (1er au 4 déc) | fin de la 5, puis la 6 |
| Après le gel | captures et rendus pour le pitch, corrections visuelles |

## Pièges

- **Le poids :** un seul .glb non compressé peut faire 30 Mo. Compresse toujours, et vérifie la taille avant chaque commit.
- **Les ombres en temps réel :** elles coûtent très cher sur mobile. Cuis-les dans Blender.
- **Le verre transparent :** évite `transmission` dans Three.js, qui est trop lourd. Utilise `opacity` avec un reflet faux (une texture d'environnement).
- **Le style « IA » :** une interface trop lisse et générique fait perdre des points. Mieux vaut des formes un peu irrégulières, des polices dessinées et une palette limitée.
