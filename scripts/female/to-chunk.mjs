// Packs the female variant (female.glb.gz + female.json, already in the atlas frame) into an extra atlas
// geometry chunk, in the same layout as public/models/body-*.bin: per part, float32 positions, normalized
// int16 normals and uint32 indices, 4-byte aligned. Writes female-chunk.bin(.gz) and female-parts.json.
// Usage: node scripts/female/to-chunk.mjs
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
import {bounds,readMeshes} from './glb.mjs';

const dir=new URL('../../public/models/female/',import.meta.url);
const source=JSON.parse(readFileSync(new URL('female.json',dir),'utf8'));
const meshes=readMeshes(gunzipSync(readFileSync(new URL('female.glb.gz',dir))));

function vertexNormals(positions,indices){
 const n=new Float64Array(positions.length);
 for(let t=0;t<indices.length;t+=3){
  const [a,b,c]=[indices[t]*3,indices[t+1]*3,indices[t+2]*3];
  const u=[0,1,2].map(k=>positions[b+k]-positions[a+k]),v=[0,1,2].map(k=>positions[c+k]-positions[a+k]);
  const f=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  for(const i of [a,b,c])for(let k=0;k<3;k++)n[i+k]+=f[k];
 }
 const out=new Int16Array(positions.length);
 for(let i=0;i<n.length;i+=3){const l=Math.hypot(n[i],n[i+1],n[i+2])||1;for(let k=0;k<3;k++)out[i+k]=Math.round(n[i+k]/l*32767);}
 return out;
}

const blocks=[],parts=[];let offset=0;
const push=(array)=>{const bytes=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);const at=offset;blocks.push(bytes);offset+=bytes.byteLength;const pad=(4-offset%4)%4;if(pad){blocks.push(new Uint8Array(pad));offset+=pad;}return at;};
for(const p of source.parts){
 const mesh=meshes.find(m=>m.name===p.node);
 if(!mesh)throw new Error(`female.glb has no node ${p.node}`);
 const positions=Float32Array.from(mesh.positions),indices=Uint32Array.from(mesh.indices);
 const [min,max]=bounds(positions);
 parts.push({id:p.id,name:p.name,nameEs:p.nameEs,conceptId:p.id,system:p.system,positions:push(positions),normals:push(vertexNormals(positions,indices)),indices:push(indices),vertexCount:positions.length/3,indexCount:indices.length,bounds:[min,max]});
}
const bin=Buffer.concat(blocks),gz=gzipSync(bin,{level:9});
writeFileSync(new URL('female-chunk.bin',dir),bin);writeFileSync(new URL('female-chunk.bin.gz',dir),gz);
const chunk={url:'/models/female/female-chunk.bin',bytes:bin.byteLength,gzip:'/models/female/female-chunk.bin.gz',gzipBytes:gz.byteLength};
writeFileSync(new URL('female-parts.json',dir),JSON.stringify({source:source.source,license:source.license,licenseUrl:source.licenseUrl,sourceUrl:source.sourceUrl,chunk,parts,replaces:source.replaces})+'\n');
console.log(`female chunk: ${parts.length} parts, ${bin.byteLength} bytes (${gz.byteLength} gz)`);
