# Performance — P2 (Tâche 6)

Mesuré le 2026-11-18. Ce qui suit est honnête sur ce qui a été vérifié et ce qui ne l'a pas été.

## Poids des fichiers (vérifié)

Tous les `.glb` sont compressés en meshopt (`weld` + `meshopt`, jamais `optimize` — voir le piège documenté plus haut dans ce README). Aucun fichier ne contient de texture image : tout est en couleur plate, donc l'optimisation KTX2/WebP prévue par la Tâche 6 n'a rien à compresser pour l'instant — elle s'appliquera le jour où de vraies textures peintes arrivent.

| Fichier | Poids |
|---|---|
| `island.glb` (toute la carte, chargée une fois) | 1,54 Mo |
| `loc_beach.glb` | 104 Ko |
| `loc_cafe.glb` | 79 Ko |
| `loc_chalet.glb` | 69 Ko |
| 9 `char_*.glb` | de 30 à 73 Ko chacun |
| 8 `glass_*.glb` | de 5,6 à 13 Ko chacun |

**Un lieu complet** (décor + verre + les 3 clients du lieu) pèse entre 110 et 220 Ko selon le lieu — très loin de la limite « quelques Mo » du contrat (00 §1). `island.glb` reste le plus gros morceau, mais il ne se charge qu'une fois, à l'entrée sur la carte.

## Triangles par scène (vérifié, `blender/triangle_report.mjs`)

| Scène | Triangles | Budget (brief §6, « pas plus de 50 000 par lieu ») |
|---|---|---|
| Café complet (décor + verre + 1 client) | ~3 000 à 3 900 | ✅ très large marge |
| Plage complète (décor + verre + 1 client) | ~4 600 à 6 600 | ✅ très large marge |
| Chalet complet (décor + verre + 1 client) | ~2 800 à 4 300 | ✅ très large marge |
| `island.glb` (carte, chargée à part) | 89 800 | n'est pas « un lieu » — c'est la carte, mesurée et déjà testée à 55 FPS avant cette session (voir `map-viewer/REPORT.md`) |

Chaque lieu de jeu reste sous 10 000 triangles au pire cas, pour un budget de 50 000 : il y a de la marge pour enrichir le décor plus tard sans risque.

## Temps de chargement (vérifié indirectement)

Pas de mesure directe en millisecondes, mais le poids (ci-dessus) le garantit : à 100-220 Ko par lieu sur une connexion mobile lente (disons 1 Mo/s effectif), le téléchargement prend une fraction de seconde. Le budget contractuel de 2 secondes (00 §1) devrait être tenu avec une large marge, sauf latence réseau exceptionnelle.

## FPS sur téléphone : **non mesuré, et c'est important de le dire**

J'ai essayé de mesurer le FPS automatiquement (`?fps=1` dans l'URL de `main.ts`, qui compte les frames sur 4 secondes). Le résultat obtenu dans l'environnement de test (navigateur headless piloté par Playwright) était de **1,2 FPS** — un chiffre absurde qui ne reflète pas la réalité : un onglet de navigateur en arrière-plan ou non focalisé voit son `requestAnimationFrame` délibérément ralenti par Chromium, ce n'est pas une mesure de performance réelle du rendu.

**Donc : le FPS réel sur téléphone n'a pas été mesuré**, et je ne veux pas prétendre le contraire. Vu le très faible nombre de triangles (quelques milliers par lieu, zéro texture à décoder), on peut raisonnablement s'attendre à 60 FPS sur un téléphone moyen — mais c'est une attente, pas une mesure.

**Ce qu'il reste à faire (vraie tâche d'équipe, brief 02 Tâche 6 point 3, et Tâche 7 du planning) :** ouvrir le jeu sur un vrai téléphone (dans l'app Reddit une fois le squelette de Mohamed branché, ou via `npm run dev:local` sur le réseau local en attendant), et noter le FPS affiché par les devtools du téléphone ou un compteur à l'écran. L'outil `?fps=1` existe déjà dans `main.ts` pour ça — il donnera un vrai chiffre une fois lancé sur un appareil réel au premier plan.

## Pièges déjà documentés (voir `blender/README.md`)

- `gltf-transform optimize` supprime les empties sans mesh → utiliser `weld` + `meshopt` séparément.
- `primitive_cube_add(size=1)` + `obj.scale=(sx,sy,sz)` directement, pas divisé par 2.
- Blender n'exporte que la dernière action d'animation sauf à les empiler sur des pistes NLA.
- `GLTFLoader` renvoie les animations dans `gltf.animations`, pas `gltf.scene.animations`.
