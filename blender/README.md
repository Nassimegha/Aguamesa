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

## Reconstruire un lieu (loc_cafe, et modèle pour loc_beach/loc_chalet)

```bash
cd blender
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --python build_loc_cafe.py
npx @gltf-transform/cli weld loc_cafe_raw.glb loc_cafe_weld.glb
npx @gltf-transform/cli meshopt loc_cafe_weld.glb loc_cafe.glb --level medium
node check_nodes.mjs loc_cafe.glb
```

Puis copie `loc_cafe.glb` dans `../assets/models/`.

**Convention des marqueurs (même idée que LIQUID_BOTTOM/TOP sur les verres) :** chaque `loc_<lieu>.glb` doit contenir 3 empties, lus par `location.ts` :
- `GLASS_ANCHOR` : où poser le verre actif (toujours à l'origine du lieu, comme pour `glass_pint`)
- `CAMERA_POS` : position de la caméra de jeu
- `CAMERA_TARGET` : point que la caméra regarde

**Astuce pour régler la caméra sans deviner à l'aveugle :** `src/client/main.ts` (temporaire) a un mode `?debug=1` dans l'URL qui place une caméra large et fixe pour voir tout le décor d'un coup, avant de choisir les bonnes valeurs de `CAMERA_POS`/`CAMERA_TARGET` à mettre dans le script Blender.

**Piège Blender :** `primitive_cube_add(size=1)` crée un cube d'arête 1. Pour une boîte de taille `(sx, sy, sz)`, le `obj.scale` doit être `(sx, sy, sz)` **directement**, pas divisé par 2 — sinon tout fait la moitié de la taille prévue (vécu sur ce fichier).
