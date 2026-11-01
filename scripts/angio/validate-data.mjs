// Validates the angiography anatomy assets written by build-anatomy.mjs (public/models/angio/*).
// Exit code 1 on any failure; prints the number of checks. Usage: node scripts/angio/validate-data.mjs
import {readFileSync,existsSync,statSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {Surface} from './lib-geom.mjs';
import {nearestOn,slice} from './lib-curves.mjs';
import * as nodeModule from 'node:module';
import {loadMean,makeRegistration,LANDMARK_KEYS} from './lib-imagecas.mjs';
nodeModule.registerHooks(await import('../gyneco/ts-resolve.mjs'));
const G=await import('../../app/angio/core/geometry.ts');

const dir=new URL('../../public/models/angio/',import.meta.url);
let checks=0;const failures=[];
const check=(ok,msg)=>{checks++;if(!ok&&failures.length<60)failures.push(msg);else if(!ok)failures.push(null);};
const isVec=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const read=name=>{const url=new URL(name,dir);if(!existsSync(url)){check(false,`missing file ${name}`);return null;}return JSON.parse(readFileSync(url,'utf8'));};

// ---- required vocabulary -------------------------------------------------------------------------------
const SYNTAX={lm:'5','lad-prox':'6','lad-mid':'7','lad-apical':'8',d1:'9',d2:'10','lcx-prox':'11',ramus:'12',om1:'12a',om2:'12b','lcx-dist':'13',lpl:'14',lpda:'15','rca-prox':'1','rca-mid':'2','rca-dist':'3',pda:'4',rpl:'16',rpl1:'16a',rpl2:'16b',rpl3:'16c'};
const COMMON=['lm','lad-prox','lad-mid','lad-apical','d1','d2','lcx-prox','ramus','om1','om2','lcx-dist','rca-prox','rca-mid','rca-dist'];
const REQUIRED={
 right:[...COMMON,'pda','rpl','rpl1','rpl2','rpl3'],
 left:[...COMMON,'lpl','lpda'],
 co:[...COMMON,'pda','rpl','rpl1','rpl2','rpl3','lpl'],
};
const FORBIDDEN={right:['lpl','lpda'],left:['pda','rpl','rpl1','rpl2','rpl3'],co:['lpda']};
const ENGLISH=/\b(artery|arteries|branch|branches|left|right|trunk|descending|vein|graft|circumflex|posterior descending|marginal artery|septal branch)\b/i;
const FAMILIES=['tci','da','cx','ri','cd','graft'];
const SEPTAL=/^s[0-9]$|^dp-s[0-9]$|^avn$|septal/; // deep branches (septum, AV node region) may run inside the myocardium

// ---- ImageCAS-X mean courses (derived statistics only) ------------------------------------------------------
const MEAN=loadMean();
const MEAN_KEY={lm:'lm','lad-prox':'lad','lad-mid':'lad','lad-apical':'lad',d1:'d1',d2:'d2','lcx-prox':'lcx','lcx-dist':'lcx',ramus:'ramus',om1:'om1',om2:'om2',lpl:'lpla',lpda:'lpda','rca-prox':'rca','rca-mid':'rca','rca-dist':'rca',pda:'rpda',rpl:'rpla'};
const MEAN_TOL={avg:7,max:12}; // mm, segment course vs the registered ImageCAS-X mean (before the epicardial fit)
check(MEAN.meta?.scansUsed>=700&&MEAN.meta?.scansUsedByDominance?.right>=600&&MEAN.meta?.scansUsedByDominance?.left>=30&&MEAN.meta?.scansUsedByDominance?.co>=20,'imagecas-mean.json: scan counts per dominance');
check(/CC BY 4\.0/.test(MEAN.meta?.license??'')&&/10\.5281\/zenodo\.21887809/.test(MEAN.meta?.source??''),'imagecas-mean.json: license and DOI');
check(Object.values(MEAN.groups).every(g=>Object.values(g.labels).every(l=>l.n>=3&&l.points.length===MEAN.meta.samples&&l.points.every(isVec))),'imagecas-mean.json: only mean courses (n >= 3 scans each, fixed sample count)');
check(!JSON.stringify(MEAN).includes('"scans"')||typeof MEAN.groups.right.scans==='number','imagecas-mean.json: no per-patient geometry');

// ---- heart asset ---------------------------------------------------------------------------------------
const heart=read('heart.json');
let heartBin=null,surface=null,union=null;
if(heart){
 check(heart.meta?.units==='mm','heart.json meta.units must be mm');
 check(typeof heart.meta?.frame==='string'&&heart.meta.frame.length>10,'heart.json meta.frame missing');
 check(Array.isArray(heart.meta?.transform?.isocentreAtlasMetres)&&heart.meta.transform.isocentreAtlasMetres.length===3,'heart.json meta.transform missing');
 check(typeof heart.meta?.layout==='object','heart.json meta.layout missing');
 check(Array.isArray(heart.parts)&&heart.parts.length>20,'heart.json parts missing');
 if(existsSync(new URL('heart.bin',dir))){
  const b=readFileSync(new URL('heart.bin',dir));heartBin=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
  check(heartBin.byteLength===heart.meta.bytes,`heart.bin size ${heartBin.byteLength} != meta.bytes ${heart.meta?.bytes}`);
  check(existsSync(new URL('heart.bin.gz',dir))&&gunzipSync(readFileSync(new URL('heart.bin.gz',dir))).equals(b),'heart.bin.gz must exist and inflate to heart.bin');
 }else check(false,'missing file heart.bin');
 const ids=new Set(),groups=new Set(['heart','great-vessel','skeleton']);
 const tris=[];
 for(const p of heart.parts??[]){
  check(!ids.has(p.id),`heart part id duplicated: ${p.id}`);ids.add(p.id);
  check(groups.has(p.group),`heart part ${p.id}: bad group ${p.group}`);
  check(typeof p.name==='string'&&p.name.length>0&&!ENGLISH.test(p.name),`heart part ${p.id}: Spanish name required (${p.name})`);
  check(p.vertexCount>0&&p.indexCount>0&&p.indexCount%3===0,`heart part ${p.id}: counts`);
  if(!heartBin)continue;
  const okRange=p.positions+p.vertexCount*12<=heartBin.byteLength&&p.normals+p.vertexCount*12<=heartBin.byteLength&&p.indices+p.indexCount*4<=heartBin.byteLength;
  check(okRange,`heart part ${p.id}: offsets outside heart.bin`);
  if(!okRange)continue;
  const pos=new Float32Array(heartBin,p.positions,p.vertexCount*3),idx=new Uint32Array(heartBin,p.indices,p.indexCount);
  let maxIdx=0;for(const i of idx)if(i>maxIdx)maxIdx=i;
  check(maxIdx<p.vertexCount,`heart part ${p.id}: index out of range`);
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<pos.length;i+=3)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],pos[i+k]);hi[k]=Math.max(hi[k],pos[i+k]);}
  check([0,1,2].every(k=>Math.abs(lo[k]-p.bounds[0][k])<1e-3&&Math.abs(hi[k]-p.bounds[1][k])<1e-3),`heart part ${p.id}: bounds do not match positions`);
  if(p.group==='heart'||p.group==='great-vessel'){
   if(p.group==='heart'||/aorta ascendente|raíz aórtica|tronco pulmonar/i.test(p.name)){
    for(let t=0;t<idx.length;t+=3)tris.push([0,1,2].map(k=>[pos[idx[t+k]*3],pos[idx[t+k]*3+1],pos[idx[t+k]*3+2]]));
   }
   union??=[[...lo],[...hi]];for(let k=0;k<3;k++){union[0][k]=Math.min(union[0][k],lo[k]);union[1][k]=Math.max(union[1][k],hi[k]);}
  }
 }
 for(const need of ['Pared ventricular','Aurícula izquierda','Aurícula derecha','Aorta ascendente','Cayado aórtico','Aorta descendente','Tronco pulmonar','Vena cava superior','Vena cava inferior','Esternón','Clavícula derecha','Clavícula izquierda']){
  check(heart.parts?.some(p=>p.name.startsWith(need)),`heart.json lacks part "${need}"`);
 }
 check(heart.parts?.filter(p=>p.group==='skeleton'&&/^Costilla/.test(p.name)).length>=20,'heart.json needs >= 20 ribs');
 check(heart.parts?.filter(p=>p.group==='skeleton'&&/^Cartílago costal/.test(p.name)).length>=10,'heart.json needs >= 10 costal cartilages');
 check(heart.parts?.filter(p=>p.group==='skeleton'&&/^Vértebra torácica/.test(p.name)).length===12,'heart.json needs 12 thoracic vertebrae');
 if(tris.length)surface=new Surface(tris,6);
}

// ---- coronary trees ------------------------------------------------------------------------------------
const trees={};
for(const dom of ['right','left','co']){
 const t=read(`coronary-${dom}.json`);trees[dom]=t;if(!t)continue;
 const tag=`coronary-${dom}`;
 check(t.meta?.units==='mm'&&t.meta?.dominance===dom,`${tag}: meta units/dominance`);
 for(const k of ['frame','isocentre','source','license','generator'])check(typeof t.meta?.[k]==='string'&&t.meta[k].length>3,`${tag}: meta.${k}`);
 check(/CC BY 4\.0/.test(t.meta?.license??''),`${tag}: license must name CC BY 4.0`);
 for(const k of ['lmOstium','rcaOstium','apex','crux','aorticRootCentre','lmBifurcation'])check(isVec(t.landmarks?.[k]),`${tag}: landmark ${k}`);
 check(Array.isArray(t.vessels)&&t.vessels.length>=30,`${tag}: needs >= 30 vessels (has ${t.vessels?.length})`);
 const byId=new Map(),segSyntax=new Map();
 for(const v of t.vessels??[]){
  check(!byId.has(v.id),`${tag}: duplicate vessel id ${v.id}`);byId.set(v.id,v);
 }
 for(const v of t.vessels??[]){
  const w=`${tag}/${v.id}`;
  check(typeof v.id==='string'&&/^[a-z0-9-]+$/.test(v.id),`${w}: id format`);
  check(typeof v.name==='string'&&v.name.length>0&&!ENGLISH.test(v.name),`${w}: Spanish name required (${v.name})`);
  check(typeof v.short==='string'&&v.short.length>0&&!ENGLISH.test(v.short),`${w}: Spanish short required (${v.short})`);
  check(['left','right'].includes(v.system),`${w}: system`);
  check(FAMILIES.includes(v.family)&&v.family!=='graft',`${w}: family`);
  check(v.parent===null||byId.has(v.parent),`${w}: parent ${v.parent} does not exist`);
  check(v.parent===null?v.parentArc===null:(typeof v.parentArc==='number'&&v.parentArc>=0&&v.parentArc<=1),`${w}: parentArc`);
  check(typeof v.source==='string'&&(/^(BodyParts3D|ImageCAS-X) /.test(v.source)||/^synthesised: /.test(v.source)),`${w}: source`);
  check(v.variant===undefined||v.variant==='ramus',`${w}: variant`);
  check(Array.isArray(v.points)&&Array.isArray(v.radii)&&v.points.length===v.radii.length&&v.points.length>=2,`${w}: points/radii length`);
  if(!Array.isArray(v.points)||!Array.isArray(v.radii))continue;
  check(v.points.every(isVec),`${w}: points must be finite vec3`);
  check(v.radii.every(r=>Number.isFinite(r)&&r>0&&r<4),`${w}: radii must be positive and < 4 mm`);
  // spacing: no jumps over 3 mm between consecutive samples
  let worst=0;for(let i=1;i<v.points.length;i++)worst=Math.max(worst,dist(v.points[i-1],v.points[i]));
  check(worst<=3.2,`${w}: sample spacing ${worst.toFixed(1)} mm exceeds 3.2`);
  // segments
  check(Array.isArray(v.segments)&&v.segments.length>=1,`${w}: needs segments`);
  for(const s of v.segments??[]){
   check(typeof s.id==='string'&&typeof s.syntax==='string'&&typeof s.name==='string'&&s.name.length>0&&!ENGLISH.test(s.name)&&typeof s.short==='string'&&s.short.length>0,`${w}/${s.id}: segment fields (${s.name})`);
   check(s.from>=0&&s.to<=1&&s.from<s.to,`${w}/${s.id}: from<to within 0..1`);
   check(!segSyntax.has(s.id),`${tag}: duplicate segment id ${s.id}`);segSyntax.set(s.id,s);
   if(SYNTAX[s.id])check(s.syntax===SYNTAX[s.id],`${tag}/${s.id}: SYNTAX must be ${SYNTAX[s.id]} (is ${s.syntax})`);
  }
 }
 // a child never has a larger lumen than its parent at the junction
 for(const c of t.vessels??[]){const par=c.parent&&byId.get(c.parent);if(!par||!c.radii?.length)continue;const pr=par.radii[Math.min(par.radii.length-1,Math.round(c.parentArc*(par.radii.length-1)))];check(c.radii[0]<=pr+0.05,`${tag}/${c.id}: first radius ${c.radii[0]} exceeds parent ${par.id} radius ${pr} at the junction`);}
 // cycles + attachment of children on parents
 for(const v of t.vessels??[]){
  const seen=new Set();let cur=v;while(cur&&!seen.has(cur.id)){seen.add(cur.id);cur=cur.parent?byId.get(cur.parent):null;}
  check(!cur,`${tag}/${v.id}: parent cycle`);
  if(v.parent&&byId.has(v.parent)&&Array.isArray(v.points)&&v.points.length){
   const par=byId.get(v.parent),hit=nearestOn(par.points,v.points[0]);
   check(hit.d<=1.0,`${tag}/${v.id}: starts ${hit.d.toFixed(2)} mm from parent ${v.parent}`);
   check(Math.abs(hit.t-v.parentArc)<=0.08,`${tag}/${v.id}: parentArc ${v.parentArc} vs nearest ${hit.t.toFixed(2)}`);
  }
 }
 // the course of each SYNTAX segment stays within tolerance of the ImageCAS-X mean after registration onto the heart
 {
  const reg=t.meta?.registration;
  check(!!reg&&LANDMARK_KEYS.every(k=>isVec(reg.targets?.[k]))&&reg.imagecasX?.doi==='10.5281/zenodo.21887809',`${tag}: meta.registration (targets, ImageCAS-X doi)`);
  if(reg&&LANDMARK_KEYS.every(k=>isVec(reg.targets?.[k]))){
   const R=makeRegistration(MEAN,dom,reg.targets);
   for(const v of t.vessels??[])for(const s of v.segments??[]){
    const key=s.id==='lpda'?'rpda':MEAN_KEY[s.id];if(!key||!SYNTAX[s.id])continue; // the left PDA runs down the same groove as the mean R-PDA course
    const c=R.course(key);check(!!c,`${tag}/${s.id}: no ImageCAS-X mean course for ${key}`);if(!c)continue;
    // left dominance: the LCx continues past the mean course along the posterior AV groove to the crux (chord from the mean end to the crux)
    let ref=c.points;if(dom==='left'&&s.id==='lcx-dist'){const e=c.points.at(-1),cr=R.placedLandmarks.crux,n=Math.ceil(dist(e,cr)/2);ref=[...c.points,...Array.from({length:n},(_,i)=>e.map((x,k)=>x+(cr[k]-x)*(i+1)/n))];}
    const ds=slice(v.points,s.from,s.to).map(p=>nearestOn(ref,p).d),avg=ds.reduce((a,b)=>a+b,0)/ds.length,mx=Math.max(...ds);
    check(avg<=MEAN_TOL.avg&&mx<=MEAN_TOL.max,`${tag}/${s.id}: ${avg.toFixed(1)} mm mean / ${mx.toFixed(1)} mm max from the ImageCAS-X mean course (limits ${MEAN_TOL.avg}/${MEAN_TOL.max})`);
   }
  }
 }
 for(const id of REQUIRED[dom])check(segSyntax.has(id),`${tag}: missing segment ${id}`);
 for(const id of FORBIDDEN[dom])check(!segSyntax.has(id),`${tag}: segment ${id} must not exist in ${dom} dominance`);
 check(segSyntax.get('lad-mid')?.syntax==='7',`${tag}: lad-mid`);
 {   // SYNTAX 6|7 is the D1 origin and 7|8 the D2 origin: the segment bounds follow where the branches leave the LAD
  const lad=byId.get('lad');
  for(const [child,seg,edge] of [['d1','lad-mid','from'],['d2','lad-apical','from']]){
   const c=byId.get(child),s=lad?.segments.find(x=>x.id===seg);
   if(c&&s)check(Math.abs(s[edge]-Math.min(0.7,Math.max(0.1,c.parentArc)))<=0.15&&s[edge]>0&&s[edge]<1,`${tag}: ${seg} ${edge} (${s[edge]}) near the ${child} origin (${c.parentArc})`);
  }
 }
 const ram=byId.get('ramus');check(ram?.variant==='ramus',`${tag}: ramus vessel must carry variant ramus`);
 check(t.vessels.filter(v=>v.variant==='ramus').length===1,`${tag}: exactly one ramus vessel`);
 // lumen: main trunks taper
 for(const id of ['lad','lcx','rca']){
  const v=byId.get(id);if(!v)continue;const n=v.radii.length,k=Math.max(2,Math.floor(n*0.2));
  const head=v.radii.slice(0,k).reduce((a,b)=>a+b,0)/k,tail=v.radii.slice(-k).reduce((a,b)=>a+b,0)/k;
  check(tail<head*0.85,`${tag}/${id}: must taper (head ${head.toFixed(2)} tail ${tail.toFixed(2)})`);
  const mx=Math.max(...v.radii);check(v.radii[0]>=mx*0.9,`${tag}/${id}: caliber should not exceed its ostial value`);
 }
 const lm=byId.get('lm');if(lm){check(Math.abs(lm.radii[0]*2-4.5)<=0.8,`${tag}/lm: ostial diameter ~4.5 mm (Dodge 1992)`);}
 const pl=byId.get('lad');if(pl)check(Math.abs(pl.radii[0]*2-3.6)<=0.7,`${tag}/lad: proximal diameter ~3.6 mm`);
 const px=byId.get('lcx');if(px)check(Math.abs(px.radii[0]*2-3.4)<=0.7,`${tag}/lcx: proximal diameter ~3.4 mm`);
 const rc=byId.get('rca');if(rc)check(Math.abs(rc.radii[0]*2-(dom==='left'?2.8:3.9))<=(dom==='left'?1:0.7),`${tag}/rca: proximal diameter`);
 // surface proximity
 if(surface){
  for(const v of t.vessels??[]){
   if(!Array.isArray(v.points))continue;
   const septal=SEPTAL.test(v.id);let worstD=0;
   for(const p of v.points){const c=surface.closest(p,60);worstD=Math.max(worstD,c?c.dist:99);}
   check(worstD<=(septal?26:5.5),`${tag}/${v.id}: ${worstD.toFixed(1)} mm from the heart surface (limit ${septal?26:5.5})`);
  }
  for(const k of ['rcaOstium','lmOstium']){const c=surface.closest(t.landmarks[k],30);check(c&&c.dist<=4,`${tag}: ${k} ${c?.dist.toFixed(1)} mm from the heart surface`);}
 }
 if(union){
  const pad=6;
  for(const v of t.vessels??[])for(const p of v.points??[])if(![0,1,2].every(k=>p[k]>=union[0][k]-pad&&p[k]<=union[1][k]+pad)){check(false,`${tag}/${v.id}: point outside heart.json bounds`);break;}
  check(true,'bounds ok');
 }
 // landmark consistency
 const rca=byId.get('rca'),lad=byId.get('lad');
 if(rca)check(dist(t.landmarks.rcaOstium,rca.points[0])<=0.5,`${tag}: rcaOstium must be the first RCA point`);
 if(lm)check(dist(t.landmarks.lmOstium,lm.points[0])<=0.5,`${tag}: lmOstium must be the first LM point`);
 if(lm)check(dist(t.landmarks.lmBifurcation,lm.points.at(-1))<=0.5,`${tag}: lmBifurcation must be the last LM point`);
 if(lad&&byId.get('lcx'))check(dist(lad.points[0],byId.get('lcx').points[0])<=1&&dist(lad.points[0],t.landmarks.lmBifurcation)<=1,`${tag}: LAD and LCx start at the bifurcation`);
}

// ---- S18: orientation, calibration against CARDIAG, ostia, left-dominant loop -----------------------------------------
{
 const CF=read('../../../scripts/angio/data/cardiag-features.json');
 check(!!CF&&/CC BY 4\.0/.test(CF.meta?.license??'')&&/10\.5281\/zenodo\.19958730/.test(CF.meta?.source??''),'cardiag-features.json: license and DOI');
 check(!!CF&&!/image|"case"|patient_id/i.test(JSON.stringify(CF.cells??{})),'cardiag-features.json: only aggregated cells (no images, no per-patient fields)');
 check(!!CF&&CF.meta.cases>=600&&CF.meta.centres>=5,'cardiag-features.json: 645 cases from 5 centres');
 const MAP={'01':['rca','rca-prox'],'02':['rca','rca-mid'],'04':['pda','pda'],'05':['lm','lm'],'06':['lad','lad-prox'],'07':['lad','lad-mid'],'11':['lcx','lcx-prox']};
 const R=trees.right;
 const ends=seg=>{const [vid,sid]=MAP[seg],v=R?.vessels.find(x=>x.id===vid),sg=v?.segments.find(x=>x.id===sid);if(!v||!sg)return null;const at=t=>{const c=[0];for(let i=1;i<v.points.length;i++)c.push(c[i-1]+dist(v.points[i-1],v.points[i]));const sx=t*c.at(-1);let j=0;while(j<v.points.length-2&&c[j+1]<sx)j++;const f=(sx-c[j])/((c[j+1]-c[j])||1);return v.points[j].map((x,k)=>x+(v.points[j+1][k]-x)*f);};const w=sg.to-sg.from;return [at(sg.from+0.05*w),at(sg.to-0.05*w)];};
 const predict=(seg,a,b)=>{const e=ends(seg),ax=G.imageAxes(a,b),P=e.map(p=>G.projectWith(ax,p));return Math.atan2(P[1].y-P[0].y,P[1].x-P[0].x)*180/Math.PI;};
 const adiff=(a,b)=>{let d=((a-b)%360+360)%360;return d>180?360-d:d;};
 if(CF&&R){
  let tot=0,n=0;const per={};
  for(const [seg,cells] of Object.entries(CF.cells)){if(!MAP[seg])continue;let t=0,m=0;for(const c of cells){const e=adiff(predict(seg,c.primary,c.secondary),c.dirDeg);t+=e*c.n;m+=c.n;}per[seg]=t/m;tot+=t;n+=m;check(t/m<=25,`S18 calibration: segment ${seg} (${MAP[seg][1]}) projects ${(t/m).toFixed(1)} deg off the CARDIAG cell means (limit 25)`);}
  check(tot/n<=15,`S18 calibration: mean angle error vs CARDIAG cell means ${(tot/n).toFixed(1)} deg (limit 15; ImageCAS-X Procrustes tree was 21.9)`);
  // the proximal RCA at OAI 40 / CAU 2 leaves the ostium almost horizontally to the screen left, then forms the C
  const rc=CF.cells['01'].find(c=>c.primary===40&&c.secondary===0);
  check(!!rc&&adiff(predict('01',40,-2),rc.dirDeg)<=20,`S18: proximal RCA direction at OAI 40 CAU 2 is ${predict('01',40,-2).toFixed(0)} deg, CARDIAG ${rc?.dirDeg} deg (tolerance 20)`);
  const d=predict('01',40,-2);check(Math.cos(d*Math.PI/180)<-0.7&&Math.sin(d*Math.PI/180)<0.1,'S18: proximal RCA at OAI 40 CAU 2 points to the screen left and not up');
  // the left coronary arteries leave the root to the screen left/right as the observed cells (LM heads to the screen right in OAI)
  check(adiff(predict('06',-20,-20),CF.cells['06'].find(c=>c.primary===-20&&c.secondary===-20).dirDeg)<=20,'S18: proximal LAD direction at OAD 20 CAU 20');
 }
 for(const dom of ['right','left','co']){
  const t=trees[dom];if(!t)continue;
  const reg=t.meta?.registration;
  check(Array.isArray(reg?.rotationDeg)&&reg.rotationDeg.every(x=>Math.abs(x)<=6)&&/translat/i.test(reg?.method??''),`coronary-${dom}: orientation of the ImageCAS-X mean is kept (no per-case rotation; global correction <= 6 deg)`);
  const lm=t.landmarks.lmOstium,rc=t.landmarks.rcaOstium;
  // ImageCAS-X (781 scans): LM ostium is 16.5 mm (p10 10.5, p90 23.0) higher and 13.9 mm (p10 7, p90 20.7) further left than the RCA ostium
  check(lm[1]-rc[1]>=5&&lm[1]-rc[1]<=24,`coronary-${dom}: LM ostium ${(lm[1]-rc[1]).toFixed(1)} mm higher than the RCA ostium (ImageCAS-X range 5-24)`);
  check(lm[0]-rc[0]>=5&&lm[0]-rc[0]<=25,`coronary-${dom}: LM ostium ${(lm[0]-rc[0]).toFixed(1)} mm left of the RCA ostium (ImageCAS-X range 5-25)`);
  const san=t.vessels.find(v=>v.id==='san');if(san){let L=0;for(let i=1;i<san.points.length;i++)L+=dist(san.points[i-1],san.points[i]);check(L<=32,`coronary-${dom}/san: ${L.toFixed(0)} mm long (short, curved branch, limit 32)`);}
 }
 // left dominance: the LCx follows the posterior AV groove to the crux and gives the left PDA there
 if(trees.left&&trees.right){
  const lc=trees.left.vessels.find(v=>v.id==='lcx'),lp=trees.left.vessels.find(v=>v.id==='lpda'),rcaEnd=trees.right.vessels.find(v=>v.id==='rca').points.at(-1);
  if(lc&&lp){
   check(dist(lc.points.at(-1),rcaEnd)<=10,`S18 left dominance: LCx ends ${dist(lc.points.at(-1),rcaEnd).toFixed(1)} mm from the crux (right-dominant RCA end), limit 10`);
   check(dist(lp.points[0],lc.points.at(-1))<=1.5,'S18 left dominance: the left PDA starts at the end of the LCx');
   check(lp.points.at(-1)[1]<lp.points[0][1]-1,'S18 left dominance: the left PDA descends from the crux');
   // at OAI 40 CAU 2 the LCx runs along the bottom toward the screen left: its distal third is a long, nearly horizontal run
   const ax=G.imageAxes(40,-2),P=lc.points.map(p=>G.projectWith(ax,p)),n=P.length,seg=P.slice(Math.floor(n*0.78));
   const dx=seg.at(-1).x-seg[0].x,dy=seg.at(-1).y-seg[0].y;
   check(dx<-20&&Math.abs(dy)<0.45*Math.abs(dx),`S18 left dominance: LCx distal run at OAI 40 CAU 2 goes ${dx.toFixed(0)} mm to the screen left with ${dy.toFixed(0)} mm of drop (needs dx < -20 and a nearly horizontal course)`);
  }
 }
 if(heart){
  const df=heart.meta?.deformation;
  check(!!df&&/ICP/.test(df.method??'')&&df.rigidRotationDeg<=12&&df.fit?.treeToEpicardiumMm?.max<=4&&df.fit?.ostiaToWallMm?.every(v=>v<=3),'S18: heart.json meta.deformation (heart deformed to the tree, small rigid part, vessels within 4 mm of the epicardium, ostia within 3 mm of the aortic wall)');
 }
}

// ---- grafts --------------------------------------------------------------------------------------------
const gr=read('grafts-right.json');
if(gr){
 check(gr.meta?.units==='mm'&&gr.meta?.dominance==='right','grafts-right: meta');
 check(/synthesised/.test(gr.meta?.source??''),'grafts-right: meta.source must say synthesised');
 const want={lima:{name:/mamaria/i,target:'lad',startsAt:'subclavian'},'svg-om':{name:/Puente venoso a OM/,target:'om1',startsAt:'aorta'},'svg-pda':{name:/Puente venoso a DP/,target:'pda',startsAt:'aorta'}};
 check(gr.vessels?.length===3,'grafts-right: three grafts');
 const rt=trees.right;
 for(const v of gr.vessels??[]){
  const w=`grafts-right/${v.id}`,spec=want[v.id];check(!!spec,`${w}: unexpected id`);if(!spec)continue;
  check(v.system==='graft'&&v.family==='graft',`${w}: system/family graft`);
  check(spec.name.test(v.name)&&!ENGLISH.test(v.name),`${w}: Spanish name (${v.name})`);
  check(v.segments?.length===1&&v.segments[0].id===v.id&&v.segments[0].from===0&&v.segments[0].to===1,`${w}: one segment with its own id`);
  check(v.points.length===v.radii.length&&v.points.length>=2&&v.radii.every(r=>r>0&&r<4),`${w}: points/radii`);
  check(/^synthesised: /.test(v.source),`${w}: source synthesised`);
  let worst=0;for(let i=1;i<v.points.length;i++)worst=Math.max(worst,dist(v.points[i-1],v.points[i]));check(worst<=3.2,`${w}: spacing`);
  if(surface){let minD=99;const m=v.points.length;v.points.forEach((p,i)=>{const s=Math.min(i,m-1-i)*1.5;if(s>=14)minD=Math.min(minD,surface.closest(p,60).dist);});check(minD>=2,`${w}: passes ${minD.toFixed(1)} mm from the heart surface (graft must not cut the myocardium, >= 2 mm)`);}
  if(!rt)continue;
  const target=rt.vessels.find(x=>x.id===spec.target);
  if(target)check(nearestOn(target.points,v.points.at(-1)).d<=2,`${w}: must end on ${spec.target} (<= 2 mm)`);
  if(spec.startsAt==='aorta'){
   const A=rt.landmarks.aorticRootCentre;
   // ascending aorta lies above the root centre; the graft origin must be on the anterior aortic wall 30–70 mm above the valve plane
   const s=v.points[0];check(s[1]-A[1]>=15&&s[1]-A[1]<=75&&dist([s[0],0,s[2]],[A[0],0,A[2]])<=40,`${w}: starts on the ascending aorta`);
   if(heart){const asc=heart.parts.find(p=>p.name.startsWith('Aorta ascendente'));if(asc&&heartBin){const pos=new Float32Array(heartBin,asc.positions,asc.vertexCount*3),idx=new Uint32Array(heartBin,asc.indices,asc.indexCount),tr=[];for(let t=0;t<idx.length;t+=3)tr.push([0,1,2].map(k=>[pos[idx[t+k]*3],pos[idx[t+k]*3+1],pos[idx[t+k]*3+2]]));const c=new Surface(tr,6).closest(s,30);check(c.dist<=4,`${w}: origin ${c.dist.toFixed(1)} mm from the ascending aorta`);}}
  }else{
   const sub=heart?.parts.find(p=>p.name.startsWith('Arteria subclavia izquierda'));
   check(!!sub,'heart.json lacks Arteria subclavia izquierda');
   if(sub&&heartBin){const pos=new Float32Array(heartBin,sub.positions,sub.vertexCount*3),idx=new Uint32Array(heartBin,sub.indices,sub.indexCount),tr=[];for(let t=0;t<idx.length;t+=3)tr.push([0,1,2].map(k=>[pos[idx[t+k]*3],pos[idx[t+k]*3+1],pos[idx[t+k]*3+2]]));const c=new Surface(tr,6).closest(v.points[0],30);check(c.dist<=4,`${w}: origin ${c.dist.toFixed(1)} mm from the left subclavian artery`);}
  }
 }
}else check(false,'missing grafts-right.json');

// ---- size budget ---------------------------------------------------------------------------------------
let gz=0;
for(const f of ['coronary-right.json','coronary-left.json','coronary-co.json','grafts-right.json','heart.json','heart.bin'])if(existsSync(new URL(f,dir)))gz+=gzipSync(readFileSync(new URL(f,dir)),{level:9}).byteLength;
check(gz<=3*1024*1024,`asset size budget: ${(gz/1048576).toFixed(2)} MB gz exceeds 3 MB`);
check(gz>0,'no assets found');

const real=failures.filter(Boolean);
if(failures.length){console.error(`validate-angio: FAILED ${failures.length} of ${checks} checks`);for(const f of real)console.error(' -',f);if(failures.length>real.length)console.error(` - … ${failures.length-real.length} more`);process.exit(1);}
console.log(`validate-angio: ${checks} checks passed (assets ${(gz/1048576).toFixed(2)} MB gz)`);
