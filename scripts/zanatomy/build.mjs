// Builds the descriptive layer of the atlas from the raw Z-Anatomy export (scripts/zanatomy/extract.py):
// bone landmarks, muscle origin/insertion areas and lymphoid structures, aligned to the BodyParts3D frame.
// Z-Anatomy data is CC BY-SA 4.0.
//
// Alignment, per bone. Z-Anatomy and BodyParts3D share the axis convention up to a swap (Z-Anatomy z up and
// front -y; atlas y up and front +z, +x the body's left in both), but the Z-Anatomy bone meshes are remodelled:
// the lower limb is about 3.5 % shorter and the head 0.7 %, so no single similarity transform fits (the global
// fit below is only reported, and used as the baseline for the lymph report). Instead:
//  - every Z-Anatomy bone that has a BodyParts3D counterpart by name gets its own transform: the axis swap, then a
//    per-axis scale (clamped to 0.85-1.2) and a translation that make its bounding box coincide with the atlas bone;
//  - a landmark takes the transform of the Z-Anatomy bone nearest to it and is then snapped to the surface of the
//    matching atlas bone; landmarks farther than 5 mm from that surface are dropped;
//  - an attachment area takes the transform of the Z-Anatomy bone most of its vertices lie on, and its vertices within
//    3 mm of the atlas bone surface are pulled onto it so the area hugs the bone;
//  - lymph geometry has no bone of its own: each vertex blends the transforms of the 3 nearest bones (inverse square
//    distance to the bone's bounding box center), so long structures do not tear between regions.
//
// Usage: node scripts/zanatomy/build.mjs [scratch dir] [--names-out file]
//   scratch dir   output of extract.py (default %TEMP%/atlas-work/zanat-extract)
//   --names-out   write every English name the build needs (one per line) and exit, to author the name files
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const root=join(dirname(fileURLToPath(import.meta.url)),'..','..');
const args=process.argv.slice(2);
const namesOutIndex=args.indexOf('--names-out');
const namesOut=namesOutIndex>=0?args.splice(namesOutIndex,2)[1]:null;
const scratch=args[0]??join(tmpdir(),'atlas-work','zanat-extract');
const outDir=join(root,'public','models','descriptive');

const MAX_ANCHOR_DISTANCE=0.005;   // meters, landmark to atlas bone surface after alignment
// A leader line that names an opening (a foramen, a canal) ends in the empty space of the hole, so it may be farther.
const OPENING=/\b(foramen|foramina|canal|hiatus|fissure)\b/i,OPENING_DISTANCE=0.02;
const MAX_DROP_SHARE=0.05;         // the build fails when more landmarks than this share are dropped
const PULL_DISTANCE=0.003;         // meters, attachment vertices this close to the bone are pulled onto it
const Z_BONE_RADIUS=0.025;         // meters, search radius for the Z-Anatomy bone a point lies on
const SCALE_RANGE=[0.85,1.2];
const BUDGET={attachments:1.5*1024*1024,lymph:2*1024*1024};
const round4=v=>Math.round(v*1e4)/1e4;

// ---------------------------------------------------------------- inputs
const atlas=JSON.parse(readFileSync(join(root,'public','models','atlas.json'),'utf8'));
const load=name=>JSON.parse(readFileSync(join(scratch,name+'.json'),'utf8'));
const zLandmarks=load('landmarks'),zBones=load('bones'),zAttachments=load('attachments'),zLymph=load('lymph');
const chunks=new Map();
const chunk=i=>{if(!chunks.has(i)){const b=readFileSync(join(root,'public',atlas.chunks[i].url.replace(/^\//,'')));chunks.set(i,b.buffer.slice(b.byteOffset,b.byteOffset+b.length));}return chunks.get(i);};

// ---------------------------------------------------------------- geometry
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
function closestOnTriangle(p,a,b,c){ // Ericson, Real-Time Collision Detection 5.1.5
 const ab=sub(b,a),ac=sub(c,a),ap=sub(p,a),d1=dot(ab,ap),d2=dot(ac,ap);
 if(d1<=0&&d2<=0)return a;
 const bp=sub(p,b),d3=dot(ab,bp),d4=dot(ac,bp);
 if(d3>=0&&d4<=d3)return b;
 const vc=d1*d4-d3*d2;
 if(vc<=0&&d1>=0&&d3<=0){const v=d1/(d1-d3);return [a[0]+v*ab[0],a[1]+v*ab[1],a[2]+v*ab[2]];}
 const cp=sub(p,c),d5=dot(ab,cp),d6=dot(ac,cp);
 if(d6>=0&&d5<=d6)return c;
 const vb=d5*d2-d1*d6;
 if(vb<=0&&d2>=0&&d6<=0){const w=d2/(d2-d6);return [a[0]+w*ac[0],a[1]+w*ac[1],a[2]+w*ac[2]];}
 const va=d3*d6-d5*d4;
 if(va<=0&&d4-d3>=0&&d5-d6>=0){const w=(d4-d3)/((d4-d3)+(d5-d6));return [b[0]+w*(c[0]-b[0]),b[1]+w*(c[1]-b[1]),b[2]+w*(c[2]-b[2])];}
 const denom=1/(va+vb+vc),v=vb*denom,w=vc*denom;
 return [a[0]+ab[0]*v+ac[0]*w,a[1]+ab[1]*v+ac[1]*w,a[2]+ab[2]*v+ac[2]*w];
}
const boxDistance=(p,min,max)=>{let s=0;for(let i=0;i<3;i++){const d=p[i]<min[i]?min[i]-p[i]:p[i]>max[i]?p[i]-max[i]:0;s+=d*d;}return Math.sqrt(s);};
const boundsOf=pos=>{const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<pos.length;i+=3)for(let k=0;k<3;k++){min[k]=Math.min(min[k],pos[i+k]);max[k]=Math.max(max[k],pos[i+k]);}return {min,max};};
const centerOf=(min,max)=>[0,1,2].map(i=>(min[i]+max[i])/2);

// Triangle surface with a uniform grid for nearest-point queries.
const CELL=0.004,cellKey=(x,y,z)=>((x+1024)*2048+(y+1024))*2048+(z+1024);
class Surface{
 constructor(id,name,pos,idx){
  this.id=id;this.name=name;this.pos=pos;this.idx=idx;
  const {min,max}=boundsOf(pos);this.min=min;this.max=max;this.grid=null;this.stamp=new Int32Array(idx.length/3);this.clock=0;
 }
 build(){
  this.grid=new Map();const {pos,idx}=this;
  for(let t=0;t<idx.length/3;t++){
   const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
   for(let k=0;k<3;k++)for(let c=0;c<3;c++){const v=pos[idx[t*3+k]*3+c];lo[c]=Math.min(lo[c],v);hi[c]=Math.max(hi[c],v);}
   for(let x=Math.floor(lo[0]/CELL);x<=Math.floor(hi[0]/CELL);x++)for(let y=Math.floor(lo[1]/CELL);y<=Math.floor(hi[1]/CELL);y++)for(let z=Math.floor(lo[2]/CELL);z<=Math.floor(hi[2]/CELL);z++){
    const key=cellKey(x,y,z),cell=this.grid.get(key);if(cell)cell.push(t);else this.grid.set(key,[t]);
   }
  }
 }
 // Nearest point within `limit` meters, or null.
 query(p,limit){
  if(boxDistance(p,this.min,this.max)>limit)return null;
  if(!this.grid)this.build();
  const {pos,idx,grid}=this;let best=null,bestD=limit;this.clock++;
  const lo=p.map(v=>Math.floor((v-limit)/CELL)),hi=p.map(v=>Math.floor((v+limit)/CELL));
  for(let x=lo[0];x<=hi[0];x++)for(let y=lo[1];y<=hi[1];y++)for(let z=lo[2];z<=hi[2];z++){
   const cell=grid.get(cellKey(x,y,z));if(!cell)continue;
   for(const t of cell){
    if(this.stamp[t]===this.clock)continue;this.stamp[t]=this.clock;
    const i=idx[t*3]*3,j=idx[t*3+1]*3,k=idx[t*3+2]*3;
    const q=closestOnTriangle(p,[pos[i],pos[i+1],pos[i+2]],[pos[j],pos[j+1],pos[j+2]],[pos[k],pos[k+1],pos[k+2]]);
    const d=Math.hypot(q[0]-p[0],q[1]-p[1],q[2]-p[2]);
    if(d<bestD){bestD=d;best={distance:d,point:q,surface:this};}
   }
  }
  return best;
 }
}
function nearest(p,surfaces,limit){ // closest point over several surfaces
 let best=null;
 for(const s of surfaces){const r=s.query(p,best?best.distance:limit);if(r)best=r;}
 return best;
}

// ---------------------------------------------------------------- atlas bones
// Skeletal parts that are bone, cartilage or teeth: the atlas files a few muscles, disks and gingiva under "skeletal".
const NOT_BONE=/fibularis|tibialis|iliotibial|subscapularis|levator scapulae|intervertebral disk|gingiva/i;
const atlasBones=atlas.parts.filter(p=>p.system==='skeletal'&&!NOT_BONE.test(p.name)).map(p=>{
 const s=new Surface(p.id,p.name,new Float32Array(chunk(p.chunk),p.positions,p.vertexCount*3),new Uint32Array(chunk(p.chunk),p.indices,p.indexCount));
 return s;
});
const boneByName=new Map();atlasBones.forEach(b=>{const k=b.name.toLowerCase();boneByName.set(k,[...(boneByName.get(k)??[]),b]);});

// ---------------------------------------------------------------- 1. match Z-Anatomy bones to atlas bones by name
const ORD_NAME={1:'first',2:'second',3:'third',4:'fourth',5:'fifth',6:'sixth',7:'seventh',8:'eighth',9:'ninth',10:'tenth',11:'eleventh',12:'twelfth'};
const FINGER={hand:{first:'thumb',second:'index finger',third:'middle finger',fourth:'ring finger',fifth:'little finger'},foot:{first:'big toe',second:'second toe',third:'third toe',fourth:'fourth toe',fifth:'little toe'}};
const TOOTH={'medial incisor':'central secondary incisor tooth','lateral incisor':'lateral secondary incisor tooth','canine':'secondary canine tooth','first premolar':'first secondary premolar tooth','second premolar':'second secondary premolar tooth','first molar tooth':'first secondary molar tooth','second molar tooth':'second secondary molar tooth'};
// "Femur.l" -> "left femur"; "Navicular bone.r" -> "navicular bone of right foot"; "Vertebra T4" -> "fourth thoracic vertebra".
function atlasNameForBone(z){
 let n=z.name,side='';
 const m=n.match(/^(.*)\.([lr])$/);if(m){n=m[1];side=m[2]==='l'?'left':'right';}
 n=n.toLowerCase();
 const v=n.match(/^vertebra ([ctl])(\d+)$/);
 if(v)return `${ORD_NAME[+v[2]]} ${{c:'cervical',t:'thoracic',l:'lumbar'}[v[1]]} vertebra`;
 if(n==='atlas (c1)')return 'atlas';if(n==='axis (c2)')return 'axis';if(n==='ethmoid bone')return 'ethmoid';
 if(n==='manubrium of sternum')return 'manubrium';
 if(!side)return n;
 if(n==='navicular bone')return `navicular bone of ${side} foot`;
 const ph=n.match(/^(distal|middle|proximal) phalanx of (\w+) finger of (hand|foot)$/);
 if(ph)return `${ph[1]} phalanx of ${side} ${FINGER[ph[3]][ph[2]]}`;
 const tooth=n.match(/^(upper|lower) (.+)$/);
 if(tooth&&TOOTH[tooth[2]])return `${side} ${tooth[1]} ${TOOTH[tooth[2]]}`;
 const cc=n.match(/^costal cartilage of (\w+) rib$/);if(cc)return `${side} ${cc[1]} costal cartilage`;
 const base=n.replace(/ bone$/,'');
 if(/^(capitate|hamate|lunate|pisiform|scaphoid|trapezium|trapezoid)$/.test(base))return `${side} ${base}`;
 if(base==='triquetrum')return `${side} triquetral`;
 return `${side} ${n}`;
}

// Axis swap Z-Anatomy -> atlas: (x, y, z) -> (x, z, -y). Verified below against the global fit.
const swap=v=>[v[0],v[2],-v[1]];
const swapBox=(min,max)=>{const a=swap(min),b=swap(max);return {min:[0,1,2].map(i=>Math.min(a[i],b[i])),max:[0,1,2].map(i=>Math.max(a[i],b[i]))};};

const zSurfaces=zBones.map(b=>{
 const s=new Surface(b.name,b.name,Float32Array.from(b.pos),Uint32Array.from(b.idx));
 s.zMin=b.min;s.zMax=b.max;s.sw=swapBox(b.min,b.max);s.atlasName=atlasNameForBone(b);
 const c=s.atlasName?boneByName.get(s.atlasName):null;s.atlas=c&&c.length===1?c[0]:null;
 if(s.atlas){ // per-axis scale and translation so the swapped bounding box coincides with the atlas bone's
  const ac=centerOf(s.atlas.min,s.atlas.max),zc=centerOf(s.sw.min,s.sw.max);
  s.scale=[0,1,2].map(i=>Math.min(SCALE_RANGE[1],Math.max(SCALE_RANGE[0],(s.atlas.max[i]-s.atlas.min[i])/Math.max(1e-6,s.sw.max[i]-s.sw.min[i]))));
  s.shift=[0,1,2].map(i=>ac[i]-s.scale[i]*zc[i]);
  s.M=[0,1,2].map(i=>[0,1,2].map(j=>i===j?s.scale[i]:0));
 }
 return s;
});
const matched=zSurfaces.filter(s=>s.atlas);
if(matched.length<20)throw new Error(`Only ${matched.length} Z-Anatomy bones matched an atlas bone by name; need at least 20.`);
const applyBone=(s,v)=>{const w=swap(v),M=s.M;return [M[0][0]*w[0]+M[0][1]*w[1]+M[0][2]*w[2]+s.shift[0],M[1][0]*w[0]+M[1][1]*w[1]+M[1][2]*w[2]+s.shift[1],M[2][0]*w[0]+M[2][1]*w[1]+M[2][2]*w[2]+s.shift[2]];};

// Global similarity fit (axis swap, uniform scale, translation) on bbox centers: reported as the baseline.
const globalPairs=matched.map(s=>({zc:centerOf(s.sw.min,s.sw.max),ac:centerOf(s.atlas.min,s.atlas.max)}));
const mean=(set,k)=>[0,1,2].map(i=>set.reduce((a,p)=>a+p[k][i],0)/set.length);
const zm=mean(globalPairs,'zc'),am=mean(globalPairs,'ac');
let num=0,den=0;for(const p of globalPairs){num+=dot(sub(p.zc,zm),sub(p.ac,am));den+=dot(sub(p.zc,zm),sub(p.zc,zm));}
const gScale=num/den,gShift=[0,1,2].map(i=>am[i]-gScale*zm[i]);
const toAtlasGlobal=v=>{const w=swap(v);return [0,1,2].map(i=>gScale*w[i]+gShift[i]);};
const globalRms=Math.sqrt(globalPairs.reduce((a,p)=>a+Math.hypot(...[0,1,2].map(i=>gScale*p.zc[i]+gShift[i]-p.ac[i]))**2,0)/globalPairs.length);
const femur=zSurfaces.find(s=>s.name==='Femur.l'),femurX=toAtlasGlobal(centerOf(femur.zMin,femur.zMax))[0];
if(!(femurX>0))throw new Error('Z-Anatomy ".l" bones land on the atlas right side; the name-based side convention does not hold.');

// Refinement: rounds of closest-point matching between the Z-Anatomy bone surface and the atlas bone surface, each
// re-solving the bone's 3x3 matrix and translation by least squares (pairs farther than 15 mm are ignored; the matrix
// is pulled toward its previous value so a shaft cannot slide along its own axis).
function surfaceError(s){ // mean distance of the transformed Z bone vertices to the atlas bone surface
 const n=s.pos.length/3,step=Math.max(1,Math.floor(n/300));let sum=0,count=0;
 for(let i=0;i<n;i+=step){const r=s.atlas.query(applyBone(s,[s.pos[i*3],s.pos[i*3+1],s.pos[i*3+2]]),0.03);sum+=r?r.distance:0.03;count++;}
 return sum/count;
}
function inverse3(m){
 const [a,b,c]=m[0],[d,e,f]=m[1],[g,h,i]=m[2],det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);
 return [[(e*i-f*h)/det,(c*h-b*i)/det,(b*f-c*e)/det],[(f*g-d*i)/det,(a*i-c*g)/det,(c*d-a*f)/det],[(d*h-e*g)/det,(b*g-a*h)/det,(a*e-b*d)/det]];
}
function refine(s){
 const n=s.pos.length/3,step=Math.max(1,Math.floor(n/600)),w=[];
 for(let i=0;i<n;i+=step)w.push(swap([s.pos[i*3],s.pos[i*3+1],s.pos[i*3+2]]));
 for(let round=0;round<12;round++){
  const pairs=[];
  for(const v of w){const q=s.M.map((row,i)=>dot(row,v)+s.shift[i]),r=s.atlas.query(q,0.015);if(r)pairs.push([v,r.point]);}
  if(pairs.length<30)return;
  const N=pairs.length,mv=[0,1,2].map(i=>pairs.reduce((a,p)=>a+p[0][i],0)/N),mt=[0,1,2].map(i=>pairs.reduce((a,p)=>a+p[1][i],0)/N);
  const C=[[0,0,0],[0,0,0],[0,0,0]],D=[[0,0,0],[0,0,0],[0,0,0]];
  for(const [v,t] of pairs)for(let i=0;i<3;i++)for(let j=0;j<3;j++){C[i][j]+=(v[i]-mv[i])*(v[j]-mv[j]);D[i][j]+=(t[i]-mt[i])*(v[j]-mv[j]);}
  const lambda=0.05*(C[0][0]+C[1][1]+C[2][2])/3;
  const A=C.map((row,i)=>row.map((x,j)=>x+(i===j?lambda:0))),B=D.map((row,i)=>row.map((x,j)=>x+lambda*s.M[i][j])),Ai=inverse3(A);
  const M=B.map(row=>[0,1,2].map(j=>row[0]*Ai[0][j]+row[1]*Ai[1][j]+row[2]*Ai[2][j]));
  if(M.some((row,i)=>row.some((x,j)=>!Number.isFinite(x)||(i===j&&(x<SCALE_RANGE[0]||x>SCALE_RANGE[1]))||(i!==j&&Math.abs(x)>0.25))))return;
  s.M=M;s.shift=[0,1,2].map(i=>mt[i]-dot(M[i],mv));
 }
}
const cornerError=s=>{ // how far the bbox-aligned Z bbox faces end up from the atlas bbox faces (non-zero only when a scale was clamped)
 const d=[0,1,2].flatMap(i=>[s.scale[i]*s.sw.min[i]+s.shift[i]-s.atlas.min[i],s.scale[i]*s.sw.max[i]+s.shift[i]-s.atlas.max[i]]);
 return {rms:Math.sqrt(d.reduce((a,v)=>a+v*v,0)/d.length),worst:Math.max(...d.map(Math.abs))};
};
const corner=matched.map(cornerError),clamped=matched.filter(s=>[0,1,2].some(i=>{const raw=(s.atlas.max[i]-s.atlas.min[i])/Math.max(1e-6,s.sw.max[i]-s.sw.min[i]);return raw<SCALE_RANGE[0]||raw>SCALE_RANGE[1];})).length;
const beforeError=matched.map(surfaceError);
matched.forEach(refine);
const afterError=matched.map(surfaceError);
const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
console.log(`alignment: ${matched.length} of ${zSurfaces.length} Z-Anatomy bones matched an atlas bone by name; Z-Anatomy ".l" lands on atlas +x (left) as expected`);
console.log(`alignment: global similarity fit (baseline, not used) scale ${gScale.toFixed(4)}, RMS of bbox centers ${(globalRms*1000).toFixed(1)} mm — above the 3 mm gate, hence the per-bone alignment`);
console.log(`alignment: per bone, bbox-to-bbox leaves RMS ${(Math.sqrt(corner.reduce((a,c)=>a+c.rms**2,0)/corner.length)*1000).toFixed(2)} mm on the bbox faces (worst ${(Math.max(...corner.map(c=>c.worst))*1000).toFixed(1)} mm, ${clamped} bones with a scale clamped to ${SCALE_RANGE.join('-')})`);
console.log(`alignment: mean distance from a Z-Anatomy bone's vertices to its atlas bone surface ${(avg(beforeError)*1000).toFixed(2)} mm after bbox alignment, ${(avg(afterError)*1000).toFixed(2)} mm after closest-point refinement (worst bone ${(Math.max(...afterError)*1000).toFixed(1)} mm)`);

// Z-Anatomy bones within `radius` of a Z-frame point (always at least the nearest one within Z_BONE_RADIUS), nearest first.
function zBonesNear(v,radius=0.012){
 const hits=[];
 for(const s of zSurfaces){const r=s.query(v,Z_BONE_RADIUS);if(r)hits.push({...r,bone:s});}
 hits.sort((a,b)=>a.distance-b.distance);
 return hits.filter((h,i)=>i===0||h.distance<=radius);
}
const zBoneAt=v=>zBonesNear(v,0)[0]??null;
const matchedCenters=matched.map(s=>({s,c:centerOf(s.sw.min,s.sw.max)}));
function nearestMatched(v,count=1){
 const w=swap(v);
 return matchedCenters.map(e=>({s:e.s,d:Math.hypot(w[0]-e.c[0],w[1]-e.c[1],w[2]-e.c[2])})).sort((a,b)=>a.d-b.d).slice(0,count);
}

// ---------------------------------------------------------------- names
const norm=s=>s.toLowerCase().replace(/\b(left|right)\b/g,' ').replace(/\bmuscles?\b/g,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const WHOLE_BONES=new Set([...zBones.map(b=>norm(b.name.replace(/\.[lr]$/,'').replace(/ bone$/,''))),...atlasBones.map(b=>norm(b.name.replace(/ bone$/,'')))]);
// Labels of whole regions of the skeleton ("Bones of thorax", "Skeleton of lower limbs"), not features of a bone.
const REGION_LABEL=/^(bones|cartilages|skeleton) of |\bskeleton$|^(bony pelvis|carpal bones|tarsal bones|metacarpal bones|metatarsal bones|phalanges of (foot|hand)|facial bones|extracranial bones of head|neurocranium|viscerocranium|cranium|pectoral girdle|pelvic girdle|vertebral column|(cervical|thoracic|lumbar) vertebrae|(cervical|thoracic) vertebra|vertebra|ribs?|true ribs|false ribs|floating ribs|costal cartilages|laryngeal cartilages|auditory ossicles|teeth|sternum|(mandibular|maxillary) dental arch)$/i;
const sideOfName=n=>/\bleft\b/i.test(n)?'left':/\bright\b/i.test(n)?'right':'';
const swapSide=n=>n.replace(/\b(left|right)\b/gi,w=>{const r=w.toLowerCase()==='left'?'right':'left';return w[0]===w[0].toUpperCase()?r[0].toUpperCase()+r.slice(1):r;});

// ---------------------------------------------------------------- 2. landmarks
const landmarks=[];let wholeBoneLabels=0,tooFar=0,unplaced=0;
for(const lm of zLandmarks){
 if(WHOLE_BONES.has(norm(lm.name.replace(/ bone$/,'')))||REGION_LABEL.test(lm.name)){wholeBoneLabels++;continue;}
 // The bone a leader line is hooked to in Z-Anatomy wins when it fits; otherwise the best of the nearby bones.
 const limit=OPENING.test(lm.name)?OPENING_DISTANCE:MAX_ANCHOR_DISTANCE;
 const hooked=(lm.hooks??[]).map(n=>zSurfaces.find(z=>z.name===n)).filter(Boolean);
 const fits={hooked:null,near:null};
 const place=(v,host)=>{
  const fallback=!host.atlas;
  if(fallback)host=nearestMatched(v)[0].s;
  const r=nearest(applyBone(host,v),fallback?atlasBones:[host.atlas],0.04);
  return r&&{...r,fallback};
 };
 for(const v of lm.v){
  for(const host of hooked){const r=place(v,host);if(r&&r.distance<=limit&&(!fits.hooked||r.distance<fits.hooked.distance))fits.hooked=r;}
  for(const hit of zBonesNear(v)){const r=place(v,hit.bone);if(r&&(!fits.near||r.distance<fits.near.distance))fits.near=r;}
 }
 const best=fits.hooked??fits.near;
 if(!best){unplaced++;continue;}
 if(best.distance>limit){tooFar++;if(process.env.DROPLOG)console.log('DROP',lm.name,(best.distance*1000).toFixed(1),best.surface.name,best.fallback?'fallback':'');continue;}
 landmarks.push({name:lm.name,part:best.surface,position:best.point,mirrored:false,fallback:best.fallback});
}
const mirrored=[];
const existing=new Set(landmarks.map(l=>`${l.name}|${l.part.id}`));
for(const l of [...landmarks]){
 const counterpart=swapSide(l.part.name).toLowerCase(),targets=boneByName.get(counterpart);
 if(!targets||counterpart===l.part.name.toLowerCase())continue;
 const mirror=[-l.position[0],l.position[1],l.position[2]],r=nearest(mirror,targets,0.05);
 if(!r||existing.has(`${l.name}|${r.surface.id}`))continue;
 existing.add(`${l.name}|${r.surface.id}`);
 mirrored.push({name:l.name,part:r.surface,position:r.point,mirrored:true});
}
const allLandmarks=[...landmarks,...mirrored];
const dropped=tooFar+unplaced,fallbackKept=landmarks.filter(l=>l.fallback).length;
console.log(`landmarks: ${zLandmarks.length} leader lines, ${wholeBoneLabels} labels of whole bones or regions skipped, ${dropped} dropped (${tooFar} farther than ${MAX_ANCHOR_DISTANCE*1000} mm from the atlas bone surface, ${unplaced} on no Z-Anatomy bone; ${(dropped/(zLandmarks.length-wholeBoneLabels)*100).toFixed(1)} %), ${landmarks.length} kept (${fallbackKept} on bones without an atlas counterpart, aligned through a neighbouring bone), ${mirrored.length} mirrored, ${allLandmarks.length} total`);
if(dropped/(zLandmarks.length-wholeBoneLabels)>MAX_DROP_SHARE)throw new Error(`More than ${MAX_DROP_SHARE*100} % of the landmarks were dropped; the alignment is not good enough.`);

// ---------------------------------------------------------------- 3. attachments
const muscular=atlas.parts.filter(p=>p.system==='muscular').map(p=>({id:p.id,name:p.name,side:sideOfName(p.name),core:norm(p.name)}));
function musclePartsFor(muscle,side){
 const core=norm(muscle);
 let found=muscular.filter(p=>p.core===core);
 if(!found.length)found=muscular.filter(p=>p.core.endsWith(' of '+core)||p.core.endsWith(' '+core));
 return found.filter(p=>side==='midline'||!p.side||p.side===side).map(p=>p.id);
}
const flat=pos=>Array.from({length:pos.length/3},(_,i)=>[pos[i*3],pos[i*3+1],pos[i*3+2]]);
const attachments=[],attachMeshes=[];const unmatchedMuscles=new Set();let noBone=0,sideDisagree=0,pulled=0,vertexTotal=0;
for(const a of zAttachments){
 const verts=flat(a.pos),votes=new Map();
 for(const v of verts){const hit=zBoneAt(v);if(hit)votes.set(hit.bone,(votes.get(hit.bone)??0)+1);}
 const ranked=[...votes.entries()].sort((x,y)=>y[1]-x[1]);
 let host=ranked.find(([s])=>s.atlas)?.[0];
 const onMatched=!!host;
 if(!host)host=nearestMatched(verts[Math.floor(verts.length/2)])[0].s;
 let out=verts.map(v=>applyBone(host,v));
 const bones=new Set();
 if(onMatched){
  const total=ranked.reduce((s,[,c])=>s+c,0);
  for(const [s,c] of ranked)if(s.atlas&&(s===host||c>=total*0.3))bones.add(s.atlas.id);
  out=out.map(p=>{vertexTotal++;const r=host.atlas.query(p,PULL_DISTANCE);if(r){pulled++;return r.point;}return p;});
 }else{ // no Z-Anatomy bone within reach with an atlas counterpart: take the bones the area ends up touching
  const hits=new Map();out.forEach(p=>{const r=nearest(p,atlasBones,0.008);if(r)hits.set(r.surface.id,(hits.get(r.surface.id)??0)+1);});
  [...hits.entries()].filter(([,c])=>c>=out.length*0.2).forEach(([id])=>bones.add(id));
 }
 const pos=new Float32Array(out.flat()),{min,max}=boundsOf(pos),center=centerOf(min,max);
 const sideSuffix=a.side==='l'?'left':'right';
 const side=min[0]<0&&max[0]>0&&Math.abs(center[0])<0.01?'midline':center[0]>0?'left':'right';
 if(side!=='midline'&&side!==sideSuffix)sideDisagree++;
 const muscleParts=musclePartsFor(a.muscle,side);
 if(!muscleParts.length)unmatchedMuscles.add(a.muscle);
 if(!bones.size)noBone++;
 attachments.push({muscle:a.muscle,kind:a.kind,side,bones:[...bones],muscleParts,node:a.raw,center:center.map(round4)});
 attachMeshes.push({name:a.raw,pos,idx:a.idx});
}
attachments.sort((x,y)=>x.muscle.localeCompare(y.muscle)||x.side.localeCompare(y.side)||x.kind.localeCompare(y.kind)||x.node.localeCompare(y.node));
console.log(`attachments: ${attachments.length} (${attachments.filter(a=>a.kind==='origin').length} origin, ${attachments.filter(a=>a.kind==='insertion').length} insertion), ${attachments.filter(a=>a.side==='midline').length} midline, ${noBone} on no atlas bone, ${sideDisagree} where geometry and name suffix disagree on the side, ${(pulled/vertexTotal*100).toFixed(0)} % of vertices pulled onto the bone surface`);
console.log(`attachments: ${unmatchedMuscles.size} muscle names without an atlas muscular part (not modelled in BodyParts3D, or filed there under skeletal): ${[...unmatchedMuscles].sort().join(', ')}`);

// ---------------------------------------------------------------- 4. lymph
const lymph=[],lymphMeshes=[];let maxShift=0,sumShift=0,shiftCount=0;
for(const l of zLymph){
 const out=new Float32Array(l.pos.length);
 for(let i=0;i<l.pos.length;i+=3){
  const v=[l.pos[i],l.pos[i+1],l.pos[i+2]],near=nearestMatched(v,3);
  let wsum=0,acc=[0,0,0];
  for(const {s,d} of near){const w=1/(d*d+1e-6),p=applyBone(s,v);wsum+=w;for(let k=0;k<3;k++)acc[k]+=w*p[k];}
  const p=acc.map(x=>x/wsum),g=toAtlasGlobal(v),shift=Math.hypot(p[0]-g[0],p[1]-g[1],p[2]-g[2]);
  maxShift=Math.max(maxShift,shift);sumShift+=shift;shiftCount++;
  out[i]=p[0];out[i+1]=p[1];out[i+2]=p[2];
 }
 const {min,max}=boundsOf(out);
 lymph.push({name:l.name,node:l.raw,bounds:[min.map(round4),max.map(round4)]});
 lymphMeshes.push({name:l.raw,pos:out,idx:l.idx});
}
lymph.sort((a,b)=>a.name.localeCompare(b.name)||a.node.localeCompare(b.node));
console.log(`lymph: ${lymph.length} meshes, ${new Set(lymph.map(l=>l.name)).size} distinct names; blending 3 bone transforms moves vertices ${(sumShift/shiftCount*1000).toFixed(1)} mm on average and ${(maxShift*1000).toFixed(1)} mm at most versus the global transform`);

// ---------------------------------------------------------------- 5. Spanish names
const muscleNames=[...new Set(attachments.map(a=>a.muscle))],landmarkNames=[...new Set(allLandmarks.map(l=>l.name))],lymphNames=[...new Set(lymph.map(l=>l.name))];
const needed=[...new Set([...landmarkNames,...muscleNames,...lymphNames])].sort((a,b)=>a.localeCompare(b,'en'));
if(namesOut){writeFileSync(namesOut,needed.join('\n')+'\n');writeFileSync(namesOut+'.kinds',needed.map(n=>`${landmarkNames.includes(n)?'L':''}${muscleNames.includes(n)?'M':''}${lymphNames.includes(n)?'Y':''}\t${n}`).join('\n')+'\n');console.log(`names: ${needed.length} written to ${namesOut}`);process.exit(0);}
const readLines=f=>readFileSync(join(root,'scripts','zanatomy',f),'utf8').split(/\r?\n/).filter((l,i,a)=>l!==''||i<a.length-1);
const en=readLines('names-en.txt'),es=readLines('names-es.txt');
if(en.length!==es.length)throw new Error(`names-en.txt has ${en.length} lines and names-es.txt ${es.length}; they must be line-aligned.`);
const spanish=new Map(en.map((n,i)=>[n,es[i]]));
const missing=needed.filter(n=>!spanish.has(n)||!spanish.get(n).trim());
if(missing.length)throw new Error(`${missing.length} names without Spanish translation: ${missing.slice(0,30).join('; ')}`);

// ---------------------------------------------------------------- 6. glb
// Positions and indices only, in the atlas frame and without node transforms; the viewer computes the normals.
function glb(meshes){
 const views=[],accessors=[],gnodes=[],gmeshes=[],parts=[];let offset=0;
 const push=(typed,target)=>{const bytes=Buffer.from(typed.buffer,typed.byteOffset,typed.byteLength),pad=(4-bytes.length%4)%4;views.push({buffer:0,byteOffset:offset,byteLength:bytes.length,target});parts.push(bytes,Buffer.alloc(pad));offset+=bytes.length+pad;return views.length-1;};
 for(const m of meshes){
  const pos=Float32Array.from(m.pos,round4),idx=Uint16Array.from(m.idx),{min,max}=boundsOf(pos);
  const a=accessors.length;
  accessors.push({bufferView:push(pos,34962),componentType:5126,count:pos.length/3,type:'VEC3',min,max});
  accessors.push({bufferView:push(idx,34963),componentType:5123,count:idx.length,type:'SCALAR'});
  gmeshes.push({name:m.name,primitives:[{attributes:{POSITION:a},indices:a+1,mode:4}]});
  gnodes.push({name:m.name,mesh:gmeshes.length-1});
 }
 const json=Buffer.from(JSON.stringify({asset:{version:'2.0',generator:'scripts/zanatomy/build.mjs',copyright:'Derived from Z-Anatomy, CC BY-SA 4.0'},scene:0,scenes:[{nodes:gnodes.map((_,i)=>i)}],nodes:gnodes,meshes:gmeshes,accessors,bufferViews:views,buffers:[{byteLength:offset}]}));
 const jsonPad=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,0x20)]),bin=Buffer.concat(parts);
 const head=Buffer.alloc(12);head.write('glTF');head.writeUInt32LE(2,4);head.writeUInt32LE(12+8+jsonPad.length+8+bin.length,8);
 const jh=Buffer.alloc(8);jh.writeUInt32LE(jsonPad.length,0);jh.write('JSON',4);const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length,0);bh.write('BIN\0',4);
 return Buffer.concat([head,jh,jsonPad,bh,bin]);
}
mkdirSync(outDir,{recursive:true});
const sizes={};
for(const [name,meshes] of [['attachments',attachMeshes],['lymph',lymphMeshes]]){
 const gz=gzipSync(glb(meshes),{level:9});sizes[name]=gz.length;
 if(gz.length>BUDGET[name])throw new Error(`${name}.glb.gz is ${gz.length} bytes; the budget is ${BUDGET[name]}.`);
 writeFileSync(join(outDir,`${name}.glb.gz`),gz);
}

// ---------------------------------------------------------------- 7. JSON
const id=(prefix,i)=>`${prefix}-${String(i+1).padStart(4,'0')}`;
const sortedLandmarks=[...allLandmarks].sort((a,b)=>a.mirrored-b.mirrored);
const out={
 source:'Z-Anatomy',license:'CC BY-SA 4.0',
 landmarks:sortedLandmarks.map((l,i)=>({id:id('lm',i),name:l.name,nameEs:spanish.get(l.name),bone:l.part.id,position:l.position.map(round4),mirrored:l.mirrored})),
 attachments:attachments.map((a,i)=>({id:id('at',i),muscle:a.muscle,muscleEs:spanish.get(a.muscle),muscleParts:a.muscleParts,kind:a.kind,side:a.side,bones:a.bones,node:a.node,center:a.center})),
 lymph:lymph.map((l,i)=>({id:id('ly',i),name:l.name,nameEs:spanish.get(l.name),node:l.node,bounds:l.bounds})),
};
const json=JSON.stringify(out);
writeFileSync(join(outDir,'landmarks.json'),json);
console.log(`wrote ${outDir}: landmarks.json ${json.length} bytes (${out.landmarks.length} landmarks, ${out.attachments.length} attachments, ${out.lymph.length} lymph), attachments.glb.gz ${sizes.attachments} bytes, lymph.glb.gz ${sizes.lymph} bytes`);
