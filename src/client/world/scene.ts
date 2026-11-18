// P2 (Nassime) : caméra, lumières, rendu, chargement des .glb.
// Réutilisé par map.ts et location.ts, qui ajusteront la caméra et le décor
// propres à chaque lieu. Contrat : 00-projet-et-contrat.md §6.3.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'meshoptimizer';

const MAX_PIXEL_RATIO = 2;

export interface GameScene {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  loadGLB(url: string): Promise<THREE.Group>;
  start(onFrame?: (deltaSeconds: number) => void): void;
  dispose(): void;
}

export function createScene(canvas: HTMLCanvasElement): GameScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14101c); // nuit chaude de café, par défaut

  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100);
  camera.position.set(0, 0.22, 0.42);
  camera.lookAt(0, 0.1, 0);

  addWarmEveningLighting(scene);

  // Reflet faux et bon marché pour le verre transparent (pitfall §"verre transparent" :
  // jamais `transmission`, trop lourd sur mobile — un environnement pré-calculé suffit).
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  function resize(): void {
    const { clientWidth, clientHeight } = canvas;
    if (clientWidth === 0 || clientHeight === 0) return;
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(clientWidth, clientHeight, false);
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();

  function loadGLB(url: string): Promise<THREE.Group> {
    return new Promise((resolve, reject) => {
      loader.load(url, (gltf) => resolve(gltf.scene), undefined, reject);
    });
  }

  let frameHandle = 0;
  let lastTime = performance.now();

  function start(onFrame?: (deltaSeconds: number) => void): void {
    function tick(now: number): void {
      const deltaSeconds = (now - lastTime) / 1000;
      lastTime = now;
      onFrame?.(deltaSeconds);
      renderer.render(scene, camera);
      frameHandle = requestAnimationFrame(tick);
    }
    frameHandle = requestAnimationFrame(tick);
  }

  function dispose(): void {
    cancelAnimationFrame(frameHandle);
    resizeObserver.disconnect();
    renderer.dispose();
  }

  return { scene, camera, renderer, loadGLB, start, dispose };
}

function addWarmEveningLighting(scene: THREE.Scene): void {
  // Ciel nocturne frais en haut, rebond chaud du bois/comptoir en bas.
  scene.add(new THREE.HemisphereLight(0x6b5a7a, 0x2a1d14, 0.6));

  // La lampe du café : chaude, proche, douce.
  const lamp = new THREE.PointLight(0xffb066, 6, 10, 2);
  lamp.position.set(0.3, 0.6, 0.4);
  scene.add(lamp);

  // Un léger contre-jour pour détacher le verre du fond.
  const rim = new THREE.DirectionalLight(0xffd9a0, 0.4);
  rim.position.set(-0.5, 0.8, -0.3);
  scene.add(rim);
}
