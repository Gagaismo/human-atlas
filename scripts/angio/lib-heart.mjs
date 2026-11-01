// Heart + great vessels + thoracic skeleton geometry in the isocentre frame (mm), decimated with meshoptimizer.
// heart.bin layout (little-endian), per part in heart.json order, each block 4-byte aligned:
//   positions float32 x3 (mm, isocentre frame), normals float32 x3 (unit), indices uint32.
import {writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {MeshoptSimplifier} from 'meshoptimizer';
import {loadPart,partInfo} from './lib-atlas.mjs';

const ORD=['1','2','3','4','5','6','7','8','9','10'];
const ribL=['FJ3228','FJ3229','FJ3230','FJ3231','FJ3232','FJ3233','FJ3234','FJ3235','FJ3236','FJ3225'];
const ribR=['FJ3334','FJ3336','FJ3338','FJ3340','FJ3342','FJ3344','FJ3346','FJ3347','FJ3348','FJ3330'];
const cartL=['FJ3239','FJ3242','FJ3245','FJ3248','FJ3251','FJ3254','FJ3255'];
const cartR=['FJ3333','FJ3335','FJ3337','FJ3339','FJ3341','FJ3343','FJ3345'];
const vert=['FJ3158','FJ3160','FJ3163','FJ3166','FJ3169','FJ3171','FJ3173','FJ3174','FJ3175','FJ3154','FJ3155','FJ3156'];

// [atlas id, Spanish name, group, target triangle count (0 = keep)]
export const HEART_PARTS=[
 ['FJ2428','Pared ventricular','heart',0],
 ['FJ2438','Aurícula izquierda (pared)','heart',0],
 ['FJ2439','Aurícula derecha (pared)','heart',0],
 ['FJ3413','Aorta ascendente','great-vessel',0],
 ['FJ3411','Cayado aórtico','great-vessel',0],
 ['FJ1931','Aorta descendente torácica','great-vessel',0],
 ['FJ3417','Tronco braquiocefálico','great-vessel',0],
 ['FJ3479','Arteria subclavia izquierda','great-vessel',0],
 ['FJ3579','Arteria subclavia derecha','great-vessel',0],
 ['FJ1972','Arteria torácica interna izquierda','great-vessel',0],
 ['FJ2966','Tronco pulmonar','great-vessel',0],
 ['FJ2924','Arteria pulmonar izquierda','great-vessel',0],
 ['FJ3019','Arteria pulmonar derecha','great-vessel',0],
 ['FJ3645','Vena cava superior','great-vessel',0],
 ['FJ3441','Vena cava inferior (torácica)','great-vessel',0],
 ['FJ3178','Esternón (cuerpo)','skeleton',900],
 ['FJ3290','Esternón (manubrio)','skeleton',500],
 ['FJ3153','Esternón (apéndice xifoides)','skeleton',160],
 ['FJ3237','Clavícula izquierda','skeleton',320],
 ['FJ3362','Clavícula derecha','skeleton',320],
 ...ribL.map((id,i)=>[id,`Costilla ${ORD[i]} izquierda`,'skeleton',360]),
 ...ribR.map((id,i)=>[id,`Costilla ${ORD[i]} derecha`,'skeleton',360]),
 ...cartL.map((id,i)=>[id,`Cartílago costal ${ORD[i]} izquierdo`,'skeleton',140]),
 ...cartR.map((id,i)=>[id,`Cartílago costal ${ORD[i]} derecho`,'skeleton',140]),
 ...vert.map((id,i)=>[id,`Vértebra torácica T${i+1}`,'skeleton',420]),
];

function normals(pos,idx){
 const n=new Float64Array(pos.length);
 for(let t=0;t<idx.length;t+=3){
  const a=idx[t]*3,b=idx[t+1]*3,c=idx[t+2]*3;
  const u=[pos[b]-pos[a],pos[b+1]-pos[a+1],pos[b+2]-pos[a+2]],v=[pos[c]-pos[a],pos[c+1]-pos[a+1],pos[c+2]-pos[a+2]];
  const f=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  for(const i of [a,b,c])for(let k=0;k<3;k++)n[i+k]+=f[k];
 }
 const out=new Float32Array(pos.length);
 for(let i=0;i<n.length;i+=3){const l=Math.hypot(n[i],n[i+1],n[i+2])||1;for(let k=0;k<3;k++)out[i+k]=n[i+k]/l;}
 return out;
}

/** atlas metres → isocentre-frame mm */
export const toFrame=(pos,iso)=>{const o=new Float32Array(pos.length);for(let i=0;i<pos.length;i+=3)for(let k=0;k<3;k++)o[i+k]=pos[i+k]*1000-iso[k];return o;};

async function decimate(pos,idx,targetTris){
 if(!targetTris||idx.length/3<=targetTris)return {pos,idx};
 await MeshoptSimplifier.ready;
 const [simp]=MeshoptSimplifier.simplify(idx,pos,3,targetTris*3,0.05);
 // compact vertices
 const map=new Map(),np=[],ni=new Uint32Array(simp.length);
 simp.forEach((v,i)=>{let m=map.get(v);if(m===undefined){m=np.length/3;map.set(v,m);np.push(pos[v*3],pos[v*3+1],pos[v*3+2]);}ni[i]=m;});
 return {pos:Float32Array.from(np),idx:ni};
}

/** Builds heart.json + heart.bin(.gz) in outDir (URL). iso = isocentre in atlas millimetres. opts.warp: frame-mm point → point, applied to the heart and great-vessel parts (never the skeleton). */
export async function buildHeartAsset(outDir,iso,meta,{warp=null}={}){
 const blocks=[],parts=[];let offset=0;
 const push=array=>{const at=offset;blocks.push(new Uint8Array(array.buffer,array.byteOffset,array.byteLength));offset+=array.byteLength;const pad=(4-offset%4)%4;if(pad){blocks.push(new Uint8Array(pad));offset+=pad;}return at;};
 let sourceTris=0,tris=0;
 for(const [id,name,group,target] of HEART_PARTS){
  const {positions,indices}=loadPart(id);
  sourceTris+=indices.length/3;
  let framed=toFrame(positions,iso);
  if(warp&&group!=='skeleton'){const o=new Float32Array(framed.length);for(let i=0;i<framed.length;i+=3){const q=warp([framed[i],framed[i+1],framed[i+2]]);o[i]=q[0];o[i+1]=q[1];o[i+2]=q[2];}framed=o;}
  const {pos,idx}=await decimate(framed,indices,target);
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<pos.length;i+=3)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],pos[i+k]);hi[k]=Math.max(hi[k],pos[i+k]);}
  tris+=idx.length/3;
  parts.push({id,name,group,positions:push(pos),normals:push(normals(pos,idx)),indices:push(idx),vertexCount:pos.length/3,indexCount:idx.length,bounds:[lo,hi]});
 }
 const bin=Buffer.concat(blocks),gz=gzipSync(bin,{level:9});
 writeFileSync(new URL('heart.bin',outDir),bin);writeFileSync(new URL('heart.bin.gz',outDir),gz);
 const json={
  meta:{
   ...meta,
   bytes:bin.byteLength,gzipBytes:gz.byteLength,url:'/models/angio/heart.bin',gzip:'/models/angio/heart.bin.gz',
   triangles:tris,sourceTriangles:sourceTris,
   layout:{
    endianness:'little',alignment:4,
    positions:'float32 x3 per vertex, millimetres, isocentre frame (X patient left, Y superior, Z anterior)',
    normals:'float32 x3 per vertex, unit length, same vertex order',
    indices:'uint32 triangle list (winding as in the BodyParts3D source meshes; render double-sided)',
    offsets:'part.positions / part.normals / part.indices are byte offsets into heart.bin; counts are part.vertexCount (vertices) and part.indexCount (indices)',
    decimation:'meshoptimizer simplify (relative error 0.05) for skeleton parts; heart and great-vessel parts keep the BodyParts3D triangles',
   },
  },
  parts,
 };
 writeFileSync(new URL('heart.json',outDir),JSON.stringify(json)+'\n');
 return json;
}
