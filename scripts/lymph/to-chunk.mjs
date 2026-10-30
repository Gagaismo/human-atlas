// Packs the Z-Anatomy lymphatic structures (public/models/descriptive/lymph.glb.gz, already in the atlas
// frame) into an extra atlas chunk: lymph-chunk.bin(.gz) and lymph-parts.json, merged by app/page.tsx with
// appendParts so they are selectable and searchable. Paired structures get their side from the geometry.
// Usage: node scripts/lymph/to-chunk.mjs   (after npm run build:descriptive)
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {readMeshes} from '../female/glb.mjs';
import {writeChunk} from '../lib/pack-chunk.mjs';
import {sideOf,sidedNames} from './sides.mjs';

const dir=new URL('../../public/models/descriptive/',import.meta.url);
const data=JSON.parse(readFileSync(new URL('landmarks.json',dir),'utf8'));
const meshes=new Map(readMeshes(gunzipSync(readFileSync(new URL('lymph.glb.gz',dir)))).map(m=>[m.name,m]));
// Z-Anatomy ships lymph nodes, tonsils, thymus and spleen but no lymphatic vessels; the spleen and thymus
// are already BodyParts3D parts, so they are skipped.
const atlas=JSON.parse(readFileSync(new URL('../atlas.json',dir),'utf8'));
const base=name=>name.toLowerCase().replace(/\b(left|right)\b ?/g,'').trim();
const existing=new Set(atlas.parts.filter(p=>p.system==='lymphatic').map(p=>base(p.name)));
const entries=data.lymph.filter(entry=>!existing.has(base(entry.name)));
// A name used twice is a left/right pair even when both lie close to the midline (e.g. thyroid nodes).
const uses=new Map();for(const e of entries)uses.set(e.name,(uses.get(e.name)??0)+1);
const sideFor=entry=>{const side=sideOf(entry.bounds);if(side!=='midline'||uses.get(entry.name)<2)return side;return (entry.bounds[0][0]+entry.bounds[1][0])/2>0?'left':'right';};
const packed=writeChunk(entries.map((entry,i)=>{
 const mesh=meshes.get(entry.node);
 if(!mesh)throw new Error(`lymph.glb has no node ${entry.node}`);
 const [name,nameEs]=sidedNames(entry.name,entry.nameEs,sideFor(entry));
 return {part:{id:`ZA-lymph-${String(i+1).padStart(3,'0')}`,name,nameEs,system:'lymphatic'},positions:Float32Array.from(mesh.positions),indices:Uint32Array.from(mesh.indices)};
}),dir,'lymph-chunk.bin','descriptive');
writeFileSync(new URL('lymph-parts.json',dir),JSON.stringify({source:data.source,license:data.license,...packed})+'\n');
console.log(`lymph chunk: ${packed.parts.length} parts, ${packed.chunk.bytes} bytes (${packed.chunk.gzipBytes} gz)`);
