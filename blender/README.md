# Carte de l'île (P2 : Nassime)

**Tout le monde peut utiliser la carte. Seule P2 la modifie.** Si tu veux un changement, demande sur le groupe.

| Fichier | À quoi il sert |
|---|---|
| `build_map.py` | Script Blender 5.2 qui construit toute l'île (6 lieux, rivière, mer, îlots). C'est la source de la carte. |
| `../assets/models/island.glb` | La carte prête pour le jeu, compressée en meshopt (1,5 Mo). C'est ce fichier que le jeu charge. |
| `map-viewer/` | Un viewer Three.js pour voir la carte : 6 lieux, caméras, jour et nuit. |
| `map-viewer/map_meta.json` | Les positions des 6 lieux, des pins et des caméras (`CAMP_n` vers `CAMT_n`). |
| `screenshots/` | Captures de la carte, y compris le Chalet tourné vers la montagne. |
| `build_glass_pint.py` | Script Blender qui construit `glass_pint` : le corps du verre, les empties `LIQUID_BOTTOM`/`LIQUID_TOP` et le mesh `LIQUID_SHAPE` (contrat §6.3). Modèle pour les 7 autres verres de la Tâche 3. |
| `check_nodes.mjs` | Petit script Node (`node check_nodes.mjs fichier.glb`) qui liste tous les objets d'un `.glb`, y compris les empties. Sert à vérifier qu'un export garde bien `LIQUID_BOTTOM`/`LIQUID_TOP` après compression. |
| `build_loc_cafe.py` | Script Blender qui construit `loc_cafe` : comptoir, étagères, fenêtre, lampe, chat. Modèle pour `loc_beach`/`loc_chalet` (Tâche 4). |

## Voir la carte

```bash
cd blender/map-viewer
npx http-server -p 8931    # ou : python -m http.server 8931
```
Puis ouvre http://127.0.0.1:8931/. Three.js 0.170.0 est chargé depuis jsDelivr.

## Reconstruire la carte

1. Ouvre Blender 5.2 et lance `build_map.py` (onglet Scripting, puis Run).
2. Exporte en glTF binaire (`island.glb`).
3. Compresse : `npx @gltf-transform/cli optimize island.glb island-opt.glb --compress meshopt`.
4. Copie le résultat dans `assets/models/island.glb` et dans `map-viewer/island-opt.glb`.

Le fichier `.blend` et les vidéos ne sont pas dans le repo, parce qu'ils sont trop lourds. Le script les recrée.

## Reconstruire un verre (glass_pint, et modèle pour les 7 autres)

```bash
cd blender
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --python build_glass_pint.py
npx @gltf-transform/cli weld glass_pint_raw.glb glass_pint_weld.glb
npx @gltf-transform/cli meshopt glass_pint_weld.glb glass_pint.glb --level medium
node check_nodes.mjs glass_pint.glb   # vérifie que LIQUID_BOTTOM et LIQUID_TOP sont toujours là
```

Puis copie `glass_pint.glb` dans `../assets/models/`.

**Piège important :** n'utilise jamais `gltf-transform optimize` (la commande tout-en-un) sur un verre. Ses étapes `join`/`prune`/`flatten` fusionnent les meshes et **suppriment les empties sans mesh** — exactement `LIQUID_BOTTOM` et `LIQUID_TOP` dont P1 a besoin. Utilise seulement `weld` + `meshopt` séparément, comme ci-dessus. `check_nodes.mjs` sert justement à repérer ce problème avant de commit.

## Les 6 lieux (loc_<lieu>.glb)

- `build_loc_cafe.py` : le Midnight Café, et la boîte à outils commune (matériaux, fusion par matériau, cuisson PBR).
- `build_loc_themed.py` : Beach Bar, Mountain Chalet, Funfair, Pirate Ship et Haunted Castle, sur la même structure (comptoir devant, clients sur l'estrade derrière, ardoise à droite, décor du thème à gauche). Il réutilise les fonctions de `build_loc_cafe.py`.
- Les matériaux procéduraux (bois veiné et usé, parquet, brique, plâtre, laiton brossé, céramique) sont **cuits par Cycles** en petites textures WebP : couleur × occlusion ambiante (ombres de contact), normal map, rugosité. Tout le reste est fusionné par matériau : 15 à 35 draw calls par lieu, 190 à 460 Ko.

```bash
cd blender
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --python build_loc_cafe.py
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --python build_loc_themed.py   # AGUAMESA_ONLY=beach,chalet pour en refaire quelques-uns
# pour chaque loc_<lieu>_raw.glb :
npx @gltf-transform/cli weld loc_cafe_raw.glb loc_cafe_weld.glb
npx @gltf-transform/cli meshopt loc_cafe_weld.glb ../assets/models/loc_cafe.glb --level medium
node check_nodes.mjs ../assets/models/loc_cafe.glb
```

**Marqueurs lus par `location.ts` :**
- `GLASS_ANCHOR` : où poser le verre actif (toujours à l'origine du lieu, comme pour `glass_pint`)
- `CAMERA_POS` / `CAMERA_TARGET` : caméra du lieu (le jeu recadre ensuite en portrait)
- `UI_DIALOGUE_ANCHOR` : au-dessus de la tête du client (bulle de dialogue, si le client n'est pas encore chargé)
- `UI_STREAK_ANCHOR` : sur l'ardoise
- `CHALKBOARD` : le mesh de l'ardoise, repeint par le jeu (boissons du lieu, numéro de la nuit, série 🔥 et traits à la craie)
- `CANDLE_FLAME_n` : les flammes, qui vacillent en jeu

**Astuce pour régler la caméra sans deviner à l'aveugle :** `src/client/main.ts` (temporaire) a un mode `?debug=1` dans l'URL qui place une caméra large et fixe pour voir tout le décor d'un coup, avant de choisir les bonnes valeurs de `CAMERA_POS`/`CAMERA_TARGET` à mettre dans le script Blender.

**Piège Blender :** `primitive_cube_add(size=1)` crée un cube d'arête 1. Pour une boîte de taille `(sx, sy, sz)`, le `obj.scale` doit être `(sx, sy, sz)` **directement**, pas divisé par 2 — sinon tout fait la moitié de la taille prévue (vécu sur ce fichier).

## Les 8 verres (Tâche 3)

- `build_glasses.py` construit les 7 verres restants (`mug_giant`, `thimble`, `flute`, `coconut`, `teacup`, `goblet`, `tankard`), sur le même principe que `build_glass_pint.py` : un profil de révolution (liste de `(rayon, z)`), lofté en mesh, plus les 3 marqueurs du contrat §6.3.
- Même pipeline de compression (`weld` + `meshopt`, jamais `optimize`).

## Les 180 clients animés (char_<id>.glb, 30 par lieu)

- `build_customers.py` est un **générateur** : un constructeur de personnage paramétrique (corps, tête, yeux, nez/museau/bec, oreilles, cheveux, chapeau, bras, ailes, queue, accessoires, objet tenu) et une table `ROSTERS` de 30 clients par lieu, chacun avec son nom et sa réplique. Il écrit aussi `src/client/world/customers.manifest.json`, lu par le jeu : impossible que le code et les .glb se désynchronisent.
- Pas de texture : les couleurs sont dans la géométrie (vertex colors) sur un seul matériau partagé, et les morceaux sont fusionnés par partie animée (corps, tête, bras, ailes, queue). Résultat : 3 à 8 draw calls et environ 45 Ko par client.
- Chaque client a les 4 animations du contrat (§6.3), avec tête, bras, bouche, ailes et queue qui bougent : `idle` (respire, regarde autour), `happy` (s'accroupit, saute, lève les bras, grand sourire), `meh` (s'affaisse, secoue la tête, croise les bras), `splashed` (recule, se protège le visage, s'ébroue).
- Tailles : `tall` (debout derrière le bar), `small` (posé sur le comptoir à côté du verre), `floater` (flotte derrière le comptoir). La position de chaque taille est dans `src/client/world/roster.ts`.

```bash
cd blender
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --python build_customers.py   # AGUAMESA_ONLY=id1,id2 pour en refaire quelques-uns
node compress_models.mjs _chars   # weld + meshopt de tous les clients -> ../assets/models/char_<id>.glb
# (pour les lieux : node compress_models.mjs .  après build_loc_cafe.py / build_loc_themed.py)
node check_animations.mjs ../assets/models/char_giant.glb
# planche de contrôle visuel des 30 clients d'un lieu :
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --python preview_customers.py -- cafe planche_cafe.png
```

- **Qui vient au comptoir :** au Service du Jour, le tirage dépend de `dayId` + lieu (même soirée pour tous les joueurs, contrat §1, mais différente chaque nuit) ; en mode Niveaux et en Visite, au hasard. Le score ne dépend jamais du client.
- **Piège animation (le plus sournois) :** si tu assignes juste `obj.animation_data.action = ...` plusieurs fois de suite pour créer plusieurs animations, Blender **n'exporte que la dernière** — les autres actions sont silencieusement perdues à l'export, même avec `use_fake_user = True`. Il faut empiler chaque action sur sa propre piste NLA (`animation_data.nla_tracks.new()` + `track.strips.new(name, frame_debut, action)`, puis remettre `animation_data.action = None`), et exporter avec `export_animation_mode='NLA_TRACKS'`. `check_animations.mjs fichier.glb` vérifie les noms des animations après export/compression.
- **Piège Three.js (deuxième sournoiserie) :** `GLTFLoader` renvoie les animations dans `gltf.animations`, **pas** dans `gltf.scene.animations`. Si `scene.ts` ne garde que `gltf.scene`, les animations sont perdues avant même d'arriver à `customers.ts`. Il faut recopier `gltf.scene.animations = gltf.animations` avant de renvoyer la scène (déjà fait dans `scene.ts`).

## La carte et les lieux 2/3 (Tâche 4)

- `src/client/world/map.ts` réutilise **island.glb tel quel** (pas retouché) et les positions de `map-viewer/map_meta.json`, avec son propre éclairage de scène (`scene.ts`) — pas celui, plus dur, de `map-viewer/index.html`. C'est pour ça que le château qui paraissait trop sombre dans le viewer de test n'a pas eu besoin d'être corrigé dans `build_map.py` : le problème venait de l'éclairage du viewer de prévisualisation, pas du modèle.
- Les panneaux des 6 lieux sont des pastilles HTML (comme dans `map-viewer`), pas des objets 3D : `map.ts` projette la position 3D de chaque lieu à l'écran à chaque frame, et écarte celles qui se chevauchent. Toucher un lieu → la caméra y vole → « Enter » → mode **Visite** (le décor, caméra libre, les 30 clients du lieu et leurs réactions, sans consommer l'essai du jour). Lien direct pour l'équipe et le jury : `game.html?visit=castle` (ou cafe, beach, chalet, fair, pirate).

## Optimisation et performance (Tâche 6)

- `triangle_report.mjs` (`node triangle_report.mjs ../assets/models`) compte les triangles de chaque `.glb` du dossier. Sert à vérifier le budget de 50 000 triangles par lieu (contrat/brief §6).
- Les résultats et ce qui a (et n'a pas) été mesuré sont dans `PERF.md` — en particulier, le FPS réel sur téléphone n'est pas encore mesuré, lire `PERF.md` avant de dire le contraire.
