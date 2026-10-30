// Packs the female variant (female.glb.gz + female.json, already in the atlas frame) into an extra atlas
// geometry chunk: female-chunk.bin(.gz) and female-parts.json, read by app/female.ts.
// Usage: node scripts/female/to-chunk.mjs
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {readMeshes} from './glb.mjs';
import {writeChunk} from '../lib/pack-chunk.mjs';

const dir=new URL('../../public/models/female/',import.meta.url);
const source=JSON.parse(readFileSync(new URL('female.json',dir),'utf8'));
const meshes=readMeshes(gunzipSync(readFileSync(new URL('female.glb.gz',dir))));
const packed=writeChunk(source.parts.map(p=>{
 const mesh=meshes.find(m=>m.name===p.node);
 if(!mesh)throw new Error(`female.glb has no node ${p.node}`);
 return {part:{id:p.id,name:p.name,nameEs:p.nameEs,system:p.system},positions:Float32Array.from(mesh.positions),indices:Uint32Array.from(mesh.indices)};
}),dir,'female-chunk.bin','female');
writeFileSync(new URL('female-parts.json',dir),JSON.stringify({source:source.source,license:source.license,licenseUrl:source.licenseUrl,sourceUrl:source.sourceUrl,...packed,replaces:source.replaces})+'\n');
console.log(`female chunk: ${packed.parts.length} parts, ${packed.chunk.bytes} bytes (${packed.chunk.gzipBytes} gz)`);
