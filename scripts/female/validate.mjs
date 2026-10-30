// Validates the female variant written by scripts/female/build.mjs.
// Usage: node scripts/female/validate.mjs [directory]   (default public/models/female)
import {readFileSync,statSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {join} from 'node:path';
import {parseGlb,readMeshes,bounds} from './glb.mjs';

const toPath=url=>new URL(url,import.meta.url).pathname.replace(/^\/(\w:)/,'$1');
const dir=process.argv[2]??toPath('../../public/models/female');
const atlasPath=toPath('../../public/models/atlas.json');
const MAX_GZ_BYTES=4*1024*1024,SYSTEMS=new Set(['reproductive','skeletal','urinary','integumentary']);
const errors=[];const fail=message=>errors.push(message);
const check=(ok,message)=>{if(!ok)fail(message);};

const meta=JSON.parse(readFileSync(join(dir,'female.json'),'utf8'));
const atlas=JSON.parse(readFileSync(atlasPath,'utf8'));
const gzPath=join(dir,'female.glb.gz'),gzBytes=statSync(gzPath).size;
check(gzBytes<=MAX_GZ_BYTES,`female.glb.gz is ${gzBytes} bytes; the budget is ${MAX_GZ_BYTES}`);
const glb=gunzipSync(readFileSync(gzPath)),{gltf}=parseGlb(glb);

// JSON schema
for(const key of ['source','license','licenseUrl','sourceUrl'])check(typeof meta[key]==='string'&&meta[key].length>0,`female.json: "${key}" must be a non-empty string`);
check(meta.license==='CC BY 4.0'&&meta.licenseUrl==='https://creativecommons.org/licenses/by/4.0/','female.json: license must be CC BY 4.0 with its canonical URL');
check(Array.isArray(meta.parts)&&meta.parts.length>0,'female.json: "parts" must be a non-empty list');
check(Array.isArray(meta.replaces)&&meta.replaces.length>0,'female.json: "replaces" must be a non-empty list');
const isPoint=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
const ids=new Set(),nodeNames=new Set();
for(const part of meta.parts){
 for(const key of ['id','node','name','nameEs'])check(typeof part[key]==='string'&&part[key].length>0,`part ${part.id}: "${key}" must be a non-empty string`);
 check(/^VHF-[a-z0-9-]+$/.test(part.id??''),`part ${part.id}: id must look like VHF-<slug>`);
 check(!ids.has(part.id),`duplicate part id ${part.id}`);ids.add(part.id);
 check(!nodeNames.has(part.node),`duplicate glb node ${part.node}`);nodeNames.add(part.node);
 check(SYSTEMS.has(part.system),`part ${part.id}: system "${part.system}" is not one of ${[...SYSTEMS]}`);
 check(Array.isArray(part.bounds)&&part.bounds.length===2&&part.bounds.every(isPoint),`part ${part.id}: bounds must be [[x,y,z],[x,y,z]]`);
 check(part.nameEs===part.nameEs?.toLowerCase()||/[A-Z][a-z]+ (de|del) [A-Z]/.test(part.nameEs??''),`part ${part.id}: nameEs "${part.nameEs}" must be lowercase except eponyms`);
}

// glb: one mesh node per part, no node transforms, geometry bbox equals "bounds" within 1 cm
const nodes=new Map(gltf.nodes.map(n=>[n.name,n]));
check(gltf.nodes.length===meta.parts.length,`glb has ${gltf.nodes.length} nodes but female.json lists ${meta.parts.length} parts`);
for(const n of gltf.nodes)for(const key of ['matrix','translation','rotation','scale','children'])check(n[key]===undefined,`glb node ${n.name} has "${key}"; nodes must be bare in the atlas frame`);
const geometry=new Map();
for(const mesh of readMeshes(glb))geometry.set(mesh.name,bounds(mesh.positions));
for(const part of meta.parts){
 const node=nodes.get(part.node);
 if(!node||node.mesh===undefined){fail(`part ${part.id}: glb node ${part.node} is missing or has no mesh`);continue;}
 const box=geometry.get(part.node);
 for(let k=0;k<2;k++)for(let c=0;c<3;c++)check(Math.abs(box[k][c]-part.bounds[k][c])<=0.01,`part ${part.id}: bounds[${k}][${c}] is ${part.bounds[k][c]} but the geometry says ${box[k][c].toFixed(4)}`);
}

// "replaces" ids exist in atlas.json and cover what the female mode swaps
const atlasIds=new Map(atlas.parts.map(p=>[p.id,p]));
check(new Set(meta.replaces).size===meta.replaces.length,'female.json: "replaces" has duplicate ids');
for(const id of meta.replaces)check(atlasIds.has(id),`replaces: atlas part ${id} does not exist in atlas.json`);
for(const p of atlas.parts)if(p.system==='reproductive'||p.system==='integumentary')check(meta.replaces.includes(p.id),`replaces: atlas ${p.system} part ${p.id} (${p.name}) must be replaced`);
const replacedNames=meta.replaces.map(id=>atlasIds.get(id)?.name);
for(const name of ['Left hip bone','Right hip bone','Sacrum','Urinary bladder'])check(replacedNames.includes(name),`replaces: atlas "${name}" must be replaced`);

// anatomy
const part=id=>meta.parts.find(p=>p.id===id),box=id=>geometry.get(part(id)?.node);
const centre=b=>b[0].map((v,i)=>(v+b[1][i])/2);
const union=ids=>[[0,1,2].map(c=>Math.min(...ids.map(i=>box(i)[0][c]))),[0,1,2].map(c=>Math.max(...ids.map(i=>box(i)[1][c])))];
const required=['VHF-hip-bone-l','VHF-hip-bone-r','VHF-sacrum','VHF-ovary-l','VHF-ovary-r','VHF-uterine-body','VHF-cervix','VHF-urinary-bladder','VHF-skin'];
if(required.every(id=>box(id))){
 const hipL=centre(box('VHF-hip-bone-l')),hipR=centre(box('VHF-hip-bone-r')),mid=(hipL[0]+hipR[0])/2;
 check(hipL[0]>0&&hipR[0]<0,`left hip bone must be at +x and right at -x, got x ${hipL[0].toFixed(3)} / ${hipR[0].toFixed(3)}`);
 check(centre(box('VHF-ovary-l'))[0]>0&&centre(box('VHF-ovary-r'))[0]<0,'left ovary centroid must be at +x and right ovary at -x');
 if(box('VHF-uterine-tube-l'))check(centre(box('VHF-uterine-tube-l'))[0]>0&&centre(box('VHF-uterine-tube-r'))[0]<0,'left tube must be at +x and right tube at -x');
 const uterus=union(['VHF-uterine-fundus','VHF-uterine-body','VHF-cervix'].filter(box)),uterusX=centre(uterus)[0];
 check(Math.abs(uterusX)<0.02&&Math.abs(uterusX-mid)<0.02,`uterus must be centred (|x| < 2 cm, and within 2 cm of the midpoint between the hip bones), x ${uterusX.toFixed(3)}, midpoint ${mid.toFixed(3)}`);
 check(centre(box('VHF-urinary-bladder'))[2]>centre(uterus)[2],'bladder must be anterior (+z) to the uterus');
 const pelvis=union(['VHF-hip-bone-l','VHF-hip-bone-r','VHF-sacrum']);
 // Pelvic organs only: the mammary gland is reproductive too but lies on the thorax.
 for(const p of meta.parts.filter(p=>(p.system==='reproductive'||p.system==='urinary')&&!/^VHF-(breast-fat|mammary-lobes|lactiferous-ducts)-/.test(p.id))){
  const b=box(p.id);
  for(let c=0;c<3;c++)check(b[0][c]>=pelvis[0][c]-0.03&&b[1][c]<=pelvis[1][c]+0.03,`${p.id}: lies outside the fitted pelvis bbox padded 3 cm on axis ${'xyz'[c]}`);
 }
 const skin=box('VHF-skin'),atlasSkin=atlas.parts.find(p=>p.system==='integumentary'&&p.name==='Skin');
 const height=skin[1][1]-skin[0][1],atlasHeight=atlasSkin.bounds[1][1]-atlasSkin.bounds[0][1];
 check(Math.abs(height/atlasHeight-1)<=0.02,`skin height ${height.toFixed(3)} m is not within 2 % of the atlas skin ${atlasHeight.toFixed(3)} m`);
 check(Math.abs(skin[0][1])<=0.01,`skin must stand on y = 0, its lowest point is ${skin[0][1].toFixed(3)}`);
 check(Math.abs(centre(skin)[0]-centre(atlasSkin.bounds)[0])<=0.02,'skin must be centred on the atlas skin in x');
 for(const side of ['l','r']){ // the nipple belongs on the skin surface, not inside the body or floating
  const nipple=box(`VHF-nipple-${side}`);
  if(nipple)check(nipple[1][2]<=skin[1][2]&&nipple[0][1]>skin[0][1]&&nipple[1][1]<skin[1][1],`VHF-nipple-${side}: lies outside the skin bbox`);
 }
}else fail(`missing required parts: ${required.filter(id=>!box(id)).join(', ')}`);

if(errors.length){console.error(`validate-female: ${errors.length} problem(s)\n- ${errors.join('\n- ')}`);process.exit(1);}
console.log(`validate-female: ok — ${meta.parts.length} parts, replaces ${meta.replaces.length} atlas parts, ${gzBytes} bytes gz (${glb.length} decoded)`);
