# Last Drop: island map pipeline test

**Pipeline:** Blender (Python, built live in a visible window) → glTF binary → gltf-transform with meshopt compression → Three.js viewer.
**Folder:** `C:\Users\User\Desktop\claude\last-drop-map-test\`
**Date:** 2026-11-17 · **Machine:** Intel Core Ultra 7 155U, Intel integrated graphics, Windows 11

## Result

| Item | Value |
|---|---|
| Blender | **5.2.3 LTS** (`C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`) |
| Triangles (whole map) | **89,801**. Island base (terrain + nature + path props) 64k, far islands + sea rocks 12k, the 6 locations about 12k in total |
| `island.glb` (Blender export, no normals) | **6,744,360 B (6.43 MiB)** |
| `island-opt.glb` (meshopt + quantization) | **1,575,212 B (1.50 MiB)**, 4.3× smaller and well under the 5 MB target |
| Side files | `heightmap.png` 52 KB (water depth/foam) · `map_meta.json` 5 KB (pins, cameras, path, river) |
| Draw calls (static) | about 3 for the island base, 1 to 2 per location, plus small animated props |
| FPS, desktop 1280×720 (Chromium, iGPU) | **50–60 FPS** (overview 50–60, close-ups 51–55, night 51) |
| FPS, phone viewport 390×844 (emulated on the same PC) | **50–57 FPS** (not a real phone; see "To do") |

## Time per step

| Step | Time |
|---|---|
| Find tools, `npm i` of three@0.170.0 + @gltf-transform/cli@4.1.1 + http-server@14.1.1 (local `node_modules`) | about 1 min |
| `build_map.py` headless run (`-b`) | **19 s** in total |
| ↳ terrain 0.6 s · river 1.7 s · path 2 s · 6 locations 0.5 s · nature scatter 12.4 s · far islands 0.3 s | |
| ↳ **AO bake into vertex colours (Cycles CPU, 24 samples)** | **2.3–3 s**: fast, so it is kept |
| ↳ heightmap + JSON 0.5 s · glTF export + .blend save 3.4 s | |
| **Live, visible build** (`blender --python build_map.py`, one step every ~1.6 s, with the camera orbiting) | **50–53 s** |
| `gltf-transform optimize … --compress meshopt` | **5.2 s** |
| Viewer load (local) | under 1 s |

## What was built

**Main island (Blender, procedural, low-poly flat-shaded, AO baked into vertex colours)**
- Irregular coastline, sandy beach ring, wet sand that grades into a turquoise seabed (visible through the transparent shallow water), and grass in 4 tones.
- A cliff headland under the castle and a small cliff in the north-east.
- A snowy peak with a river that starts near it, a **waterfall** (a 3.4 m drop), banks and rocks, foam at the bottom of the fall, and a river mouth on the beach.
- A winding dirt path (1 → 2 → 3 → 4 → 5 → 6) with an arched **wooden bridge** over the river, **stepping stones** near the river mouth, **lanterns** every ~13 m, **signposts** with coloured arrows to the neighbouring locations, and **fences** along the castle headland and the café garden.
- 150 trees (pines, snowy pines, round trees, palms in forest clusters), 70 bushes, 45 flower patches, and 45 rocks of varied size.

**The 6 locations.** Each one is its own collection, and its root empty `LOC_n_key` holds the merged mesh plus `PIN_n`, `CAMT_n` (camera target) and `CAMP_n` (camera position):
1. **Midnight Café:** navy café with warm lit windows, a striped awning, string lights, 2 lamp posts, 3 tables with chairs and candles, a chalkboard A-frame, planters, a garden fence, and a cat on the roof.
2. **Beach Bar:** bamboo hut on stilts, thatched roof, counter, stools, glowing bottles, tiki torches, 5 palms, 3 striped parasols with sun loungers and towels, 3 surfboards, a beach ball, a pier with lamps, and a rowboat (a separate object that bobs).
3. **Mountain Chalet:** log chalet on the snowy shoulder with a snow-capped roof, balcony, chimney (`SMOKE_3` empty; smoke particles are drawn in Three.js), firewood stack, sled, snowman, and snowy pines.
4. **Funfair:** Ferris wheel (separate `FerrisWheel` object that rotates), carousel (separate `Carousel` object that rotates), striped tent with a flag, ticket booth, balloons, bunting, and benches.
5. **Pirate Ship:** a long dock with crates, barrels, bollards and lamps. The ship (`PirateShip`, bobbing and rolling) has a hull with a gold stripe, cabin with lit windows, 2 masts, 4 square sails plus a jib, a black flag, 6 cannons and a figurehead.
6. **Haunted Castle:** dark keep with 4 towers and a tall central tower, purple roofs and pennants, glowing purple windows, a **broken curtain wall** with rubble, a graveyard, dead trees, purple wisps, and **bats** circling (`BATS_6` empty; the bats are drawn in Three.js).

**Sea and ambience**
- 4 far islands that cannot be visited: a lighthouse isle with a keeper's house, a palm cay with a treasure chest, rock stacks, and a twin isle. There are also 34 sea rocks.
- 6 **fishing buoys** that bob, a **dolphin** that jumps every 5–11 s with splash rings, and a **whale tail** that rises every 12–22 s.
- The **lighthouse beam rotates** (additive cones plus a glow).
- 9 **seagulls** circle with flapping wings, and 14 low-poly **clouds** drift.

**Viewer (`index.html`, three@0.170.0 from local `node_modules`, ES module import map)**
- Loads `island-opt.glb` with `MeshoptDecoder`.
- Water is a `Reflector` with a custom shader: planar reflections distorted by animated procedural waves, Fresnel, sun glint, a depth-based shallow/deep colour taken from `heightmap.png`, shimmer in the shallows, animated **shore foam bands**, alpha that depends on depth, and fog.
- The river uses a flowing-stripes shader.
- Gradient sky shader with a sun disc and stars at night, sun shadows (PCF soft), hemisphere light, and exponential fog that fades the far islands.
- **Day / Golden / Night presets**, blended over 2.5 s. They change the sun or moon, sky, fog, water colours and lamp glow, and the beam is stronger at night.
- 6 HTML pins at `PIN_n` that bob and fade when the island hides them. Clicking a pin or a bottom chip flies the camera (`CAMP_n` → `CAMT_n`, eased with an arc) and walks the **"drop" player marker** along the path (`PATH_###` empties / `map_meta.path`) to that location.
- **Locked variant:** the "Lock 3–6" button greys out locations 3 to 6 (a desaturated material made with `onBeforeCompile`, glow switched off), shows drifting grey fog sprites over them, and puts a lock icon on their pins. In code: `__app.setLocked(loc, true)`.
- OrbitControls are limited: polar ≤ 78°, the camera stays above y=3, distance 10–340, and the target is clamped to the map.
- Pixel ratio is capped at 2. On mobile the shadow map is 1024 and the reflection is at 0.35 scale. On portrait screens the camera moves back automatically.
- FPS and triangle counter in the corner. `window.__app` exposes `goTo(id)`, `overview()` and `setTOD(i)` for tests.

## Files

- `build_map.py`: the whole map as code. `blender --python build_map.py` gives the live build; `blender -b -P build_map.py` gives a 19 s headless build.
- `island.blend`: saved scene with collections `Island_Base`, `LOC_1_cafe` … `LOC_6_castle`, `Far_Islands`.
- `island.glb` / `island-opt.glb`: raw export and compressed export.
- `heightmap.png`, `map_meta.json`: water depth and game metadata (positions in Three.js coordinates).
- `index.html`: the viewer.
- `screenshots/`:
  - Desktop: `desktop_overview.png`, `desktop_cafe.png`, `desktop_chalet.png`, `desktop_pirate_ship.png`, `desktop_castle.png`, `desktop_night_locked.png`
  - Phone: `phone_overview.png`, `phone_funfair.png`
  - Blender: `blender_live_build.png`
- `build_log.txt`, `build_done.json`, `compress_log.txt`: logs, per-step times and per-object triangle counts.

Run the viewer with `npx http-server -p 8931` inside the folder, then open http://127.0.0.1:8931/. Port 8765 was already used by another server on this PC.

## What worked
- The whole pipeline worked on the first full run: procedural build, AO bake, glTF export, meshopt compression and the Three.js load. The build step had no errors.
- The AO bake to vertex colours costs only about 3 s, gives soft contact shadows for free at runtime, and needs no texture.
- Exporting **without normals** (Three.js computes flat normals) plus meshopt and quantization brings 6.4 MiB down to 1.5 MiB.
- `--prune false --flatten false --join false` keeps every empty and the hierarchy (PIN, CAMT, CAMP, SMOKE, BATS, LIGHTHOUSE_LAMP, PATH_###) through compression. `--simplify false` keeps the hand-built flat-shaded look intact.
- The water reads well: transparent turquoise shallows over the sand, a foam line, reflections of the island and the ship, and a sun glint.

## What failed or was changed
- **The first layout had problems.** The path climbed over the mountain to 20 m and the bridge sat 20 m up. The castle plateau also cut a radial cliff "wall" through the middle of the island. I fixed both by rerouting the path around the mountain, moving the chalet up the shoulder, and fading the cliff plateau out toward the centre.
- **The first camera targets looked at the backs of buildings.** I fixed this: `CAMP_n` now sits in front of each building (facing the centre, or facing the sea for the beach and the ship). The ship pin now sits over the ship.
- The first fog setting washed the scene out, and water + sky made the sea look beige. I lowered the fog and the Fresnel cap.
- Glow windows blew out to white under ACES tone mapping. I capped emissive at runtime; the purple windows are still fairly pale.
- `gltf-transform` warns that it skipped quantizing the river UVs because they are outside the 0–1 range. This is harmless.
- The live Blender build and the headless build give identical output (fixed random seeds). **I rebuilt the live window with the final script.** The first Blender window I opened (the earlier version) is still open, so close it without saving.
- One stray screenshot from the first test landed in `C:\Users\User\Desktop\claude\screenshots\` (outside the test folder). The tool blocked my attempt to delete it, so please delete it by hand.

## Explainer video (added 2026-11-17)
- **File:** `video/last-drop-carte-video.mp4`. 3 min 36 s, 1920×1080 at 30 fps, H.264 + AAC 192k, 335 MB, loudness −14.3 LUFS.
- **Narration and captions:** 16 sections, with French narration from a local Kokoro TTS voice (`ff_siwis`, `kokoro-onnx` in `video/.venv`). Captions are burned in with the active word highlighted. Each section has a title card, and a progress bar runs along the bottom.
- **Music:** a soft procedural music bed that ducks under the voice.
- **How the footage was made:**
  - `tour.html` is a copy of `index.html` with a scripted cinematic tour. The original page is untouched.
  - `video/capture.mjs` drives it frame by frame (deterministic time) in the system Chrome through `playwright-core`.
  - The Blender part is the real viewport. `build_map.py` saves its own 3D view while it builds, when `LD_RECORD_DIR` is set. That clip is shown sped up, with the dark shader-compile and bake seconds cut out.
- **To rebuild:** `python build_timeline.py` → `python make_tour.py` → `node capture.mjs` → `.venv\Scripts\python audio.py` → ffmpeg loudnorm + encode.
- **Fixes made before recording:**
  - The castle stone is lighter and the purple windows are saturated (no longer washed out to white).
  - The lighthouse beam fades along its length.
  - The tour camera never goes below the terrain.
- **Still true:** at golden hour the castle front faces away from the sun, so it still reads dark in close-ups.
- **What did not work:** my first attempt was a desktop screen recording with ffmpeg gdigrab. The browser window covered Blender, so I replaced it with the in-Blender viewport capture. That capture only runs at about 2 fps, so the clip is smoothed with frame blending.

## To do for "perfect quality"
1. **Test on a real phone.** The FPS numbers here come from a desktop iGPU with phone emulation. On mid-range Android, expect the reflection pass plus shadows to be the cost. Add an automatic quality step-down: turn off the Reflector and use a cheap sky-gradient reflection, and turn off shadows.
2. **Devvit size and loading.** 1.5 MB is fine. Lazy-load or stream the far islands, or generate them in code.
3. **Art pass**
   - Hand-place props at a few hero spots instead of relying fully on procedural scatter.
   - Make the castle stone a lighter, cooler grey so it reads at golden hour.
   - Tune the purple glow (bloom or a separate emissive tint).
   - Give the path a vertex-coloured edge blend instead of whole triangles.
   - Add more variety to the chalet logs, café signage text and the ship's sails (curved sails).
4. **Coastline.** Use an adaptive or denser triangulation near the shore for a smoother outline, which costs about 10–15k more triangles.
5. **Water.** Add a soft-particle-style foam ring around the ship hull and pier posts (draw them into the heightmap or a second mask), and a small waterfall splash particle emitter.
6. **Bloom at night** (UnrealBloomPass at half resolution) so the lanterns and windows glow. Desktop only.
7. **Locked state.** Replace the grey sprites with a proper volumetric-looking fog card or a shader dome. Optionally ship `KHR_materials_variants` in the glb so locked/unlocked is data-driven.
8. **Pins.** Add a collision or declutter pass when pins overlap at wide angles. Occlusion fading is already done.
9. **Game hook-up.** `map_meta.json` already has pins, cameras, the path and `pathIndex` per location. Next is to wire the drop marker to the real game state, as the "current drop" location.

## 2026-11-18: chalet faces the mountain
- `build_map.py` change: the Mountain Chalet's front now faces the snowy peak, and `CAMP_3` stands on the sea side looking across the chalet toward the mountain. The old script is kept as `build_map_avant-chalet.py`.
- Rebuilt headless (`blender -b -P build_map.py`, 8.7 s, no step failed, 89,801 triangles). `island.glb` is now 6,744,336 B.
- `npx gltf-transform optimize island.glb island-opt.glb --compress meshopt --prune false --flatten false --join false --simplify false --instance false` gives **`island-opt.glb` = 1,575,800 B (1.50 MiB)**. It is copied to `share\` together with `share\island-opt.glb.b64.txt`, `map_meta.json` and `heightmap.png`. `share\island-q.glb.b64.txt` (the non-meshopt fallback) was **not** rebuilt, so it still has the old chalet.
- Checked in Blender: the chalet front (local −Y, found from its window faces) points at the peak within 0.8°. `CAMP_3 → CAMT_3` points at the peak within 4.8° and at the chalet within 3.4°, and the camera is 54 m from the island centre while the chalet is 28 m away, so the camera is on the sea side.
- Render from `CAMP_3`: `screenshots/chalet-montagne.png` (EEVEE, 1600×900). It shows the back of the chalet with the peak behind it.
- Viewer at http://127.0.0.1:8931/: it loads with meshopt (no fallback), `goTo(3)` flies to the chalet at 54 FPS, and there are no console errors except a harmless 404 for `favicon.ico`. The check script is `video/check_chalet.mjs`.
