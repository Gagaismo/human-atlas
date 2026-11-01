// Cath-lab layout and collision checks (S9). Everything is expressed in the patient frame (X = patient left,
// Y = superior, Z = anterior, mm, origin = heart isocentre), so the C-arm simply rotates the detector and tube around
// the origin. The patient lies supine on the table with the head toward the gantry (+Y), as in the reference view.
// Dimensions are our own rough adult values (head on a pillow, arms resting beside the body), chosen so every standard
// view is safe while the extremes collide: full cranial angulation near AP (CRA ≥ ~42 with |OAD/OAI| ≲ 60) hits the
// head, and the lateral caudal corners (|rotation| ≳ 70–80 with CAU ≥ ~20) hit the arm beside the table. Steep caudal
// obliques (|rotation| 40–80, CAU ≥ 40) touch the chest. See COLLISION_CORNERS.
import {DETECTOR_SIZE,SID,SOD,detectorDir,imageAxes} from './geometry';
import type {Vec3} from './types';

export type BodyPart='cabeza'|'cuello'|'brazo'|'piernas'|'pies'|'torso';
export interface Collision{part:BodyPart;message:string}

export const COLLISION_MESSAGES:Record<BodyPart,string>={
 cabeza:'El detector tocaría la cabeza del paciente',
 cuello:'El detector tocaría el cuello del paciente',
 brazo:'El detector tocaría el brazo del paciente',
 piernas:'El detector tocaría las piernas del paciente',
 pies:'El detector tocaría los pies del paciente',
 torso:'El detector tocaría el tórax del paciente'};

/** Table: top surface height (Z, negative = below the isocentre), slab thickness, half width (X) and Y extent. */
export const TABLE={top:-120,thickness:40,halfWidth:250,yMin:-900,yMax:520} as const;

/** Detector housing: a box of the detector size, `thickness` deep, whose patient-side face is `faceDistance` from the isocentre. */
export const DETECTOR_HOUSING={size:DETECTOR_SIZE,thickness:120,faceDistance:SID-SOD-50} as const;
/** Tube housing, behind the source point on the opposite side (below the table in AP). */
export const TUBE_HOUSING={width:220,height:220,depth:260,faceDistance:SOD-60} as const;

export interface Box{min:Vec3;max:Vec3}
export interface Capsule{a:Vec3;b:Vec3;r:number}
/** Patient solids used for collisions; the room view draws these same volumes. */
export const TORSO:Box={min:[-145,-420,-120],max:[145,150,85]};
export const CAPSULES:readonly {part:BodyPart;c:Capsule}[]=[
 {part:'cuello',c:{a:[0,150,-60],b:[0,215,-45],r:55}},
 {part:'cabeza',c:{a:[0,245,30],b:[0,285,30],r:100}},
 {part:'brazo',c:{a:[-205,110,-75],b:[-205,-330,-75],r:45}},
 {part:'brazo',c:{a:[205,110,-75],b:[205,-330,-75],r:45}},
 {part:'piernas',c:{a:[-85,-420,-58],b:[-85,-1000,-58],r:62}},
 {part:'piernas',c:{a:[85,-420,-58],b:[85,-1000,-58],r:62}},
 {part:'pies',c:{a:[-90,-1020,-70],b:[-100,-1130,-60],r:45}},
 {part:'pies',c:{a:[90,-1020,-70],b:[100,-1130,-60],r:45}}];

/** Extreme corners that collide (head at full CRA, arm at lateral CAU), handy for tests and demos. */
export const COLLISION_CORNERS:readonly [number,number][]=[[0,45],[90,-45],[-90,-45]];

interface Obb{c:Vec3;ax:[Vec3,Vec3,Vec3];h:Vec3}
const dot=(p:Vec3,q:Vec3)=>p[0]*q[0]+p[1]*q[1]+p[2]*q[2];

/** Detector housing as an oriented box at (a, b). */
export function detectorObb(a:number,b:number):Obb{
 const {d,u,v}=imageAxes(a,b),{size,thickness,faceDistance}=DETECTOR_HOUSING,s=faceDistance+thickness/2;
 return {c:[d[0]*s,d[1]*s,d[2]*s],ax:[u,v,d],h:[size/2,size/2,thickness/2]};
}
/** Tube housing as an oriented box at (a, b). */
export function tubeObb(a:number,b:number):Obb{
 const {d,u,v}=imageAxes(a,b),{width,height,depth,faceDistance}=TUBE_HOUSING,s=-(faceDistance+depth/2);
 return {c:[d[0]*s,d[1]*s,d[2]*s],ax:[u,v,d],h:[width/2,height/2,depth/2]};
}

/** Does a capsule touch an oriented box? (axis sampled every ≈10 mm, distance point-box < radius) */
function capsuleHitsObb(cap:Capsule,o:Obb):boolean{
 const L=Math.hypot(cap.b[0]-cap.a[0],cap.b[1]-cap.a[1],cap.b[2]-cap.a[2]),n=Math.max(2,Math.ceil(L/10));
 for(let i=0;i<=n;i++){
  const t=i/n,p:Vec3=[cap.a[0]+(cap.b[0]-cap.a[0])*t-o.c[0],cap.a[1]+(cap.b[1]-cap.a[1])*t-o.c[1],cap.a[2]+(cap.b[2]-cap.a[2])*t-o.c[2]];
  let d2=0;
  for(let k=0;k<3;k++){const l=dot(p,o.ax[k]),e=Math.abs(l)-o.h[k];if(e>0)d2+=e*e;}
  if(d2<cap.r*cap.r)return true;
 }
 return false;
}

/** Separating-axis test between an oriented box and the (axis-aligned) torso box. */
function boxHitsObb(box:Box,o:Obb):boolean{
 const bc:Vec3=[(box.min[0]+box.max[0])/2,(box.min[1]+box.max[1])/2,(box.min[2]+box.max[2])/2];
 const bh:Vec3=[(box.max[0]-box.min[0])/2,(box.max[1]-box.min[1])/2,(box.max[2]-box.min[2])/2];
 const E:Vec3[]=[[1,0,0],[0,1,0],[0,0,1]],t:Vec3=[o.c[0]-bc[0],o.c[1]-bc[1],o.c[2]-bc[2]];
 const axes:Vec3[]=[...E,...o.ax];
 for(const e of E)for(const f of o.ax)axes.push([e[1]*f[2]-e[2]*f[1],e[2]*f[0]-e[0]*f[2],e[0]*f[1]-e[1]*f[0]]);
 for(const L of axes){
  const len=Math.hypot(L[0],L[1],L[2]);if(len<1e-9)continue;
  const l:Vec3=[L[0]/len,L[1]/len,L[2]/len];
  const ra=Math.abs(l[0])*bh[0]+Math.abs(l[1])*bh[1]+Math.abs(l[2])*bh[2];
  const rb=Math.abs(dot(l,o.ax[0]))*o.h[0]+Math.abs(dot(l,o.ax[1]))*o.h[1]+Math.abs(dot(l,o.ax[2]))*o.h[2];
  if(Math.abs(dot(l,t))>ra+rb)return false;
 }
 return true;
}

/** First body part the detector housing would touch at (a, b), or null when the position is free. */
export function collision(a:number,b:number):Collision|null{
 const o=detectorObb(a,b);
 for(const {part,c} of CAPSULES)if(capsuleHitsObb(c,o))return {part,message:COLLISION_MESSAGES[part]};
 if(boxHitsObb(TORSO,o))return {part:'torso',message:COLLISION_MESSAGES.torso};
 return null;
}

export interface Clamped{a:number;b:number;hit:Collision|null}

/**
 * Walk the straight path from → to in (a, b) and return the last collision-free angle (refined to ≈0.05°).
 * `hit` is the collision that stopped it, or null when `to` is reachable. If `from` already collides it is returned as is.
 */
export function clampToSafe(from:{a:number;b:number},to:{a:number;b:number}):Clamped{
 const first=collision(from.a,from.b);
 if(first)return {a:from.a,b:from.b,hit:first};
 const steps=Math.max(1,Math.ceil(Math.max(Math.abs(to.a-from.a),Math.abs(to.b-from.b))));
 let lastSafe=0;
 for(let i=1;i<=steps;i++){
  const t=i/steps,h=collision(from.a+(to.a-from.a)*t,from.b+(to.b-from.b)*t);
  if(h){
   let lo=lastSafe,hi=t;
   for(let k=0;k<5;k++){const mid=(lo+hi)/2;if(collision(from.a+(to.a-from.a)*mid,from.b+(to.b-from.b)*mid))hi=mid;else lo=mid;}
   return {a:from.a+(to.a-from.a)*lo,b:from.b+(to.b-from.b)*lo,hit:collision(from.a+(to.a-from.a)*hi,from.b+(to.b-from.b)*hi)};
  }
  lastSafe=t;
 }
 return {a:to.a,b:to.b,hit:null};
}

export {detectorDir};
