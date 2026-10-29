// Validates the rigged kinesiology model written by scripts/kinesio/build-rig.py.
// Usage: node scripts/kinesio/validate-rig.mjs [directory]   (default public/models/kinesio)
import {readFileSync,statSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {join} from 'node:path';

const dir=process.argv[2]??new URL('../../public/models/kinesio',import.meta.url).pathname.replace(/^\/(\w:)/,'$1');
const MAX_TRANSFER=12*1024*1024;
const errors=[];const fail=message=>errors.push(message);

// The muscle list lives once, in the shared contract.
const types=readFileSync(new URL('../../app/kinesio/types.ts',import.meta.url),'utf8');
const muscleIds=[...types.match(/export type MuscleId\s*=([^;]+);/)[1].matchAll(/'([a-z_]+)'/g)].map(m=>m[1]);
const jointIds=['pelvis',...['l','r'].flatMap(s=>[`hip_${s}`,`knee_${s}`,`ankle_${s}`])];

const meta=JSON.parse(readFileSync(join(dir,'lower-limb.json'),'utf8'));
const modelPath=join(dir,meta.model);
const transferred=statSync(modelPath).size;
if(transferred>MAX_TRANSFER)fail(`${meta.model} is ${transferred} bytes; the budget is ${MAX_TRANSFER}`);
const glb=meta.model.endsWith('.gz')?gunzipSync(readFileSync(modelPath)):readFileSync(modelPath);
if(glb.length!==meta.modelBytes)fail(`${meta.model} decodes to ${glb.length} bytes, but modelBytes says ${meta.modelBytes}`);
if(glb.toString('latin1',0,4)!=='glTF')throw new Error(`${meta.model} is not a binary glTF file`);
const jsonLength=glb.readUInt32LE(12),gltf=JSON.parse(glb.toString('utf8',20,20+jsonLength));
const binStart=20+jsonLength+8,bin=glb.subarray(binStart,binStart+glb.readUInt32LE(20+jsonLength));
const nodes=new Map(gltf.nodes.map((n,i)=>[n.name,{...n,index:i}]));

const COMPONENTS={5121:[1,'readUInt8'],5123:[2,'readUInt16LE'],5125:[4,'readUInt32LE'],5126:[4,'readFloatLE']};
function read(accessorIndex){
 const a=gltf.accessors[accessorIndex],view=gltf.bufferViews[a.bufferView],[size,method]=COMPONENTS[a.componentType];
 const count={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],stride=view.byteStride??size*count,base=(view.byteOffset??0)+(a.byteOffset??0);
 const max=a.componentType===5121?255:a.componentType===5123?65535:1;
 return Array.from({length:a.count},(_,i)=>Array.from({length:count},(_,c)=>{const v=bin[method](base+i*stride+c*size);return a.normalized?v/max:v;}));
}

for(const id of jointIds){
 const joint=meta.joints.find(j=>j.id===id);
 if(!joint){fail(`joint ${id} is missing from lower-limb.json`);continue;}
 if(!nodes.has(joint.bone))fail(`joint ${id}: bone node ${joint.bone} is not in the model`);
}
for(const id of muscleIds)for(const side of ['l','r']){
 const muscle=meta.muscles.find(m=>m.id===id&&m.side===side),label=`${id}:${side}`;
 if(!muscle){fail(`muscle ${label} is missing from lower-limb.json`);continue;}
 if(!(muscle.restLength>0))fail(`muscle ${label}: restLength must be positive, got ${muscle.restLength}`);
 for(const key of ['origin','insertion'])if(!nodes.has(muscle[key]))fail(`muscle ${label}: ${key} node ${muscle[key]} is not in the model`);
 const node=nodes.get(muscle.mesh);
 if(!node||node.mesh===undefined||node.skin===undefined){fail(`muscle ${label}: skinned mesh node ${muscle.mesh} is not in the model`);continue;}
 const skinJoints=gltf.skins[node.skin].joints.map(j=>gltf.nodes[j].name),allowed=new Set(muscle.bones),outside=new Set();
 for(const primitive of gltf.meshes[node.mesh].primitives){
  const joints=read(primitive.attributes.JOINTS_0),weights=read(primitive.attributes.WEIGHTS_0);
  joints.forEach((set,v)=>set.forEach((j,k)=>{if(weights[v][k]>0&&!allowed.has(skinJoints[j]))outside.add(skinJoints[j]);}));
 }
 if(outside.size)fail(`muscle ${label}: weighted to ${[...outside].join(', ')}, outside the bones it crosses (${muscle.bones.join(', ')})`);
}

if(errors.length){console.error(`validate-rig: ${errors.length} problem(s)\n- ${errors.join('\n- ')}`);process.exit(1);}
console.log(`validate-rig: ok — ${meta.joints.length} joints, ${meta.muscles.length} muscles, ${transferred} bytes transferred`);
