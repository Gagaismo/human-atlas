// Tube geometry of a coronary vessel with varying radius (shared by the 3D heart scene and the angiogram worker).
// Frame: millimetres, patient frame of core/types. The geometry carries an 'arc' attribute (0..1 along the smoothed
// centreline, i.e. a fraction of its length) that matches the arc fractions of core/tree.segmentRange within a few percent.
import * as T from 'three';
import type {Segment,Vessel} from './core/types';
import {arcLengths,pointAtLength,segmentRange} from './core/tree';

/** Thinnest drawn radius (mm): the distal calibres would otherwise vanish at 3D zoom levels. */
export const MIN_RADIUS=0.35;

export interface Centerline{points:T.Vector3[];radii:number[];
 /** Arc fraction (0..1) of each sample along the smoothed centreline. */
 arcs:number[]}

/** Smooth Catmull-Rom centreline resampled every `step` mm, with the radius interpolated along the original polyline. */
export function vesselCenterline(vessel:Vessel,step=1):Centerline{
 const raw:T.Vector3[]=[],rr:number[]=[];
 vessel.points.forEach((p,i)=>{
  const v=new T.Vector3(p[0],p[1],p[2]);
  if(raw.length&&raw[raw.length-1].distanceTo(v)<1e-3)return;
  raw.push(v);rr.push(vessel.radii[i]??vessel.radii[vessel.radii.length-1]??1);
 });
 if(raw.length<2)return {points:raw,radii:rr,arcs:raw.map(()=>0)};
 const curve=new T.CatmullRomCurve3(raw,false,'centripetal'),length=curve.getLength();
 curve.arcLengthDivisions=Math.max(200,raw.length*8);curve.updateArcLengths();
 const poly=raw.map(v=>[v.x,v.y,v.z] as [number,number,number]),arcs=arcLengths(poly),total=arcs[arcs.length-1];
 const n=Math.max(2,Math.ceil(length/step)),out:Centerline={points:[],radii:[],arcs:[]};
 for(let k=0;k<=n;k++){
  const t=k/n;
  out.points.push(curve.getPointAt(t));
  out.radii.push(pointAtLength(poly,rr,arcs,t*total).r);
  out.arcs.push(t);
 }
 return out;
}

/** Closed-cap tube with per-sample radius (parallel-transport frames) and an 'arc' vertex attribute; `radiusScale` fattens it for the 3D view (the angiogram keeps 1). */
export function buildVesselGeometry(vessel:Vessel,radialSegments=10,step=1,radiusScale=1):T.BufferGeometry{
 const geometry=new T.BufferGeometry(),{points,radii,arcs}=vesselCenterline(vessel,step),m=points.length,rs=Math.max(3,Math.round(radialSegments));
 if(m<2){
  geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(0),3));geometry.setAttribute('normal',new T.BufferAttribute(new Float32Array(0),3));geometry.setAttribute('arc',new T.BufferAttribute(new Float32Array(0),1));
  return geometry;
 }
 const nv=m*rs+2,pos=new Float32Array(nv*3),nor=new Float32Array(nv*3),arc=new Float32Array(nv),index=new Uint32Array((m-1)*rs*6+rs*6);
 const tangent=(k:number)=>new T.Vector3().subVectors(points[Math.min(k+1,m-1)],points[Math.max(k-1,0)]).normalize();
 let tPrev=tangent(0);
 const normal=new T.Vector3().crossVectors(tPrev,Math.abs(tPrev.y)<.9?new T.Vector3(0,1,0):new T.Vector3(1,0,0)).normalize(),axis=new T.Vector3(),quat=new T.Quaternion(),bin=new T.Vector3();
 for(let k=0;k<m;k++){
  const tk=tangent(k);
  axis.crossVectors(tPrev,tk);
  const s=axis.length();
  if(s>1e-6){quat.setFromAxisAngle(axis.divideScalar(s),Math.atan2(s,tPrev.dot(tk)));normal.applyQuaternion(quat);}
  normal.addScaledVector(tk,-normal.dot(tk)).normalize();
  bin.crossVectors(tk,normal);
  tPrev=tk;
  const r=Math.max(radii[k],MIN_RADIUS)*radiusScale;
  for(let j=0;j<rs;j++){
   const phi=j/rs*Math.PI*2,c=Math.cos(phi),sn=Math.sin(phi),i=(k*rs+j)*3,nx=normal.x*c+bin.x*sn,ny=normal.y*c+bin.y*sn,nz=normal.z*c+bin.z*sn;
   nor[i]=nx;nor[i+1]=ny;nor[i+2]=nz;
   pos[i]=points[k].x+nx*r;pos[i+1]=points[k].y+ny*r;pos[i+2]=points[k].z+nz*r;
   arc[k*rs+j]=arcs[k];
  }
 }
 const c0=m*rs,c1=m*rs+1,t0=tangent(0),t1=tangent(m-1);
 points[0].toArray(pos,c0*3);points[m-1].toArray(pos,c1*3);
 nor[c0*3]=-t0.x;nor[c0*3+1]=-t0.y;nor[c0*3+2]=-t0.z;nor[c1*3]=t1.x;nor[c1*3+1]=t1.y;nor[c1*3+2]=t1.z;
 arc[c0]=0;arc[c1]=1;
 let q=0;
 for(let k=0;k<m-1;k++)for(let j=0;j<rs;j++){
  const a=k*rs+j,b=k*rs+(j+1)%rs,c=(k+1)*rs+j,d=(k+1)*rs+(j+1)%rs;
  index[q++]=a;index[q++]=b;index[q++]=c;index[q++]=b;index[q++]=d;index[q++]=c;
 }
 for(let j=0;j<rs;j++){
  const j1=(j+1)%rs;
  index[q++]=c0;index[q++]=j1;index[q++]=j;
  index[q++]=c1;index[q++]=(m-1)*rs+j;index[q++]=(m-1)*rs+j1;
 }
 geometry.setAttribute('position',new T.BufferAttribute(pos,3));geometry.setAttribute('normal',new T.BufferAttribute(nor,3));geometry.setAttribute('arc',new T.BufferAttribute(arc,1));
 geometry.setIndex(new T.BufferAttribute(index,1));
 geometry.computeBoundingSphere();geometry.computeBoundingBox();
 return geometry;
}

/** The segment of a vessel that contains the arc fraction `arc` (the nearest one when it falls in a gap). */
export function segmentAtArc(vessel:Vessel,arc:number):Segment|null{
 let best:Segment|null=null,bestGap=Infinity;
 for(const seg of vessel.segments){
  const {f0,f1}=segmentRange(vessel,seg),lo=Math.min(f0,f1),hi=Math.max(f0,f1),gap=arc<lo?lo-arc:arc>hi?arc-hi:0;
  if(gap<bestGap){bestGap=gap;best=seg;}
 }
 return best;
}
