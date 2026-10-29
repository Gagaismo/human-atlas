import {useEffect,useRef} from 'react';
import * as T from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {decodeModelResponse} from '../model-download';
import {PointerTap} from '../pointer-tap';
import {POSITION_ROTATION,applyPose,bindRig,elongation,type Rig} from './pose';
import type {JointAngles,JointId,Motion,PatientPosition,RigMeta} from './types';

interface Props {position:PatientPosition;pose:JointAngles;targets:string[];onElongation:(values:Map<string,number>)=>void;onPick:(key:string)=>void;onProgress:(n:number)=>void;onError:(message:string)=>void}
const BASE='/models/kinesio/';
const TABLE_TOP=.75,MOTIONS:Motion[]=['flexion','abduction','rotation'];
const MUSCLE=new T.Color('#a8746b'),SHORT=new T.Color('#5b84ad'),LONG=new T.Color('#e2341d');

// Strain color: blue when shortened, muscle tone at rest, bright red from +20 %.
const strainColor=(e:number,out:T.Color)=>e<0?out.copy(MUSCLE).lerp(SHORT,Math.min(1,-e/.1)):out.copy(MUSCLE).lerp(LONG,Math.min(1,e/.2));
const angleOf=(pose:JointAngles,joint:JointId,motion:Motion)=>pose[joint]?.[motion]??0;

export default function KinesioScene({position,pose,targets,onElongation,onPick,onProgress,onError}:Props){
 const host=useRef<HTMLDivElement>(null),latest=useRef({position,pose,targets}),callbacks=useRef({onElongation,onPick});
 latest.current={position,pose,targets};callbacks.current={onElongation,onPick};
 useEffect(()=>{
  const el=host.current!;let disposed=false,rig:Rig|null=null;
  const abort=new AbortController();
  let renderer:T.WebGLRenderer;
  try{renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}catch{onError('Este navegador no pudo iniciar el visor 3D. Probá con un navegador con WebGL activado.');return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<768?1.5:2));renderer.setClearColor('#f2f3f3');renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;el.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','Paciente 3D. Arrastrá para rotar, pellizcá o usá la rueda para acercar y tocá un músculo para elegirlo.');
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(34,1,.01,60),controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;controls.dampingFactor=.085;controls.addEventListener('change',()=>{dirty=true;});controls.minDistance=.3;controls.maxDistance=8;controls.maxPolarAngle=Math.PI*.96;
  const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment();scene.environment=pmrem.fromScene(room,.04).texture;room.dispose();pmrem.dispose();
  scene.add(new T.HemisphereLight(0xffffff,0xa7acb2,1.05));
  const key=new T.DirectionalLight(0xfffaf4,2.2);key.position.set(-2,4,3);scene.add(key);
  const rim=new T.DirectionalLight(0xe9f0ff,1.6);rim.position.set(2,2,-3);scene.add(rim);
  const ground=new T.Mesh(new T.CircleGeometry(30,96),new T.MeshStandardMaterial({color:0xd5d9dc,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.002;scene.add(ground);
  const furniture=new T.MeshStandardMaterial({color:0xe7e3dc,roughness:.8});
  const table=new T.Mesh(new T.BoxGeometry(.72,.06,1),furniture),seat=new T.Mesh(new T.BoxGeometry(.5,.05,.42),furniture);scene.add(table,seat);
  const holder=new T.Group();scene.add(holder);
  let boneMeshes:T.Mesh[]=[],trunkMeshes:T.Mesh[]=[];
  // Pose transitions animate joint by joint so the movement reads as a movement.
  let dirty=true,from:JointAngles={},to:JointAngles={},shown:JointAngles={},start=0,lastPosition:PatientPosition|null=null,lastTargets='';
  const DURATION=700;
  const resize=()=>{const w=el.clientWidth,h=el.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();dirty=true;};
  const observer=new ResizeObserver(resize);observer.observe(el);resize();

  const place=(p:PatientPosition)=>{
   holder.position.set(0,0,0);holder.quaternion.setFromEuler(POSITION_ROTATION[p]);holder.updateMatrixWorld(true);
   const lying=p==='supino'||p==='prono'||p==='lateral';
   table.visible=lying;seat.visible=p==='sedente';
   if(lying&&rig){
    // The posed trunk rests on the table; limbs may hang off it (Thomas) or rise (straight-leg raise).
    const trunk=new T.Box3(),body=new T.Box3();
    for(const m of trunkMeshes)trunk.expandByObject(m);
    for(const m of boneMeshes)body.expandByObject(m);
    const c=body.getCenter(new T.Vector3());
    holder.position.set(-c.x,TABLE_TOP-trunk.min.y,-c.z);holder.updateMatrixWorld(true);
    // In supine with a hip in extension the limb hangs off the end of the table (Thomas position).
    const pose=latest.current.pose,hanging=p==='supino'&&(['hip_r','hip_l'] as JointId[]).filter(id=>(pose[id]?.flexion??0)<0);
    let head=body.min.z-c.z-.05,feet=body.max.z-c.z+.05;
    if(hanging&&hanging.length)feet=Math.min(feet,Math.max(...hanging.map(id=>rig!.joints.get(id)!.bone.getWorldPosition(new T.Vector3()).z))+.08);
    table.scale.z=feet-head;table.position.set(0,TABLE_TOP-.03,(head+feet)/2);
   }
   holder.updateMatrixWorld(true);
  };
  const ground_feet=()=>{
   // Standing and sitting: put the feet on the floor and the seat under the pelvis.
   if(!rig)return;const p=latest.current.position;if(p!=='sedente'&&p!=='bipedestacion')return;
   const ankles=(['ankle_r','ankle_l'] as JointId[]).map(id=>rig!.joints.get(id)!.bone.getWorldPosition(new T.Vector3()).y);
   holder.position.y+=.072-Math.min(...ankles);holder.updateMatrixWorld(true);
   if(p==='sedente'){const hip=rig.joints.get('hip_r')!.bone.getWorldPosition(new T.Vector3());seat.position.set(0,hip.y-.09,hip.z+.02);}
  };
  const frame=(p:PatientPosition)=>{
   const lying=p==='supino'||p==='prono'||p==='lateral';
   controls.target.set(0,lying?TABLE_TOP+.1:p==='sedente'?.6:.85,0);
   // Portrait phones show the body above the detail sheet: step back so the whole patient fits.
   const back=camera.aspect<.8?2.1:1,t=controls.target;
   camera.position.set(lying?1.9:1.5,lying?1.9:1.2,lying?2.1:3.1).sub(t).multiplyScalar(back).add(t);
   if(camera.aspect<.8)t.y-=lying?.35:.25;
   camera.updateProjectionMatrix();controls.update();dirty=true;
  };
  const paint=()=>{
   if(!rig)return;const values=new Map<string,number>(),targetSet=new Set(latest.current.targets);
   for(const [k,m] of rig.muscles){
    const e=elongation(rig,k),mat=m.mesh.material as T.MeshStandardMaterial;values.set(k,e);
    const target=targetSet.has(k);
    if(target)strainColor(e,mat.color);else mat.color.copy(MUSCLE);
    mat.opacity=target?1:.32;mat.transparent=!target;mat.depthWrite=target;mat.emissive.setHex(target?0x220806:0);
   }
   callbacks.current.onElongation(values);
  };
  const interpolate=(t:number)=>{
   const out:JointAngles={},ids=new Set([...Object.keys(from),...Object.keys(to)]) as Set<JointId>;
   for(const id of ids){out[id]={};for(const m of MOTIONS){const a=angleOf(from,id,m),b=angleOf(to,id,m);if(a||b)out[id]![m]=a+(b-a)*t;}}
   return out;
  };
  const sync=(now:number)=>{
   const {position:p,pose:target,targets:t}=latest.current;
   if(p!==lastPosition){lastPosition=p;place(p);frame(p);from=shown;to=target;start=now;}
   else if(target!==to){from=shown;to=target;start=now;}
   // Keep moving until the shown pose is the target: a slow first frame can jump straight past the duration.
   const k=Math.min(1,(now-start)/DURATION),eased=k<.5?2*k*k:1-(-2*k+2)**2/2;
   if(rig&&(shown!==to||t.join()!==lastTargets)){shown=k<1?interpolate(eased):to;applyPose(rig,shown);place(p);ground_feet();paint();lastTargets=t.join();dirty=true;}
  };
  // Render only when something changed: an orbit, a resize or a pose still moving.
  const loop=(now:number)=>{if(disposed)return;sync(now);controls.update();if(dirty){dirty=false;renderer.render(scene,camera);}};

  (async()=>{
   const metaResponse=await fetch(BASE+'lower-limb.json',{signal:abort.signal});
   if(!metaResponse.ok)throw new Error('No se pudo cargar el modelo de kinesiología.');
   const meta=await metaResponse.json() as RigMeta;onProgress(10);
   const buffer=await decodeModelResponse(await fetch(BASE+meta.model,{signal:abort.signal}),meta.modelBytes,true);onProgress(80);
   const gltf=await new GLTFLoader().parseAsync(buffer,'');if(disposed)return;
   const bone=new T.MeshStandardMaterial({color:'#e2d9ba',metalness:.05,roughness:.6}),context=new T.MeshStandardMaterial({color:'#c9a39b',roughness:.6,transparent:true,opacity:.22,depthWrite:false});
   gltf.scene.traverse(o=>{
    if(!(o as T.Mesh).isMesh)return;const mesh=o as T.Mesh;
    mesh.material=mesh.name.startsWith('muscle__')?new T.MeshStandardMaterial({color:MUSCLE,metalness:.05,roughness:.5}):mesh.name.startsWith('context__')?context:bone;
    mesh.frustumCulled=false;
   });
   holder.add(gltf.scene);rig=bindRig(meta,gltf.scene);
   // Bone meshes that hang from a limb root are not trunk.
   const LIMBS=new Set(['RightUpLeg','LeftUpLeg','RightArm','LeftArm']);
   gltf.scene.traverse(o=>{if((o as T.Mesh).isMesh&&o.name.startsWith('bone__'))boneMeshes.push(o as T.Mesh);});
   trunkMeshes=boneMeshes.filter(m=>{for(let p=m.parent;p;p=p.parent)if(LIMBS.has(p.name))return false;return true;});
   for(const [k,m] of rig.muscles)m.mesh.userData.muscle=k;
   lastPosition=null;lastTargets='-';onProgress(100);
   renderer.setAnimationLoop(loop);
  })().catch(e=>{if(e.name!=='AbortError'&&!disposed)onError(e.message||'No se pudo cargar el modelo de kinesiología.');});

  // Tap a muscle to choose it; drags orbit the camera.
  const tap=new PointerTap(),ray=new T.Raycaster(),pointer=new T.Vector2();
  const down=(e:PointerEvent)=>tap.down(e.pointerId,e.clientX,e.clientY,e.pointerType==='touch'?12:5),move=(e:PointerEvent)=>tap.move(e.pointerId,e.clientX,e.clientY),cancel=(e:PointerEvent)=>tap.cancel(e.pointerId);
  const up=(e:PointerEvent)=>{
   if(!tap.up(e.pointerId,e.clientX,e.clientY)||!rig)return;
   const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);
   const hit=ray.intersectObjects([...rig.muscles.values()].map(m=>m.mesh),false)[0];
   if(hit)callbacks.current.onPick(hit.object.userData.muscle);
  };
  const c=renderer.domElement;c.addEventListener('pointerdown',down);c.addEventListener('pointermove',move);c.addEventListener('pointerup',up);c.addEventListener('pointercancel',cancel);
  return()=>{disposed=true;abort.abort();observer.disconnect();renderer.setAnimationLoop(null);controls.dispose();renderer.dispose();c.remove();};
 },[]);
 return <div ref={host} className="kinesio-canvas"/>;
}
