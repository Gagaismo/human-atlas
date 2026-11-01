// Procedural cath-lab models for the room panel (S9). No external assets. Everything is built in the patient frame
// (X = patient left, Y = superior, Z = anterior, mm, origin = heart isocentre) with the numbers of core/room.ts, so the
// drawing matches the collision model exactly. The C-arm rig is a group whose basis is (u, v, d) from core imageAxes(a,b):
// local +Z is the detector direction, local +Y screen-up, local +X screen-right.
import * as T from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {DETECTOR_SIZE,SID,SOD,imageAxes} from './core/geometry';
import {CAPSULES,DETECTOR_HOUSING,TABLE,TORSO,TUBE_HOUSING,type BodyPart} from './core/room';
import type {Vec3} from './core/types';

export const FLOOR_Z=-1000;
/** Distance from the isocentre to the carriage ("hub") the L-arm holds, along the image-up axis. */
export const HUB_DISTANCE=660;
const STAND_Y=1300,STAND_TOP_Z=-60,PEDESTAL_Y=-820;

// The patient solids of the collision model, drawn as they are tested.
export const TORSO_BOX=TORSO;
export const BODY_CAPSULES:readonly (readonly [BodyPart,Vec3,Vec3,number])[]=CAPSULES.map(({part,c})=>[part,c.a,c.b,c.r] as const);

const SKIN='#b9ad9c',SKIN_FLASH='#e0302c';

/** Rig basis for (a, b): columns u, v, d, exactly core's imageAxes. */
export function rigMatrix(a:number,b:number,m=new T.Matrix4()):T.Matrix4{
 const {d,u,v}=imageAxes(a,b);
 return m.makeBasis(new T.Vector3(...u),new T.Vector3(...v),new T.Vector3(...d));
}

export interface RoomModel{
 /** Whole room in the patient frame (mm); the scene scales and rotates it into the viewer. */
 group:T.Group;
 /** The C-arm, pivoting about the isocentre. */
 rig:T.Group;
 /** Meshes that a drag grabs (C, detector, tube, carriage). */
 pickables:T.Mesh[];
 detector:T.Object3D;tube:T.Object3D;
 /** Label anchors, children of the rig. */
 detectorAnchor:T.Object3D;tubeAnchor:T.Object3D;
 /** Patient-side letter anchors in the patient frame. */
 sideLetters:{text:string;point:T.Vector3}[];
 setAngles(a:number,b:number):void;
 /** Colour a body part red (true) or back to its skin tone (false). */
 flash(part:BodyPart,on:boolean):void;
 dispose():void}

const mat=(color:string,roughness=.7,metalness=0)=>new T.MeshStandardMaterial({color,roughness,metalness});
const rbox=(w:number,h:number,d:number,r:number,m:T.Material)=>new T.Mesh(new RoundedBoxGeometry(w,h,d,3,r),m);
const box=(w:number,h:number,d:number,m:T.Material)=>new T.Mesh(new T.BoxGeometry(w,h,d),m);
const place=<O extends T.Object3D>(o:O,x:number,y:number,z:number):O=>{o.position.set(x,y,z);return o;};

function capsule(a:Vec3,b:Vec3,r:number,m:T.Material):T.Mesh{
 const A=new T.Vector3(...a),B=new T.Vector3(...b),dir=B.clone().sub(A),L=dir.length();
 const mesh=new T.Mesh(new T.CapsuleGeometry(r,L,6,20),m);
 mesh.position.copy(A).add(B).multiplyScalar(.5);
 mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),dir.normalize());
 return mesh;
}

function floorGrid():T.Object3D{
 const g=new T.Group(),floor=new T.Mesh(new T.CircleGeometry(4600,96),new T.MeshStandardMaterial({color:'#12151a',roughness:1}));
 floor.position.z=FLOOR_Z;g.add(floor);
 const pts:number[]=[],E=3500,step=500;
 for(let i=-E;i<=E;i+=step)pts.push(i,-E,FLOOR_Z+1,i,E,FLOOR_Z+1,-E,i,FLOOR_Z+1,E,i,FLOOR_Z+1);
 const geo=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(pts,3));
 g.add(new T.LineSegments(geo,new T.LineBasicMaterial({color:'#2f3a47',transparent:true,opacity:.55})));
 return g;
}

function xrayCone():{cone:T.Group;iso:T.Object3D}{
 const h=DETECTOR_SIZE/2,zs=-SOD,zd=SID-SOD,apex=[0,0,zs],c=[[-h,-h,zd],[h,-h,zd],[h,h,zd],[-h,h,zd]];
 const tri:number[]=[];
 for(let i=0;i<4;i++)tri.push(...apex,...c[i],...c[(i+1)%4]);
 const geo=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(tri,3));
 const g=new T.Group();
 const body=new T.Mesh(geo,new T.MeshBasicMaterial({color:'#ffd25a',transparent:true,opacity:.1,depthWrite:false,side:T.DoubleSide}));
 body.renderOrder=3;g.add(body);
 const edges:number[]=[];
 for(const p of c)edges.push(...apex,...p);
 for(let i=0;i<4;i++)edges.push(...c[i],...c[(i+1)%4]);
 const lines=new T.LineSegments(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(edges,3)),new T.LineBasicMaterial({color:'#ffd25a',transparent:true,opacity:.35,depthWrite:false}));
 lines.renderOrder=3;g.add(lines);
 // Isocentre marker, visible through the patient.
 const iso=[-30,0,0,30,0,0,0,-30,0,0,30,0,0,0,-30,0,0,30];
 const cross=new T.LineSegments(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(iso,3)),new T.LineBasicMaterial({color:'#ffd25a',depthTest:false}));
 cross.renderOrder=4;
 return {cone:g,iso:cross};
}

export function buildRoom():RoomModel{
 const group=new T.Group();
 const owned:T.Material[]=[];
 const own=<M extends T.Material>(m:M)=>{owned.push(m);return m;};
 group.add(floorGrid());

 // Table: base slab with a mattress on top (top surface at TABLE.top), pedestal near the foot end.
 const slabMat=own(mat('#2b3037',.55,.25)),mattMat=own(mat('#4b535e',.9)),standMat=own(mat('#c9ced4',.5,.35)),darkMat=own(mat('#20242a',.6,.3));
 const tl=TABLE.yMax-TABLE.yMin,tw=TABLE.halfWidth*2,tcy=(TABLE.yMax+TABLE.yMin)/2,t0=TABLE.top-TABLE.thickness;
 group.add(place(rbox(tw,tl,TABLE.thickness*.55,6,slabMat),0,tcy,t0+TABLE.thickness*.275));
 group.add(place(rbox(tw-10,tl-10,TABLE.thickness*.45,10,mattMat),0,tcy,TABLE.top-TABLE.thickness*.225));
 group.add(place(rbox(150,240,t0-FLOOR_Z,6,darkMat),0,PEDESTAL_Y,(FLOOR_Z+t0)/2));
 group.add(place(rbox(620,720,40,8,darkMat),0,PEDESTAL_Y,FLOOR_Z+20));

 // Patient: supine, head toward the gantry (+Y), arms at the sides.
 const parts=new Map<BodyPart,T.MeshStandardMaterial>();
 const partMat=(p:BodyPart)=>{let m=parts.get(p);if(!m){m=mat(SKIN,.85);parts.set(p,m);owned.push(m);}return m;};
 const {min,max}=TORSO_BOX;
 group.add(place(rbox(max[0]-min[0],max[1]-min[1],max[2]-min[2],55,partMat('torso')),(min[0]+max[0])/2,(min[1]+max[1])/2,(min[2]+max[2])/2));
 for(const [p,a,b,r] of BODY_CAPSULES)group.add(capsule(a,b,r,partMat(p)));
 // Pillow under the head (not part of the collision model: the head capsule sits right above it).
 group.add(place(rbox(300,280,-70-TABLE.top,24,own(mat('#d9d4ca',.95))),0,290,(TABLE.top-70)/2));

 // Floor-mounted stand with its L-arm.
 group.add(place(rbox(700,700,40,10,darkMat),0,STAND_Y,FLOOR_Z+20));
 group.add(place(rbox(300,300,STAND_TOP_Z-FLOOR_Z,20,standMat),0,STAND_Y,(FLOOR_Z+STAND_TOP_Z)/2));
 group.add(place(new T.Mesh(new T.SphereGeometry(110,24,16),standMat),0,STAND_Y,STAND_TOP_Z));
 const armLen=new T.Mesh(new T.CylinderGeometry(55,55,1,20),standMat);group.add(armLen);

 // C-arm rig.
 const rig=new T.Group();rig.matrixAutoUpdate=false;group.add(rig);
 const pickables:T.Mesh[]=[];
 const cMat=own(mat('#d4d8dd',.4,.45));
 const R=[440,520,610,660,760,880,960],ang=[0,30,60,90,120,150,180].map(t=>t*Math.PI/180);
 R[0]=425;R[6]=945;
 const curve=new T.CatmullRomCurve3(ang.map((t,i)=>new T.Vector3(0,R[i]*Math.sin(t),R[i]*Math.cos(t))),false,'centripetal');
 const arc=new T.Mesh(new T.TubeGeometry(curve,48,42,16,false),cMat);rig.add(arc);pickables.push(arc);
 const hub=new T.Mesh(new T.CylinderGeometry(95,95,150,28),standMat);hub.rotation.z=Math.PI/2;hub.position.set(0,HUB_DISTANCE,0);rig.add(hub);pickables.push(hub);

 const {size,thickness,faceDistance}=DETECTOR_HOUSING;
 const detector=new T.Group();detector.position.z=faceDistance+thickness/2;rig.add(detector);
 const det=rbox(size,size,thickness,14,own(mat('#2a3038',.5,.3)));detector.add(det);pickables.push(det);
 const plate=box(size*.88,size*.88,4,own(mat('#0f1216',.3,.4)));plate.position.z=-thickness/2-1;detector.add(plate);

 const th=TUBE_HOUSING,tube=new T.Group();tube.position.z=-(th.faceDistance+th.depth/2);rig.add(tube);
 const tub=rbox(th.width,th.height,th.depth,16,own(mat('#e7e9ec',.45,.2)));tube.add(tub);pickables.push(tub);
 const coll=new T.Mesh(new T.CylinderGeometry(70,80,50,24),darkMat);coll.rotation.x=Math.PI/2;coll.position.z=th.depth/2+20;tube.add(coll);

 const {cone,iso}=xrayCone();rig.add(cone,iso);

 const detectorAnchor=place(new T.Object3D(),0,size/2+20,faceDistance+thickness/2);rig.add(detectorAnchor);
 const tubeAnchor=place(new T.Object3D(),0,-th.height/2-20,-(th.faceDistance+th.depth/2));rig.add(tubeAnchor);

 const up=new T.Vector3(0,1,0),from=new T.Vector3(0,STAND_Y,STAND_TOP_Z),to=new T.Vector3(),dir=new T.Vector3();
 const setAngles=(a:number,b:number)=>{
  rigMatrix(a,b,rig.matrix);rig.matrixWorldNeedsUpdate=true;
  const {v}=imageAxes(a,b);to.set(v[0]*HUB_DISTANCE,v[1]*HUB_DISTANCE,v[2]*HUB_DISTANCE);
  dir.copy(to).sub(from);const L=dir.length();
  armLen.scale.set(1,L,1);armLen.position.copy(from).add(to).multiplyScalar(.5);armLen.quaternion.setFromUnitVectors(up,dir.normalize());
  armLen.updateMatrix();
 };
 setAngles(0,0);

 const flashColor=new T.Color(SKIN_FLASH),skinColor=new T.Color(SKIN);
 return {
  group,rig,pickables,detector,tube,detectorAnchor,tubeAnchor,setAngles,
  sideLetters:[{text:'I',point:new T.Vector3(TABLE.halfWidth+90,-380,TABLE.top)},{text:'D',point:new T.Vector3(-TABLE.halfWidth-90,-380,TABLE.top)}],
  flash(part,on){const m=parts.get(part);if(!m)return;m.color.copy(on?flashColor:skinColor);m.emissive.set(on?'#6a0d0a':'#000000');},
  dispose(){
   const mm=new Set<T.Material>(owned);
   group.traverse(o=>{
    const m=o as T.Mesh;if(m.geometry)m.geometry.dispose();
    if(m.material)(Array.isArray(m.material)?m.material:[m.material]).forEach(x=>mm.add(x));
   });
   mm.forEach(m=>m.dispose());
  }};
}
