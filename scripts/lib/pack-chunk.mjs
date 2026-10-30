// Packs meshes into an extra atlas geometry chunk, in the layout of public/models/body-*.bin: per part,
// float32 positions, normalized int16 normals and uint32 indices, each 4-byte aligned.
import {writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';

export function bounds(positions){
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<positions.length;i+=3)for(let c=0;c<3;c++){const v=positions[i+c];if(v<min[c])min[c]=v;if(v>max[c])max[c]=v;}
 return [min,max];
}

export function vertexNormals(positions,indices){
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

/** meshes: [{part:{id,name,nameEs,system,...}, positions:Float32Array, indices:Uint32Array}].
 * Writes <dir>/<file> and <file>.gz; returns {chunk, parts} for the app (urls under /models/<urlDir>/). */
export function writeChunk(meshes,dir,file,urlDir){
 const blocks=[],parts=[];let offset=0;
 const push=array=>{const at=offset;blocks.push(new Uint8Array(array.buffer,array.byteOffset,array.byteLength));offset+=array.byteLength;const pad=(4-offset%4)%4;if(pad){blocks.push(new Uint8Array(pad));offset+=pad;}return at;};
 for(const {part,positions,indices} of meshes){
  parts.push({...part,conceptId:part.id,positions:push(positions),normals:push(vertexNormals(positions,indices)),indices:push(indices),vertexCount:positions.length/3,indexCount:indices.length,bounds:bounds(positions)});
 }
 const bin=Buffer.concat(blocks),gz=gzipSync(bin,{level:9});
 writeFileSync(new URL(file,dir),bin);writeFileSync(new URL(`${file}.gz`,dir),gz);
 return {chunk:{url:`/models/${urlDir}/${file}`,bytes:bin.byteLength,gzip:`/models/${urlDir}/${file}.gz`,gzipBytes:gz.byteLength},parts};
}
