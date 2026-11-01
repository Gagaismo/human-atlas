// View-quality metrics of a segment at given C-arm angles (S11): foreshortening and overlap.
//
// foreshortening = 1 − projected length / true length. The projected length is measured on the detector after the
//   cone-beam projection and rescaled edge by edge by the local magnification, so a segment parallel to the detector
//   gives ≈0 and one along the beam gives ≈1.
// overlap = share of the segment's samples whose projected disc (radius × magnification) touches the projected disc of a
//   sample of any other visible vessel, whatever its depth (contrast adds up). Excluded: the segment's own vessel, and
//   the parent/child (and sibling) neighbours close to their branch point, where vessels touch by construction.
// combined = (1 − foreshortening)(1 − overlap): 1 = long and unobstructed ("vista más clara").
//
// Speed: all samples of the visible tree are projected once per angle and bucketed in a dense uniform grid (counting
// sort over typed arrays); each target sample only inspects the 3×3 cells around it.
import {SID,SOD,imageAxes} from './geometry';
import {arcLengths,findSegment,sampleSegment,visibleVessels} from './tree';
import type {CoronaryTree,Vec3,Vessel,Visibility} from './types';

export const DEFAULT_STEP=1.5;           // mm between samples
export const DEFAULT_JUNCTION_WINDOW=4;  // mm of arc around a branch point where neighbours do not count

export interface MetricOptions{step?:number;junctionWindow?:number}
export interface ViewMetrics{foreshortening:number;overlap:number;combined:number}

interface Junction{pArc:number;cArc:number}
interface PreparedVessel{id:string;parent:number;length:number;junction:Junction|null}

/** The visible tree flattened to typed arrays of samples (built once, reused for every angle). */
export interface PreparedTree{
 count:number;step:number;
 x:Float64Array;y:Float64Array;z:Float64Array;r:Float64Array;
 /** Index into `vessels` of every sample, and its absolute arc length (mm) along that vessel. */
 vessel:Int32Array;arc:Float64Array;
 vessels:PreparedVessel[];vesselIndex:Map<string,number>;
 tree:CoronaryTree;visible:Vessel[]}

/** One segment resampled; `trueLength` is the 3D centreline length. */
export interface Target{segmentId:string;vessel:number;count:number;step:number;trueLength:number;
 x:Float64Array;y:Float64Array;z:Float64Array;r:Float64Array;arc:Float64Array}

/** Where a child touches its parent: closest approach of either end of the child to the parent centreline. */
function findJunction(child:Vessel,parent:Vessel):Junction|null{
 if(!child.points.length||!parent.points.length)return null;
 const pa=arcLengths(parent.points),ca=arcLengths(child.points);
 let best:Junction|null=null,bd=Infinity;
 for(const [end,cArc] of [[child.points[0],0],[child.points[child.points.length-1],ca[ca.length-1]]] as [Vec3,number][]){
  for(let i=0;i<parent.points.length-1||i===0;i++){
   const p=parent.points[i],q=parent.points[Math.min(i+1,parent.points.length-1)];
   const dx=q[0]-p[0],dy=q[1]-p[1],dz=q[2]-p[2],l2=dx*dx+dy*dy+dz*dz;
   const t=l2>0?Math.min(1,Math.max(0,((end[0]-p[0])*dx+(end[1]-p[1])*dy+(end[2]-p[2])*dz)/l2)):0;
   const d=Math.hypot(p[0]+dx*t-end[0],p[1]+dy*t-end[1],p[2]+dz*t-end[2]);
   if(d<bd){bd=d;best={pArc:pa[i]+(pa[Math.min(i+1,pa.length-1)]-pa[i])*t,cArc};}
  }
 }
 return best;
}

export function prepareTree(tree:CoronaryTree,vis:Visibility,step=DEFAULT_STEP):PreparedTree{
 const visible=visibleVessels(tree,vis),vesselIndex=new Map<string,number>();
 visible.forEach((v,i)=>vesselIndex.set(v.id,i));
 const samples=visible.map(v=>({v,s:sampleSegment(v,{id:'',syntax:'',name:'',short:'',from:0,to:1},step)}));
 const count=samples.reduce((n,s)=>n+s.s.points.length,0);
 const out:PreparedTree={count,step,x:new Float64Array(count),y:new Float64Array(count),z:new Float64Array(count),r:new Float64Array(count),
  vessel:new Int32Array(count),arc:new Float64Array(count),vessels:[],vesselIndex,tree,visible};
 let k=0;
 samples.forEach(({v,s},vi)=>{
  const parent=v.parent!==null?(vesselIndex.get(v.parent)??-1):-1;
  const arcs=arcLengths(v.points);
  out.vessels.push({id:v.id,parent,length:arcs[arcs.length-1]??0,junction:parent>=0?findJunction(v,visible[parent]):null});
  for(let i=0;i<s.points.length;i++,k++){
   out.x[k]=s.points[i][0];out.y[k]=s.points[i][1];out.z[k]=s.points[i][2];out.r[k]=s.radii[i];out.vessel[k]=vi;out.arc[k]=s.arcs[i];
  }
 });
 return out;
}

/** Resample one visible segment; null when its vessel is not part of the prepared (visible) tree. */
export function prepareTarget(prep:PreparedTree,segmentId:string):Target|null{
 const found=findSegment(prep.tree,segmentId);
 if(!found)return null;
 const vi=prep.vesselIndex.get(found.vessel.id);
 if(vi===undefined)return null;
 const s=sampleSegment(found.vessel,found.segment,prep.step),n=s.points.length;
 const t:Target={segmentId,vessel:vi,count:n,step:prep.step,trueLength:0,x:new Float64Array(n),y:new Float64Array(n),z:new Float64Array(n),r:new Float64Array(n),arc:new Float64Array(n)};
 for(let i=0;i<n;i++){
  t.x[i]=s.points[i][0];t.y[i]=s.points[i][1];t.z[i]=s.points[i][2];t.r[i]=s.radii[i];t.arc[i]=s.arcs[i];
  if(i>0)t.trueLength+=Math.hypot(t.x[i]-t.x[i-1],t.y[i]-t.y[i-1],t.z[i]-t.z[i-1]);
 }
 return t;
}

/** Foreshortening of a raw polyline (no tree needed). */
export function foreshorteningOfPolyline(points:readonly Vec3[],a:number,b:number):number{
 const ax=imageAxes(a,b),{d,u,v}=ax;
 let truth=0,proj=0,px=0,py=0,pm=0;
 for(let i=0;i<points.length;i++){
  const p=points[i],m=SID/(SOD+p[0]*d[0]+p[1]*d[1]+p[2]*d[2]);
  const x=(p[0]*u[0]+p[1]*u[1]+p[2]*u[2])*m,y=(p[0]*v[0]+p[1]*v[1]+p[2]*v[2])*m;
  if(i>0){const q=points[i-1];truth+=Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]);proj+=Math.hypot(x-px,y-py)/((m+pm)/2);}
  px=x;py=y;pm=m;
 }
 return truth>0?Math.min(1,Math.max(0,1-proj/truth)):0;
}

/** Reusable buffers so a pad of thousands of angles allocates nothing per angle. */
export interface Scratch{px:Float64Array;py:Float64Array;pr:Float64Array;cell:Int32Array;order:Int32Array;starts:Int32Array}
export function createScratch(prep:PreparedTree):Scratch{
 return {px:new Float64Array(prep.count),py:new Float64Array(prep.count),pr:new Float64Array(prep.count),
  cell:new Int32Array(prep.count),order:new Int32Array(prep.count),starts:new Int32Array(1024*1024+2)};
}

const MAX_GRID=1000;

/** Foreshortening, overlap and the combined score of the target at (a, b). */
export function evaluateView(prep:PreparedTree,target:Target,a:number,b:number,scratch:Scratch=createScratch(prep),opts:MetricOptions={}):ViewMetrics{
 const win=opts.junctionWindow??DEFAULT_JUNCTION_WINDOW,{d,u,v}=imageAxes(a,b);
 const {px,py,pr,cell,order,starts}=scratch,n=prep.count;
 // 1. project every sample of the visible tree
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,maxR=0;
 for(let i=0;i<n;i++){
  const x=prep.x[i],y=prep.y[i],z=prep.z[i],m=SID/(SOD+x*d[0]+y*d[1]+z*d[2]);
  const X=(x*u[0]+y*u[1]+z*u[2])*m,Y=(x*v[0]+y*v[1]+z*v[2])*m,R=prep.r[i]*m;
  px[i]=X;py[i]=Y;pr[i]=R;
  if(X<minX)minX=X;if(X>maxX)maxX=X;if(Y<minY)minY=Y;if(Y>maxY)maxY=Y;if(R>maxR)maxR=R;
 }
 // 2. dense grid, counting sort
 let size=Math.max(2*maxR*1.1+0.01,0.5);
 size=Math.max(size,(maxX-minX)/(MAX_GRID-1),(maxY-minY)/(MAX_GRID-1));
 const nx=Math.floor((maxX-minX)/size)+1,ny=Math.floor((maxY-minY)/size)+1,cells=nx*ny;
 starts.fill(0,0,cells+2);
 for(let i=0;i<n;i++){
  const c=Math.floor((py[i]-minY)/size)*nx+Math.floor((px[i]-minX)/size);
  cell[i]=c;starts[c+1]++;
 }
 for(let c=0;c<cells;c++)starts[c+1]+=starts[c];
 // starts[c] = first slot of cell c; fill using a moving cursor stored one slot ahead
 for(let i=0;i<n;i++)order[starts[cell[i]]++]=i;
 // after filling, starts[c] holds the end of cell c, i.e. the start of cell c+1: shift back
 for(let c=cells;c>0;c--)starts[c]=starts[c-1];
 starts[0]=0;
 // 3. walk the target
 const tv=target.vessel,pv=prep.vessels[tv],cnt=target.count;
 let proj=0,hit=0,lx=0,ly=0,lm=0;
 for(let j=0;j<cnt;j++){
  const x=target.x[j],y=target.y[j],z=target.z[j],m=SID/(SOD+x*d[0]+y*d[1]+z*d[2]);
  const X=(x*u[0]+y*u[1]+z*u[2])*m,Y=(x*v[0]+y*v[1]+z*v[2])*m,R=target.r[j]*m,s=target.arc[j];
  if(j>0)proj+=Math.hypot(X-lx,Y-ly)/((m+lm)/2);
  lx=X;ly=Y;lm=m;
  const cx=Math.floor((X-minX)/size),cy=Math.floor((Y-minY)/size);
  let over=false;
  for(let yy=Math.max(cy-1,0);yy<=Math.min(cy+1,ny-1)&&!over;yy++){
   for(let xx=Math.max(cx-1,0);xx<=Math.min(cx+1,nx-1)&&!over;xx++){
    const c=yy*nx+xx;
    for(let k=starts[c];k<starts[c+1];k++){
     const w=order[k],wv=prep.vessel[w];
     if(wv===tv)continue;
     const dx=px[w]-X,dy=py[w]-Y,rr=pr[w]+R;
     if(dx*dx+dy*dy>=rr*rr)continue;
     const t=prep.arc[w],pw=prep.vessels[wv];
     if(win>0){
      if(wv===pv.parent&&pv.junction&&Math.abs(s-pv.junction.cArc)<win&&Math.abs(t-pv.junction.pArc)<win)continue;
      if(pw.parent===tv&&pw.junction&&Math.abs(t-pw.junction.cArc)<win&&Math.abs(s-pw.junction.pArc)<win)continue;
      if(pw.parent>=0&&pw.parent===pv.parent&&pw.junction&&pv.junction&&Math.abs(s-pv.junction.cArc)<win&&Math.abs(t-pw.junction.cArc)<win&&Math.abs(pv.junction.pArc-pw.junction.pArc)<win)continue;
     }
     over=true;break;
    }
   }
  }
  if(over)hit++;
 }
 const foreshortening=target.trueLength>0?Math.min(1,Math.max(0,1-proj/target.trueLength)):0;
 const overlap=cnt>0?hit/cnt:0;
 return {foreshortening,overlap,combined:(1-foreshortening)*(1-overlap)};
}

/** One-shot convenience: metrics of a segment at (a, b); null when the segment is not visible. Prefer prepareTree for many angles. */
export function segmentMetrics(tree:CoronaryTree,vis:Visibility,segmentId:string,a:number,b:number,opts:MetricOptions={}):ViewMetrics|null{
 const prep=prepareTree(tree,vis,opts.step??DEFAULT_STEP),target=prepareTarget(prep,segmentId);
 return target?evaluateView(prep,target,a,b,createScratch(prep),opts):null;
}
