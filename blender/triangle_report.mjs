import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import fs from 'node:fs';
import path from 'node:path';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

const dir = path.resolve(process.argv[2]);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.glb'));

let total = 0;
const rows = [];
for (const file of files) {
  const doc = await io.read(path.join(dir, file));
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      const count = indices ? indices.getCount() : prim.getAttribute('POSITION').getCount();
      tris += Math.floor(count / 3);
    }
  }
  const size = fs.statSync(path.join(dir, file)).size;
  rows.push({ file, tris, kb: (size / 1024).toFixed(1) });
  total += tris;
}

rows.sort((a, b) => b.tris - a.tris);
for (const r of rows) console.log(`${r.file.padEnd(28)} ${String(r.tris).padStart(6)} tris   ${r.kb} Ko`);
console.log(`\nTOTAL (tous fichiers)        ${total} tris`);
