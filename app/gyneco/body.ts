// The rigged female body of the self-exam demo (public/models/gyneco, built by scripts/gyneco/build-body.py from the
// MakeHuman / MPFB2 CC0 assets) and the poses it performs: the mirror inspection, the arm of the examined side raised
// with the hand behind the nape, and the opposite hand palpating with the pads of three fingers (two-bone IK on the
// arm, the palm facing the skin). Everything is expressed in the body frame (the glTF root: y up, +z front, left at
// +x), so the same code poses the standing and the lying body and runs in Node for scripts/gyneco/validate.mjs.
import * as T from 'three';
import {deltaRotation,solveTwoBone,type TwoBoneSolution} from './ik';
import type {SurfaceHit} from './surface';
import {STEPS,circleOffset,type Pressure,type Sample,type StepId} from './palpation';

export type Side='l'|'r';
export interface BodyMeta {
 model:string;modelBytes:number;gzipBytes:number;
 source:{name:string;url:string;license:string;licenseUrl:string;licenseQuote:string;files:string[]};
 transform:{scale:number;floor:number;shiftZ:number;note:string};
 mesh:string;bones:string[];heads:Record<string,number[]>;tails:Record<string,number[]>;
 landmarks:{height:number;nipple:Record<Side,number[]>;ear:number[];headTop:number[];chestBackZ:number;chestFrontZ:number;backZ:number;shoulder:Record<Side,number[]>};
}
export const BODY_URL='/models/gyneco/body.json';
const FINGERS=['thumb','index','middle','ring','pinky'] as const;
type Finger=typeof FINGERS[number];
const SIDES:Side[]=['l','r'];
/** Bones the poses rely on; the validator checks they exist in the model and the skin. */
export const BODY_BONES=['Root','pelvis','spine_01','spine_02','spine_03','neck_01','head',...SIDES.flatMap(s=>['clavicle','upperarm','lowerarm','hand',...FINGERS.flatMap(f=>['01','02','03'].map(n=>`${f}_${n}`))].map(b=>`${b}_${s}`))];
/** Pad center height over the skin (m): hovering while it travels, then pressing deeper with each pressure. */
export const PAD_HEIGHT:Record<Pressure|'lift',number>={lift:.022,suave:.007,media:.0035,firme:-.001};
/** Pad center: on the palmar side of the distal phalanx, a little proximal of the tip (m). */
const PAD_BACK=.008,PAD_UNDER=.005;
const rad=(d:number)=>d*Math.PI/180;

/** Finger pose: flexion per phalanx (degrees) and how much each finger closes toward the middle finger. */
type FingerPose=Record<Finger,[number,number,number]>&{close?:number};
const FLAT:FingerPose={thumb:[-18,0,0],index:[14,10,4],middle:[12,10,4],ring:[14,10,4],pinky:[48,42,20],close:7};
const PINCH:FingerPose={thumb:[0,0,0],index:[26,22,10],middle:[62,55,25],ring:[66,55,25],pinky:[70,55,25]};
const NAPE:FingerPose={thumb:[6,0,0],index:[22,22,10],middle:[22,22,10],ring:[22,22,10],pinky:[24,22,10],close:3};
const RELAXED:FingerPose={thumb:[4,0,0],index:[10,10,5],middle:[10,10,5],ring:[12,10,5],pinky:[14,10,5]};

interface FingerBone {bone:T.Bone;hinge:T.Vector3;yaw:T.Vector3;closeSign:number}
interface Arm {
 side:Side;sign:1|-1;clavicle:T.Bone;upper:T.Bone;lower:T.Bone;hand:T.Bone;upperLength:number;lowerLength:number;
 /** Rest directions in the body frame: upper arm, forearm, their plane normal, the hand and its palm normal. */
 restUpper:T.Vector3;restLower:T.Vector3;restNormal:T.Vector3;restHand:T.Vector3;restPalm:T.Vector3;
 fingers:Record<Finger,FingerBone[]>;
 /** Pad offsets from the wrist in the rest frame, for each finger pose that places a pad on the skin. */
 pads:{flat:T.Vector3;pinch:T.Vector3};
 /** Thumb angles (flex 01, yaw 01, flex 02) fitted so the thumb pad meets the index pad in the pinch. */
 thumbPinch:[number,number,number];
}
export interface BodyRig {
 root:T.Object3D;mesh:T.SkinnedMesh;bones:Map<string,T.Bone>;meta:BodyMeta;
 rest:Map<string,T.Quaternion>;restWorld:Map<string,T.Quaternion>;heads:Map<string,T.Vector3>;tails:Map<string,T.Vector3>;
 arms:Record<Side,Arm>;
 /** Scratch: inverse of the root's world rotation, refreshed by every pose call. */
 rootInverse:T.Quaternion;
}

const tmpQ=new T.Quaternion(),tmpV=new T.Vector3();
function bone(rig:BodyRig,name:string){const b=rig.bones.get(name);if(!b)throw new Error(`El cuerpo no tiene el hueso ${name}.`);return b;}
/** World position of a bone in the body frame (the hierarchy is refreshed from the root first). */
export function positionOf(rig:BodyRig,b:T.Bone,target=new T.Vector3()){b.updateWorldMatrix(true,false);return rig.root.worldToLocal(b.getWorldPosition(target));}
function rotationOf(rig:BodyRig,b:T.Bone,target=new T.Quaternion()){b.updateWorldMatrix(true,false);return target.copy(rig.rootInverse).multiply(b.getWorldQuaternion(tmpQ));}
/** Gives the bone the body-frame rotation `q`. */
function setRotation(rig:BodyRig,b:T.Bone,q:T.Quaternion){
 const parent=b.parent!;parent.updateWorldMatrix(true,false);
 const parentQ=tmpQ.copy(rig.rootInverse).multiply(parent.getWorldQuaternion(new T.Quaternion()));
 b.quaternion.copy(parentQ.invert().multiply(q));
}
/** Turns a bone so its rest direction `restAlong` points `along` and the rest reference `restNormal` turns to `normal`. */
function orient(rig:BodyRig,b:T.Bone,restAlong:T.Vector3,restNormal:T.Vector3,along:T.Vector3,normal:T.Vector3){
 setRotation(rig,b,deltaRotation(restAlong,restNormal,along,normal).multiply(rig.restWorld.get(b.name)!));
}
/** Rotates a bone from its rest pose about a body-frame axis. */
function turn(rig:BodyRig,b:T.Bone,axis:T.Vector3,angle:number){setRotation(rig,b,new T.Quaternion().setFromAxisAngle(axis,angle).multiply(rig.restWorld.get(b.name)!));}
const refresh=(rig:BodyRig)=>{rig.root.updateWorldMatrix(true,false);rig.rootInverse.copy(rig.root.getWorldQuaternion(tmpQ)).invert();};

export function resetPose(rig:BodyRig){for(const [name,b] of rig.bones)b.quaternion.copy(rig.rest.get(name)!);refresh(rig);}

/** Binds the loaded glTF scene: bones by name, rest pose, arm metrics, finger hinges and the fitted thumb. */
export function bindBody(meta:BodyMeta,scene:T.Object3D):BodyRig{
 let mesh:T.SkinnedMesh|undefined;const bones=new Map<string,T.Bone>();
 scene.traverse(o=>{if((o as T.SkinnedMesh).isSkinnedMesh)mesh??=o as T.SkinnedMesh;if((o as T.Bone).isBone)bones.set(o.name,o as T.Bone);});
 if(!mesh)throw new Error('El modelo del cuerpo no tiene una malla con esqueleto.');
 for(const name of BODY_BONES)if(!bones.has(name))throw new Error(`El cuerpo no tiene el hueso ${name}.`);
 scene.updateMatrixWorld(true);
 const rest=new Map<string,T.Quaternion>(),restWorld=new Map<string,T.Quaternion>(),heads=new Map<string,T.Vector3>(),tails=new Map<string,T.Vector3>();
 const rootQ=scene.getWorldQuaternion(new T.Quaternion()).invert();
 for(const [name,b] of bones){rest.set(name,b.quaternion.clone());restWorld.set(name,rootQ.clone().multiply(b.getWorldQuaternion(new T.Quaternion())));heads.set(name,scene.worldToLocal(b.getWorldPosition(new T.Vector3())));tails.set(name,new T.Vector3(...meta.tails[name]));}
 const rig:BodyRig={root:scene,mesh,bones,meta,rest,restWorld,heads,tails,arms:{} as Record<Side,Arm>,rootInverse:rootQ.clone()};
 const dir=(a:string,b:string)=>tails.get(b)!.clone().sub(heads.get(a)!).normalize();
 for(const side of SIDES){
  const sign=side==='l'?1:-1,n=(b:string)=>`${b}_${side}`,at=(b:string)=>heads.get(n(b))!;
  const restUpper=dir(n('upperarm'),n('upperarm')),restLower=dir(n('lowerarm'),n('lowerarm')),restHand=dir(n('hand'),n('hand'));
  const restNormal=new T.Vector3().crossVectors(restUpper,restLower).normalize();
  // Palm normal: perpendicular to the metacarpal plane, on the side of the thumb.
  const restPalm=new T.Vector3().crossVectors(at('index_01').clone().sub(at('hand')),at('pinky_01').clone().sub(at('hand'))).normalize();
  const thumbSide=at('thumb_02').clone().sub(at('hand')).dot(restPalm);
  if(Math.abs(thumbSide)<.005)throw new Error('No se pudo orientar la palma del cuerpo.');
  if(thumbSide<0)restPalm.negate();
  const middle=dir(n('middle_01'),n('middle_03'));
  const fingers={} as Record<Finger,FingerBone[]>;
  for(const f of FINGERS)fingers[f]=['01','02','03'].map(k=>{
   const name=n(`${f}_${k}`),b=bones.get(name)!,along=dir(name,name),inverse=restWorld.get(name)!.clone().invert();
   const hinge=new T.Vector3().crossVectors(along,restPalm).normalize(),toMiddle=new T.Vector3().crossVectors(restPalm,along).dot(middle.clone().sub(along));
   return {bone:b,hinge:hinge.applyQuaternion(inverse),yaw:restPalm.clone().applyQuaternion(inverse),closeSign:Math.sign(toMiddle)||1};
  });
  const arm:Arm={side,sign,clavicle:bones.get(n('clavicle'))!,upper:bones.get(n('upperarm'))!,lower:bones.get(n('lowerarm'))!,hand:bones.get(n('hand'))!,
   upperLength:at('upperarm').distanceTo(at('lowerarm')),lowerLength:at('lowerarm').distanceTo(at('hand')),restUpper,restLower,restNormal,restHand,restPalm,fingers,
   pads:{flat:new T.Vector3(),pinch:new T.Vector3()},thumbPinch:[0,0,0]};
  rig.arms[side]=arm;
 }
 // Pad offsets in the rest frame (hand at rest, fingers posed), then the thumb fitted onto the index pad for the pinch.
 for(const side of SIDES){
  const arm=rig.arms[side];resetPose(rig);
  poseFingers(rig,arm,FLAT);arm.pads.flat.copy(padOf(rig,arm,'middle')).sub(positionOf(rig,arm.hand));
  resetPose(rig);poseFingers(rig,arm,PINCH);
  const index=padOf(rig,arm,'index');arm.pads.pinch.copy(index).sub(positionOf(rig,arm.hand));
  let best=Infinity;
  for(let a=-30;a<=60;a+=10)for(let y=-70;y<=70;y+=10)for(let c=0;c<=60;c+=15){
   poseThumb(rig,arm,a,y,c);const d=padOf(rig,arm,'thumb').distanceTo(index);
   if(d<best){best=d;arm.thumbPinch=[a,y,c];}
  }
 }
 resetPose(rig);
 return rig;
}

function poseFingers(rig:BodyRig,arm:Arm,pose:FingerPose){
 for(const f of FINGERS)arm.fingers[f].forEach((fb,i)=>{
  const q=rig.rest.get(fb.bone.name)!.clone().multiply(tmpQ.setFromAxisAngle(fb.hinge,rad(pose[f][i])));
  if(i===0&&pose.close&&f!=='thumb'&&f!=='middle')q.multiply(tmpQ.setFromAxisAngle(fb.yaw,rad(pose.close)*fb.closeSign));
  fb.bone.quaternion.copy(q);
 });
}
function poseThumb(rig:BodyRig,arm:Arm,flex1:number,yaw1:number,flex2:number){
 const [t1,t2]=arm.fingers.thumb;
 t1.bone.quaternion.copy(rig.rest.get(t1.bone.name)!).multiply(tmpQ.setFromAxisAngle(t1.hinge,rad(flex1))).multiply(new T.Quaternion().setFromAxisAngle(t1.yaw,rad(yaw1)));
 t2.bone.quaternion.copy(rig.rest.get(t2.bone.name)!).multiply(tmpQ.setFromAxisAngle(t2.hinge,rad(flex2)));
}
/** Body-frame center of a finger pad: the palmar side of the distal phalanx, just behind the tip. */
function padOf(rig:BodyRig,arm:Arm,finger:Finger,target=new T.Vector3()){
 const b=arm.fingers[finger][2].bone,name=b.name,delta=rotationOf(rig,b).multiply(rig.restWorld.get(name)!.clone().invert());
 const along=rig.tails.get(name)!.clone().sub(rig.heads.get(name)!),palm=arm.restPalm.clone().applyQuaternion(delta);
 return positionOf(rig,b,target).add(along.addScaledVector(along.clone().normalize(),-PAD_BACK).applyQuaternion(delta)).addScaledVector(palm,PAD_UNDER);
}

/** Pad target on the skin for a timeline sample: the hit point, the small circle offset in the skin plane and the height. */
export function padTarget(hit:SurfaceHit,sample:Sample,height:number,target=new T.Vector3()){
 const n=hit.normal,y=new T.Vector3(0,1,0).addScaledVector(n,-n.y);if(y.lengthSq()<1e-6)y.set(1,0,0);y.normalize();
 const x=new T.Vector3().crossVectors(y,n),o=sample.pressure?circleOffset(sample.circlePhase):{u:0,v:0};
 return target.copy(hit.point).addScaledVector(x,o.u).addScaledVector(y,o.v).addScaledVector(n,height);
}

/** Two-bone IK on an arm: elbow toward `pole`, hand turned to (along, palm), fingers posed; the hand lands on `wrist`. */
function poseArm(rig:BodyRig,arm:Arm,wrist:T.Vector3,pole:T.Vector3,along:T.Vector3,palm:T.Vector3,fingers:FingerPose):TwoBoneSolution{
 const shoulder=positionOf(rig,arm.upper),s=solveTwoBone(shoulder,wrist,arm.upperLength,arm.lowerLength,pole);
 const upper=s.elbow.clone().sub(shoulder),lower=s.wrist.clone().sub(s.elbow),normal=new T.Vector3().crossVectors(upper,lower);
 if(normal.lengthSq()<1e-10)normal.crossVectors(upper,pole.clone().sub(shoulder));
 normal.normalize();
 orient(rig,arm.upper,arm.restUpper,arm.restNormal,upper,normal);
 orient(rig,arm.lower,arm.restLower,arm.restNormal,lower,normal);
 orient(rig,arm.hand,arm.restHand,arm.restPalm,along,palm);
 poseFingers(rig,arm,fingers);
 return s;
}
/** Lifts the lateral end of the clavicle (elevation) and brings it forward (protraction), in degrees. */
function shrug(rig:BodyRig,arm:Arm,elevation:number,protraction:number){
 const q=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),rad(elevation)*arm.sign).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),-rad(protraction)*arm.sign));
 setRotation(rig,arm.clavicle,q.multiply(rig.restWorld.get(arm.clavicle.name)!));
}
const v=(x:number,y:number,z:number)=>new T.Vector3(x,y,z);
/** Arm hanging at the side (at ease, mirror inspection first phase). */
function hangArm(rig:BodyRig,arm:Arm){
 const s=arm.sign,shoulder=positionOf(rig,arm.upper);
 return poseArm(rig,arm,v(s*.215,.9,.035),shoulder.clone().add(v(s*.4,-.35,-.3)),v(s*.05,-1,.1),v(-s,0,0),RELAXED);
}

export interface ExamInput {step:StepId;side:Side;/** Body-frame target of the palpating pad and the skin normal there (null outside the palpation). */pad:T.Vector3|null;normal:T.Vector3|null;t:number;demo:boolean}
export interface ExamReport {
 /** Achieved pad (middle finger, or the index in the nipple pinch), thumb pad in the pinch, elbow of the palpating arm. */
 pad:T.Vector3;thumb:T.Vector3|null;elbowAngle:number;clamped:boolean;
 /** Hand and elbow of the raised arm, and both hands (body frame). */
 raisedHand:T.Vector3;raisedElbow:T.Vector3;hands:Record<Side,T.Vector3>;
}
/** Poses the whole body for a moment of the demo. Inspection (and anything outside the demo): the mirror sequence
 * arms down → hands on the hips → arms up. From the position step on: the arm of the examined side raised with the hand
 * behind the nape, the other hand palpating at `pad` with the palm facing the skin, or pinching the nipple. */
export function applyExamPose(rig:BodyRig,input:ExamInput):ExamReport{
 resetPose(rig);
 const examined=rig.arms[input.side],palpating=rig.arms[input.side==='l'?'r':'l'],s=examined.sign;
 const report:Partial<ExamReport>={thumb:null,elbowAngle:180,clamped:false};
 const inspection=STEPS[0];
 if(!input.demo||input.step==='inspection'){
  const phase=!input.demo?0:Math.min(2,Math.floor((input.t-inspection.start)/((inspection.end-inspection.start)/3)));
  for(const arm of [rig.arms.l,rig.arms.r]){
   const a=arm.sign,shoulder=positionOf(rig,arm.upper);
   if(phase===0)hangArm(rig,arm);
   else if(phase===1){shrug(rig,arm,4,6);poseArm(rig,arm,v(a*.19,1.0,.06),shoulder.clone().add(v(a*.7,-.25,-.1)),v(-a*.6,-.45,.55),v(-a,-.25,-.35),RELAXED);}
   else{shrug(rig,arm,16,4);poseArm(rig,arm,v(a*.19,1.82,.02),shoulder.clone().add(v(a*.6,.25,.1)),v(a*.12,1,0),v(-a,0,.1),RELAXED);}
  }
  report.pad=positionOf(rig,palpating.hand);
 }else{
  // Raised arm: elbow up and out, hand behind the nape with the fingers across it and the palm on the neck.
  shrug(rig,examined,12,-4);
  const shoulder=positionOf(rig,examined.upper);
  poseArm(rig,examined,v(s*.045,1.53,-.095),shoulder.clone().add(v(s*.5,.45,-.05)),v(-s*.9,-.35,.1),v(0,.3,1),NAPE);
  if(!input.pad||!input.normal){hangArm(rig,palpating);report.pad=positionOf(rig,palpating.hand);}
  else{
   const pinch=input.step==='nipple',n=input.normal;
   shrug(rig,palpating,2,14);
   const shoulder=positionOf(rig,palpating.upper),away=input.pad.clone().sub(shoulder);
   // Fingers lie on the skin pointing toward the examined side and up; the farther the point from the palpating
   // shoulder, the more they point away from it, so the wrist stays within reach (the hand radiates from the shoulder).
   const w=Math.min(1,Math.max(0,(away.length()-.22)/.15)),t=v(s,.4,0).multiplyScalar(1-w).addScaledVector(away.normalize(),w);
   t.addScaledVector(n,-t.dot(n));if(t.lengthSq()<1e-6)t.set(0,1,0).addScaledVector(n,-n.y);t.normalize();
   // Tilted so the pads touch while the wrist stays off the skin; the palm faces the skin.
   const tilt=rad(pinch?32:20),along=t.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(n,-Math.sin(tilt)),palm=n.clone().multiplyScalar(-Math.cos(tilt)).addScaledVector(t,-Math.sin(tilt));
   const delta=deltaRotation(palpating.restHand,palpating.restPalm,along,palm),wrist=input.pad.clone().sub((pinch?palpating.pads.pinch:palpating.pads.flat).clone().applyQuaternion(delta));
   // Elbow down, out and forward of the chest, so the forearm crosses in front of the breasts instead of over them.
   const solved=poseArm(rig,palpating,wrist,shoulder.clone().add(v(-s*.25,-.45,.42)),along,palm,pinch?PINCH:FLAT);
   if(pinch)poseThumb(rig,palpating,...palpating.thumbPinch);
   report.elbowAngle=solved.elbowAngle;report.clamped=solved.clamped;
   report.pad=padOf(rig,palpating,pinch?'index':'middle');
   if(pinch)report.thumb=padOf(rig,palpating,'thumb');
  }
 }
 report.raisedHand=positionOf(rig,examined.hand);report.raisedElbow=positionOf(rig,examined.lower);
 report.hands={l:positionOf(rig,rig.arms.l.hand),r:positionOf(rig,rig.arms.r.hand)};
 return report as ExamReport;
}

/** Skin of the chest in the exam pose of `side` (its arm raised, the other hanging), in the body frame: an indexed
 * geometry with normals that ChestSurface ray-casts. Triangles of the palpating arm are dropped so rays reach the chest. */
export function bakeChest(rig:BodyRig,side:Side):T.BufferGeometry{
 applyExamPose(rig,{step:'pads',side,pad:null,normal:null,t:0,demo:true});
 rig.root.updateWorldMatrix(true,true);
 const mesh=rig.mesh,g=mesh.geometry,position=g.getAttribute('position'),index=g.getIndex()!,skinIndex=g.getAttribute('skinIndex') as T.BufferAttribute,skinWeight=g.getAttribute('skinWeight') as T.BufferAttribute;
 const toBody=rig.root.matrixWorld.clone().invert().multiply(mesh.matrixWorld),posed=new Float32Array(position.count*3);
 for(let i=0;i<position.count;i++){tmpV.fromBufferAttribute(position,i);mesh.applyBoneTransform(i,tmpV);tmpV.applyMatrix4(toBody).toArray(posed,i*3);}
 const other=side==='l'?'r':'l',armBones=new Set(['upperarm','lowerarm','hand',...FINGERS.flatMap(f=>['01','02','03'].map(n=>`${f}_${n}`))].map(b=>`${b}_${other}`));
 const excluded=new Set(mesh.skeleton.bones.map((b,i)=>armBones.has(b.name)?i:-1).filter(i=>i>=0));
 const dominant=(i:number)=>{let best=-1,w=-1;for(let k=0;k<4;k++){const x=skinWeight.getComponent(i,k);if(x>w){w=x;best=skinIndex.getComponent(i,k);}}return best;};
 const sign=side==='l'?1:-1,keep:number[]=[];
 for(let i=0;i<index.count;i+=3){
  let ok=true,cx=0,cy=0,cz=0;
  for(let k=0;k<3;k++){const vi=index.getX(i+k);if(excluded.has(dominant(vi))){ok=false;break;}cx+=posed[vi*3];cy+=posed[vi*3+1];cz+=posed[vi*3+2];}
  // Sums of three vertices: centroid on the examined half (x > -3 cm), y 1.03–1.53 m, not behind z = -0.12 m.
  if(ok&&sign*cx>-.09&&cy>3.1&&cy<4.6&&cz>-.35)keep.push(index.getX(i),index.getX(i+1),index.getX(i+2));
 }
 const out=new T.BufferGeometry();out.setAttribute('position',new T.BufferAttribute(posed,3));out.setIndex(keep);out.computeVertexNormals();
 return out;
}
