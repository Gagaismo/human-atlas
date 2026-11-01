// Stand-in fluoroscopy background of the angiogram: grey field with the projected heart silhouette, the diaphragm dome,
// the spine and faint ribs. Everything is procedural from the C-arm angles and uses the same projection as the vessels,
// so it moves consistently with them. Canvas 2D, grey only (the red channel is what the compositor reads).
import {FIELD_SIZE,imageAxes,projectWith} from './core/geometry';
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
/** Points of the dome ellipsoid (patient frame), a coarse sampling of its surface. */
function domePoints():Vec3[]{
 const pts:Vec3[]=[];
 for(let i=0;i<24;i++){
  const th=i/24*Math.PI*2;
  for(const lat of [-60,-30,0,35,65,90]){
   const cl=Math.cos(lat*rad),sl=Math.sin(lat*rad);
   pts.push([DOME.c[0]+DOME.rx*cl*Math.cos(th),DOME.c[1]+DOME.ry*sl,DOME.c[2]+DOME.rz*cl*Math.sin(th)]);
  }
 }
 return pts;
}

/** Soft elliptical shadow fitted to a point set: centre and axes from the 2D covariance, radial falloff to nothing, so it has no edge at all. */
function softBlob(ctx:CanvasRenderingContext2D,pts:readonly P2[],spread:number,alpha:number,grey=0){
 if(pts.length<3)return;
 let mx=0,my=0;for(const p of pts){mx+=p[0];my+=p[1];}mx/=pts.length;my/=pts.length;
 let sxx=0,sxy=0,syy=0;for(const p of pts){const x=p[0]-mx,y=p[1]-my;sxx+=x*x;sxy+=x*y;syy+=y*y;}
 sxx/=pts.length;sxy/=pts.length;syy/=pts.length;
 const half=(sxx-syy)/2,r=Math.sqrt(half*half+sxy*sxy),l1=(sxx+syy)/2+r,l2=Math.max((sxx+syy)/2-r,1e-6);
 ctx.save();
 ctx.translate(mx,my);ctx.rotate(.5*Math.atan2(2*sxy,sxx-syy));ctx.scale(Math.sqrt(l1)*spread,Math.sqrt(l2)*spread);
 const g=ctx.createRadialGradient(0,0,0,0,0,1),c=(a:number)=>`rgba(${grey},${grey},${grey},${(alpha*a).toFixed(3)})`;
 g.addColorStop(0,c(1));g.addColorStop(.4,c(.86));g.addColorStop(.62,c(.5));g.addColorStop(.82,c(.16));g.addColorStop(1,c(0));
 ctx.fillStyle=g;ctx.fillRect(-1,-1,2,2);
 ctx.restore();
}

/** Soft stroked curve: only the blurred shadow is drawn (the shape itself is moved off the canvas), so no hard edges survive. */
function softStroke(ctx:CanvasRenderingContext2D,pts:readonly P2[],S:number,color:string,width:number,blur:number){
 if(pts.length<2)return;
 ctx.save();
 ctx.shadowColor=color;ctx.shadowBlur=blur;ctx.shadowOffsetX=S*4;ctx.translate(-S*4,0);
 ctx.strokeStyle='#000';ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';
 ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.stroke();
 ctx.restore();
}

/** Large soft light and dark clouds (fixed pattern, drifting a little with the table pan), like the uneven density of a real fluoroscopy field. */
function mottling(ctx:CanvasRenderingContext2D,S:number,pan:readonly [number,number]){
 let seed=7;
 const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
 for(let k=0;k<46;k++){
  const x=(rnd()+pan[0]*.04)*S,y=(rnd()-pan[1]*.04)*S,r=S*(.12+rnd()*.22),dark=rnd()<.55,a=.035+rnd()*.05;
  const g=ctx.createRadialGradient(x,y,0,x,y,r),c=dark?'0,0,0':'255,255,255';
  g.addColorStop(0,`rgba(${c},${a.toFixed(3)})`);g.addColorStop(1,`rgba(${c},0)`);
  ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
 }
}

/** Paint the background for angles (a,b) and table pan (field-normalised, ±1 = half field) onto a square canvas. */
export function paintBackground(ctx:CanvasRenderingContext2D,S:number,a:number,b:number,pan:readonly [number,number],cloud:readonly Vec3[]|null):void{
 const ax=imageAxes(a,b),h=FIELD_SIZE/2;
 const toPx=(p:Vec3):[number,number,number]=>{
  const q=projectWith(ax,p);
  return [(q.x/h+pan[0]+1)/2*S,(1-(q.y/h+pan[1]))/2*S,q.m*S/FIELD_SIZE];  // third: pixels per mm at that depth
 };
 const flat=(list:readonly Vec3[]):P2[]=>list.map(p=>{const q=toPx(p);return [q[0],q[1]];});
 ctx.save();
 ctx.globalAlpha=1;ctx.shadowBlur=0;
 // Lung field: brighter at the periphery, slightly darker towards the mediastinum.
 const g=ctx.createRadialGradient(S*(.5+pan[0]/2),S*(.5-pan[1]/2),S*.05,S*.5,S*.5,S*.78);
 g.addColorStop(0,'#c8c8c8');g.addColorStop(1,'#e2e2e2');
 ctx.fillStyle=g;ctx.fillRect(0,0,S,S);
 mottling(ctx,S,pan);
 const blur=S*.03;
 // Diaphragm dome: denser (darker) tissue under it.
 softBlob(ctx,flat(domePoints()),2.3,.26);
 // Mediastinum + heart silhouette.
 if(cloud&&cloud.length){
  const pts=flat(cloud);
  softBlob(ctx,pts,3.1,.14);
  softBlob(ctx,pts,2.15,.3);
 }
 // Spine: a band along the vertical axis of the patient; its position follows the rotation (over the midline at AP, swinging
 // aside in obliques). Bone attenuates more than soft tissue, so on this display (contrast dark, lungs bright) it is darker.
 {
  const top=toPx([MIDLINE_X,330,SPINE_Z]),bot=toPx([MIDLINE_X,-330,SPINE_Z]),w=SPINE_HALF_WIDTH*2*top[2],len=Math.hypot(top[0]-bot[0],top[1]-bot[1]);
  ctx.save();
  ctx.translate((top[0]+bot[0])/2,(top[1]+bot[1])/2);ctx.rotate(Math.atan2(top[1]-bot[1],top[0]-bot[0]));
  const band=ctx.createLinearGradient(0,-w,0,w),c=(a:number)=>`rgba(0,0,0,${a})`;
  band.addColorStop(0,c(0));band.addColorStop(.2,c(.05));band.addColorStop(.35,c(.2));band.addColorStop(.5,c(.3));band.addColorStop(.65,c(.2));band.addColorStop(.8,c(.05));band.addColorStop(1,c(0));
  ctx.fillStyle=band;ctx.fillRect(-len,-w,len*2,w*2);
  // Disc spaces: a few soft lighter steps between the vertebral bodies.
  for(let k=-7;k<=7;k++){
   const q=toPx([MIDLINE_X,k*38,SPINE_Z]);
   ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.translate(q[0],q[1]);ctx.rotate(Math.atan2(top[1]-bot[1],top[0]-bot[0]));ctx.scale(Math.max(q[2]*5,2),w*.6);
   const d=ctx.createRadialGradient(0,0,0,0,0,1);d.addColorStop(0,'rgba(255,255,255,.07)');d.addColorStop(1,'rgba(255,255,255,0)');
   ctx.fillStyle=d;ctx.fillRect(-1,-1,2,2);ctx.restore();
  }
  ctx.restore();
 }
 // Ribs: tilted elliptical hoops around the chest, as faint blurred curves.
 for(let k=0;k<8;k++){
  const y0=-110+k*42,line:P2[]=[];
  for(let i=0;i<=56;i++){
   const th=i/56*Math.PI*2,x=MIDLINE_X+170*Math.cos(th),z=-10+135*Math.sin(th),q=toPx([x,y0-0.32*z,z]);
   line.push([q[0],q[1]]);
  }
  const k0=toPx([MIDLINE_X,y0,-10])[2];
  softStroke(ctx,line,S,'rgba(0,0,0,.035)',Math.max(2,k0*9),blur*.6);
 }
 ctx.restore();
}
