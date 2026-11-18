import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const path = process.argv[2];
const doc = await io.read(path);
const anims = doc.getRoot().listAnimations().map(a => a.getName());
console.log(`${path}: animations = [${anims.join(', ')}]`);
