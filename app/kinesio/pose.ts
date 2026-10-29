import * as T from 'three';
import type {JointAngles,JointId,Motion,PatientPosition,RigMeta,RigMuscle,Side} from './types';

// Same rule as three.js PropertyBinding.sanitizeNodeName, which GLTFLoader applies to node names.
export const nodeName=(name:string)=>name.replace(/\s/g,'_').replace(/[\[\]\.:\/]/g,'');
const MOTIONS:Motion[]=['flexion','abduction','rotation'];

export interface Rig {
 meta:RigMeta;root:T.Object3D;
 joints:Map<JointId,{bone:T.Bone;rest:T.Quaternion;axes:Partial<Record<Motion,T.Vector3>>;limits:RigMeta['joints'][number]['limits']}>;
 muscles:Map<string,{meta:RigMuscle;mesh:T.SkinnedMesh;path:T.Object3D[]}>;
}
export const muscleKey=(id:string,side:Side)=>`${id}:${side}`;

/** Binds the loaded glTF scene to its metadata. Call before rotating the root: axes are taken from the rest pose. */
export function bindRig(meta:RigMeta,root:T.Object3D):Rig{
 root.updateMatrixWorld(true);
 const find=(name:string)=>{const o=root.getObjectByName(nodeName(name));if(!o)throw new Error(`The kinesiology model has no node ${name}.`);return o;};
 const rootInverse=root.getWorldQuaternion(new T.Quaternion()).invert(),joints:Rig['joints']=new Map(),muscles:Rig['muscles']=new Map();
 for(const j of meta.joints){
  const bone=find(j.bone) as T.Bone,world=rootInverse.clone().multiply(bone.getWorldQuaternion(new T.Quaternion())).invert(),axes:Partial<Record<Motion,T.Vector3>>={};
  for(const m of MOTIONS){const a=j.axes[m];if(a)axes[m]=new T.Vector3(...a).applyQuaternion(world).normalize();}
  joints.set(j.id,{bone,rest:bone.quaternion.clone(),axes,limits:j.limits});
 }
 for(const m of meta.muscles)muscles.set(muscleKey(m.id,m.side),{meta:m,mesh:find(m.mesh) as T.SkinnedMesh,path:[m.origin,...m.via,m.insertion].map(find)});
 return {meta,root,joints,muscles};
}

/** The catalog describes the right side; this moves every `_r` joint to `_l` and back. */
export function mirrorPose(pose:JointAngles,side:Side):JointAngles{
 if(side==='r')return pose;
 const out:JointAngles={};
 for(const [joint,angles] of Object.entries(pose))out[joint.replace(/_(l|r)$/,(_,s)=>s==='r'?'_l':'_r') as JointId]={...angles};
 return out;
}

export function clampPose(rig:Rig,pose:JointAngles):JointAngles{
 const out:JointAngles={};
 for(const [id,angles] of Object.entries(pose) as [JointId,Partial<Record<Motion,number>>][]){
  const limits=rig.joints.get(id)?.limits;if(!limits)continue;
  out[id]=Object.fromEntries(Object.entries(angles).filter(([m])=>limits[m as Motion]).map(([m,v])=>{const [lo,hi]=limits[m as Motion]!;return [m,Math.min(hi,Math.max(lo,v))];}));
 }
 return out;
}

/** Sets every joint to rest and then applies the pose (degrees, clamped to the joint limits). */
export function applyPose(rig:Rig,pose:JointAngles){
 const clamped=clampPose(rig,pose),q=new T.Quaternion();
 for(const [id,joint] of rig.joints){
  joint.bone.quaternion.copy(joint.rest);
  const angles=clamped[id];if(!angles)continue;
  for(const m of MOTIONS){const axis=joint.axes[m],deg=angles[m];if(axis&&deg)joint.bone.quaternion.multiply(q.setFromAxisAngle(axis,T.MathUtils.degToRad(deg)));}
 }
 rig.root.updateMatrixWorld(true);
}

/** Length along origin -> via points -> insertion relative to rest: 0.18 means 18 % longer. */
export function elongation(rig:Rig,key:string){
 const m=rig.muscles.get(key);if(!m)return 0;
 const points=m.path.map(o=>o.getWorldPosition(new T.Vector3())),scale=rig.root.getWorldScale(new T.Vector3()).x;
 let length=0;for(let i=1;i<points.length;i++)length+=points[i].distanceTo(points[i-1]);
 return length/scale/m.meta.restLength-1;
}

// Whole-body orientation for each patient position (the model stands facing +Z with Y up).
export const POSITION_ROTATION:Record<PatientPosition,T.Euler>={
 bipedestacion:new T.Euler(0,0,0),
 sedente:new T.Euler(0,0,0),
 supino:new T.Euler(-Math.PI/2,0,0),
 prono:new T.Euler(Math.PI/2,0,0),
 // Lying on the left side, so the right limb from the catalog is on top.
 lateral:new T.Euler(-Math.PI/2,0,-Math.PI/2,'ZXY'),
};
// Posture each position starts from before the stretch is applied.
export const BASE_POSE:Record<PatientPosition,JointAngles>={
 bipedestacion:{},supino:{},prono:{},lateral:{},
 sedente:{hip_r:{flexion:90},hip_l:{flexion:90},knee_r:{flexion:90},knee_l:{flexion:90}},
};
export function composePose(position:PatientPosition,pose:JointAngles):JointAngles{
 const out:JointAngles=structuredClone(BASE_POSE[position]);
 for(const [id,angles] of Object.entries(pose) as [JointId,Partial<Record<Motion,number>>][])out[id]={...out[id],...angles};
 return out;
}
