// P2 (Nassime) : la carte de l'île, choix du lieu, lieux verrouillés (brief 02 Tâche 4).
// Porte dans le jeu tout l'environnement de blender/map-viewer/index.html : ciel en
// dégradé, eau animée (reflets, écume selon la profondeur), rivière qui coule, soleil +
// ombres, brouillard, nuages, oiseaux, fumée, phare, bateaux qui tanguent, manèges, dauphin
// et baleine, la goutte qui marche sur le chemin, brume sur les lieux verrouillés.
// La carte partage le renderer du jeu : à l'entrée on cache le décor du comptoir et on
// règle le renderer comme le viewer ; dispose() remet tout comme avant.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import type { GameScene } from './scene';
import type { LocationId } from './location';

type Vec3 = [number, number, number];

interface MapMeta {
  extent: number;
  heightMin: number;
  heightRange: number;
  locations: { id: number; key: string; name: string; node: string; pin: Vec3; camTarget: Vec3; camPos: Vec3; pathIndex: number }[];
  path: Vec3[];
}

/** Nom affiché et LocationId du contrat (00 §6.1), dans l'ordre des lieux de map_meta.json. */
const LOCATION_IDS: Record<number, { key: LocationId; name: string }> = {
  1: { key: 'cafe', name: 'Midnight Café' },
  2: { key: 'beach', name: 'Beach Bar' },
  3: { key: 'chalet', name: 'Mountain Chalet' },
  4: { key: 'fair', name: 'Funfair' },
  5: { key: 'pirate', name: 'Pirate Ship' },
  6: { key: 'castle', name: 'Haunted Castle' },
};
const LOC_COLORS = ['#c9573f', '#2f9e95', '#5679c4', '#d79a1e', '#8a5a33', '#7c4bb8'];
const MAP_URL = '/assets/map/';

// Deux ambiances du viewer : Day (lumière dorée, par défaut) et Night (« Nuit »).
// Le bouton soleil/lune passe de l'une à l'autre en fondu, sans recharger la scène.
const DAY = {
  sunDir: new THREE.Vector3(-0.62, 0.33, 0.48).normalize(),
  sun: new THREE.Color('#ffc28a'),
  sunI: 2.6,
  hemiSky: new THREE.Color('#ffdcb8'),
  hemiGround: new THREE.Color('#b68e6a'),
  hemiI: 0.95,
  zenith: new THREE.Color('#5f86cc'),
  horizon: new THREE.Color('#ffcf9f'),
  fog: 0.0021,
  emissive: 1.2,
  deep: new THREE.Color('#246f8c'),
  shallow: new THREE.Color('#5fc6b9'),
  beam: 0.1,
  glow: 1.0,
  stars: 0,
};
type Preset = typeof DAY;
const GOLDEN: Preset = DAY; // valeurs de départ de la scène
const NIGHT: Preset = {
  sunDir: new THREE.Vector3(0.35, 0.6, -0.55).normalize(),
  sun: new THREE.Color('#a9bdff'),
  sunI: 0.6,
  hemiSky: new THREE.Color('#41558f'),
  hemiGround: new THREE.Color('#1a2133'),
  hemiI: 0.55,
  zenith: new THREE.Color('#0a1330'),
  horizon: new THREE.Color('#2c3c69'),
  fog: 0.0026,
  emissive: 2.4,
  deep: new THREE.Color('#0c2a44'),
  shallow: new THREE.Color('#1d5a6a'),
  beam: 0.42,
  glow: 0.3,
  stars: 1,
};
const AMBER = 0xffb45a;

const NOISE = `
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }`;

const WATER_SHADER = {
  name: 'IslandWater',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    uTime: { value: 0 },
    uHeight: { value: null as THREE.Texture | null },
    uExtent: { value: 240 },
    uHmin: { value: -8 },
    uHrange: { value: 12 },
    uSunDir: { value: new THREE.Vector3() },
    uSunColor: { value: new THREE.Color() },
    uDeep: { value: new THREE.Color() },
    uShallow: { value: new THREE.Color() },
    uFogColor: { value: new THREE.Color() },
    uFogDensity: { value: 0.003 },
    uNight: { value: 0 },
  },
  vertexShader: `
    uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vWorld;
    void main(){ vUv = textureMatrix * vec4(position,1.0); vec4 w = modelMatrix*vec4(position,1.0); vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `
    uniform vec3 color; uniform sampler2D tDiffuse; varying vec4 vUv; varying vec3 vWorld;
    uniform float uTime, uExtent, uHmin, uHrange, uFogDensity, uNight; uniform sampler2D uHeight;
    uniform vec3 uSunDir, uSunColor, uDeep, uShallow, uFogColor;
    ${NOISE}
    float waves(vec2 p){
      float t = uTime;
      float h = vnoise(p*0.11 + vec2(t*0.04, t*0.025));
      h += 0.5*vnoise(p*0.27 - vec2(t*0.06, -t*0.035));
      h += 0.25*vnoise(p*0.75 + vec2(t*0.11, t*0.09));
      h += 0.12*vnoise(p*1.9 - vec2(t*0.2, t*0.13));
      h += 0.35*sin(p.x*0.07 + p.y*0.045 + t*0.7);
      return h;
    }
    void main(){
      vec3 toCam = cameraPosition - vWorld; float dist = length(toCam); vec3 V = toCam/dist;
      vec2 p = vWorld.xz;
      float e = 0.3;
      float k = mix(0.9, 0.18, smoothstep(25.0, 380.0, dist));
      float h0 = waves(p), hx = waves(p+vec2(e,0.)), hz = waves(p+vec2(0.,e));
      vec3 n = normalize(vec3(-(hx-h0)/e*k, 1.0, -(hz-h0)/e*k));
      vec2 huv = vec2((p.x + uExtent)/(2.0*uExtent), (-p.y + uExtent)/(2.0*uExtent));
      float th = uHmin;
      if (huv.x > 0.0 && huv.x < 1.0 && huv.y > 0.0 && huv.y < 1.0) th = uHmin + texture2D(uHeight, huv).r * uHrange;
      float depth = max(-th, 0.0);
      vec2 ruv = vUv.xy / vUv.w + n.xz * 0.035;
      vec3 refl = texture2D(tDiffuse, ruv).rgb;
      float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
      fres = clamp(fres * 0.95 + 0.06, 0.0, 0.72);
      vec3 water = mix(uShallow, uDeep, smoothstep(0.0, 5.5, depth));
      float sh = vnoise(p*0.55 + uTime*0.35) * vnoise(p*0.8 - uTime*0.27);
      water += uShallow * sh * 0.35 * (1.0 - smoothstep(0.0, 3.0, depth));
      vec3 col = mix(water, refl, fres);
      vec3 R = reflect(-normalize(uSunDir), n);
      col += uSunColor * pow(max(dot(R, V), 0.0), 220.0) * 3.0;
      float fn = vnoise(p*1.3 + vec2(uTime*0.25, -uTime*0.18));
      float shore = 1.0 - smoothstep(0.0, 0.35 + 0.3*fn, depth);
      float band = smoothstep(0.78, 1.0, sin(depth*4.5 - uTime*1.5 + fn*2.5)*0.5+0.5) * (1.0 - smoothstep(0.25, 1.9, depth));
      float foam = clamp(shore*0.95 + band*0.75*smoothstep(0.25, 0.6, fn), 0.0, 1.0);
      col = mix(col, vec3(mix(1.0, 0.55, uNight)), foam * 0.9);
      float alpha = mix(0.55, 1.0, smoothstep(0.0, 4.0, depth));
      alpha = max(alpha, foam);
      float ff = 1.0 - exp(-uFogDensity*uFogDensity*dist*dist);
      col = mix(col, uFogColor, ff);
      alpha = mix(alpha, 1.0, ff);
      gl_FragColor = vec4(col, alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

export interface GameMap {
  readonly island: THREE.Object3D;
  dispose(): void;
}

interface MapLocation {
  id: number;
  key: LocationId;
  locked: boolean;
  pin: THREE.Vector3;
  camTarget: THREE.Vector3;
  camPos: THREE.Vector3;
  pathIndex: number;
  meshes: THREE.Mesh[];
  fog: THREE.Group;
  el: HTMLButtonElement;
  size?: { w: number; h: number };
  lift?: number;
}

function softTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.5, 'rgba(255,255,255,.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeBird(color: number, size: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, flatShading: true });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.18 * size, 1.0 * size, 4), mat);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  for (const s of [1, -1]) {
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.35 * size, 0, 0, 0.3 * size, s * 1.4 * size, 0, -0.1 * size], 3));
    wg.computeVertexNormals();
    const w = new THREE.Mesh(wg, mat);
    w.userData.s = s;
    g.add(w);
  }
  return g;
}

const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export async function loadMap(
  game: GameScene,
  unlockedLocations: ReadonlySet<LocationId>,
  onEnter: (id: LocationId) => void,
): Promise<GameMap> {
  const { scene, camera, renderer } = game;
  const mobile = matchMedia('(pointer:coarse)').matches || Math.min(innerWidth, innerHeight) < 600;

  const [island, meta, heightTex] = await Promise.all([
    game.loadGLB('/assets/models/island.glb'),
    fetch(`${MAP_URL}map_meta.json`).then((r) => r.json() as Promise<MapMeta>),
    new THREE.TextureLoader().loadAsync(`${MAP_URL}heightmap.png`),
  ]);

  // --- on range le comptoir et on règle le renderer comme le viewer ---------------
  const hidden: THREE.Object3D[] = [];
  for (const child of scene.children) {
    if (child.visible) {
      child.visible = false;
      hidden.push(child);
    }
  }
  const saved = {
    toneMapping: renderer.toneMapping,
    exposure: renderer.toneMappingExposure,
    shadows: renderer.shadowMap.enabled,
    shadowType: renderer.shadowMap.type,
    fog: scene.fog,
    background: scene.background,
    environment: scene.environment,
    fov: camera.fov,
    near: camera.near,
    far: camera.far,
  };
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap n'existe plus en three r187
  scene.background = null;
  scene.environment = null;
  scene.fog = new THREE.FogExp2(GOLDEN.horizon.getHex(), GOLDEN.fog);
  camera.fov = mobile ? 55 : 45;
  camera.near = 0.5;
  camera.far = 5000;
  camera.updateProjectionMatrix();

  const added: THREE.Object3D[] = [];
  const add = <T extends THREE.Object3D>(o: T): T => {
    scene.add(o);
    added.push(o);
    return o;
  };

  // --- lumières ----------------------------------------------------------------
  const hemi = add(new THREE.HemisphereLight(GOLDEN.hemiSky, GOLDEN.hemiGround, GOLDEN.hemiI));
  void hemi;
  const sun = new THREE.DirectionalLight(GOLDEN.sun, GOLDEN.sunI);
  sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -85, right: 85, top: 85, bottom: -85, near: 10, far: 400 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.6;
  sun.position.copy(GOLDEN.sunDir).multiplyScalar(180);
  add(sun);
  add(sun.target);

  // --- ciel ----------------------------------------------------------------------
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: GOLDEN.zenith.clone() },
      uHorizon: { value: GOLDEN.horizon.clone() },
      uSunDir: { value: GOLDEN.sunDir.clone() },
      uSunColor: { value: GOLDEN.sun.clone() },
      uStars: { value: GOLDEN.stars },
      uGlow: { value: GOLDEN.glow },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `
      uniform vec3 uZenith,uHorizon,uSunDir,uSunColor; uniform float uStars,uGlow; varying vec3 vDir;
      float h3(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
      void main(){
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 c = mix(uHorizon, uZenith, pow(smoothstep(-0.02, 0.65, y), 0.75));
        float s = max(dot(d, normalize(uSunDir)), 0.0);
        c += uSunColor * (pow(s, 900.0) * 4.0 + pow(s, 10.0) * 0.28 * uGlow);
        if (uStars > 0.0) { vec3 q = floor(d * 260.0); float st = step(0.9975, h3(q)); c += vec3(st) * uStars * smoothstep(0.02, 0.25, y) * (0.6 + 0.4*h3(q+1.0)); }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = add(new THREE.Mesh(new THREE.SphereGeometry(2000, 32, 16), skyMat));
  sky.frustumCulled = false;
  sky.renderOrder = -10;

  // --- eau -----------------------------------------------------------------------
  heightTex.colorSpace = THREE.NoColorSpace;
  heightTex.wrapS = heightTex.wrapT = THREE.ClampToEdgeWrapping;
  const reflScale = mobile ? 0.35 : 0.5;
  const water = add(
    new Reflector(new THREE.PlaneGeometry(6000, 6000), {
      shader: WATER_SHADER,
      clipBias: 0.003,
      textureWidth: innerWidth * renderer.getPixelRatio() * reflScale,
      textureHeight: innerHeight * renderer.getPixelRatio() * reflScale,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  const waterMat = water.material as THREE.ShaderMaterial;
  waterMat.transparent = true;
  water.renderOrder = 1;
  const WU = waterMat.uniforms as typeof WATER_SHADER.uniforms;
  WU.uHeight.value = heightTex;
  WU.uExtent.value = meta.extent;
  WU.uHmin.value = meta.heightMin;
  WU.uHrange.value = meta.heightRange;
  WU.uSunDir.value.copy(GOLDEN.sunDir);
  WU.uSunColor.value.copy(GOLDEN.sun).multiplyScalar(GOLDEN.sunI / 2.6);
  WU.uDeep.value.copy(GOLDEN.deep);
  WU.uShallow.value.copy(GOLDEN.shallow);
  WU.uFogColor.value.copy(GOLDEN.horizon);
  WU.uFogDensity.value = GOLDEN.fog;
  WU.uNight.value = GOLDEN.stars;

  // --- l'île -----------------------------------------------------------------------
  add(island);
  const glowMats = new Set<THREE.MeshStandardMaterial>();
  island.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const m = o.material as THREE.MeshStandardMaterial;
    m.flatShading = true;
    m.needsUpdate = true;
    if (m.emissive && m.emissive.getHex() !== 0) {
      m.userData.baseEmissive = Math.min(m.emissiveIntensity, 1.2);
      glowMats.add(m);
      m.emissiveIntensity = m.userData.baseEmissive * GOLDEN.emissive;
    } else {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  const named = (n: string): THREE.Object3D | undefined => island.getObjectByName(n);

  const occluders: THREE.Object3D[] = [];
  named('Island_Base_mesh')?.traverse((o) => {
    if (o instanceof THREE.Mesh) occluders.push(o);
  });

  // rivière qui coule
  const riverMat = new THREE.ShaderMaterial({
    vertexColors: true,
    transparent: true,
    fog: false,
    uniforms: { uTime: { value: 0 }, uFogColor: WU.uFogColor, uFogDensity: WU.uFogDensity, uNight: WU.uNight },
    vertexShader: `varying vec2 vUv; varying vec3 vCol; varying vec3 vWorld;
      void main(){ vUv = uv; vCol = color; vec4 w = modelMatrix*vec4(position,1.); vWorld = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float uTime, uFogDensity, uNight; uniform vec3 uFogColor; varying vec2 vUv; varying vec3 vCol; varying vec3 vWorld;
      ${NOISE}
      void main(){
        float f = vnoise(vec2(vUv.x*3.0, vUv.y*6.0 - uTime*2.2)) * vnoise(vec2(vUv.x*7.0+3.0, vUv.y*14.0 - uTime*3.1));
        float edge = smoothstep(0.32, 0.0, min(vUv.x, 1.0 - vUv.x));
        vec3 c = vCol * mix(1.0, 0.45, uNight) + smoothstep(0.25, 0.55, f + edge*0.4) * 0.55 * mix(1.0, 0.5, uNight);
        float dist = length(cameraPosition - vWorld);
        c = mix(c, uFogColor, 1.0 - exp(-uFogDensity*uFogDensity*dist*dist));
        gl_FragColor = vec4(c, 0.88);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  named('River')?.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.material = riverMat;
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });

  // --- lieux : pastilles, verrouillage, brume -------------------------------------
  const soft = softTexture();
  const lockedCache = new Map<THREE.Material, THREE.Material>();
  const lockedVariant = (m: THREE.Material): THREE.Material => {
    const cached = lockedCache.get(m);
    if (cached) return cached;
    const lm = m.clone() as THREE.MeshStandardMaterial;
    lm.emissiveIntensity = 0;
    lm.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb = mix(vec3(lum) * vec3(0.88, 0.9, 0.97), vec3(0.55, 0.57, 0.63), 0.4);`,
      );
    };
    lm.customProgramCacheKey = () => 'locked';
    lockedCache.set(m, lm);
    return lm;
  };

  const overlay = document.createElement('div');
  overlay.className = 'map-pins';
  document.body.appendChild(overlay);

  const portrait = (): number => THREE.MathUtils.clamp(0.75 / camera.aspect, 1, 1.9);
  const worldOf = (name: string, fallback: Vec3): THREE.Vector3 => {
    const o = named(name);
    return o ? o.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(...fallback);
  };

  let flight: { p0: THREE.Vector3; t0: THREE.Vector3; p1: THREE.Vector3; t1: THREE.Vector3; t: number; dur: number; then?: () => void } | null = null;
  const path = meta.path.map((p) => new THREE.Vector3(...p));
  const walker = { f: 0, target: 0 };
  let selected: MapLocation | null = null;
  const warmLights: { light: THREE.PointLight; halo: THREE.Sprite }[] = [];

  const locations: MapLocation[] = [];
  for (const L of meta.locations) {
    const info = LOCATION_IDS[L.id];
    if (!info) continue;
    const locked = !unlockedLocations.has(info.key);
    const meshes: THREE.Mesh[] = [];
    named(L.node)?.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.userData.origMat = o.material;
        meshes.push(o);
        if (locked) o.material = lockedVariant(o.material as THREE.Material);
      }
    });

    const camTarget = worldOf(`CAMT_${L.id}`, L.camTarget);
    // lumière ambrée des fenêtres / lanternes du lieu, contre la mer indigo
    const warm = add(new THREE.PointLight(AMBER, 0, 28, 1.6));
    warm.position.copy(camTarget).add(new THREE.Vector3(0, 3, 0));
    const halo = add(
      new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, color: AMBER, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })),
    );
    warmLights.push({ light: warm, halo });
    halo.position.copy(warm.position);
    halo.scale.setScalar(12);
    const fog = add(new THREE.Group());
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: soft, color: 0xc9cdd6, transparent: true, opacity: locked ? 0.55 : 0, depthWrite: false, fog: true }),
      );
      const a = (i / 9) * Math.PI * 2;
      const r = 4 + Math.random() * 7;
      s.position.set(Math.cos(a) * r, 2 + Math.random() * 5, Math.sin(a) * r);
      s.scale.setScalar(10 + Math.random() * 8);
      s.userData.phase = Math.random() * 6.28;
      fog.add(s);
    }
    fog.position.copy(camTarget).add(new THREE.Vector3(0, -2, 0));
    fog.visible = locked;

    const el = document.createElement('button');
    el.className = `map-pin${locked ? ' map-pin--locked' : ''}`;
    if (!locked) el.style.setProperty('--c', LOC_COLORS[L.id - 1] ?? '#e0703c');
    el.innerHTML = locked
      ? `<span class="map-pin__badge"><span class="map-pin__num">🔒</span><span class="map-pin__name">${info.name}<small>Coming soon</small></span></span><span class="map-pin__stem"></span><span class="map-pin__dot"></span>`
      : `<span class="map-pin__badge"><span class="map-pin__num">${L.id}</span><span class="map-pin__name" data-name>${info.name}</span></span><span class="map-pin__stem"></span><span class="map-pin__dot"></span>`;
    el.disabled = locked;
    el.setAttribute('aria-label', info.name);
    overlay.appendChild(el);

    const loc: MapLocation = {
      id: L.id,
      key: info.key,
      locked,
      pin: worldOf(`PIN_${L.id}`, L.pin),
      camTarget,
      camPos: worldOf(`CAMP_${L.id}`, L.camPos),
      pathIndex: L.pathIndex,
      meshes,
      fog,
      el,
    };
    if (!locked) {
      // 1er tap : la caméra vole vers le lieu et la pastille devient « Enter ».
      // 2e tap (sur « Enter ») : on entre dans le lieu.
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (selected === loc && !flight) {
          onEnter(loc.key);
          return;
        }
        select(null);
        goTo(loc, () => select(loc));
      });
    }
    locations.push(loc);
  }
  function select(loc: MapLocation | null): void {
    if (selected) {
      selected.el.classList.remove('map-pin--selected');
      const n = selected.el.querySelector('[data-name]');
      if (n) n.textContent = LOCATION_IDS[selected.id]?.name ?? '';
    }
    selected = loc;
    if (loc) {
      loc.el.classList.add('map-pin--selected');
      const n = loc.el.querySelector('[data-name]');
      if (n) n.textContent = 'Enter ▸';
    }
  }
  const first = locations[0];
  walker.f = walker.target = first ? first.pathIndex : 0;

  // --- objets animés de l'île --------------------------------------------------------
  const bobbers: { o: THREE.Object3D; y: number; q: THREE.Quaternion; ph: number; amp: number; roll: number }[] = [];
  for (const n of ['PirateShip', 'Rowboat', 'Buoy_1', 'Buoy_2', 'Buoy_3', 'Buoy_4', 'Buoy_5', 'Buoy_6']) {
    const o = named(n);
    if (o) {
      const ship = n === 'PirateShip';
      bobbers.push({ o, y: o.position.y, q: o.quaternion.clone(), ph: Math.random() * 6.28, amp: ship ? 0.16 : 0.12, roll: ship ? 0.035 : 0.09 });
    }
  }
  const wheel = named('FerrisWheel');
  const carousel = named('Carousel');
  const dolphin = named('Dolphin');
  const whale = named('WhaleTail');
  if (dolphin) dolphin.visible = false;
  if (whale) whale.visible = false;

  // fumée de la cheminée du Chalet
  const smoke: THREE.Sprite[] = [];
  const smokeAnchor = named('SMOKE_3');
  if (smokeAnchor) {
    const base = smokeAnchor.getWorldPosition(new THREE.Vector3());
    for (let i = 0; i < 16; i++) {
      const s = add(new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, color: 0xf2f0ee, transparent: true, depthWrite: false })));
      s.userData = { t: i / 16, base };
      smoke.push(s);
    }
  }

  // faisceau du phare
  const beam = add(new THREE.Group());
  const beamMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    color: 0xfff0b8,
    transparent: true,
    opacity: GOLDEN.beam,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  const lamp = named('LIGHTHOUSE_LAMP');
  if (lamp) {
    lamp.getWorldPosition(beam.position);
    for (const s of [1, -1]) {
      const g = new THREE.ConeGeometry(7, 90, 20, 6, true);
      g.translate(0, -45, 0);
      const pa = g.attributes.position!;
      const col: number[] = [];
      for (let k = 0; k < pa.count; k++) {
        const f = Math.pow(Math.max(0, 1 + pa.getY(k) / 90), 1.6);
        col.push(f, f, f);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.rotateZ((s * Math.PI) / 2);
      beam.add(new THREE.Mesh(g, beamMat));
    }
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: soft, color: 0xffe7a0, transparent: true, opacity: 0.3 + GOLDEN.beam * 1.6, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    glow.scale.setScalar(9);
    beam.add(glow);
    beam.userData.glow = glow;
  }

  // mouettes et chauves-souris
  const birds: THREE.Group[] = [];
  for (let i = 0; i < (mobile ? 5 : 9); i++) {
    const b = add(makeBird(0xf7f7f2, 1.2));
    b.userData = {
      r: 25 + Math.random() * 40, h: 22 + Math.random() * 16, sp: 0.12 + Math.random() * 0.1, ph: Math.random() * 6.28,
      cx: (Math.random() - 0.5) * 30, cz: (Math.random() - 0.5) * 30, flap: 5 + Math.random() * 2,
    };
    birds.push(b);
  }
  const batAnchor = named('BATS_6');
  if (batAnchor) {
    const bp = batAnchor.getWorldPosition(new THREE.Vector3());
    for (let i = 0; i < 8; i++) {
      const b = add(makeBird(0x2a2033, 0.45));
      b.userData = {
        r: 4 + Math.random() * 6, h: bp.y + (Math.random() - 0.5) * 4, sp: 0.6 + Math.random() * 0.5, ph: Math.random() * 6.28,
        cx: bp.x, cz: bp.z, flap: 14 + Math.random() * 5,
      };
      birds.push(b);
    }
  }

  // nuages
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.55, flatShading: true, transparent: true, opacity: 0.9, fog: true });
  cloudMat.color.setRGB(1, 1, 1).lerp(GOLDEN.horizon, 0.3);
  cloudMat.emissive.copy(GOLDEN.horizon).lerp(new THREE.Color(1, 1, 1), 0.5);
  cloudMat.emissiveIntensity = 0.55 * (1 - 0.75 * GOLDEN.stars);
  const clouds: THREE.Group[] = [];
  for (let i = 0; i < (mobile ? 8 : 14); i++) {
    const c = add(new THREE.Group());
    const n = 4 + Math.floor(Math.random() * 4);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), cloudMat);
      m.position.set((k - n / 2) * 4 + Math.random() * 2, Math.random() * 2, (Math.random() - 0.5) * 5);
      m.scale.set(4 + Math.random() * 3, 2.4 + Math.random() * 1.5, 3.5 + Math.random() * 2);
      c.add(m);
    }
    c.position.set((Math.random() - 0.5) * 600, 60 + Math.random() * 35, (Math.random() - 0.5) * 600);
    c.userData.sp = 1.5 + Math.random() * 2;
    clouds.push(c);
  }

  // éclaboussures (dauphin, baleine)
  const splashes: { m: THREE.Mesh; t: number }[] = [];
  const splash = (p: THREE.Vector3): void => {
    const m = add(new THREE.Mesh(new THREE.RingGeometry(0.4, 1.0, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false })));
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, 0.08, p.z);
    splashes.push({ m, t: 0 });
  };
  const rndSeaPoint = (rmin: number, rmax: number): THREE.Vector3 => {
    const a = Math.random() * Math.PI * 2;
    const r = rmin + Math.random() * (rmax - rmin);
    return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
  };

  // la goutte qui marche sur le chemin
  const marker = add(new THREE.Group());
  {
    const mat = new THREE.MeshStandardMaterial({ color: 0x4fb8f0, emissive: 0x1a6aa8, emissiveIntensity: 0.6, roughness: 0.25, flatShading: true });
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1), mat);
    s.position.y = 0.75;
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.1, 10), mat);
    c.position.y = 1.65;
    s.castShadow = c.castShadow = true;
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.8, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.06;
    marker.add(s, c, sh);
  }
  if (path[walker.f]) marker.position.copy(path[walker.f]!);

  // --- caméra ------------------------------------------------------------------------
  const OVERVIEW = { pos: new THREE.Vector3(-30, 120, 165), target: new THREE.Vector3(0, 2, 0) };
  const overviewPos = (): THREE.Vector3 =>
    OVERVIEW.target.clone().add(OVERVIEW.pos.clone().sub(OVERVIEW.target).multiplyScalar(portrait()));
  camera.position.copy(overviewPos());
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(OVERVIEW.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 10;
  controls.maxDistance = 340;
  controls.maxPolarAngle = 1.36;
  controls.screenSpacePanning = false;
  controls.update();

  function goTo(loc: MapLocation, then?: () => void): void {
    const p = loc.camTarget.clone().add(loc.camPos.clone().sub(loc.camTarget).multiplyScalar(Math.min(portrait(), 1.5)));
    flight = { p0: camera.position.clone(), t0: controls.target.clone(), p1: p, t1: loc.camTarget.clone(), t: 0, dur: 1.8, ...(then ? { then } : {}) };
    walker.target = loc.pathIndex;
  }

  // --- jour / nuit ---------------------------------------------------------------------
  const cur: Preset = {
    ...DAY,
    sunDir: DAY.sunDir.clone(), sun: DAY.sun.clone(), hemiSky: DAY.hemiSky.clone(), hemiGround: DAY.hemiGround.clone(),
    zenith: DAY.zenith.clone(), horizon: DAY.horizon.clone(), deep: DAY.deep.clone(), shallow: DAY.shallow.clone(),
  };
  const mix = (a: Preset, b: Preset, k: number): void => {
    const n = (x: number, y: number): number => x + (y - x) * k;
    cur.sunDir.lerpVectors(a.sunDir, b.sunDir, k).normalize();
    for (const c of ['sun', 'hemiSky', 'hemiGround', 'zenith', 'horizon', 'deep', 'shallow'] as const) cur[c].lerpColors(a[c], b[c], k);
    for (const f of ['sunI', 'hemiI', 'fog', 'emissive', 'beam', 'glow', 'stars'] as const) cur[f] = n(a[f], b[f]);
  };
  const fogExp = scene.fog as THREE.FogExp2;
  function applyPreset(p: Preset): void {
    sun.color.copy(p.sun);
    sun.intensity = p.sunI;
    sun.position.copy(p.sunDir).multiplyScalar(180);
    hemi.color.copy(p.hemiSky);
    hemi.groundColor.copy(p.hemiGround);
    hemi.intensity = p.hemiI;
    const su = skyMat.uniforms;
    su.uZenith!.value.copy(p.zenith);
    su.uHorizon!.value.copy(p.horizon);
    su.uSunDir!.value.copy(p.sunDir);
    su.uSunColor!.value.copy(p.sun);
    su.uStars!.value = p.stars;
    su.uGlow!.value = p.glow;
    fogExp.color.copy(p.horizon);
    fogExp.density = p.fog;
    WU.uSunDir.value.copy(p.sunDir);
    WU.uSunColor.value.copy(p.sun).multiplyScalar(p.sunI / 2.6);
    WU.uDeep.value.copy(p.deep);
    WU.uShallow.value.copy(p.shallow);
    WU.uFogColor.value.copy(p.horizon);
    WU.uFogDensity.value = p.fog;
    WU.uNight.value = p.stars;
    for (const m of glowMats) m.emissiveIntensity = (m.userData.baseEmissive as number) * p.emissive;
    beamMat.opacity = p.beam;
    const bg = beam.userData.glow as THREE.Sprite | undefined;
    if (bg) bg.material.opacity = 0.3 + p.beam * 1.6;
    cloudMat.color.setRGB(1, 1, 1).lerp(p.horizon, 0.3);
    cloudMat.emissive.copy(p.horizon).lerp(new THREE.Color(1, 1, 1), 0.5);
    cloudMat.emissiveIntensity = 0.55 * (1 - 0.75 * p.stars);
    for (const w of warmLights) {
      w.light.intensity = (mobile ? 35 : 50) * p.stars;
      w.halo.material.opacity = 0.35 * p.stars;
    }
  }
  // Le choix Jour/Nuit est retenu (préférence locale du joueur, facultative).
  let night = false;
  try {
    night = localStorage.getItem('aguamesa.mapNight') === '1';
  } catch {
    /* stockage bloqué : on reste en Jour */
  }
  if (night) mix(DAY, NIGHT, 1);
  applyPreset(cur);
  let tod: { from: Preset; to: Preset; t: number } | null = null;
  const todBtn = document.createElement('button');
  todBtn.className = 'tod-toggle';
  const renderTod = (): void => {
    todBtn.innerHTML = `<span class="tod-toggle__icon">${night ? '🌙' : '☀️'}</span><span>${night ? 'Night' : 'Day'}</span>`;
    todBtn.setAttribute('aria-label', night ? 'Switch to day' : 'Switch to night');
    todBtn.setAttribute('aria-pressed', String(night));
  };
  renderTod();
  todBtn.addEventListener('click', () => {
    night = !night;
    renderTod();
    try {
      localStorage.setItem('aguamesa.mapNight', night ? '1' : '0');
    } catch {
      /* rien : la préférence ne sera simplement pas retenue */
    }
    const snap: Preset = {
      ...cur,
      sunDir: cur.sunDir.clone(), sun: cur.sun.clone(), hemiSky: cur.hemiSky.clone(), hemiGround: cur.hemiGround.clone(),
      zenith: cur.zenith.clone(), horizon: cur.horizon.clone(), deep: cur.deep.clone(), shallow: cur.shallow.clone(),
    };
    tod = { from: snap, to: night ? NIGHT : DAY, t: 0 };
  });
  document.body.appendChild(todBtn);

  // --- boucle -------------------------------------------------------------------------
  const tmp = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  let time = 0;
  let frameNo = 0;
  let dolphinState: { t: number; next: number; p?: THREE.Vector3; dir?: THREE.Vector3 } = { t: -1, next: 3 };
  let whaleState: { t: number; next: number; p?: THREE.Vector3 } = { t: -1, next: 8 };

  const stopTick = game.onTick((rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    time += dt;
    const t = time;

    if (tod) {
      tod.t = Math.min(1, tod.t + dt / 1.6);
      mix(tod.from, tod.to, easeInOut(tod.t));
      applyPreset(cur);
      if (tod.t >= 1) tod = null;
    }
    WU.uTime.value = t;
    riverMat.uniforms.uTime!.value = t;
    for (const b of bobbers) {
      b.o.position.y = b.y + Math.sin(t * 1.1 + b.ph) * b.amp;
      b.o.quaternion.copy(b.q).multiply(
        new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(t * 0.8 + b.ph) * b.roll * 0.6, 0, Math.sin(t * 1.25 + b.ph) * b.roll)),
      );
    }
    wheel?.rotateZ(-dt * 0.22);
    carousel?.rotateY(dt * 0.6);
    beam.rotation.y = t * 0.7;

    for (const s of smoke) {
      const u = (s.userData.t + t * 0.09) % 1;
      s.position.copy(s.userData.base).add(tmp.set(Math.sin(u * 6 + s.userData.t * 9) * 0.5 + u * 2.5, u * 9, u * 1.2));
      s.scale.setScalar(0.8 + u * 3.5);
      s.material.opacity = Math.sin(Math.PI * u) * 0.55;
    }
    for (const g of birds) {
      const d = g.userData;
      const a = t * d.sp + d.ph;
      g.position.set(d.cx + Math.cos(a) * d.r, d.h + Math.sin(t * 0.7 + d.ph) * 1.5, d.cz + Math.sin(a) * d.r);
      g.rotation.y = -a;
      for (const w of g.children) if (w.userData.s) w.rotation.z = w.userData.s * Math.sin(t * d.flap + d.ph) * 0.55;
    }
    for (const c of clouds) {
      c.position.x += c.userData.sp * dt;
      if (c.position.x > 320) c.position.x = -320;
    }
    for (const L of locations) {
      if (!L.locked) continue;
      for (const s of L.fog.children) s.position.y += Math.sin(t * 0.4 + s.userData.phase) * 0.01;
    }

    if (dolphin) {
      if (dolphinState.t < 0 && t > dolphinState.next) {
        const p = rndSeaPoint(72, 110);
        dolphinState = { t: 0, next: 0, p, dir: new THREE.Vector3(-p.z, 0, p.x).normalize() };
        dolphin.visible = true;
        splash(p);
      }
      if (dolphinState.t >= 0 && dolphinState.p && dolphinState.dir) {
        dolphinState.t += dt / 1.5;
        const u = dolphinState.t;
        const pos = dolphinState.p.clone().addScaledVector(dolphinState.dir, u * 11);
        pos.y = -1.2 + Math.sin(Math.PI * u) * 4.2;
        const vel = dolphinState.dir.clone().multiplyScalar(11);
        vel.y = Math.cos(Math.PI * u) * 4.2 * Math.PI;
        dolphin.position.copy(pos);
        dolphin.lookAt(pos.clone().sub(vel));
        if (u >= 1) {
          splash(pos);
          dolphin.visible = false;
          dolphinState = { t: -1, next: t + 5 + Math.random() * 6 };
        }
      }
    }
    if (whale) {
      if (whaleState.t < 0 && t > whaleState.next) {
        whaleState = { t: 0, next: 0, p: rndSeaPoint(95, 150) };
        whale.visible = true;
        whale.rotation.y = Math.random() * 6.28;
        splash(whaleState.p!);
      }
      if (whaleState.t >= 0 && whaleState.p) {
        whaleState.t += dt / 5;
        const u = whaleState.t;
        whale.position.set(whaleState.p.x, -4.2 + Math.sin(Math.PI * u) * 4.6, whaleState.p.z);
        whale.rotation.x = (u - 0.5) * 0.7;
        if (u >= 1) {
          whale.visible = false;
          splash(whaleState.p);
          whaleState = { t: -1, next: t + 12 + Math.random() * 10 };
        }
      }
    }
    for (let i = splashes.length - 1; i >= 0; i--) {
      const s = splashes[i]!;
      s.t += dt;
      s.m.scale.setScalar(1 + s.t * 4);
      (s.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - s.t * 0.7);
      if (s.t > 1.3) {
        scene.remove(s.m);
        s.m.geometry.dispose();
        splashes.splice(i, 1);
      }
    }

    // la goutte marche vers le lieu choisi
    if (path.length > 1) {
      if (Math.abs(walker.target - walker.f) > 0.01) {
        const dir = Math.sign(walker.target - walker.f);
        walker.f += (dir * dt * 9) / 2.4;
        if (Math.sign(walker.target - walker.f) !== dir) walker.f = walker.target;
      }
      const i0 = Math.floor(walker.f);
      const i1 = Math.min(i0 + 1, path.length - 1);
      const a = path[i0];
      const b = path[i1];
      if (a && b) {
        marker.position.lerpVectors(a, b, walker.f - i0);
        marker.position.y = Math.max(marker.position.y, 0.1);
        const moving = Math.abs(walker.target - walker.f) > 0.01;
        const body = marker.children[0]!;
        body.position.y = 0.75 + (moving ? Math.abs(Math.sin(t * 10)) * 0.5 : Math.sin(t * 2) * 0.12);
        marker.children[1]!.position.y = body.position.y + 0.9;
        if (moving) {
          tmp.subVectors(b, a);
          marker.rotation.y = Math.atan2(tmp.x, tmp.z);
        }
      }
    }

    // vol de la caméra vers un lieu
    if (flight) {
      flight.t += dt / flight.dur;
      const u = easeInOut(Math.min(flight.t, 1));
      camera.position.lerpVectors(flight.p0, flight.p1, u);
      camera.position.y += Math.sin(Math.PI * u) * 18;
      controls.target.lerpVectors(flight.t0, flight.t1, u);
      if (flight.t >= 1) {
        const then = flight.then;
        flight = null;
        then?.();
      }
    }
    controls.enabled = !flight;
    controls.update();
    if (camera.position.y < 3) camera.position.y = 3;
    controls.target.y = Math.max(controls.target.y, 0);
    const tl = Math.hypot(controls.target.x, controls.target.z);
    if (tl > 220) {
      controls.target.x *= 220 / tl;
      controls.target.z *= 220 / tl;
    }
    sky.position.copy(camera.position);
    camera.updateMatrixWorld();

    // pastilles : projetées à l'écran, à moitié transparentes si l'île les cache
    const rect = renderer.domElement.getBoundingClientRect();
    frameNo++;
    if (frameNo % 30 === 1) for (const L of locations) L.size = { w: L.el.offsetWidth, h: L.el.querySelector('.map-pin__badge')?.clientHeight ?? 36 };
    const placed: { x: number; top: number; w: number; h: number }[] = [];
    const screen: { L: MapLocation; x: number; y: number }[] = [];
    for (const L of locations) {
      if (frameNo % 12 === 0 && occluders.length) {
        const d = tmp.copy(L.pin).sub(camera.position);
        const len = d.length();
        ray.set(camera.position, d.normalize());
        ray.far = len - 2;
        L.el.style.opacity = ray.intersectObjects(occluders, false).length > 0 ? '0.35' : '1';
      }
      tmp.copy(L.pin);
      tmp.y += Math.sin(t * 2 + L.id) * 0.35;
      tmp.project(camera);
      const behind = tmp.z > 1;
      L.el.style.display = behind ? 'none' : 'flex';
      if (!behind) {
        screen.push({ L, x: rect.left + (tmp.x * 0.5 + 0.5) * rect.width, y: rect.top + (-tmp.y * 0.5 + 0.5) * rect.height });
      }
    }
    // Pas de chevauchement : en partant du bas de l'écran, une pastille qui touche une
    // autre déjà placée monte, sa tige s'allonge (lissé pour ne pas trembler).
    screen.sort((a, b) => b.y - a.y);
    for (const s of screen) {
      const { w, h } = s.L.size ?? { w: 120, h: 36 };
      const base = s.y - 25; // bas de la pastille avec la tige normale (16 px + point 9 px)
      let top = base - h;
      for (let moved = true, n = 0; moved && n < 8; n++) {
        moved = false;
        for (const p of placed) {
          if (Math.abs(p.x - s.x) < (p.w + w) / 2 + 4 && top < p.top + p.h + 4 && top + h > p.top - 4) {
            top = p.top - h - 6;
            moved = true;
          }
        }
      }
      placed.push({ x: s.x, top, w, h });
      const want = base - h - top;
      s.L.lift = (s.L.lift ?? 0) + (want - (s.L.lift ?? 0)) * Math.min(1, dt * 12);
      const stem = s.L.el.querySelector<HTMLElement>('.map-pin__stem');
      if (stem) stem.style.height = `${16 + s.L.lift}px`;
      s.L.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
    }
  });

  function dispose(): void {
    stopTick();
    controls.dispose();
    overlay.remove();
    todBtn.remove();
    for (const o of added) scene.remove(o);
    for (const s of splashes) scene.remove(s.m);
    water.dispose();
    for (const L of locations) for (const m of L.meshes) m.material = m.userData.origMat as THREE.Material;
    for (const o of hidden) o.visible = true;
    renderer.toneMapping = saved.toneMapping;
    renderer.toneMappingExposure = saved.exposure;
    renderer.shadowMap.enabled = saved.shadows;
    renderer.shadowMap.type = saved.shadowType;
    scene.fog = saved.fog;
    scene.background = saved.background;
    scene.environment = saved.environment;
    camera.fov = saved.fov;
    camera.near = saved.near;
    camera.far = saved.far;
    camera.updateProjectionMatrix();
  }

  return { island, dispose };
}
