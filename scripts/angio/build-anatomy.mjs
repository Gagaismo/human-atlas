// Builds the angiography anatomy assets in public/models/angio/ from the BodyParts3D meshes already in the atlas
// (© DBCLS, CC BY 4.0) and published measurements (Dodge 1988 positions, Dodge 1992 calibers). Own data: nothing
// is taken from angioview.com. Usage: node scripts/angio/build-anatomy.mjs
import {writeFileSync,mkdirSync} from 'node:fs';
import {atlasParts,loadPart} from './lib-atlas.mjs';
import {extractCenterline,smoothResample} from './lib-centerline.mjs';
import {Surface,trisOf,hullCentroid} from './lib-geom.mjs';
import {add,sub,mul,dot,unit,lerp,dist,pointAt,nearestOn,spline,smooth,resample,len} from './lib-curves.mjs';
import {buildTree} from './lib-tree.mjs';
import {buildHeartAsset,toFrame as meshToFrame} from './lib-heart.mjs';

const out=new URL('../../public/models/angio/',import.meta.url);
mkdirSync(out,{recursive:true});

// ---- 1. centrelines of every coronary piece (atlas millimetres) -------------------------------------------
const pieceIds=atlasParts.filter(p=>p.chunk===9&&p.system==='arterial'&&/coronary|interventricular|circumflex|conus artery/i.test(p.name)).map(p=>p.id);
const raw=new Map();
for(const id of pieceIds){
 const {positions,indices}=loadPart(id);

 const cl=extractCenterline(positions,indices,.002).map(c=>({p:c.p.map(x=>x*1000),r:c.r*1000}));
 if(cl.length<2)continue;
 raw.set(id,smoothResample(cl,1.5).map(c=>c.p));
}

// ---- 2. isocentre: volume centroid of the convex hull of heart walls, aorta, pulmonary trunk, coronaries ------
const heartIds=['FJ2428','FJ2438','FJ2439','FJ3413','FJ2966'];
const hullPts=[];
for(const id of heartIds){const {positions}=loadPart(id);for(let i=0;i<positions.length;i+=3)hullPts.push([positions[i]*1000,positions[i+1]*1000,positions[i+2]*1000]);}
for(const pts of raw.values())hullPts.push(...pts);
const {centroid:iso,volume:hullVolume}=hullCentroid(hullPts);
const toFrame=p=>[p[0]-iso[0],p[1]-iso[1],p[2]-iso[2]];
const frameTris=id=>{const {positions,indices}=loadPart(id);return trisOf(positions,indices,1000).map(t=>t.map(toFrame));};

// ---- 3. surfaces and landmarks (isocentre frame) ------------------------------------------------------------
const epi=new Surface(['FJ2428','FJ2438','FJ2439','FJ3413','FJ2966'].flatMap(frameTris),6);
const aortaSurf=new Surface(frameTris('FJ3413'),6);
const outward=c=>dot(c.normal,c.point)<0?mul(c.normal,-1):c.normal;
const lay=(p,off)=>{const c=epi.closest(p,60);return add(c.point,mul(outward(c),off));};
const centroidOf=ids=>{let s=[0,0,0],n=0;for(const id of ids){const {positions}=loadPart(id);for(let i=0;i<positions.length;i+=3){s=add(s,toFrame([positions[i]*1000,positions[i+1]*1000,positions[i+2]*1000]));n++;}}return mul(s,1/n);};
const aorticRootCentre=centroidOf(['FJ2426','FJ2431','FJ2435']);
let apex=null;{const {positions}=loadPart('FJ2428');let best=-1;for(let i=0;i<positions.length;i+=3){const p=toFrame([positions[i]*1000,positions[i+1]*1000,positions[i+2]*1000]),d=dist(p,aorticRootCentre);if(d>best){best=d;apex=p;}}}
// SVC base: lowest 8 % of the superior vena cava vertices
let sanEnd;{const {positions}=loadPart('FJ3645');const ys=[];for(let i=0;i<positions.length;i+=3)ys.push(positions[i+1]*1000);ys.sort((a,b)=>a-b);const cut=ys[Math.floor(ys.length*0.08)];let s=[0,0,0],n=0;for(let i=0;i<positions.length;i+=3)if(positions[i+1]*1000<=cut){s=add(s,toFrame([positions[i]*1000,positions[i+1]*1000,positions[i+2]*1000]));n++;}sanEnd=lay(mul(s,1/n),0.9);}
const cruxAtlas=raw.get('FJ2692')?.at(-1);
const avnTarget=add(toFrame(cruxAtlas),[-4,14,6]);

const framePieces=new Map([...raw].map(([id,pts])=>[id,pts.map(toFrame)]));
const piece=(id,{rev=false,from,to}={})=>{
 const pts=framePieces.get(id);if(!pts)throw new Error(`no centreline for ${id}`);
 let r=pts;if(from!==undefined||to!==undefined)r=pts.slice(from??0,to??pts.length);
 return (rev?[...r].reverse():[...r]).map(p=>[...p]);
};
const ctx={piece,lay,epi,toFrame,aorticRootCentre,apex,avnTarget,sanEnd};

// ---- 4. trees ---------------------------------------------------------------------------------------------
const SRC='BodyParts3D © DBCLS (https://lifesciencedb.jp/bp3d/), CC BY 4.0; Dodge JT Jr et al., Circulation 1988;78:1167 (segment positions) and 1992;86:232 (lumen calibers)';
const meta=dominance=>({units:'mm',frame:'X = patient left, Y = superior, Z = anterior; origin = isocentre = volume centroid of the convex hull of the heart (ventricle wall, atrial walls, ascending aorta, pulmonary trunk, coronary arteries)',dominance,isocentre:`atlas millimetres [${iso.map(v=>v.toFixed(3)).join(', ')}] (atlas metres = frame/1000 + isocentre/1000; frame = (atlas*1000 - isocentre), same axes, no rotation)`,source:SRC,license:'Derived from BodyParts3D (CC BY 4.0, attribution required: "BodyParts3D, © The Database Center for Life Science, licensed under CC Attribution-Share Alike 4.0 International"); this derived data is released under the same CC BY 4.0 terms',generator:'scripts/angio/build-anatomy.mjs'});
const trees={};
for(const dominance of ['right','left','co']){
 const {vessels,landmarks}=buildTree(dominance,ctx);
 const lm=v=>Object.fromEntries(Object.entries(v).map(([k,p])=>[k,p.map(x=>+x.toFixed(2))]));
 trees[dominance]={meta:meta(dominance),vessels,landmarks:lm(landmarks)};
 writeFileSync(new URL(`coronary-${dominance}.json`,out),JSON.stringify(trees[dominance])+'\n');
}

// ---- 5. grafts (synthesised courses on the right-dominant tree) ---------------------------------------------
const R=trees.right,vessel=id=>R.vessels.find(v=>v.id===id);
// graft waypoint: project a point lying clearly outside (30 mm radially out) onto the epicardium and stand `off` mm off it
const shell=(p,off)=>{const q=add(p,mul(unit(p),30)),c=epi.closest(q,80);return add(c.point,mul(c.normal,Math.sign(dot(sub(q,c.point),c.normal))*off));};
const radial=shell;
// outward side for a point that should lie outside: the side of the nearest surface triangle it is on
const sideOut=(p,c)=>{const s=dot(sub(p,c.point),c.normal);return Math.abs(s)>0.05?mul(c.normal,Math.sign(s)):outward(c);};
const keepOut=(pts,minD=3.5)=>{const cum=[0];for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+dist(pts[i-1],pts[i]));const total=cum.at(-1);return pts.map((p,i)=>{const w=Math.min(1,Math.min(cum[i],total-cum[i])/14),m=minD*w,c=epi.closest(p,60);return c.dist<m?add(c.point,mul(sideOut(p,c),m)):p;});};
function graft({id,name,short,way,r0,r1,source,target,keep=true}){
 let pts=spline(way,1.5);
 if(keep){for(let it=0;it<12;it++){pts=keepOut(pts,4.5);pts=smooth(pts,1,1);}pts=resample(smooth(keepOut(pts,5.0),3,2),1.5);}
 pts[0]=way[0];pts[pts.length-1]=way.at(-1);
 const n=pts.length;
 return {id,name,short,system:'graft',family:'graft',parent:null,parentArc:null,points:pts.map(p=>p.map(x=>+x.toFixed(2))),radii:pts.map((_,i)=>+(r0+(r1-r0)*i/(n-1)).toFixed(3)),segments:[{id,syntax:'',name,short,from:0,to:1}],source,target};
}
// LIMA: BodyParts3D left internal thoracic artery (FJ1972) from the left subclavian down the chest wall, then to the mid LAD
const lita=(()=>{const {positions,indices}=loadPart('FJ1972');const cl=smoothResample(extractCenterline(positions,indices,.002).map(c=>({p:c.p.map(x=>x*1000),r:c.r*1000})),1.5).map(c=>toFrame(c.p));return cl[0][1]>cl.at(-1)[1]?cl:cl.reverse();})();
const ladTarget=pointAt(vessel('lad').points,0.58);
const cut=lita.findIndex(p=>p[1]<=ladTarget[1]+24);
const litaTop=lita.slice(0,cut>0?cut:lita.length);
const limaWay=[...litaTop.filter((_,i)=>i%6===0||i===litaTop.length-1),shell(lerp(litaTop.at(-1),ladTarget,0.6),9),shell(ladTarget,6),ladTarget];
const lima=graft({id:'lima',name:'Arteria mamaria interna izquierda (AMI)',short:'AMI',way:limaWay,r0:1.3,r1:1.0,source:'synthesised: BodyParts3D FJ1972 (left internal thoracic artery) centreline from the left subclavian artery, then a spline to the mid LAD (arc 0.58); plausible course, not patient data'});
// SVG to OM1 and to the PDA: from the anterior ascending aorta wall, 8–12 mm off the epicardium
const aortaStart=q=>aortaSurf.closest(add(aorticRootCentre,q),40).point;
const sA=aortaStart([6,36,12]),sB=aortaStart([-8,38,12]);
// first waypoint straight out of the aortic wall (away from the aortic axis), so the graft leaves the wall perpendicularly
const outOfAorta=(p,off)=>{const n=aortaSurf.closest(p,10).normal,h=[p[0]-aorticRootCentre[0],0,p[2]-aorticRootCentre[2]];return add(p,mul(n,Math.sign(dot(n,h))*off));};
const om1T=pointAt(vessel('om1').points,0.5);
const svgOm=graft({id:'svg-om',name:'Puente venoso a OM',short:'PV-OM',way:[sA,outOfAorta(sA,10),...[0.15,0.25,0.35,0.45,0.55,0.65,0.75,0.85].map(t=>shell(lerp(sA,om1T,t),10-4*t)),shell(om1T,6),om1T],r0:2.0,r1:1.7,source:'synthesised: saphenous vein graft spline from the anterior ascending aorta to OM1 (arc 0.50), kept 3.5 mm off the epicardium; plausible course, not patient data'});
const rcaV=vessel('rca'),pdaT=pointAt(vessel('pda').points,0.35);
const svgPda=graft({id:'svg-pda',name:'Puente venoso a DP',short:'PV-DP',way:[sB,outOfAorta(sB,10),...[0.05,0.15,0.25,0.35,0.45,0.55,0.65,0.75,0.85,0.95].map(t=>shell(pointAt(rcaV.points,t),9)),...[0.2,0.4,0.6,0.8].map(t=>shell(lerp(pointAt(rcaV.points,1),pdaT,t),8)),shell(pdaT,6),pdaT],r0:2.0,r1:1.7,source:'synthesised: saphenous vein graft spline from the anterior ascending aorta along the right AV groove and the inferior wall to the PDA (arc 0.35), kept 3.5 mm off the epicardium; plausible course, not patient data'});
const graftMeta={...meta('right'),dominance:'right',source:`${SRC}; grafts are synthesised`};
const strip=g=>{const {target,...rest}=g;return rest;};
writeFileSync(new URL('grafts-right.json',out),JSON.stringify({meta:graftMeta,vessels:[lima,svgOm,svgPda].map(strip)})+'\n');

// ---- 6. heart + great vessels + thoracic skeleton ------------------------------------------------------------
const heart=await buildHeartAsset(out,iso,{units:'mm',frame:trees.right.meta.frame,transform:{isocentreAtlasMetres:iso.map(v=>+(v/1000).toFixed(6)),isocentreAtlasMillimetres:iso.map(v=>+v.toFixed(3)),rule:'frame_mm = atlas_metres * 1000 - isocentreAtlasMillimetres (translation only; axes unchanged)',hullVolumeMm3:Math.round(hullVolume)},source:'BodyParts3D © DBCLS, CC BY 4.0 (decimated)',license:trees.right.meta.license,generator:'scripts/angio/build-anatomy.mjs'});

for(const [k,t] of Object.entries(trees)){const syn=t.vessels.filter(v=>v.source.startsWith('synthesised'));console.log(`${k}: ${t.vessels.length} vessels, ${t.vessels.length-syn.length} from BodyParts3D centrelines, ${syn.length} synthesised: ${syn.map(v=>v.id).join(', ')}`);}
const counts=Object.fromEntries(Object.entries(trees).map(([k,t])=>[k,t.vessels.length]));
console.log('isocentre (atlas mm):',iso.map(v=>v.toFixed(2)).join(', '));
console.log('vessels per dominance:',JSON.stringify(counts));
console.log('heart parts:',heart.parts.length,'triangles',heart.meta.triangles,'of',heart.meta.sourceTriangles,'bytes',heart.meta.bytes,'gz',heart.meta.gzipBytes);
