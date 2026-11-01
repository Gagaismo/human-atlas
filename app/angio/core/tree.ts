// Helpers over the coronary tree: arc-length parametrisation, sampling, segment sub-polylines, visibility.
import type {CoronaryTree,Family,GraftId,Segment,Vec3,Vessel,Visibility} from './types';

const dist=(p:Vec3,q:Vec3)=>Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]);
const lerp3=(p:Vec3,q:Vec3,t:number):Vec3=>[p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t,p[2]+(q[2]-p[2])*t];

/** Cumulative arc length (mm) at every point of a polyline; arcs[0] = 0. */
export function arcLengths(points:readonly Vec3[]):number[]{
 const arcs=[0];
 for(let i=1;i<points.length;i++)arcs.push(arcs[i-1]+dist(points[i-1],points[i]));
 return arcs;
}
export function polylineLength(points:readonly Vec3[]):number{
 const a=arcLengths(points);return a[a.length-1]??0;
}

/** Index i with arcs[i] ≤ s ≤ arcs[i+1] (binary search), clamped to the valid segment range. */
function locate(arcs:readonly number[],s:number):number{
 let lo=0,hi=arcs.length-2;
 if(hi<0)return 0;
 while(lo<hi){const mid=(lo+hi+1)>>1;if(arcs[mid]<=s)lo=mid;else hi=mid-1;}
 return lo;
}

/** Point and radius at an absolute arc length `s` (mm), linearly interpolated. */
export function pointAtLength(points:readonly Vec3[],radii:readonly number[],arcs:readonly number[],s:number):{p:Vec3;r:number}{
 if(points.length===1)return {p:points[0],r:radii[0]};
 const total=arcs[arcs.length-1],c=Math.min(Math.max(s,0),total),i=locate(arcs,c);
 const span=arcs[i+1]-arcs[i],t=span>0?(c-arcs[i])/span:0;
 return {p:lerp3(points[i],points[i+1],t),r:radii[i]+(radii[i+1]-radii[i])*t};
}
/** Point and radius at an arc *fraction* (0 = start, 1 = end). */
export function pointAtArc(points:readonly Vec3[],radii:readonly number[],fraction:number):{p:Vec3;r:number}{
 const arcs=arcLengths(points);return pointAtLength(points,radii,arcs,fraction*arcs[arcs.length-1]);
}

export interface Samples{points:Vec3[];radii:number[];
 /** Absolute arc length (mm) of every sample along the polyline it was taken from. */
 arcs:number[]}

/** Resample a polyline every `step` mm (first and last points always included). */
export function resample(points:readonly Vec3[],radii:readonly number[],step:number,arcs:readonly number[]=arcLengths(points),offset=0):Samples{
 const total=arcs[arcs.length-1]-arcs[0],out:Samples={points:[],radii:[],arcs:[]};
 const n=Math.max(1,Math.ceil(total/step-1e-9));
 for(let k=0;k<=n;k++){
  const s=k===n?arcs[arcs.length-1]:arcs[0]+k*step,q=pointAtLength(points,radii,arcs,s);
  out.points.push(q.p);out.radii.push(q.r);out.arcs.push(s+offset);
 }
 return out;
}

/**
 * Range of a segment along its vessel as arc fractions. `Segment.from/to` ≤ 1 are read as arc fractions;
 * a `to` above 1 means both are (possibly fractional) point indices of `vessel.points`.
 */
export function segmentRange(vessel:Vessel,seg:Segment):{f0:number;f1:number}{
 if(seg.to<=1)return {f0:seg.from,f1:seg.to};
 const arcs=arcLengths(vessel.points),total=arcs[arcs.length-1]||1;
 const at=(idx:number)=>{
  const c=Math.min(Math.max(idx,0),vessel.points.length-1),i=Math.min(Math.floor(c),vessel.points.length-2);
  return (arcs[i]+(arcs[i+1]-arcs[i])*(c-i))/total;
 };
 return {f0:at(seg.from),f1:at(seg.to)};
}

/** Exact sub-polyline of a segment (boundaries interpolated), with absolute arcs along the vessel. */
export function segmentPolyline(vessel:Vessel,seg:Segment):Samples{
 const arcs=arcLengths(vessel.points),total=arcs[arcs.length-1],{f0,f1}=segmentRange(vessel,seg);
 const s0=Math.min(f0,f1)*total,s1=Math.max(f0,f1)*total,out:Samples={points:[],radii:[],arcs:[]};
 const push=(s:number)=>{const q=pointAtLength(vessel.points,vessel.radii,arcs,s);out.points.push(q.p);out.radii.push(q.r);out.arcs.push(s);};
 push(s0);
 for(let i=0;i<arcs.length;i++)if(arcs[i]>s0+1e-9&&arcs[i]<s1-1e-9)push(arcs[i]);
 if(s1>s0+1e-9)push(s1);
 return out;
}

/** A segment resampled every `step` mm, with absolute arcs along its vessel. */
export function sampleSegment(vessel:Vessel,seg:Segment,step:number):Samples{
 const sub=segmentPolyline(vessel,seg);
 return resample(sub.points,sub.radii,step,sub.arcs.map(s=>s-sub.arcs[0]),sub.arcs[0]);
}

/** Vessels drawn for a visibility state. Grafts match by vessel id or by any of their segment ids. */
export function visibleVessels(tree:CoronaryTree,vis:Visibility):Vessel[]{
 return tree.vessels.filter(v=>{
  if(v.system==='graft')return vis.grafts.has(v.id as GraftId)||v.segments.some(s=>vis.grafts.has(s.id as GraftId));
  if(v.variant==='ramus'&&!vis.ramus)return false;
  return vis.system==='both'||v.system===vis.system;
 });
}

export function findSegment(tree:CoronaryTree,segmentId:string):{vessel:Vessel;segment:Segment}|null{
 for(const vessel of tree.vessels)for(const segment of vessel.segments)if(segment.id===segmentId)return {vessel,segment};
 return null;
}

/** Colour key of a vessel / segment: its family ('tci'|'da'|'cx'|'ri'|'cd'|'graft'). */
export function familyColorKey(vessel:Pick<Vessel,'family'>):Family{return vessel.family}

/** Default palette for the teaching colour overlay, keyed by family (the UI may override it). */
export const FAMILY_PALETTE:Record<Family,string>={tci:'#e8c547',da:'#ff7a59',cx:'#4fb6ff',ri:'#c58bff',cd:'#5ee08a',graft:'#ff6fb5'};
