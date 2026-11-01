import {useEffect,useRef,useState} from 'react';
import * as T from 'three';
import type {CoronaryTree,Segment,Vec3,Vessel,Visibility} from './core/types';
import {FAMILY_PALETTE,arcLengths,findSegment,pointAtArc,polylineLength,segmentRange,visibleVessels} from './core/tree';
import {DETECTOR_SIZE,SID,SOD,imageAxes} from './core/geometry';
import {foreshorteningOfPolyline} from './core/metrics';
import {buildVesselGeometry,segmentAtArc} from './vessel-mesh';
import {loadHeartAsset,type HeartPart} from './heart-asset';

export interface HeartToggles{detectorView:boolean;foreshortening:boolean;skeleton:boolean;seeThrough:boolean;labels:boolean;planes:boolean}
export interface HeartSceneProps{tree:CoronaryTree;vis:Visibility;a:number;b:number;selected:string|null;toggles:HeartToggles;onSelect:(segmentId:string|null)=>void;onDetectorViewLeft:()=>void}

const NO_WEBGL='Esta vista necesita WebGL 2, que este navegador tiene desactivado o no admite. Probá con una versión actual de Chrome, Firefox o Safari.';
/** The C-arm is drawn at this fraction of its real size so the whole arc stays close to the heart. */
const ARM_SCALE=.35,TUBE_Z=-SOD*ARM_SCALE,DETECTOR_Z=(SID-SOD)*ARM_SCALE,DETECTOR_SIDE=DETECTOR_SIZE*ARM_SCALE;
const MIN_DIST=100,MAX_DIST=1500,DEFAULT_DIST=340,HIGHLIGHT='#ff9a1f',HOVER='#ffffff',FADE_S=.25;
// S16: darker matte heart, plain grey-blue great vessels and a light grey skeleton ghost so the coloured coronaries stand out.
const HEART_COLOR='#8a4b41',GREAT_COLOR='#7f93a6',SKELETON_COLOR='#dde5ec',SOURCE_COLOR='#ffa31f',FIELD_COLOR='#ffb347';
const LABEL_BASE='position:absolute;left:0;top:0;white-space:nowrap;pointer-events:none;font:11px/1.2 ui-monospace,Menlo,Consolas,monospace;padding:1px 5px;border-radius:3px;will-change:transform;';
const LABEL_STYLE={vessel:'color:#f1f4f7;background:#0b1118b3;border:1px solid #ffffff2e;',selected:'color:#1b1002;background:#ff9a1f;font-weight:700;',plane:'color:#d6f6ff;background:#0b1118cc;border:1px solid #6fd3ff80;',carm:'color:#e6eef6;background:#0b1118b3;border:1px solid #7f95a855;',hover:'color:#f1f4f7;background:#0b1118d9;border:1px solid #ffffff55;z-index:3;'};

type Kind=keyof typeof LABEL_STYLE;
interface Label{el:HTMLDivElement;kind:Kind;at:()=>T.Vector3}
type Uni<T>={value:T};
/** Highlight of one vessel: the segment range now selected and the one that is fading out (S14: no abrupt switching). */
interface Glow{uHi0:Uni<number>;uHi1:Uni<number>;uHiA:Uni<number>;uHj0:Uni<number>;uHj1:Uni<number>;uHjA:Uni<number>;uHv0:Uni<number>;uHv1:Uni<number>;uHiColor:Uni<T.Color>;uHvColor:Uni<T.Color>}
interface Fade{lo:number;hi:number;a:number;goal:number}
interface Entry{vessel:Vessel;mesh:T.Mesh;material:T.MeshStandardMaterial;hi:Glow;cur:Fade;old:Fade;full:boolean;base:T.Color;/** Arc fraction of each point of vessel.points (for screen-space picking of thin vessels). */arcF:number[]}
interface PlaneFit{centre:T.Vector3;basis:T.Matrix4;size:[number,number];axis:T.Vector3;corner:T.Vector3}

const v3=(p:Vec3)=>new T.Vector3(p[0],p[1],p[2]);
const visKey=(v:Visibility)=>`${v.system}|${v.ramus}|${[...v.grafts].sort().join(',')}`;

/** Total-least-squares plane through points: centroid + the eigenvector of the smallest covariance eigenvalue. */
function fitPlane(points:T.Vector3[]):PlaneFit|null{
 if(points.length<3)return null;
 const c=new T.Vector3();points.forEach(p=>c.add(p));c.divideScalar(points.length);
 const cov=[0,0,0,0,0,0];
 for(const p of points){const x=p.x-c.x,y=p.y-c.y,z=p.z-c.z;cov[0]+=x*x;cov[1]+=x*y;cov[2]+=x*z;cov[3]+=y*y;cov[4]+=y*z;cov[5]+=z*z;}
 const tr=cov[0]+cov[3]+cov[5],m=new T.Matrix3().set(tr-cov[0],-cov[1],-cov[2],-cov[1],tr-cov[3],-cov[4],-cov[2],-cov[4],tr-cov[5]);
 // Power iteration on (tr·I − C): its dominant eigenvector is the smallest-variance direction of C.
 const n=new T.Vector3(.31,.52,.79).normalize();
 for(let i=0;i<80;i++){n.applyMatrix3(m);if(n.lengthSq()<1e-12)return null;n.normalize();}
 const e1=new T.Vector3().crossVectors(n,Math.abs(n.y)<.9?new T.Vector3(0,1,0):new T.Vector3(1,0,0)).normalize(),e2=new T.Vector3().crossVectors(n,e1);
 let lo1=Infinity,hi1=-Infinity,lo2=Infinity,hi2=-Infinity;
 for(const p of points){const d=p.clone().sub(c),s=d.dot(e1),t=d.dot(e2);lo1=Math.min(lo1,s);hi1=Math.max(hi1,s);lo2=Math.min(lo2,t);hi2=Math.max(hi2,t);}
 const pad=14,mid=c.clone().addScaledVector(e1,(lo1+hi1)/2).addScaledVector(e2,(lo2+hi2)/2);
 return {centre:mid,basis:new T.Matrix4().makeBasis(e1,e2,n),size:[hi1-lo1+2*pad,hi2-lo2+2*pad],axis:n,corner:mid.clone().addScaledVector(e1,(hi1-lo1)/2+pad).addScaledVector(e2,(hi2-lo2)/2+pad)};
}

const COLD=new T.Color('#2f6bff'),MID=new T.Color('#f2d230'),HOT=new T.Color('#e5322d');
/** Foreshortening → colour: 0 % blue, 25 % yellow, ≥ 50 % red. */
function shortColor(f:number,out:T.Color){const t=Math.min(Math.max(f/.5,0),1);return t<.5?out.copy(COLD).lerp(MID,t*2):out.copy(MID).lerp(HOT,t*2-1);}

function labelFor(el:HTMLDivElement,text:string,kind:Kind){el.style.cssText=LABEL_BASE+LABEL_STYLE[kind];el.textContent=text;}

function webgl2(){try{return !!document.createElement('canvas').getContext('webgl2');}catch{return false;}}

const FACES:[string,string,string][]=[
 ['A','translateZ(24px)','Anterior'],['P','rotateY(180deg) translateZ(24px)','Posterior'],['I','rotateY(90deg) translateZ(24px)','Izquierda'],
 ['D','rotateY(-90deg) translateZ(24px)','Derecha'],['C','rotateX(90deg) translateZ(24px)','Craneal'],['Cd','rotateX(-90deg) translateZ(24px)','Caudal']];

export default function HeartScene(props:HeartSceneProps){
 const host=useRef<HTMLDivElement>(null),layer=useRef<HTMLDivElement>(null),cube=useRef<HTMLDivElement>(null),latest=useRef(props);
 latest.current=props;
 const [ok,setOk]=useState(true),[status,setStatus]=useState('Cargando corazón…');
 useEffect(()=>{
  const el=host.current,labelLayer=layer.current,cubeEl=cube.current;
  if(!el||!labelLayer||!cubeEl)return;
  if(!webgl2()){setOk(false);return;}
  let renderer:T.WebGLRenderer;
  try{renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});}catch{setOk(false);return;}
  let disposed=false,dirty=true,raf=0,lastNow=performance.now();
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x000000,0);renderer.outputColorSpace=T.SRGBColorSpace;
  const canvas=renderer.domElement;canvas.style.cssText='display:block;width:100%;height:100%;touch-action:none;cursor:grab';
  canvas.setAttribute('aria-label','Corazón 3D con el árbol coronario. Arrastrá para rotar y usá la rueda o pellizcá para acercar.');
  el.appendChild(canvas);
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(32,1,20,2500);scene.add(camera);
  scene.add(new T.HemisphereLight(0xffffff,0x3b2b2b,1.05));
  const headlight=new T.DirectionalLight(0xfff6ee,2);headlight.position.set(.4,.8,1);camera.add(headlight);
  const world=new T.Group();scene.add(world);

  // Orbit: own quaternion trackball, because the detector view needs an arbitrary up vector (v) that OrbitControls would fight.
  const q=new T.Quaternion(),qGoal=new T.Quaternion(),qDrag=new T.Quaternion(),basis=new T.Matrix4();
  let dist=DEFAULT_DIST;
  const goalOf=(a:number,b:number)=>{const {u,v,d}=imageAxes(a,b);basis.makeBasis(v3(u),v3(v),v3(d));return qGoal.setFromRotationMatrix(basis);};
  q.copy(goalOf(latest.current.a,latest.current.b));
  /** Camera distance at which the whole heart box, seen with orientation `qa` and aimed at the isocentre, fits the panel with margin. */
  const inv=new T.Quaternion(),corner=new T.Vector3();
  const fitDist=(qa:T.Quaternion,box:T.Box3=heartBox,margin=1.12)=>{
   if(box.isEmpty())return DEFAULT_DIST;
   inv.copy(qa).invert();
   const tv=Math.tan(T.MathUtils.degToRad(camera.fov)/2),th=tv*camera.aspect;
   let need=0;
   for(let i=0;i<8;i++){
    corner.set(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z).applyQuaternion(inv);
    need=Math.max(need,corner.z+Math.abs(corner.y)/tv*margin,corner.z+Math.abs(corner.x)/th*margin);
   }
   return Math.min(Math.max(need,MIN_DIST),MAX_DIST);
  };
  const place=()=>{camera.quaternion.copy(q);camera.position.set(0,0,dist).applyQuaternion(q);camera.updateMatrixWorld(true);};
  const resize=()=>{const w=el.clientWidth,h=el.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();dirty=true;};
  const observer=new ResizeObserver(resize);observer.observe(el);resize();

  // Heart parts.
  const heartMat=new T.MeshStandardMaterial({color:HEART_COLOR,roughness:.88,metalness:0,side:T.DoubleSide,transparent:true,opacity:1}),greatMat=new T.MeshStandardMaterial({color:GREAT_COLOR,roughness:.8,side:T.DoubleSide,transparent:true,opacity:1});
  const skeletonMat=new T.MeshStandardMaterial({color:SKELETON_COLOR,roughness:1,transparent:true,opacity:.1,depthWrite:false});
  const partGroup=new T.Group(),skeletonGroup=new T.Group(),heartMeshes:T.Mesh[]=[],heartCentre=new T.Vector3(),heartHalf=new T.Vector3(1,1,1),heartBox=new T.Box3(),thoraxBox=new T.Box3();
  world.add(partGroup,skeletonGroup);
  let parts:HeartPart[]|null=null,restDist=DEFAULT_DIST,distGoal:number|null=null;
  loadHeartAsset().then(list=>{
   if(disposed)return;parts=list;
   const box=new T.Box3();
   for(const p of list){
    const mesh=new T.Mesh(p.geometry,p.group==='skeleton'?skeletonMat:p.group==='heart'?heartMat:greatMat);
    if(p.group==='skeleton'){mesh.renderOrder=-1;skeletonGroup.add(mesh);thoraxBox.union(p.geometry.boundingBox!);}
    else{partGroup.add(mesh);if(p.group==='heart'){heartMeshes.push(mesh);box.union(p.geometry.boundingBox!);}}
   }
   if(!box.isEmpty()){heartBox.copy(box);box.getCenter(heartCentre);box.getSize(heartHalf).multiplyScalar(.5);}
   // Free orbit rests on the whole thorax with the small heart in the middle (S16).
   if(!thoraxBox.isEmpty())restDist=Math.min(Math.max(fitDist(q,thoraxBox,1.05),MIN_DIST),MAX_DIST);
   if(!latest.current.toggles.detectorView)dist=restDist;
   setStatus('');dirty=true;
  }).catch(()=>{if(!disposed)setStatus('No se pudo cargar el modelo del corazón.');});

  // C-arm drawn around the heart (local frame: x = image right u, y = image up v, z = towards the detector d).
  const arm=new T.Group();arm.matrixAutoUpdate=false;world.add(arm);
  const sourceMat=new T.MeshBasicMaterial({color:SOURCE_COLOR}),source=new T.Mesh(new T.SphereGeometry(4.5,20,14),sourceMat);source.position.z=TUBE_Z;arm.add(source);
  const panelMat=new T.MeshBasicMaterial({color:'#9db2c6',transparent:true,opacity:.09,side:T.DoubleSide,depthWrite:false});
  const panel=new T.Mesh(new T.PlaneGeometry(DETECTOR_SIDE*1.45,DETECTOR_SIDE*1.45),panelMat);panel.renderOrder=4;panel.position.z=DETECTOR_Z+1;arm.add(panel);
  const fh=DETECTOR_SIDE/2*.94,fieldMat=new T.LineBasicMaterial({color:FIELD_COLOR,transparent:true,opacity:.85});
  const field=new T.LineLoop(new T.BufferGeometry().setFromPoints([[-fh,-fh],[fh,-fh],[fh,fh],[-fh,fh]].map(([x,y])=>new T.Vector3(x,y,DETECTOR_Z))),fieldMat);arm.add(field);
  const apex=new T.Vector3(0,0,TUBE_Z),corners=[[-fh,-fh],[fh,-fh],[fh,fh],[-fh,fh]].map(([x,y])=>new T.Vector3(x,y,DETECTOR_Z));
  const beamMat=new T.LineBasicMaterial({color:'#ffd36b',transparent:true,opacity:.3});
  arm.add(new T.LineSegments(new T.BufferGeometry().setFromPoints([...corners.flatMap(c=>[apex,c]),apex,new T.Vector3(0,0,DETECTOR_Z)]),beamMat));
  /** C-arm parts that react to the pointer (hover feedback only; clicking them does not change anything). */
  const armParts:T.Object3D[]=[source,field];   // the big translucent panel itself is not pickable: it would shadow the vessels behind it

  // Vessels, planes and labels depend on (tree, visibility); style depends on angles, selection and toggles.
  const tubeGroup=new T.Group(),planeGroup=new T.Group();world.add(tubeGroup,planeGroup);
  const geometries=new Map<Vessel,T.BufferGeometry>(),pickables:T.Mesh[]=[];
  let selAmount=0,entries:Entry[]=[],labels:Label[]=[],shownTree:CoronaryTree|null=null,shownVis='',shownSig='',planeFits:{av:PlaneFit|null;septum:PlaneFit|null}={av:null,septum:null};
  const addLabel=(text:string,kind:Kind,at:()=>T.Vector3)=>{const e=document.createElement('div');labelFor(e,text,kind);e.style.display='none';labelLayer.appendChild(e);const l={el:e,kind,at};labels.push(l);return l;};
  const vesselLabels:{label:Label;vessel:Vessel}[]=[];let selectedLabel:Label|null=null,avLabel:Label|null=null,septumLabel:Label|null=null;
  const clearLabels=()=>{labels.forEach(l=>l.el.remove());labels=[];vesselLabels.length=0;selectedLabel=null;avLabel=null;septumLabel=null;};

  const patchMaterial=(material:T.MeshStandardMaterial,hi:Entry['hi'])=>{
   material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,hi);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float arc;\nvarying float vArc;').replace('#include <begin_vertex>','#include <begin_vertex>\nvArc=arc;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vArc;\nuniform float uHi0;\nuniform float uHi1;\nuniform float uHiA;\nuniform float uHj0;\nuniform float uHj1;\nuniform float uHjA;\nuniform float uHv0;\nuniform float uHv1;\nuniform vec3 uHiColor;\nuniform vec3 uHvColor;')
     .replace('#include <color_fragment>','#include <color_fragment>\nfloat hiMask=max(step(uHi0,vArc)*step(vArc,uHi1)*uHiA,step(uHj0,vArc)*step(vArc,uHj1)*uHjA);\nfloat hvMask=step(uHv0,vArc)*step(vArc,uHv1);\ndiffuseColor.rgb=mix(mix(diffuseColor.rgb,uHvColor,.4*hvMask),uHiColor,hiMask);')
     .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=uHiColor*0.35*hiMask+uHvColor*0.22*hvMask;');
   };
   material.customProgramCacheKey=()=>'angio-vessel-arc';
  };

  const rebuild=()=>{
   const {tree,vis}=latest.current;
   tubeGroup.clear();planeGroup.clear();pickables.length=0;clearLabels();
   entries.forEach(e=>e.material.dispose());entries=[];
   const live=new Set(tree.vessels);
   for(const [v,g] of geometries)if(!live.has(v)){g.dispose();geometries.delete(v);}
   const visible=new Set(visibleVessels(tree,vis));
   for(const vessel of tree.vessels){
    const full=visible.has(vessel);
    if(!full&&(vessel.system==='graft'||(vessel.variant==='ramus'&&!vis.ramus)||vessel.points.length<2))continue;
    let geometry=geometries.get(vessel);
    if(!geometry){geometry=buildVesselGeometry(vessel,10,1);geometries.set(vessel,geometry);}
    if(!geometry.getAttribute('position').count)continue;
    const base=new T.Color(FAMILY_PALETTE[vessel.family]).multiplyScalar(.92);
    const material=new T.MeshStandardMaterial({color:base,roughness:.4,metalness:0,emissive:base.clone().multiplyScalar(.28)});
    const hi:Glow={uHi0:{value:-1},uHi1:{value:-1},uHiA:{value:0},uHj0:{value:-1},uHj1:{value:-1},uHjA:{value:0},uHv0:{value:-1},uHv1:{value:-1},uHiColor:{value:new T.Color(HIGHLIGHT)},uHvColor:{value:new T.Color(HOVER)}};
    patchMaterial(material,hi);
    if(!full){material.transparent=true;material.opacity=.2;material.depthWrite=false;material.color.multiplyScalar(.55);material.emissive.setScalar(0);}
    const mesh=new T.Mesh(geometry,material);mesh.renderOrder=full?1:0;tubeGroup.add(mesh);
    if(full)pickables.push(mesh);
    entries.push({vessel,mesh,material,hi,cur:{lo:-1,hi:-1,a:0,goal:0},old:{lo:-1,hi:-1,a:0,goal:0},full,base:material.color.clone(),arcF:(()=>{const a=arcLengths(vessel.points),t=a[a.length-1]||1;return a.map(x=>x/t);})()});
    if(full&&polylineLength(vessel.points)>=28){
     const label=addLabel(vessel.short,'vessel',()=>{const p=pointAtArc(vessel.points,vessel.radii,.55).p;return v3(p);});
     vesselLabels.push({label,vessel});
    }
   }
   // Anatomical planes: AV groove from CD + Cx, septum from DA + DP.
   const pts=(ids:string[])=>tree.vessels.filter(v=>ids.includes(v.id)).flatMap(v=>v.points.map(v3));
   const lad=pts(['lad']),pda=pts(['pda','lpda']);
   planeFits={av:fitPlane(pts(['rca','lcx'])),septum:fitPlane([...lad,...(pda.length?pda:[v3(tree.landmarks.crux),v3(tree.landmarks.apex)])])};
   const addPlane=(fit:PlaneFit|null,color:string,text:string)=>{
    if(!fit)return null;
    const mesh=new T.Mesh(new T.PlaneGeometry(fit.size[0],fit.size[1]),new T.MeshBasicMaterial({color,transparent:true,opacity:.16,side:T.DoubleSide,depthWrite:false}));
    mesh.applyMatrix4(fit.basis.clone().setPosition(fit.centre));mesh.renderOrder=3;
    const edge=new T.LineSegments(new T.EdgesGeometry(mesh.geometry),new T.LineBasicMaterial({color,transparent:true,opacity:.65}));edge.applyMatrix4(mesh.matrix);edge.matrixAutoUpdate=false;
    planeGroup.add(mesh,edge);
    return addLabel(text,'plane',()=>fit.corner);
   };
   avLabel=addPlane(planeFits.av,'#4fd6ff','Surco AV');septumLabel=addPlane(planeFits.septum,'#ff7ad9','Septum');
   const armLabel=(text:string,z:number,y:number)=>addLabel(text,'carm',()=>arm.localToWorld(new T.Vector3(0,y,z)));
   armLabel('Rayos X',TUBE_Z,12);armLabel('Detector (I/I)',DETECTOR_Z,DETECTOR_SIDE*.74+6);
   selectedLabel=addLabel('','selected',()=>new T.Vector3());
   shownTree=tree;shownVis=visKey(vis);shownSig='';dirty=true;
  };

  /** Applies angles, selection and toggles to materials, planes and the C-arm. */
  const restyle=()=>{
   const {a,b,selected,toggles}=latest.current;
   const {u,v,d}=imageAxes(a,b);arm.matrix.makeBasis(v3(u),v3(v),v3(d));arm.matrixWorldNeedsUpdate=true;arm.updateMatrixWorld(true);
   const glass=toggles.seeThrough;
   heartMat.opacity=glass?.35:1;greatMat.opacity=glass?.42:1;heartMat.depthWrite=greatMat.depthWrite=!glass;
   skeletonGroup.visible=toggles.skeleton;planeGroup.visible=toggles.planes;arm.visible=!toggles.detectorView;
   const hit=selected?findSegment(latest.current.tree,selected):null,tmp=new T.Color();
   for(const e of entries){
    if(e.full)e.material.color.copy(toggles.foreshortening?shortColor(foreshorteningOfPolyline(e.vessel.points,a,b),tmp):e.base);
    let lo=-1,hi=-1;
    if(hit&&hit.vessel===e.vessel){const r=segmentRange(e.vessel,hit.segment);lo=Math.min(r.f0,r.f1);hi=Math.max(r.f0,r.f1);}
    const c=e.cur;
    if(lo>=0&&Math.abs(lo-c.lo)<1e-6&&Math.abs(hi-c.hi)<1e-6)c.goal=1;            // same segment still selected
    else if(lo<0&&c.lo<0)continue;                                                 // nothing here before, nothing now
    else{
     if(c.a>.001)e.old={lo:c.lo,hi:c.hi,a:c.a,goal:0};                            // the previous highlight fades out
     e.cur=lo>=0?{lo,hi,a:0,goal:1}:{lo:-1,hi:-1,a:0,goal:0};                     // the new one fades in
    }
   }
   if(selectedLabel){
    const sel=hit&&entries.find(e=>e.vessel===hit.vessel&&e.full);
    if(hit&&sel){const r=segmentRange(hit.vessel,hit.segment);labelFor(selectedLabel.el,hit.segment.short,'selected');const p=pointAtArc(hit.vessel.points,hit.vessel.radii,(r.f0+r.f1)/2).p;selectedLabel.at=()=>v3(p);}   // when nothing is selected it keeps its place while it fades out
   }
   dirty=true;
  };

  // Labels: projected each frame; those behind the heart are hidden (a shrunk bounding ellipsoid stands in for the heart) unless see-through.
  const NDC=new T.Vector3(),dir=new T.Vector3(),o=new T.Vector3();
  const hiddenByHeart=(p:T.Vector3)=>{
   o.copy(camera.position).sub(heartCentre);dir.copy(p).sub(camera.position);
   const k=.84,sx=1/(heartHalf.x*k),sy=1/(heartHalf.y*k),sz=1/(heartHalf.z*k);
   const ox=o.x*sx,oy=o.y*sy,oz=o.z*sz,dx=dir.x*sx,dy=dir.y*sy,dz=dir.z*sz;
   const A=dx*dx+dy*dy+dz*dz,B=2*(ox*dx+oy*dy+oz*dz),C=ox*ox+oy*oy+oz*oz-1,disc=B*B-4*A*C;
   if(disc<0||A<1e-9)return false;
   const t=(-B-Math.sqrt(disc))/(2*A);
   return t>0&&t<1;
  };
  const placeLabels=()=>{
   const {toggles}=latest.current,w=el.clientWidth,hh=el.clientHeight,glass=toggles.seeThrough;
   const show=(l:Label,visible:boolean,occludable:boolean)=>{
    if(!visible){l.el.style.display='none';return;}
    const p=l.at();
    if(!Number.isFinite(p.x)){l.el.style.display='none';return;}
    NDC.copy(p).project(camera);
    if(NDC.z>1||Math.abs(NDC.x)>1.05||Math.abs(NDC.y)>1.05||(occludable&&!glass&&parts&&hiddenByHeart(p))){l.el.style.display='none';return;}
    l.el.style.display='block';
    l.el.style.transform=`translate(${((NDC.x+1)/2*w).toFixed(1)}px,${((1-NDC.y)/2*hh).toFixed(1)}px) translate(-50%,-135%)`;
   };
   for(const l of labels){
    if(l.kind==='vessel')show(l,toggles.labels,true);
    else if(l.kind==='plane')show(l,toggles.planes,false);
    else if(l.kind==='selected'){show(l,selAmount>.01,true);l.el.style.opacity=String(Math.min(1,selAmount));}
    else show(l,!toggles.detectorView,false);
   }
  };
  const updateCube=()=>{
   const e=new T.Matrix4().makeRotationFromQuaternion(camera.quaternion.clone().invert()).elements,s=[1,-1,1],m:number[]=[];
   for(let c=0;c<3;c++){for(let r=0;r<3;r++)m.push(e[c*4+r]*s[r]*s[c]);m.push(0);}
   cubeEl.style.transform=`matrix3d(${m.join(',')},0,0,0,1)`;
  };

  // Pointer input: one pointer orbits, two pinch; a press without movement picks the segment under it.
  const ptrs=new Map<number,{x:number;y:number}>();let press:{x:number;y:number;moved:boolean}|null=null,pinch=0,dragging=false;
  const raycaster=new T.Raycaster(),ndc=new T.Vector2();
  raycaster.params.Line={threshold:3};
  // Hover feedback (S16): everything coloured can be pointed at; a vessel segment lights up and is named, the C-arm parts brighten.
  const hoverEl=document.createElement('div');hoverEl.style.cssText=LABEL_BASE+LABEL_STYLE.hover;hoverEl.style.display='none';labelLayer.appendChild(hoverEl);
  let hoverEntry:Entry|null=null,hoverArm:T.Object3D|null=null,hoverReq:{x:number;y:number}|null=null;
  const clearHover=()=>{
   if(hoverEntry){hoverEntry.hi.uHv0.value=hoverEntry.hi.uHv1.value=-1;hoverEntry=null;}
   hoverArm=null;source.scale.setScalar(1);panelMat.opacity=.09;fieldMat.opacity=.85;beamMat.opacity=.3;hoverEl.style.display='none';
  };
  const applyHover=(x:number,y:number)=>{
   const hit=probe(x,y);
   clearHover();
   if(hit&&'seg' in hit){
    const r=segmentRange(hit.entry.vessel,hit.seg);hoverEntry=hit.entry;
    hit.entry.hi.uHv0.value=Math.min(r.f0,r.f1);hit.entry.hi.uHv1.value=Math.max(r.f0,r.f1);
    const b=canvas.getBoundingClientRect();hoverEl.textContent=hit.seg.short;hoverEl.style.display='block';
    hoverEl.style.transform=`translate(${(x-b.left+12).toFixed(0)}px,${(y-b.top-26).toFixed(0)}px)`;
   }else if(hit){hoverArm=hit.arm;source.scale.setScalar(1.7);panelMat.opacity=.26;fieldMat.opacity=1;beamMat.opacity=.55;}
   canvas.style.cursor=hit?'pointer':'grab';dirty=true;
  };
  const nearest=(cx:number,cy:number):{entry:Entry;seg:Segment}|null=>{
   const r=canvas.getBoundingClientRect(),w=r.width,h=r.height,glass=latest.current.toggles.seeThrough;
   let best:{entry:Entry;arc:number}|null=null,bd=9;
   for(const entry of entries){
    if(!entry.full)continue;
    const pts=entry.vessel.points;
    for(let i=0;i<pts.length;i++){
     NDC.set(pts[i][0],pts[i][1],pts[i][2]).project(camera);
     if(NDC.z>1)continue;
     const d=Math.hypot((NDC.x+1)/2*w-(cx-r.left),(1-NDC.y)/2*h-(cy-r.top));
     if(d>=bd||(!glass&&parts&&hiddenByHeart(v3(pts[i]))))continue;
     bd=d;best={entry,arc:entry.arcF[i]};
    }
   }
   const seg=best?segmentAtArc(best.entry.vessel,best.arc):null;
   return best&&seg?{entry:best.entry,seg}:null;
  };
/** Nearest coloured thing under a pointer position: a coronary segment (with its arc range) or a C-arm part. */
  const probe=(cx:number,cy:number):{arm:T.Object3D}|{entry:Entry;seg:Segment}|null=>{
   const r=canvas.getBoundingClientRect();ndc.set((cx-r.left)/r.width*2-1,-((cy-r.top)/r.height)*2+1);
   raycaster.setFromCamera(ndc,camera);
   const vh=raycaster.intersectObjects(pickables,false)[0],ah=arm.visible?raycaster.intersectObjects(armParts,false)[0]:undefined;
   if(ah&&(!vh||ah.distance<vh.distance))return {arm:ah.object};
   if(!vh||!vh.face)return nearest(cx,cy);   // thin vessels are a pixel or two wide at this zoom: fall back to the closest centreline within a few pixels
   const entry=entries.find(e=>e.mesh===vh.object);if(!entry)return null;
   const arcs=(vh.object as T.Mesh).geometry.getAttribute('arc'),pos=(vh.object as T.Mesh).geometry.getAttribute('position'),f=vh.face,bc=new T.Vector3();
   T.Triangle.getBarycoord(vh.point,new T.Vector3().fromBufferAttribute(pos,f.a),new T.Vector3().fromBufferAttribute(pos,f.b),new T.Vector3().fromBufferAttribute(pos,f.c),bc);
   const arc=arcs.getX(f.a)*bc.x+arcs.getX(f.b)*bc.y+arcs.getX(f.c)*bc.z,seg=segmentAtArc(entry.vessel,Math.min(Math.max(arc,0),1));
   return seg?{entry,seg}:null;
  };
  const pick=(cx:number,cy:number)=>{
   const hit=probe(cx,cy);
   if(hit&&'seg' in hit)latest.current.onSelect(hit.seg.id);
  };
  const onDown=(e:PointerEvent)=>{
   canvas.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(ptrs.size===1)press={x:e.clientX,y:e.clientY,moved:false};
   else{press=null;const [p1,p2]=[...ptrs.values()];pinch=Math.hypot(p1.x-p2.x,p1.y-p2.y);}
  };
  const onMove=(e:PointerEvent)=>{
   if(!ptrs.size){hoverReq=e.pointerType==='touch'?null:{x:e.clientX,y:e.clientY};return;}
   const prev=ptrs.get(e.pointerId);if(!prev)return;
   const dx=e.clientX-prev.x,dy=e.clientY-prev.y;prev.x=e.clientX;prev.y=e.clientY;
   if(ptrs.size===1&&press){
    if(!press.moved&&Math.hypot(e.clientX-press.x,e.clientY-press.y)>4){press.moved=true;dragging=true;canvas.style.cursor='grabbing';if(latest.current.toggles.detectorView){latest.current.onDetectorViewLeft();distGoal=restDist;}clearHover();}
    if(press.moved){qDrag.setFromEuler(new T.Euler(-dy*.0055,-dx*.0055,0,'YXZ'));q.multiply(qDrag).normalize();dirty=true;}
   }else if(ptrs.size===2){
    const [p1,p2]=[...ptrs.values()],d=Math.hypot(p1.x-p2.x,p1.y-p2.y);
    if(pinch>0&&d>0){distGoal=null;dist=Math.min(Math.max(dist*pinch/d,MIN_DIST),MAX_DIST);dirty=true;}
    pinch=d;
   }
  };
  const onUp=(e:PointerEvent)=>{
   if(!ptrs.has(e.pointerId))return;
   if(ptrs.size===1&&press&&!press.moved&&e.type==='pointerup')pick(e.clientX,e.clientY);
   ptrs.delete(e.pointerId);press=null;pinch=0;if(!ptrs.size){dragging=false;canvas.style.cursor='grab';}
  };
  const onWheel=(e:WheelEvent)=>{e.preventDefault();distGoal=null;if(latest.current.toggles.detectorView)latest.current.onDetectorViewLeft();dist=Math.min(Math.max(dist*Math.exp(e.deltaY*.0012),MIN_DIST),MAX_DIST);dirty=true;};
  const onLeave=()=>{hoverReq=null;clearHover();canvas.style.cursor='grab';dirty=true;};
  canvas.addEventListener('pointerleave',onLeave);canvas.addEventListener('pointerdown',onDown);canvas.addEventListener('pointermove',onMove);canvas.addEventListener('pointerup',onUp);canvas.addEventListener('pointercancel',onUp);canvas.addEventListener('wheel',onWheel,{passive:false});

  let prevDetector=latest.current.toggles.detectorView;
  const loop=(now:number)=>{
   raf=requestAnimationFrame(loop);
   const dt=Math.min((now-lastNow)/1000,.1);lastNow=now;
   const p=latest.current;
   if(p.tree!==shownTree||visKey(p.vis)!==shownVis)rebuild();
   const t=p.toggles,sig=[p.a,p.b,p.selected,t.foreshortening,t.skeleton,t.seeThrough,t.planes,t.detectorView,parts?1:0].join('|');
   if(sig!==shownSig){shownSig=sig;restyle();}
   if(t.detectorView&&!dragging){
    goalOf(p.a,p.b);
    const gap=q.angleTo(qGoal);
    if(gap>1e-4){q.slerp(qGoal,gap<.002?1:1-Math.exp(-dt*14));dirty=true;}
    const want=fitDist(qGoal);
    if(Math.abs(want-dist)>.05){dist+=(want-dist)*(Math.abs(want-dist)<.5?1:1-Math.exp(-dt*10));dirty=true;}
   }
   const calm=matchMedia('(prefers-reduced-motion: reduce)').matches,step=calm?1:dt/FADE_S;
   if(prevDetector!==t.detectorView){if(prevDetector&&!t.detectorView&&!dragging)distGoal=restDist;prevDetector=t.detectorView;}
   if(distGoal!==null){
    if(Math.abs(distGoal-dist)<.5||calm){dist=distGoal;distGoal=null;}else dist+=(distGoal-dist)*(1-Math.exp(-dt*6));
    dirty=true;
   }
   if(hoverReq){applyHover(hoverReq.x,hoverReq.y);hoverReq=null;}
   if(hoverEntry&&!entries.includes(hoverEntry))clearHover();
   // Segment highlights fade in and out (S14) instead of switching.
   selAmount=0;
   for(const e of entries){
    const c=e.cur,o=e.old,h=e.hi;
    if(c.a!==c.goal){c.a=c.goal>c.a?Math.min(c.goal,c.a+step):Math.max(c.goal,c.a-step);dirty=true;}
    if(o.a>0){o.a=Math.max(0,o.a-step);dirty=true;}
    h.uHi0.value=c.lo;h.uHi1.value=c.hi;h.uHiA.value=c.a;h.uHj0.value=o.lo;h.uHj1.value=o.hi;h.uHjA.value=o.a;
    selAmount=Math.max(selAmount,c.goal>0?c.a:0,o.a);
   }
   if(!dirty)return;
   dirty=false;place();placeLabels();updateCube();renderer.render(scene,camera);
  };
  raf=requestAnimationFrame(loop);

  return()=>{
   disposed=true;cancelAnimationFrame(raf);observer.disconnect();
   canvas.removeEventListener('pointerleave',onLeave);hoverEl.remove();canvas.removeEventListener('pointerdown',onDown);canvas.removeEventListener('pointermove',onMove);canvas.removeEventListener('pointerup',onUp);canvas.removeEventListener('pointercancel',onUp);canvas.removeEventListener('wheel',onWheel);
   clearLabels();
   entries.forEach(e=>e.material.dispose());geometries.forEach(g=>g.dispose());
   parts?.forEach(p=>p.geometry.dispose());
   scene.traverse(o=>{const m=o as T.Mesh;if(m.isMesh||(o as T.LineSegments).isLineSegments){if(!(parts?.some(p=>p.geometry===m.geometry))&&!([...geometries.values()].includes(m.geometry)))m.geometry.dispose();const mat=m.material;(Array.isArray(mat)?mat:[mat]).forEach(x=>x.dispose());}});
   renderer.dispose();renderer.forceContextLoss();canvas.remove();
  };
 },[]);

 const {toggles}=props;
 const box:React.CSSProperties={position:'relative',width:'100%',height:'100%',minHeight:0,overflow:'hidden',background:'radial-gradient(ellipse at 50% 45%,#16202b 0%,#0a0f15 75%)'};
 const tag:React.CSSProperties={position:'absolute',font:'11px ui-monospace,Menlo,Consolas,monospace',letterSpacing:'.14em',color:'#9fb2c4',pointerEvents:'none'};
 if(!ok)return <div style={{...box,display:'flex',alignItems:'center',justifyContent:'center',padding:24,textAlign:'center',color:'#c9d4de',font:'13px/1.5 system-ui,sans-serif'}} role="status"><span style={{...tag,left:12,top:10}}>CORAZÓN 3D</span>{NO_WEBGL}</div>;
 return <div style={box}>
  <div ref={host} style={{position:'absolute',inset:0}}/>
  <div ref={layer} style={{position:'absolute',inset:0,overflow:'hidden',pointerEvents:'none'}}/>
  <span style={{...tag,left:12,top:10}}>CORAZÓN 3D</span>
  {status&&<span style={{...tag,left:'50%',top:'50%',transform:'translate(-50%,-50%)',letterSpacing:'.04em'}} role="status">{status}</span>}
  <div aria-hidden style={{position:'absolute',left:14,bottom:14,width:48,height:48,perspective:220,pointerEvents:'none'}} title="Orientación: D derecha, I izquierda, A anterior, P posterior, C craneal, Cd caudal">
   <div ref={cube} style={{position:'absolute',inset:0,transformStyle:'preserve-3d'}}>
    {FACES.map(([t,tr,name])=><div key={t} title={name} style={{position:'absolute',inset:0,transform:tr,backfaceVisibility:'hidden',display:'flex',alignItems:'center',justifyContent:'center',font:'700 15px ui-monospace,Menlo,Consolas,monospace',color:t==='A'||t==='P'?'#ffd9a0':'#cfe3f5',background:'#1b2a38d9',border:'1px solid #6f8aa3'}}>{t}</div>)}
   </div>
  </div>
  {toggles.foreshortening&&<div style={{position:'absolute',left:84,bottom:14,width:150,pointerEvents:'none',font:'11px ui-monospace,Menlo,Consolas,monospace',color:'#c9d4de'}}>
   <div style={{marginBottom:4}}>Acortamiento</div>
   <div style={{height:8,borderRadius:2,background:'linear-gradient(90deg,#2f6bff,#f2d230,#e5322d)'}}/>
   <div style={{display:'flex',justifyContent:'space-between',marginTop:3,color:'#8da0b3'}}><span>0 %</span><span>25 %</span><span>≥ 50 %</span></div>
  </div>}
 </div>;
}
