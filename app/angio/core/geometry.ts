// C-arm geometry and cone-beam projection (S11). Framework-free, our own formulas.
//
// Patient frame: X = patient left, Y = superior, Z = anterior, mm, origin = heart isocentre.
// Angles in degrees: `a` = rotation (negative OAD = RAO, positive OAI = LAO, clamped ±90), `b` = angulation
// (negative CAU, positive CRA, clamped ±45).
//   d = (sin a·cos b, sin b, cos a·cos b)   unit vector isocentre → detector
//   u = (cos a, 0, −sin a)                  screen right   (AP: +X; OAI 90: −Z, so anterior is on the screen left)
//   v = d × u                               screen up      (AP: +Y, head up); (u, v, d) is right-handed
// The X-ray source sits at −SOD·d and the detector plane at (SID−SOD)·d from the isocentre.
import type {Vec3} from './types';

export const SOD=750;            // source → isocentre, mm
export const SID=1100;           // source → detector plane, mm
export const DETECTOR_SIZE=250;  // square detector side, mm
export const A_LIMIT=90;
export const B_LIMIT=45;

const RAD=Math.PI/180;
const clamp=(x:number,lo:number,hi:number)=>x<lo?lo:x>hi?hi:x;

export function clampAngles(a:number,b:number):{a:number;b:number}{
 return {a:clamp(a,-A_LIMIT,A_LIMIT),b:clamp(b,-B_LIMIT,B_LIMIT)};
}

/** Unit vector from the isocentre towards the detector. */
export function detectorDir(a:number,b:number):Vec3{
 const ra=a*RAD,rb=b*RAD;
 return [Math.sin(ra)*Math.cos(rb),Math.sin(rb),Math.cos(ra)*Math.cos(rb)];
}

export interface ImageAxes{d:Vec3;u:Vec3;v:Vec3}

/** Orthonormal right-handed basis of the image: u screen right, v screen up, d towards the detector. */
export function imageAxes(a:number,b:number):ImageAxes{
 const ra=a*RAD,rb=b*RAD,sa=Math.sin(ra),ca=Math.cos(ra),sb=Math.sin(rb),cb=Math.cos(rb);
 return {d:[sa*cb,sb,ca*cb],u:[ca,0,-sa],v:[-sa*sb,cb,-ca*sb]};
}

export interface Projected{
 /** Image coordinates on the detector plane, mm (x right, y up). */
 x:number;y:number;
 /** Magnification SID / (distance from the source along d). */
 m:number}

/** Perspective (cone-beam) projection of a patient point to the detector plane. */
export function projectWith(ax:ImageAxes,p:Vec3):Projected{
 const {d,u,v}=ax;
 const t=p[0]*d[0]+p[1]*d[1]+p[2]*d[2];
 const m=SID/(SOD+t);
 return {x:(p[0]*u[0]+p[1]*u[1]+p[2]*u[2])*m,y:(p[0]*v[0]+p[1]*v[1]+p[2]*v[2])*m,m};
}

export function projectPoint(p:Vec3,a:number,b:number):Projected{return projectWith(imageAxes(a,b),p)}

/** Projection normalised to [-1,1] over the detector (±1 = detector edge). */
export function projectNorm(p:Vec3,a:number,b:number):[number,number]{
 const q=projectPoint(p,a,b),h=DETECTOR_SIZE/2;
 return [q.x/h,q.y/h];
}

const r=(x:number)=>Math.round(x);

/** Rotation label: "OAD 30°", "OAI 45°", "AP 0°". */
export function fmtRotation(a:number):string{
 const n=r(a);return n<0?`OAD ${-n}°`:n>0?`OAI ${n}°`:'AP 0°';
}
/** Angulation label: "CAU 30°", "CRA 30°", "0°" (no direction at zero). */
export function fmtAngulation(b:number):string{
 const n=r(b);return n<0?`CAU ${-n}°`:n>0?`CRA ${n}°`:'0°';
}
/** Combined label: "AP", "OAD 30 CAU 30", "OAI 45 CAU 35", "AP CRA 30", "OAI 90". */
export function fmtAngles(a:number,b:number):string{
 const na=r(a),nb=r(b);
 const rot=na<0?`OAD ${-na}`:na>0?`OAI ${na}`:'AP';
 const ang=nb<0?` CAU ${-nb}`:nb>0?` CRA ${nb}`:'';
 return rot+ang;
}
