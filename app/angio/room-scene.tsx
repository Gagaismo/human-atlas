import {useEffect,useRef,useState} from 'react';
import * as T from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {clampAngles,fmtAngulation,fmtRotation} from './core/geometry';
import {clampToSafe,type BodyPart} from './core/room';
import {buildRoom,rigMatrix,type RoomModel} from './room-models';

export interface RoomSceneProps{a:number;b:number;onAngles:(a:number,b:number)=>void}

const NO_WEBGL='Esta vista necesita WebGL 2, que este navegador tiene desactivado o no admite. Probá con una versión actual de Chrome, Firefox o Safari.';
const FLASH_MS=2000;
const BG='#0a0c0f';
/** Default room camera: from the patient's left-foot side, slightly above (world metres; the patient lies along −Z, head at −Z). */
const HOME_DIR=new T.Vector3(3.3,1.7,3.4),HOME_TARGET=new T.Vector3(0,-.25,.05);
const webgl2=()=>{try{return !!document.createElement('canvas').getContext('webgl2');}catch{return false;}};

const ui={
 root:{position:'relative',width:'100%',height:'100%',minHeight:160,overflow:'hidden',background:BG,fontFamily:'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',color:'#c9ced4',touchAction:'none',userSelect:'none'},
 corner:{position:'absolute',left:10,top:8,pointerEvents:'none',lineHeight:1.35},
 label:{fontSize:10,letterSpacing:'.14em',color:'#7d8793'},
 readout:{fontSize:12,color:'#e6e9ec'},
 tag:{position:'absolute',left:0,top:0,fontSize:11,color:'#ffd25a',whiteSpace:'nowrap',pointerEvents:'none',textShadow:'0 0 4px #000,0 0 2px #000',willChange:'transform'},
 side:{position:'absolute',left:0,top:0,fontSize:11,color:'#aab3bd',pointerEvents:'none',willChange:'transform'},
 hint:{position:'absolute',left:10,bottom:8,fontSize:10,color:'#7d8793',pointerEvents:'none'},
 reset:{position:'absolute',right:8,bottom:8,font:'inherit',fontSize:11,padding:'4px 8px',color:'#c9ced4',background:'#161a20',border:'1px solid #343c46',borderRadius:3,cursor:'pointer'},
 warn:{position:'absolute',left:'50%',top:34,transform:'translateX(-50%)',maxWidth:'90%',fontSize:12,textAlign:'center',color:'#ffd9d6',background:'rgba(120,20,16,.88)',border:'1px solid #e0302c',borderRadius:3,padding:'5px 10px',pointerEvents:'none'},
 fallback:{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',padding:16,textAlign:'center',fontSize:12,lineHeight:1.5,color:'#aab3bd'},
} satisfies Record<string,React.CSSProperties>;

interface Api{setAngles(a:number,b:number):void}

export default function RoomScene({a,b,onAngles}:RoomSceneProps){
 const host=useRef<HTMLDivElement>(null),detTag=useRef<HTMLSpanElement>(null),tubeTag=useRef<HTMLSpanElement>(null),letters=useRef<(HTMLSpanElement|null)[]>([]);
 const latest=useRef({a,b,onAngles}),api=useRef<Api|null>(null),resetView=useRef<()=>void>(()=>{});
 latest.current={a,b,onAngles};
 const [warning,setWarning]=useState<string|null>(null),[supported,setSupported]=useState(true);
 const warnTimer=useRef(0);

 useEffect(()=>{
  const el=host.current!;
  if(!webgl2()){setSupported(false);return;}
  let renderer:T.WebGLRenderer;
  try{renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}catch{setSupported(false);return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(BG);renderer.outputColorSpace=T.SRGBColorSpace;
  const canvas=renderer.domElement;canvas.style.cssText='display:block;width:100%;height:100%;touch-action:none';
  canvas.setAttribute('aria-hidden','true');el.insertBefore(canvas,el.firstChild);

  const scene=new T.Scene();scene.background=new T.Color(BG);scene.fog=new T.Fog(BG,6,13);
  const camera=new T.PerspectiveCamera(32,1,.1,40);
  scene.add(new T.HemisphereLight(0xdfe6ee,0x1b1f25,1.25));
  const key=new T.DirectionalLight(0xfff6ea,2.1);key.position.set(2.5,4.5,3);scene.add(key);
  const fill=new T.DirectionalLight(0xb9ccff,.7);fill.position.set(-3,2,-2);scene.add(fill);

  const model:RoomModel=buildRoom();
  // Patient frame (X left, Y head, Z anterior, mm) → viewer world (Y up, patient along −Z, metres).
  model.group.rotation.x=-Math.PI/2;model.group.scale.setScalar(.001);scene.add(model.group);
  scene.updateMatrixWorld(true);

  const controls=new OrbitControls(camera,canvas);
  controls.enablePan=false;controls.minDistance=2.4;controls.maxDistance=9;controls.maxPolarAngle=Math.PI*.49;
  let disposed=false,frameQueued=0,w=1,h=1;
  const request=()=>{if(!frameQueued&&!disposed)frameQueued=requestAnimationFrame(draw);};
  controls.addEventListener('change',request);

  const home=()=>{
   const k=Math.min(1.6,Math.max(.7,.78/Math.max(w/h,.1)));
   camera.position.copy(HOME_TARGET).addScaledVector(HOME_DIR,k);controls.target.copy(HOME_TARGET);controls.update();request();
  };
  resetView.current=home;

  const tmp=new T.Vector3(),tmpM=new T.Matrix4();
  const toScreen=(p:T.Vector3,out:{x:number;y:number})=>{tmp.copy(p).project(camera);out.x=(tmp.x+1)/2*w;out.y=(1-tmp.y)/2*h;return tmp.z<1;};
  const anchor=new T.Vector3(),pt={x:0,y:0};
  const placeTag=(node:HTMLElement|null,o:T.Object3D|T.Vector3,dx:number,dy:number)=>{
   if(!node)return;
   if(o instanceof T.Vector3)anchor.copy(o).applyMatrix4(model.group.matrixWorld);else o.getWorldPosition(anchor);
   const ok=toScreen(anchor,pt);node.style.visibility=ok?'visible':'hidden';node.style.transform=`translate(${Math.round(pt.x+dx)}px,${Math.round(pt.y+dy)}px)`;
  };
  function draw(){
   frameQueued=0;if(disposed)return;
   scene.updateMatrixWorld(true);renderer.render(scene,camera);
   placeTag(detTag.current,model.detectorAnchor,-100,-14);
   placeTag(tubeTag.current,model.tubeAnchor,-30,6);
   model.sideLetters.forEach((s,i)=>placeTag(letters.current[i],s.point,-4,-6));
  }

  const resize=()=>{w=Math.max(el.clientWidth,1);h=Math.max(el.clientHeight,1);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();request();};
  const observer=new ResizeObserver(()=>{const first=!camera.userData.sized;camera.userData.sized=true;resize();if(first)home();});observer.observe(el);resize();

  // Flash a colliding body part and show the message for ~2 s.
  let flashed:BodyPart|null=null,flashTimer=0;
  const flash=(part:BodyPart,message:string)=>{
   if(flashed&&flashed!==part)model.flash(flashed,false);
   flashed=part;model.flash(part,true);request();
   clearTimeout(flashTimer);flashTimer=window.setTimeout(()=>{model.flash(part,false);flashed=null;request();},FLASH_MS);
   setWarning(message);clearTimeout(warnTimer.current);warnTimer.current=window.setTimeout(()=>setWarning(null),FLASH_MS);
  };

  api.current={setAngles(a2,b2){model.setAngles(a2,b2);request();}};
  model.setAngles(latest.current.a,latest.current.b);

  // Dragging the C-arm: pointer motion is mapped to angle changes through the on-screen Jacobian of the grabbed point,
  // so dragging toward the head raises CRA and toward the patient's left raises OAI from any camera.
  const ray=new T.Raycaster(),ndc=new T.Vector2(),local=new T.Vector3();
  const pick=(e:PointerEvent)=>{
   const r=canvas.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height)*2+1);
   ray.setFromCamera(ndc,camera);return ray.intersectObjects(model.pickables,false)[0]??null;
  };
  const screenOf=(a2:number,b2:number,out:{x:number;y:number})=>{
   rigMatrix(a2,b2,tmpM);const p=local.clone().applyMatrix4(tmpM).applyMatrix4(model.group.matrixWorld);return toScreen(p,out)&&out;
  };
  let drag:{id:number;x:number;y:number;a:number;b:number;wantA:number;wantB:number}|null=null;
  const onDown=(e:PointerEvent)=>{
   if(e.button!==0&&e.pointerType==='mouse')return;
   const hit=pick(e);if(!hit)return;
   // Capture phase on the host: the orbit controls (target phase) must not start this gesture.
   controls.enabled=false;
   local.copy(hit.point);model.rig.worldToLocal(local);
   const {a:ca,b:cb}=latest.current;
   drag={id:e.pointerId,x:e.clientX,y:e.clientY,a:ca,b:cb,wantA:ca,wantB:cb};
   canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';e.preventDefault();
  };
  const P0={x:0,y:0},P1={x:0,y:0},Q0={x:0,y:0},Q1={x:0,y:0};
  const onMove=(e:PointerEvent)=>{
   if(!drag){if(e.pointerType==='mouse'&&controls.enabled)canvas.style.cursor=pick(e)?'grab':'';return;}
   if(e.pointerId!==drag.id)return;
   const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;
   const {a:a0,b:b0}=drag;
   const okA=screenOf(a0+.5,b0,P1)&&screenOf(a0-.5,b0,P0),okB=screenOf(a0,b0+.5,Q1)&&screenOf(a0,b0-.5,Q0);
   let da=dx*.3,db=-dy*.3;
   if(okA&&okB){
    const ax=P1.x-P0.x,ay=P1.y-P0.y,bx=Q1.x-Q0.x,by=Q1.y-Q0.y,det=ax*by-bx*ay;   // pixels per degree
    if(Math.abs(det)>.25*Math.hypot(ax,ay)*Math.hypot(bx,by)){da=(dx*by-bx*dy)/det;db=(ax*dy-dx*ay)/det;}
   }
   const lim=(x:number)=>Math.max(-20,Math.min(20,x));
   const want=clampAngles(drag.wantA+lim(da),drag.wantB+lim(db));
   const res=clampToSafe({a:a0,b:b0},want);
   if(res.hit){flash(res.hit.part,res.hit.message);drag.wantA=res.a;drag.wantB=res.b;}else{drag.wantA=want.a;drag.wantB=want.b;}
   drag.a=res.a;drag.b=res.b;
   if(res.a!==latest.current.a||res.b!==latest.current.b)latest.current.onAngles(res.a,res.b);
  };
  const onUp=(e:PointerEvent)=>{
   if(!drag||e.pointerId!==drag.id)return;
   drag=null;controls.enabled=true;canvas.style.cursor='';
   if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
  };
  el.addEventListener('pointerdown',onDown,true);
  canvas.addEventListener('pointermove',onMove);canvas.addEventListener('pointerup',onUp);canvas.addEventListener('pointercancel',onUp);

  request();
  return()=>{
   disposed=true;cancelAnimationFrame(frameQueued);clearTimeout(flashTimer);clearTimeout(warnTimer.current);
   el.removeEventListener('pointerdown',onDown,true);observer.disconnect();controls.dispose();
   api.current=null;resetView.current=()=>{};
   model.dispose();renderer.dispose();canvas.remove();
  };
 },[]);

 useEffect(()=>{api.current?.setAngles(a,b);},[a,b]);

 const summary=`Sala de hemodinamia 3D: arco en C en ${fmtRotation(a)} ${fmtAngulation(b)}. Se mueve con los controles de rotación y angulación.`;
 return <div ref={host} className="angio-room" style={ui.root} role="group" aria-label={summary}>
  {supported?<>
   <span ref={detTag} style={ui.tag} aria-hidden="true">Detector (I/I)</span>
   <span ref={tubeTag} style={ui.tag} aria-hidden="true">Tubo de rayos X</span>
   {['I','D'].map((t,i)=><span key={t} ref={n=>{letters.current[i]=n;}} style={ui.side} aria-hidden="true" title={t==='I'?'Izquierda del paciente':'Derecha del paciente'}>{t}</span>)}
   <div className="angio-room-readout" style={ui.corner}><span style={ui.label}>SALA</span><span style={ui.readout}> · {fmtRotation(a)}{Math.round(b)?` ${fmtAngulation(b)}`:''}</span></div>
   <div style={ui.hint}>arrastrá para mover el arco en C</div>
   <button type="button" className="angio-room-reset" style={ui.reset} onClick={()=>resetView.current()}>Vista de la sala</button>
   {warning&&<div role="status" style={ui.warn}>{warning}</div>}
  </>:<div style={ui.fallback} role="status">{NO_WEBGL}</div>}
 </div>;
}
