// Analytic two-bone inverse kinematics and the orientation math the rigged body is posed with. Pure vector math
// (three.js types only), so scripts/gyneco/validate.mjs can run it in Node without WebGL.
import * as T from 'three';

export interface TwoBoneSolution {
 /** Elbow position; the wrist is at `wrist` (the target, pulled onto the reachable sphere when needed). */
 elbow:T.Vector3;wrist:T.Vector3;
 /** Interior elbow angle in degrees: 180 = straight arm. */
 elbowAngle:number;
 /** True when the target was out of reach (too far or too close) and was clamped. */
 clamped:boolean;
}
const perpendicular=(v:T.Vector3)=>Math.abs(v.x)<.9?new T.Vector3(1,0,0).cross(v):new T.Vector3(0,1,0).cross(v);

/** Places the elbow of a shoulder→elbow→wrist chain of lengths `upper` and `lower` so the wrist reaches `target`, in the
 * plane that contains the shoulder, the target and the `pole` point (the elbow bends toward the pole). */
export function solveTwoBone(shoulder:T.Vector3,target:T.Vector3,upper:number,lower:number,pole:T.Vector3):TwoBoneSolution{
 const toTarget=target.clone().sub(shoulder),far=upper+lower,near=Math.abs(upper-lower);
 let d=toTarget.length(),clamped=false;
 if(d<1e-9){toTarget.set(0,-1,0);d=1e-9;}
 const dir=toTarget.clone().divideScalar(d);
 if(d>far){d=far;clamped=true;}else if(d<near){d=near;clamped=true;}
 const wrist=shoulder.clone().addScaledVector(dir,d);
 // Elbow direction: rotate `dir` toward the pole by the shoulder angle (law of cosines).
 const cosA=Math.min(1,Math.max(-1,(upper*upper+d*d-lower*lower)/(2*upper*d))),sinA=Math.sqrt(Math.max(0,1-cosA*cosA));
 const side=pole.clone().sub(shoulder);side.addScaledVector(dir,-side.dot(dir));
 if(side.lengthSq()<1e-10)side.copy(perpendicular(dir));
 side.normalize();
 const elbow=shoulder.clone().addScaledVector(dir,upper*cosA).addScaledVector(side,upper*sinA);
 const cosE=Math.min(1,Math.max(-1,(upper*upper+lower*lower-d*d)/(2*upper*lower)));
 return {elbow,wrist,elbowAngle:Math.acos(cosE)*180/Math.PI,clamped};
}

/** Orthonormal rotation whose first axis is `along` and whose second axis is `normal` made perpendicular to it. */
export function frameOf(along:T.Vector3,normal:T.Vector3):T.Quaternion{
 const a=along.clone().normalize(),n=normal.clone().addScaledVector(a,-normal.dot(a));
 if(n.lengthSq()<1e-10)n.copy(perpendicular(a));
 n.normalize();
 const b=new T.Vector3().crossVectors(a,n);
 return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(a,n,b));
}

/** Rotation that takes the rest frame (restAlong, restNormal) onto (along, normal). */
export function deltaRotation(restAlong:T.Vector3,restNormal:T.Vector3,along:T.Vector3,normal:T.Vector3):T.Quaternion{
 return frameOf(along,normal).multiply(frameOf(restAlong,restNormal).invert());
}

/** Rotates `v` about `axis` (unit) by `angle` radians: a ⟂-safe helper for finger hinges. */
export const rotateAbout=(v:T.Vector3,axis:T.Vector3,angle:number)=>v.clone().applyQuaternion(new T.Quaternion().setFromAxisAngle(axis,angle));
