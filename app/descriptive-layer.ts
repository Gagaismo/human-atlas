import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {sourceNodeName} from './gltf-names';
import {attachmentsFor,capitalize,drawnOnBones,landmarksFor,type DescriptiveData,type Landmark} from './descriptive';

const ORIGIN=0xc8473f,INSERTION=0x2f6fb3;
export const ATTACHMENTS_URL='/models/descriptive/attachments.glb.gz';

/** Static hosts may or may not decode .gz themselves; inspect the payload, as app/model-download.ts does. */
export async function gunzipIfNeeded(response:Response){
 if(!response.ok)throw new Error('No se pudo cargar un modelo descriptivo.');
 const payload=await response.arrayBuffer(),head=new Uint8Array(payload,0,Math.min(2,payload.byteLength));
 return head[0]===0x1f&&head[1]===0x8b?new Response(new Blob([payload]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():payload;
}

/** Scene overlay for the selection: landmark dots and HTML labels on selected bones, and origin (red) and
 * insertion (blue) areas of selected muscles or on selected bones. Follows the exploded offsets of the bones. */
export class DescriptiveLayer {
 private group=new T.Group();
 private dots:T.Points;
 private labels=document.createElement('div');
 private landmarks:{landmark:Landmark;index:number;el:HTMLSpanElement;world:T.Vector3}[]=[];
 private areas=new Map<string,T.Mesh>();
 private shown:{mesh:T.Mesh;index:number}[]=[];
 private loading:Promise<void>|null=null;
 private key='';
 private materials:T.Material[];
 private ray=new T.Raycaster();

 constructor(private scene:T.Scene,host:HTMLElement,private data:DescriptiveData,private indexOf:Map<string,number>,private boundsOf:(index:number)=>[number[],number[]],private clip:T.Plane,private onLoaded:()=>void){
  const area=(color:number)=>new T.MeshStandardMaterial({color,roughness:.6,metalness:0,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,clippingPlanes:[clip]});
  const dotMaterial=new T.PointsMaterial({color:0x1f2d3a,size:7,sizeAttenuation:false,depthTest:false,transparent:true,clippingPlanes:[clip]});
  dotMaterial.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif (distance(gl_PointCoord, vec2(0.5)) > 0.5) discard;');};
  // Areas of a selected muscle lie under the muscle itself, so they are drawn through the anatomy.
  const xray=(color:number)=>new T.MeshBasicMaterial({color,side:T.DoubleSide,transparent:true,opacity:.8,depthTest:false,clippingPlanes:[clip]});
  this.materials=[area(ORIGIN),area(INSERTION),dotMaterial,xray(ORIGIN),xray(INSERTION)];
  this.dots=new T.Points(new T.BufferGeometry(),dotMaterial);this.dots.renderOrder=12;this.dots.frustumCulled=false;
  this.group.add(this.dots);scene.add(this.group);
  this.labels.className='landmark-labels';this.labels.setAttribute('aria-hidden','true');host.appendChild(this.labels);
 }

 private loadAreas(){
  this.loading??=(async()=>{
   const buffer=await gunzipIfNeeded(await fetch(ATTACHMENTS_URL));
   const gltf=await new GLTFLoader().parseAsync(buffer,'');
   // The areas ship positions and indices only.
   gltf.scene.traverse(o=>{if(o instanceof T.Mesh){o.geometry.computeVertexNormals();o.material=this.materials[1];o.matrixAutoUpdate=false;o.renderOrder=11;this.areas.set(sourceNodeName(gltf,o),o);}});
   this.key='';this.onLoaded();
  })().catch(()=>{this.loading=null;});
  return this.loading;
 }

 /** Recomputes what the selection shows; cheap when nothing changed. */
 update(selected:readonly string[],active:boolean,offset:(index:number)=>T.Vector3){
  const key=active?selected.join(','):'';
  if(key!==this.key){
   this.key=key;this.labels.replaceChildren();this.landmarks=[];
   for(const s of this.shown)this.group.remove(s.mesh);this.shown=[];
   if(active&&selected.length){
    for(const landmark of landmarksFor(this.data,selected)){
     const index=this.indexOf.get(landmark.bone);if(index===undefined)continue;
     const el=document.createElement('span');el.className='landmark-label';el.textContent=capitalize(landmark.nameEs);this.labels.appendChild(el);
     this.landmarks.push({landmark,index,el,world:new T.Vector3()});
    }
    const attachments=attachmentsFor(this.data,selected);
    if(attachments.length&&!this.areas.size)void this.loadAreas();
    const selection=new Set(selected),boneBoxes=selected.map(id=>this.indexOf.get(id)).filter((i):i is number=>i!==undefined).map(i=>this.boundsOf(i));
    for(const a of attachments){
     const mesh=this.areas.get(a.node),index=this.indexOf.get(a.bones[0]);if(!mesh||index===undefined)continue;
     // Selected through a bone: skip areas that reach beyond it, they would float around an isolated bone.
     const ofMuscle=a.muscleParts.some(id=>selection.has(id));
     if(!ofMuscle){mesh.geometry.boundingBox??mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox!;if(!drawnOnBones([box.min.toArray(),box.max.toArray()],boneBoxes))continue;}
     const copy=mesh.clone();copy.material=this.materials[(a.kind==='origin'?0:1)+(ofMuscle?3:0)];copy.renderOrder=ofMuscle?13:11;this.group.add(copy);this.shown.push({mesh:copy,index});
    }
   }
  }
  const positions=new Float32Array(this.landmarks.length*3);
  this.landmarks.forEach(({landmark,index,world},i)=>{world.fromArray(landmark.position).add(offset(index)).toArray(positions,i*3);});
  this.dots.geometry.setAttribute('position',new T.BufferAttribute(positions,3));this.dots.geometry.computeBoundingSphere();
  for(const {mesh,index} of this.shown){mesh.position.copy(offset(index));mesh.updateMatrix();}
 }

 /** Places the labels: dims those behind their own bone and hides texts that would overlap a nearer one. */
 place(camera:T.Camera,width:number,height:number,picker:(index:number)=>T.Mesh|undefined){
  const placed:[number,number,number,number][]=[];
  const items=this.landmarks.map(item=>({item,world:item.world,screen:item.world.clone().project(camera),distance:item.world.distanceTo(camera.position)})).sort((a,b)=>a.distance-b.distance);
  for(const {item,world,screen,distance} of items){
   const {el}=item;
   if(screen.z<-1||screen.z>1||this.clip.distanceToPoint(world)<0){el.hidden=true;continue;}
   const x=(screen.x+1)*width/2,y=(1-screen.y)*height/2,w=el.offsetWidth||80,h=14;
   const box:[number,number,number,number]=[x+6,y-h/2,x+6+w,y+h/2];
   const overlaps=placed.some(b=>box[0]<b[2]&&box[2]>b[0]&&box[1]<b[3]&&box[3]>b[1]);
   let behind=false;const mesh=picker(item.index);
   if(mesh){this.ray.set(camera.position,world.clone().sub(camera.position).normalize());const hit=this.ray.intersectObject(mesh,false)[0];behind=!!hit&&hit.distance<distance-.002;}
   el.hidden=overlaps;el.classList.toggle('is-behind',behind);el.style.transform=`translate(${box[0].toFixed(1)}px,${box[1].toFixed(1)}px)`;
   if(!overlaps)placed.push(box);
  }
 }

 hasContent(){return this.landmarks.length>0||this.shown.length>0;}

 dispose(){this.scene.remove(this.group);this.dots.geometry.dispose();this.materials.forEach(m=>m.dispose());this.areas.forEach(m=>m.geometry.dispose());this.labels.remove();}
}
