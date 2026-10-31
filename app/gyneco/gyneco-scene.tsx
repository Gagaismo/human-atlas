import {useEffect,useRef} from 'react';
import * as T from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {decodeModelResponse} from '../model-download';
import {PointerTap} from '../pointer-tap';
import {ChestSurface,type SurfaceHit} from './surface';
import {partGeometry,type FemaleManifest} from './model';
import {BODY_URL,PAD_HEIGHT,applyExamPose,bakeChest,bindBody,padTarget,type BodyMeta,type BodyRig} from './body';
import {DURATION,PALPATION_TRAIL,STOPS,TRAIL,sampleAt,type Pressure} from './palpation';

export type Side='l'|'r';
export type BodyPosition='standing'|'supine';
export type ViewPreset='breasts'|'pelvis';
interface Props {
 demo:boolean;side:Side;position:BodyPosition;interior:boolean;view:{preset:ViewPreset;n:number};
 playing:boolean;speed:number;seek:{t:number;n:number};selectedId:string|null;
 onTime:(t:number)=>void;onEnd:()=>void;onPick:(id:string)=>void;onProgress:(n:number)=>void;onError:(message:string)=>void;
}
const MANIFEST='/models/female/female-parts.json',TABLE_TOP=.6;
const HALO:Record<Pressure,{color:string;scale:number}>={suave:{color:'#5fd0b5',scale:1},media:{color:'#f2b84b',scale:1.12},firme:{color:'#e0463c',scale:1.26}};
const TISSUE=[/^VHF-breast-fat/,/^VHF-mammary-lobes/,/^VHF-lactiferous-ducts/];
const looks:[RegExp,string,number][]=[
 [/^VHF-breast-fat/,'#f1dd9e',.3],[/^VHF-mammary-lobes/,'#d98f86',.55],[/^VHF-lactiferous-ducts/,'#fff0b8',.92],
 [/^VHF-(areola|nipple)/,'#b87a6b',1],[/^VHF-uterine-tube/,'#d6877d',1],[/^VHF-ovary/,'#e0b46a',1],[/^VHF-urinary-bladder/,'#d8c872',1],
 [/^VHF-(hip-bone|sacrum|coccyx)/,'#e4dcc4',1],[/^VHF-(uterine|lower-uterine|cervi)/,'#c9707a',1],
];
/** Body skin: opaque, or see-through when the interior is shown so the glands and the pelvic organs show under it. */
const SKIN_OPACITY={opaque:1,interior:.28};
/** The pose eases toward its target with this rate (1/s), so steps and seeks blend instead of snapping. */
const POSE_RATE=11;

type Paths=Record<Side,{stops:SurfaceHit[];trail:SurfaceHit[]}>;
const upperBound=(values:number[],x:number)=>{let lo=0,hi=values.length;while(lo<hi){const m=lo+hi>>1;if(values[m]<=x)lo=m+1;else hi=m;}return lo;};

export default function GynecoScene(props:Props){
 const host=useRef<HTMLDivElement>(null),latest=useRef(props);
 latest.current=props;
 useEffect(()=>{
  const el=host.current!;let disposed=false,dirty=true;
  const abort=new AbortController();
  let renderer:T.WebGLRenderer;
  try{renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}catch{latest.current.onError('Este navegador no pudo iniciar el visor 3D. Probá con un navegador con WebGL activado.');return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<768?1.5:2));renderer.setClearColor('#f2f3f3');renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;el.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','Modelo femenino 3D. Arrastrá para rotar, pellizcá o usá la rueda para acercar y tocá una estructura para ver su descripción.');
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(34,1,.01,60),controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;controls.dampingFactor=.085;controls.addEventListener('change',()=>{dirty=true;});controls.minDistance=.12;controls.maxDistance=8;controls.maxPolarAngle=Math.PI*.96;
  const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment();scene.environment=pmrem.fromScene(room,.04).texture;room.dispose();pmrem.dispose();
  scene.add(new T.HemisphereLight(0xffffff,0xa7acb2,1.05));
  const key=new T.DirectionalLight(0xfffaf4,2.2);key.position.set(-2,4,3);scene.add(key);
  const rim=new T.DirectionalLight(0xe9f0ff,1.6);rim.position.set(2,2,-3);scene.add(rim);
  const ground=new T.Mesh(new T.CircleGeometry(30,96),new T.MeshStandardMaterial({color:0xd5d9dc,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.002;scene.add(ground);
  const table=new T.Mesh(new T.BoxGeometry(.8,TABLE_TOP-.05,2.1),new T.MeshStandardMaterial({color:0xe7e3dc,roughness:.8}));table.position.set(0,(TABLE_TOP+.05)/2,0);scene.add(table);
  // Everything anatomical lives in the holder (the body frame), so lying down rotates body, hands and trail together.
  const holder=new T.Group();scene.add(holder);
  // Lying: a pillow under the shoulder of the examined side (sources: "almohada bajo el hombro"), behind the back in the body frame.
  const pillow=new T.Mesh(new T.BoxGeometry(.3,.26,.055),new T.MeshStandardMaterial({color:0xf4f1ea,roughness:.95}));pillow.visible=false;holder.add(pillow);
  // On wide screens the detail panel covers the right side: shift the image left so the body (and the axilla) stays in the free band.
  const resize=()=>{const w=el.clientWidth,h=el.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/Math.max(h,1);if(w>=768)camera.setViewOffset(w,h,w>1000?80:70,0,w,h);else camera.clearViewOffset();camera.updateProjectionMatrix();dirty=true;};
  const observer=new ResizeObserver(resize);observer.observe(el);resize();

  // A halo on the skin shows the pressure; the trail and its dots show the covered path.
  const haloMaterial=new T.MeshBasicMaterial({color:HALO.suave.color,transparent:true,opacity:.8,side:T.DoubleSide,depthTest:false}),halo=new T.Mesh(new T.RingGeometry(.039,.043,64),haloMaterial);halo.renderOrder=10;halo.visible=false;
  holder.add(halo);
  const trailGeometry=new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(new Float32Array(TRAIL.length*3),3)),trail=new T.Line(trailGeometry,new T.LineBasicMaterial({color:'#1f6f8b'}));trail.frustumCulled=false;trail.renderOrder=9;holder.add(trail);
  const dotMaterial=new T.MeshBasicMaterial({color:'#2a8fb0'}),dots=STOPS.map(()=>{const d=new T.Mesh(new T.SphereGeometry(.005,10,8),dotMaterial);d.visible=false;holder.add(d);return d;});

  let rig:BodyRig|null=null,paths:Paths|null=null,backZ=-.136;
  let clock=0,lastNow=0,lastSent=-1,lastSeek=latest.current.seek.n,lastView=-1,lastSide:Side|null=null,lastPosition:BodyPosition|null=null,lastInterior:boolean|null=null,lastDemo=true,lastSelected:string|null|undefined,height=PAD_HEIGHT.lift,ended=false,settling=false;
  const meshes=new Map<string,T.Mesh>(),times=TRAIL.map(p=>p.t);
  const skinMaterial=new T.MeshStandardMaterial({color:'#e2b9a0',roughness:.62,transparent:true,opacity:SKIN_OPACITY.opaque});
  // Shown bone rotations ease toward the pose the timeline asks for.
  const shown=new Map<string,T.Quaternion>(),target=new T.Quaternion();

  const place=(position:BodyPosition)=>{
   const lying=position==='supine';table.visible=lying;pillow.visible=lying;
   holder.rotation.set(lying?-Math.PI/2:0,0,0);holder.position.set(0,lying?TABLE_TOP-backZ+.003:0,lying?.86:0);holder.updateMatrixWorld(true);
  };
  const frame=()=>{
   const {side,view,position}=latest.current,s=side==='l'?1:-1,breasts=view.preset==='breasts',lying=position==='supine';
   // Lying, the camera stands at the feet end above the table, so the head stays at the top of the screen.
   // The breasts view frames the head too, so the raised hand behind the nape stays in sight while the other hand palpates.
   const portrait=camera.aspect<.8,target=breasts?new T.Vector3(s*.06,portrait?1.22:1.4,.08):new T.Vector3(0,.92,.01),offset=lying?(breasts?new T.Vector3(s*.2,-.8,.85):new T.Vector3(.25,-.55,.5)):breasts?new T.Vector3(s*.22,.06,1.2):new T.Vector3(.25,.1,.55);
   // Portrait phones show the body above the detail sheet: step back and move the view up into the free band.
   const back=portrait?(breasts?2.5:1.3):1;
   controls.target.copy(holder.localToWorld(target.clone()));camera.position.copy(holder.localToWorld(target.clone().add(offset.multiplyScalar(back))));
   if(portrait){const dir=controls.target.clone().sub(camera.position).normalize(),shift=new T.Vector3().crossVectors(new T.Vector3().crossVectors(dir,camera.up).normalize(),dir).multiplyScalar(-(breasts?.064:.06)*back);controls.target.add(shift);camera.position.add(shift);}
   camera.updateProjectionMatrix();controls.update();dirty=true;
  };
  const refreshPaths=()=>{
   if(!paths)return;const p=paths[latest.current.side],attr=trailGeometry.getAttribute('position') as T.BufferAttribute,v=new T.Vector3();
   p.trail.forEach((h,i)=>{v.copy(h.point).addScaledVector(h.normal,.003).toArray(attr.array,i*3);});attr.needsUpdate=true;
   p.stops.forEach((h,i)=>dots[i].position.copy(h.point).addScaledVector(h.normal,.002));
   const s=latest.current.side==='l'?1:-1;pillow.position.set(s*.19,1.36,backZ+.02);
   dirty=true;
  };
  const hitAt=(t:number):SurfaceHit|null=>{
   if(!paths)return null;const p=paths[latest.current.side].trail,i=upperBound(times,t)-1;
   if(i<0)return p[0];if(i>=p.length-1)return p[p.length-1];
   const a=p[i],b=p[i+1],span=times[i+1]-times[i],u=span>0?(t-times[i])/span:0;
   return {point:a.point.clone().lerp(b.point,u),normal:a.normal.clone().lerp(b.normal,u).normalize(),distance:a.distance};
  };
  const UP=new T.Vector3(0,1,0),X=new T.Vector3(),Y=new T.Vector3(),basis=new T.Matrix4(),pad=new T.Vector3();
  /** Poses the body for the current moment and eases the shown bones toward it. */
  const pose=(dt:number,h:SurfaceHit|null)=>{
   if(!rig)return;
   const {demo,side}=latest.current,s=sampleAt(clock),palpating=demo&&s.step!=='inspection'&&h;
   if(palpating)padTarget(h,s,height,pad);
   applyExamPose(rig,{step:s.step,side,pad:palpating?pad:null,normal:palpating?h.normal:null,t:clock,demo});
   const k=dt>0?1-Math.exp(-dt*POSE_RATE):1;let moving=false;
   for(const [name,bone] of rig.bones){
    target.copy(bone.quaternion);const q=shown.get(name);
    if(!q){shown.set(name,target.clone());continue;}
    q.slerp(target,k);if(q.angleTo(target)>1e-3)moving=true;bone.quaternion.copy(q);
   }
   settling=moving;
  };
  const paint=(dt:number)=>{
   const h=hitAt(clock);if(!h)return;
   const s=sampleAt(clock),n=h.normal,{demo}=latest.current;
   const t=PAD_HEIGHT[s.pressure??'lift'],k=1-Math.exp(-dt*28);
   height+=(t-height)*(dt>0?k:1);
   pose(dt,h);
   // Outside the self-exam section, and during the mirror inspection, there is no halo and no trail yet.
   if(!demo||s.step==='inspection'){halo.visible=false;trailGeometry.setDrawRange(0,0);STOPS.forEach((_,i)=>{dots[i].visible=false;});return;}
   Y.copy(UP).addScaledVector(n,-UP.dot(n));if(Y.lengthSq()<1e-6)Y.set(1,0,0);Y.normalize();X.crossVectors(Y,n);
   halo.visible=!!s.pressure;
   if(s.pressure){haloMaterial.color.set(HALO[s.pressure].color);halo.scale.setScalar(HALO[s.pressure].scale);basis.makeBasis(X,Y,n);halo.quaternion.setFromRotationMatrix(basis);halo.position.copy(h.point).addScaledVector(n,.004);}
   trailGeometry.setDrawRange(0,Math.min(upperBound(times,clock),PALPATION_TRAIL));
   STOPS.forEach((stop,i)=>{dots[i].visible=stop.start<=clock;});
  };
  const select=(id:string|null)=>{for(const [pid,m] of meshes){const mat=m.material as T.MeshStandardMaterial;mat.emissive.set(pid===id?'#1d6fa5':'#000000');mat.emissiveIntensity=pid===id?.7:0;}dirty=true;};

  const loop=(now:number)=>{
   if(disposed)return;
   const dt=lastNow?Math.min(.1,(now-lastNow)/1000):0;lastNow=now;
   const p=latest.current;
   if(p.seek.n!==lastSeek){lastSeek=p.seek.n;clock=Math.min(Math.max(p.seek.t,0),DURATION);ended=false;lastSent=-1;dirty=true;}
   if(p.position!==lastPosition){lastPosition=p.position;place(p.position);frame();}
   if(p.side!==lastSide){lastSide=p.side;refreshPaths();frame();}
   if(p.demo!==lastDemo){lastDemo=p.demo;dirty=true;}
   if(p.view.n!==lastView){lastView=p.view.n;frame();}
   if(p.interior!==lastInterior){lastInterior=p.interior;skinMaterial.opacity=p.interior?SKIN_OPACITY.interior:SKIN_OPACITY.opaque;skinMaterial.depthWrite=!p.interior;dirty=true;}
   if(p.selectedId!==lastSelected){lastSelected=p.selectedId;select(p.selectedId);}
   if(p.playing&&clock<DURATION){clock=Math.min(DURATION,clock+dt*p.speed);dirty=true;if(clock>=DURATION&&!ended){ended=true;p.onEnd();}}
   if(paths&&(dirty||settling||Math.abs(height-PAD_HEIGHT[sampleAt(clock).pressure??'lift'])>1e-4)){paint(dt);dirty=true;}
   if(Math.abs(clock-lastSent)>=.05||(clock===DURATION&&lastSent!==clock)){lastSent=clock;p.onTime(clock);}
   controls.update();
   if(dirty){dirty=false;renderer.render(scene,camera);}
  };

  (async()=>{
   const [manifestResponse,metaResponse]=await Promise.all([fetch(MANIFEST,{signal:abort.signal}),fetch(BODY_URL,{signal:abort.signal})]);
   if(!manifestResponse.ok)throw new Error('No se pudo cargar el modelo femenino.');
   if(!metaResponse.ok)throw new Error('No se pudo cargar el cuerpo del modelo.');
   const manifest=await manifestResponse.json() as FemaleManifest,meta=await metaResponse.json() as BodyMeta;latest.current.onProgress(10);
   const chunk=manifest.chunk,compressed=!!chunk.gzip&&typeof DecompressionStream!=='undefined';
   const [buffer,bodyBuffer]=await Promise.all([
    decodeModelResponse(await fetch(compressed?chunk.gzip!:chunk.url,{signal:abort.signal}),chunk.bytes,compressed),
    decodeModelResponse(await fetch('/models/gyneco/'+meta.model,{signal:abort.signal}),meta.modelBytes,true),
   ]);latest.current.onProgress(70);
   if(disposed)return;
   // HRA organs: the breast structures and the pelvic organs; the HRA skin is replaced by the rigged body.
   for(const part of manifest.parts){
    if(part.id==='VHF-skin')continue;
    const g=partGeometry(buffer,part);g.computeBoundingSphere();
    const [,color,opacity]=looks.find(([re])=>re.test(part.id))??[/./,'#c9a39b',1],tissue=TISSUE.some(re=>re.test(part.id));
    const mesh=new T.Mesh(g,new T.MeshStandardMaterial({color,roughness:.55,transparent:opacity<1,opacity,depthWrite:opacity>=1}));
    if(tissue)mesh.renderOrder=TISSUE.findIndex(re=>re.test(part.id))+1;
    mesh.userData.id=part.id;meshes.set(part.id,mesh);mesh.frustumCulled=false;holder.add(mesh);
   }
   const gltf=await new GLTFLoader().parseAsync(bodyBuffer,'');if(disposed)return;
   gltf.scene.traverse(o=>{if((o as T.Mesh).isMesh){const m=o as T.Mesh;m.material=skinMaterial;m.frustumCulled=false;m.renderOrder=4;}});
   holder.add(gltf.scene);
   rig=bindBody(meta,gltf.scene);backZ=meta.landmarks.backZ;latest.current.onProgress(85);
   // Palpation points on the posed skin of each side (its arm raised opens the axilla), then the pose eases from rest.
   const surface={l:new ChestSurface(bakeChest(rig,'l')),r:new ChestSurface(bakeChest(rig,'r'))};
   const hits=(list:{theta:number;y:number}[],side:Side)=>list.map(p=>{const h=surface[side].hit(p.theta,p.y,side==='l'?1:-1);if(!h)throw new Error('No se pudo ubicar la piel del pecho en el modelo.');return h;});
   paths={l:{stops:hits(STOPS,'l'),trail:hits(TRAIL,'l')},r:{stops:hits(STOPS,'r'),trail:hits(TRAIL,'r')}};
   skinMaterial.opacity=latest.current.interior?SKIN_OPACITY.interior:SKIN_OPACITY.opaque;skinMaterial.depthWrite=!latest.current.interior;
   lastSide=null;lastPosition=null;lastSelected=undefined;dirty=true;latest.current.onProgress(100);
  })().catch(e=>{if(e.name!=='AbortError'&&!disposed)latest.current.onError(e.message||'No se pudo cargar el modelo femenino.');});
  renderer.setAnimationLoop(loop);

  // Tap a structure to select it (the body is ignored so organs under it can be reached); drags orbit.
  const tap=new PointerTap(),ray=new T.Raycaster(),pointer=new T.Vector2(),c=renderer.domElement;
  const down=(e:PointerEvent)=>tap.down(e.pointerId,e.clientX,e.clientY,e.pointerType==='touch'?12:5),move=(e:PointerEvent)=>tap.move(e.pointerId,e.clientX,e.clientY),cancel=(e:PointerEvent)=>tap.cancel(e.pointerId);
  const up=(e:PointerEvent)=>{
   if(!tap.up(e.pointerId,e.clientX,e.clientY))return;
   const r=c.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);
   const hit=ray.intersectObjects([...meshes.values()],false)[0];
   if(hit)latest.current.onPick(hit.object.userData.id);
  };
  c.addEventListener('pointerdown',down);c.addEventListener('pointermove',move);c.addEventListener('pointerup',up);c.addEventListener('pointercancel',cancel);
  return()=>{disposed=true;abort.abort();observer.disconnect();renderer.setAnimationLoop(null);controls.dispose();renderer.dispose();c.remove();};
 },[]);
 return <div ref={host} className="gyneco-canvas"/>;
}
