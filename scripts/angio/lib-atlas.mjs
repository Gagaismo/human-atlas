// Reads BodyParts3D parts (© DBCLS, CC BY 4.0) from public/models/atlas.json and body-<chunk>.bin
// (per part: float32 positions, int16 normals, uint32 indices; atlas frame in metres).
import {readFileSync} from 'node:fs';

const root=new URL('../../public/models/',import.meta.url);
const atlas=JSON.parse(readFileSync(new URL('atlas.json',root),'utf8'));
const byId=new Map(atlas.parts.map(p=>[p.id,p]));
const chunks=new Map();

export const atlasParts=atlas.parts;
export const partInfo=id=>{const p=byId.get(id);if(!p)throw new Error(`atlas has no part ${id}`);return p;};

export function loadPart(id){
 const p=partInfo(id);
 if(!chunks.has(p.chunk)){const b=readFileSync(new URL(`body-${p.chunk}.bin`,root));chunks.set(p.chunk,b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}
 const buf=chunks.get(p.chunk);
 return {
  info:p,
  positions:new Float32Array(buf.slice(p.positions,p.positions+p.vertexCount*12)),
  indices:new Uint32Array(buf.slice(p.indices,p.indices+p.indexCount*4)),
 };
}

export const partsByName=re=>atlas.parts.filter(p=>re.test(p.name));
