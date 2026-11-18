import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const path = process.argv[2];
const doc = await io.read(path);
const names = doc.getRoot().listNodes().map(n => {
  const t = n.getTranslation();
  return `${n.getName()} @ (${t.map(v => v.toFixed(4)).join(', ')})`;
});
console.log(`nodes in ${path}:`);
for (const n of names) console.log(' -', n);
