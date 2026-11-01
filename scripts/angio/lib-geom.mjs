// Geometry helpers: convex-hull volume centroid, closest point on a triangle soup (uniform grid), ray parity.
import {ConvexHull} from 'three/examples/jsm/math/ConvexHull.js';
import {Vector3} from 'three';

/** Volume centroid of the convex hull of points [[x,y,z]...]. */
export function hullCentroid(points){
 const hull=new ConvexHull().setFromPoints(points.map(p=>new Vector3(...p)));
 const o=points.reduce((s,p)=>[s[0]+p[0]/points.length,s[1]+p[1]/points.length,s[2]+p[2]/points.length],[0,0,0]);
 let vol=0;const c=[0,0,0];
 for(const f of hull.faces){
  let e=f.edge;const v=[];do{v.push(e.head().point);e=e.next;}while(e!==f.edge);
  for(let i=1;i<v.length-1;i++){
   const a=[v[0].x-o[0],v[0].y-o[1],v[0].z-o[2]],b=[v[i].x-o[0],v[i].y-o[1],v[i].z-o[2]],d=[v[i+1].x-o[0],v[i+1].y-o[1],v[i+1].z-o[2]];
   const tv=(a[0]*(b[1]*d[2]-b[2]*d[1])-a[1]*(b[0]*d[2]-b[2]*d[0])+a[2]*(b[0]*d[1]-b[1]*d[0]))/6;
   vol+=tv;for(let k=0;k<3;k++)c[k]+=tv*(a[k]+b[k]+d[k])/4;
  }
 }
 return {centroid:[0,1,2].map(k=>o[k]+c[k]/vol),volume:Math.abs(vol)};
}

const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function closestOnTri(p,a,b,c){ // Ericson, Real-Time Collision Detection
 const ab=sub(b,a),ac=sub(c,a),ap=sub(p,a),d1=dot(ab,ap),d2=dot(ac,ap);
 if(d1<=0&&d2<=0)return a;
 const bp=sub(p,b),d3=dot(ab,bp),d4=dot(ac,bp);if(d3>=0&&d4<=d3)return b;
 const vc=d1*d4-d3*d2;if(vc<=0&&d1>=0&&d3<=0){const v=d1/(d1-d3);return [a[0]+v*ab[0],a[1]+v*ab[1],a[2]+v*ab[2]];}
 const cp=sub(p,c),d5=dot(ab,cp),d6=dot(ac,cp);if(d6>=0&&d5<=d6)return c;
 const vb=d5*d2-d1*d6;if(vb<=0&&d2>=0&&d6<=0){const w=d2/(d2-d6);return [a[0]+w*ac[0],a[1]+w*ac[1],a[2]+w*ac[2]];}
 const va=d3*d6-d5*d4;if(va<=0&&d4-d3>=0&&d5-d6>=0){const w=(d4-d3)/((d4-d3)+(d5-d6));return [b[0]+w*(c[0]-b[0]),b[1]+w*(c[1]-b[1]),b[2]+w*(c[2]-b[2])];}
 const den=1/(va+vb+vc),v=vb*den,w=vc*den;return [a[0]+ab[0]*v+ac[0]*w,a[1]+ab[1]*v+ac[1]*w,a[2]+ab[2]*v+ac[2]*w];
}

export class Surface{
 /** tris: array of [a,b,c] points (any consistent unit); cell: grid cell size in the same unit. */
 constructor(tris,cell=6){
  this.tris=tris;this.cell=cell;this.grid=new Map();
  tris.forEach((t,i)=>{
   const lo=[0,1,2].map(k=>Math.floor(Math.min(t[0][k],t[1][k],t[2][k])/cell)),hi=[0,1,2].map(k=>Math.floor(Math.max(t[0][k],t[1][k],t[2][k])/cell));
   for(let x=lo[0];x<=hi[0];x++)for(let y=lo[1];y<=hi[1];y++)for(let z=lo[2];z<=hi[2];z++){const key=`${x},${y},${z}`;let l=this.grid.get(key);if(!l)this.grid.set(key,l=[]);l.push(i);}
  });
  this.bounds=[0,1,2].map(k=>[Math.min(...tris.map(t=>Math.min(t[0][k],t[1][k],t[2][k]))),Math.max(...tris.map(t=>Math.max(t[0][k],t[1][k],t[2][k])))]);
 }
 /** closest surface point: {point,dist,normal,tri} (searches growing shells of cells). */
 closest(p,maxR=40){
  let best=null;const c=this.cell,pc=p.map(v=>Math.floor(v/c));
  for(let r=0;r<=Math.ceil(maxR/c);r++){
   if(best&&best.dist<=(r-1)*c)break;
   for(let x=pc[0]-r;x<=pc[0]+r;x++)for(let y=pc[1]-r;y<=pc[1]+r;y++)for(let z=pc[2]-r;z<=pc[2]+r;z++){
    if(Math.max(Math.abs(x-pc[0]),Math.abs(y-pc[1]),Math.abs(z-pc[2]))!==r)continue;
    const l=this.grid.get(`${x},${y},${z}`);if(!l)continue;
    for(const i of l){const t=this.tris[i],q=closestOnTri(p,t[0],t[1],t[2]),d=Math.hypot(q[0]-p[0],q[1]-p[1],q[2]-p[2]);if(!best||d<best.dist)best={point:q,dist:d,tri:i};}
   }
  }
  if(best){const t=this.tris[best.tri];let n=cross(sub(t[1],t[0]),sub(t[2],t[0]));const l=Math.hypot(...n)||1;best.normal=n.map(v=>v/l);}
  return best;
 }
 /** number of triangle crossings of the ray from p along +x (odd = inside a closed shell). */
 crossings(p,dir=[1,0,0]){
  let n=0;const seen=new Set();
  const [lo,hi]=this.bounds[0];
  // brute force over the grid column the ray passes (small meshes)
  for(let i=0;i<this.tris.length;i++){const t=this.tris[i];if(this._hit(p,dir,t))n++;}
  return n;
 }
 _hit(o,d,t){const e1=sub(t[1],t[0]),e2=sub(t[2],t[0]),h=cross(d,e2),a=dot(e1,h);if(Math.abs(a)<1e-12)return false;const f=1/a,s=sub(o,t[0]),u=f*dot(s,h);if(u<0||u>1)return false;const q=cross(s,e1),v=f*dot(d,q);if(v<0||u+v>1)return false;return f*dot(e2,q)>1e-9;}
}
export const trisOf=(positions,indices,scale=1000)=>{const out=[];for(let t=0;t<indices.length;t+=3)out.push([0,1,2].map(k=>[0,1,2].map(a=>positions[indices[t+k]*3+a]*scale)));return out;};
