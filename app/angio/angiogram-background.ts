// Stand-in fluoroscopy background of the angiogram: grey field with the projected heart silhouette, the diaphragm dome,
// the spine and faint ribs. Everything is procedural from the C-arm angles and uses the same projection as the vessels,
// so it moves consistently with them. Canvas 2D, grey only (the red channel is what the compositor reads).
import {DETECTOR_SIZE,imageAxes,projectWith} from './core/geometry';
import type {CoronaryTree,Vec3} from './core/types';

type P2=[number,number];
const cross=(o:P2,p:P2,q:P2)=>(p[0]-o[0])*(q[1]-o[1])-(p[1]-o[1])*(q[0]-o[0]);

/** Convex hull (monotone chain), counter-clockwise. */
export function convexHull(points:readonly P2[]):P2[]{
 const pts=[...points].sort((p,q)=>p[0]-q[0]||p[1]-q[1]);
 if(pts.length<3)return pts;
 const lower:P2[]=[],upper:P2[]=[];
 for(const p of pts){while(lower.length>1&&cross(lower[lower.length-2],lower[lower.length-1],p)<=0)lower.pop();lower.push(p);}
 for(let i=pts.length-1;i>=0;i--){const p=pts[i];while(upper.length>1&&cross(upper[upper.length-2],upper[upper.length-1],p)<=0)upper.pop();upper.push(p);}
 lower.pop();upper.pop();
 return lower.concat(upper);
}

const clouds=new WeakMap<CoronaryTree,Vec3[]>();
/** 3D points whose projected hull stands in for the heart: the whole coronary tree (grafts excluded) pushed outwards from its centroid. */
export function heartCloud(tree:CoronaryTree):Vec3[]{
 let cloud=clouds.get(tree);
 if(cloud)return cloud;
 const raw:Vec3[]=[];
 for(const v of tree.vessels)if(v.system!=='graft')for(let i=0;i<v.points.length;i+=2)raw.push(v.points[i]);
 const L=tree.landmarks;
 raw.push(L.apex,L.crux,L.aorticRootCentre,L.lmOstium,L.rcaOstium);
 const c:Vec3=[0,0,0];
 for(const p of raw){c[0]+=p[0];c[1]+=p[1];c[2]+=p[2];}
 for(let k=0;k<3;k++)c[k]/=Math.max(raw.length,1);
 cloud=raw.map(p=>[c[0]+(p[0]-c[0])*1.3,c[1]+(p[1]-c[1])*1.25,c[2]+(p[2]-c[2])*1.3]);
 clouds.set(tree,cloud);
 return cloud;
}

// Anatomy of the stand-in, patient frame (mm). The midline sits to the right of the heart's isocentre.
const MIDLINE_X=-40,SPINE_Z=-105,SPINE_HALF_WIDTH=19;
const DOME={c:[0,-125,-15] as Vec3,rx:160,ry:70,rz:125};

const rad=Math.PI/180;
function domeHull(toPx:(p:Vec3)=>[number,number,number]):P2[]{
 const pts:P2[]=[];
 for(let i=0;i<24;i++){
  const th=i/24*Math.PI*2;
  for(const lat of [0,35,65,90]){
   const cl=Math.cos(lat*rad),sl=Math.sin(lat*rad);
   const p:Vec3=[DOME.c[0]+DOME.rx*cl*Math.cos(th),DOME.c[1]+DOME.ry*sl,DOME.c[2]+DOME.rz*cl*Math.sin(th)];
   const q=toPx(p);pts.push([q[0],q[1]]);
   if(lat===0){const w=toPx([p[0],-420,p[2]]);pts.push([w[0],w[1]]);}
  }
 }
 return convexHull(pts);
}

/** Paint the background for angles (a,b) and table pan (detector-normalised, ±1 = half detector) onto a square canvas. */
export function paintBackground(ctx:CanvasRenderingContext2D,S:number,a:number,b:number,pan:readonly [number,number],cloud:readonly Vec3[]|null):void{
 const ax=imageAxes(a,b),h=DETECTOR_SIZE/2;
 const toPx=(p:Vec3):[number,number,number]=>{
  const q=projectWith(ax,p);
  return [(q.x/h+pan[0]+1)/2*S,(1-(q.y/h+pan[1]))/2*S,q.m*S/DETECTOR_SIZE];  // third: pixels per mm at that depth
 };
 ctx.save();
 ctx.globalAlpha=1;ctx.shadowBlur=0;
 // Lung field: brighter at the periphery, slightly darker towards the mediastinum.
 const g=ctx.createRadialGradient(S*(.5+pan[0]/2),S*(.5-pan[1]/2),S*.05,S*.5,S*.5,S*.78);
 g.addColorStop(0,'#8e8e8e');g.addColorStop(1,'#b4b4b4');
 ctx.fillStyle=g;ctx.fillRect(0,0,S,S);
 const blur=S*.025;
 const fillPoly=(poly:P2[],color:string,soft:number)=>{
  if(poly.length<3)return;
  ctx.save();ctx.shadowColor=color;ctx.shadowBlur=soft;ctx.shadowOffsetX=S*4;ctx.translate(-S*4,0);  // shadow-only trick keeps the edge soft
  ctx.fillStyle='#000';ctx.beginPath();poly.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fill();ctx.restore();
 };
 // Diaphragm dome: denser (darker) tissue under it.
 fillPoly(domeHull(toPx),'rgba(60,60,60,.55)',blur*1.4);
 // Mediastinum + heart silhouette.
 if(cloud&&cloud.length){
  const hull=convexHull(cloud.map(p=>{const q=toPx(p);return [q[0],q[1]] as P2;}));
  const c:P2=[0,0];hull.forEach(p=>{c[0]+=p[0];c[1]+=p[1];});c[0]/=Math.max(hull.length,1);c[1]/=Math.max(hull.length,1);
  fillPoly(hull.map(p=>[c[0]+(p[0]-c[0])*1.22,c[1]+(p[1]-c[1])*1.12] as P2),'rgba(70,70,70,.22)',blur*3);
  fillPoly(hull,'rgba(58,58,58,.48)',blur);
 }
 // Spine: a vertical band; its position follows the rotation (over the midline at AP, swinging aside in obliques).
 // Bone attenuates more than soft tissue, so on this display (contrast dark, lungs bright) it is darker.
 {
  const top=toPx([MIDLINE_X,330,SPINE_Z]),bot=toPx([MIDLINE_X,-330,SPINE_Z]),w=SPINE_HALF_WIDTH*2*top[2];
  ctx.save();ctx.lineCap='butt';
  ctx.strokeStyle='rgba(0,0,0,.13)';ctx.lineWidth=w;ctx.shadowColor='rgba(0,0,0,.14)';ctx.shadowBlur=blur*.8;
  ctx.beginPath();ctx.moveTo(top[0],top[1]);ctx.lineTo(bot[0],bot[1]);ctx.stroke();
  ctx.shadowBlur=0;ctx.strokeStyle='rgba(0,0,0,.08)';ctx.lineWidth=Math.max(1.5,w*.12);
  for(const s of [-1,1]){
   const t=toPx([MIDLINE_X+s*SPINE_HALF_WIDTH*ax.u[0],330+s*SPINE_HALF_WIDTH*ax.u[1],SPINE_Z+s*SPINE_HALF_WIDTH*ax.u[2]]);
   const bt=toPx([MIDLINE_X+s*SPINE_HALF_WIDTH*ax.u[0],-330+s*SPINE_HALF_WIDTH*ax.u[1],SPINE_Z+s*SPINE_HALF_WIDTH*ax.u[2]]);
   ctx.beginPath();ctx.moveTo(t[0],t[1]);ctx.lineTo(bt[0],bt[1]);ctx.stroke();
  }
  // Disc spaces as faint lighter steps between the vertebral bodies.
  ctx.fillStyle='rgba(255,255,255,.05)';
  for(let k=-7;k<=7;k++){const q=toPx([MIDLINE_X,k*38,SPINE_Z]);ctx.fillRect(q[0]-w*.5,q[1]-q[2]*2,w,q[2]*4);}
  ctx.restore();
 }
 // Ribs: tilted elliptical hoops around the chest, drawn as faint lines.
 ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
 for(let k=0;k<8;k++){
  const y0=-110+k*42;
  for(const [col,off] of [['rgba(0,0,0,.07)',0],['rgba(255,255,255,.04)',9]] as const){
   ctx.strokeStyle=col;
   ctx.beginPath();
   for(let i=0;i<=56;i++){
    const th=i/56*Math.PI*2,x=MIDLINE_X+170*Math.cos(th),z=-10+135*Math.sin(th);
    const q=toPx([x,y0-0.32*z+off,z]);
    if(i)ctx.lineTo(q[0],q[1]);else ctx.moveTo(q[0],q[1]);
    if(i===0)ctx.lineWidth=Math.max(2,q[2]*6);
   }
   ctx.stroke();
  }
 }
 ctx.restore();
 ctx.restore();
}
