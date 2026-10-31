import * as T from 'three';

export interface SurfaceHit {point:T.Vector3;normal:T.Vector3;distance:number}
/** Chest region kept from the skin: enough to cover the breast, pectoral and axillary area, nothing else to test. */
const KEEP={yMin:1.05,yMax:1.5,xMax:.25,zMin:-.1};
/** The chest axis the palpation frame is centered on (m, in the standing model frame). */
export const AXIS_Z=0;

/** The skin triangles of the chest, so a ray from the chest axis outward at (θ, y) lands on the skin. */
export class ChestSurface {
 readonly mesh:T.Mesh;
 readonly triangles:number;
 private ray=new T.Raycaster();
 private normals:Float32Array;
 constructor(skin:T.BufferGeometry){
  const position=skin.getAttribute('position'),normal=skin.getAttribute('normal'),index=skin.getIndex()!;
  const keep:number[]=[],c=new T.Vector3(),v=new T.Vector3();
  for(let i=0;i<index.count;i+=3){
   c.set(0,0,0);for(let k=0;k<3;k++)c.add(v.fromBufferAttribute(position,index.getX(i+k)));c.multiplyScalar(1/3);
   if(c.y>=KEEP.yMin&&c.y<=KEEP.yMax&&Math.abs(c.x)<=KEEP.xMax&&c.z>=KEEP.zMin)keep.push(i);
  }
  const positions=new Float32Array(keep.length*9);this.normals=new Float32Array(keep.length*9);
  keep.forEach((i,t)=>{for(let k=0;k<3;k++){const vertex=index.getX(i+k);v.fromBufferAttribute(position,vertex).toArray(positions,t*9+k*3);v.fromBufferAttribute(normal,vertex).normalize().toArray(this.normals,t*9+k*3);}});
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(positions,3));
  this.mesh=new T.Mesh(g,new T.MeshBasicMaterial({side:T.DoubleSide}));this.mesh.updateMatrixWorld();
  this.triangles=keep.length;
 }
 /** First skin hit of the ray from the chest axis at height y, θ from the midline toward `side` (+1 = +x, the model's left). */
 hit(theta:number,y:number,side:1|-1):SurfaceHit|null{
  const dir=new T.Vector3(side*Math.sin(theta),0,Math.cos(theta));
  this.ray.set(new T.Vector3(0,y,AXIS_Z),dir);
  const h=this.ray.intersectObject(this.mesh,false)[0];
  if(!h||!h.face)return null;
  const t=Math.floor(h.faceIndex!),p=this.mesh.geometry.getAttribute('position'),bary=new T.Vector3();
  const a=new T.Vector3().fromBufferAttribute(p,t*3),b=new T.Vector3().fromBufferAttribute(p,t*3+1),d=new T.Vector3().fromBufferAttribute(p,t*3+2);
  T.Triangle.getBarycoord(h.point,a,b,d,bary);
  const n=new T.Vector3();
  for(let k=0;k<3;k++){const o=t*9+k*3,w=[bary.x,bary.y,bary.z][k];n.x+=this.normals[o]*w;n.y+=this.normals[o+1]*w;n.z+=this.normals[o+2]*w;}
  n.normalize();if(n.dot(dir)<0)n.negate();
  return {point:h.point.clone(),normal:n,distance:h.distance};
 }
}
