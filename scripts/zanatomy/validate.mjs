// Validates the descriptive layer written by scripts/zanatomy/build.mjs (derived from Z-Anatomy, CC BY-SA 4.0).
// Usage: node scripts/zanatomy/validate.mjs [directory]   (default public/models/descriptive)
import {readFileSync,statSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {join} from 'node:path';
import assert from 'node:assert/strict';

const root=new URL('../../',import.meta.url).pathname.replace(/^\/(\w:)/,'$1');
const dir=process.argv[2]??join(root,'public','models','descriptive');
const BUDGET={'attachments.glb.gz':1.5*1024*1024,'lymph.glb.gz':2*1024*1024};
const BONE_TOLERANCE=0.005,MIRROR_TOLERANCE=0.01,GEOMETRY_TOLERANCE=0.02;

const atlas=JSON.parse(readFileSync(join(root,'public','models','atlas.json'),'utf8'));
const parts=new Map(atlas.parts.map(p=>[p.id,p]));
const data=JSON.parse(readFileSync(join(dir,'landmarks.json'),'utf8'));

const isVec3=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
const text=v=>typeof v==='string'&&v.trim()!=='';
const unique=(label,ids)=>assert.equal(new Set(ids).size,ids.length,`${label}: ids are not unique`);
const distanceToBox=(p,[min,max])=>Math.hypot(...[0,1,2].map(i=>Math.max(min[i]-p[i],0,p[i]-max[i])));
const centerOfBox=([min,max])=>[0,1,2].map(i=>(min[i]+max[i])/2);
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const partsNamed=name=>atlas.parts.filter(p=>p.name===name&&p.system==='skeletal');

// ---------------------------------------------------------------- schema
assert.equal(data.source,'Z-Anatomy');
assert.equal(data.license,'CC BY-SA 4.0');
for(const key of ['landmarks','attachments','lymph'])assert.ok(Array.isArray(data[key])&&data[key].length>0,`${key} must be a non-empty list`);
unique('landmarks',data.landmarks.map(l=>l.id));unique('attachments',data.attachments.map(a=>a.id));unique('lymph',data.lymph.map(l=>l.id));
data.landmarks.forEach(l=>{
 assert.match(l.id,/^lm-\d{4,}$/);assert.ok(text(l.name)&&text(l.nameEs),`${l.id}: name and nameEs are required`);
 assert.ok(isVec3(l.position),`${l.id}: position must be 3 finite numbers`);assert.equal(typeof l.mirrored,'boolean',`${l.id}: mirrored must be boolean`);
 assert.ok(parts.has(l.bone),`${l.id}: bone ${l.bone} is not an atlas part`);
});
data.attachments.forEach(a=>{
 assert.match(a.id,/^at-\d{4,}$/);assert.ok(text(a.muscle)&&text(a.muscleEs)&&text(a.node),`${a.id}: muscle, muscleEs and node are required`);
 assert.ok(['origin','insertion'].includes(a.kind),`${a.id}: kind ${a.kind}`);assert.ok(['left','right','midline'].includes(a.side),`${a.id}: side ${a.side}`);
 assert.ok(Array.isArray(a.bones)&&Array.isArray(a.muscleParts),`${a.id}: bones and muscleParts must be lists`);assert.ok(isVec3(a.center),`${a.id}: center`);
});
data.lymph.forEach(l=>{
 assert.match(l.id,/^ly-\d{4,}$/);assert.ok(text(l.name)&&text(l.nameEs)&&text(l.node),`${l.id}: name, nameEs and node are required`);
 assert.ok(Array.isArray(l.bounds)&&l.bounds.length===2&&l.bounds.every(isVec3)&&[0,1,2].every(i=>l.bounds[0][i]<=l.bounds[1][i]),`${l.id}: bounds must be [min, max]`);
});

// ---------------------------------------------------------------- atlas links
let withMuscleParts=0;
data.landmarks.forEach(l=>{
 const part=parts.get(l.bone);
 assert.equal(part.system,'skeletal',`${l.id}: bone ${l.bone} (${part.name}) is ${part.system}, not skeletal`);
 const d=distanceToBox(l.position,part.bounds);
 assert.ok(d<=BONE_TOLERANCE,`${l.id} "${l.name}" lies ${(d*1000).toFixed(1)} mm from the bounds of ${part.name}`);
});
data.attachments.forEach(a=>{
 a.bones.forEach(id=>{assert.ok(parts.has(id),`${a.id}: bone ${id} is not an atlas part`);assert.equal(parts.get(id).system,'skeletal',`${a.id}: bone ${id} is not skeletal`);});
 a.muscleParts.forEach(id=>{assert.ok(parts.has(id),`${a.id}: muscle part ${id} is not an atlas part`);assert.equal(parts.get(id).system,'muscular',`${a.id}: muscle part ${id} is not muscular`);});
 if(a.muscleParts.length)withMuscleParts++;
});

// mirrored landmarks come from a non-mirrored one with the same name on the opposite side
const sources=data.landmarks.filter(l=>!l.mirrored);
data.landmarks.filter(l=>l.mirrored).forEach(m=>{
 const ok=sources.some(s=>s.name===m.name&&s.bone!==m.bone&&Math.abs(s.position[0]+m.position[0])<=MIRROR_TOLERANCE&&Math.abs(s.position[1]-m.position[1])<=MIRROR_TOLERANCE&&Math.abs(s.position[2]-m.position[2])<=MIRROR_TOLERANCE);
 assert.ok(ok,`${m.id} "${m.name}" is mirrored but has no non-mirrored source with x negated within ${MIRROR_TOLERANCE*1000} mm`);
});

// ---------------------------------------------------------------- glb
function readGlb(file){
 const gz=readFileSync(join(dir,file));
 assert.ok(gz.length<=BUDGET[file],`${file} is ${gz.length} bytes; the budget is ${BUDGET[file]}`);
 const glb=gunzipSync(gz);
 assert.equal(glb.toString('latin1',0,4),'glTF',`${file} is not a binary glTF file`);
 assert.equal(glb.readUInt32LE(8),glb.length,`${file}: header length differs from the file length`);
 const jsonLength=glb.readUInt32LE(12),gltf=JSON.parse(glb.toString('utf8',20,20+jsonLength));
 const nodes=new Map();
 for(const n of gltf.nodes){
  assert.equal(n.matrix,undefined,`${file}: node ${n.name} carries a transform; geometry must already be in the atlas frame`);
  assert.ok(n.translation===undefined&&n.rotation===undefined&&n.scale===undefined,`${file}: node ${n.name} carries a transform`);
  assert.ok(n.mesh!==undefined,`${file}: node ${n.name} has no mesh`);
  assert.ok(!nodes.has(n.name),`${file}: duplicate node ${n.name}`);
  const position=gltf.accessors[gltf.meshes[n.mesh].primitives[0].attributes.POSITION];
  nodes.set(n.name,{min:position.min,max:position.max,vertices:position.count});
 }
 return {nodes,bytes:gz.length};
}
const attachmentsGlb=readGlb('attachments.glb.gz'),lymphGlb=readGlb('lymph.glb.gz');
data.attachments.forEach(a=>{
 const node=attachmentsGlb.nodes.get(a.node);assert.ok(node,`${a.id}: node ${a.node} is not in attachments.glb.gz`);
 const d=dist(centerOfBox([node.min,node.max]),a.center);assert.ok(d<=GEOMETRY_TOLERANCE,`${a.id}: geometry center is ${(d*1000).toFixed(0)} mm from center`);
});
data.lymph.forEach(l=>{
 const node=lymphGlb.nodes.get(l.node);assert.ok(node,`${l.id}: node ${l.node} is not in lymph.glb.gz`);
 const d=dist(centerOfBox([node.min,node.max]),centerOfBox(l.bounds));assert.ok(d<=GEOMETRY_TOLERANCE,`${l.id}: geometry center is ${(d*1000).toFixed(0)} mm from the bounds center`);
});
assert.equal(attachmentsGlb.nodes.size,data.attachments.length,'every node of attachments.glb.gz must have an entry');
assert.equal(lymphGlb.nodes.size,data.lymph.length,'every node of lymph.glb.gz must have an entry');

// ---------------------------------------------------------------- anatomy spot checks
const landmarksOn=(boneName,landmarkName)=>data.landmarks.filter(l=>l.name===landmarkName&&partsNamed(boneName).some(p=>p.id===l.bone));
assert.ok(landmarksOn('Occipital bone','Foramen magnum').length>=1,'the occipital bone must have a "Foramen magnum" landmark');
for(const side of ['Left','Right'])assert.ok(landmarksOn(`${side} femur`,'Greater trochanter').length>=1,`the ${side.toLowerCase()} femur must have a "Greater trochanter" landmark`);
const onBone=(a,names)=>a.bones.some(id=>names.includes(parts.get(id).name));
const biceps=data.attachments.filter(a=>/biceps femoris/i.test(a.muscle));
for(const side of ['left','right']){
 const s=biceps.filter(a=>a.side===side);
 assert.ok(s.some(a=>a.kind==='origin'&&onBone(a,[`${side[0].toUpperCase()+side.slice(1)} hip bone`])),`biceps femoris (${side}) needs an origin on the hip bone`);
 assert.ok(s.some(a=>a.kind==='insertion'&&onBone(a,[`${side[0].toUpperCase()+side.slice(1)} fibula`])),`biceps femoris (${side}) needs an insertion on the fibula`);
}
// Z-Anatomy ships no lymphatic vessel geometry (its thoracic duct collections are empty), so the lymph checks cover what it does have.
for(const name of ['Spleen','Left lobe of thymus','Right lobe of thymus','Supraclavicular nodes','Superficial popliteal nodes'])assert.ok(data.lymph.some(l=>l.name===name),`lymph must include "${name}"`);

console.log(`validate-descriptive: ok — ${data.landmarks.length} landmarks (${data.landmarks.filter(l=>l.mirrored).length} mirrored, ${new Set(data.landmarks.map(l=>l.name)).size} distinct names), `+
 `${data.attachments.length} attachments (${data.attachments.filter(a=>a.kind==='origin').length} origin, ${data.attachments.filter(a=>a.kind==='insertion').length} insertion, ${withMuscleParts} linked to atlas muscle parts), `+
 `${data.lymph.length} lymph meshes; attachments.glb.gz ${attachmentsGlb.bytes} bytes, lymph.glb.gz ${lymphGlb.bytes} bytes, landmarks.json ${statSync(join(dir,'landmarks.json')).size} bytes`);
