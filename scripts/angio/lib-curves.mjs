// Polyline / spline helpers on [x,y,z] points (mm).
export const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
export const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
export const mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
export const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const len=a=>Math.hypot(a[0],a[1],a[2]);
export const dist=(a,b)=>len(sub(a,b));
export const unit=a=>{const l=len(a)||1;return [a[0]/l,a[1]/l,a[2]/l];};
export const lerp=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

export function cumulative(pts){const c=[0];for(let i=1;i<pts.length;i++)c.push(c[i-1]+dist(pts[i-1],pts[i]));return c;}
export const arcLength=pts=>cumulative(pts).at(-1);

/** point at arc fraction t (0..1) of a polyline */
export function pointAt(pts,t){
 const c=cumulative(pts),s=Math.min(1,Math.max(0,t))*c.at(-1);let j=0;while(j<pts.length-2&&c[j+1]<s)j++;
 const f=(s-c[j])/((c[j+1]-c[j])||1);return lerp(pts[j],pts[j+1],f);
}
/** nearest point on a polyline: {t (arc fraction), d, p, index} */
export function nearestOn(pts,q){
 const c=cumulative(pts),total=c.at(-1)||1;let best=null;
 for(let i=0;i<pts.length-1;i++){
  const ab=sub(pts[i+1],pts[i]),l2=dot(ab,ab)||1e-12,u=Math.min(1,Math.max(0,dot(sub(q,pts[i]),ab)/l2)),p=add(pts[i],mul(ab,u)),d=dist(p,q);
  if(!best||d<best.d)best={d,p,t:(c[i]+u*Math.sqrt(l2))/total,index:i+u};
 }
 return best;
}
/** sub-polyline between arc fractions t0..t1 (t0<t1), endpoints interpolated */
export function slice(pts,t0,t1){
 const c=cumulative(pts),total=c.at(-1),s0=t0*total,s1=t1*total,out=[pointAt(pts,t0)];
 for(let i=0;i<pts.length;i++)if(c[i]>s0+1e-9&&c[i]<s1-1e-9)out.push(pts[i]);
 out.push(pointAt(pts,t1));return out;
}
/** Centripetal Catmull-Rom through waypoints, resampled at constant spacing (mm). */
export function spline(way,spacing=1.5){
 const P=way.length<2?way:[add(way[0],sub(way[0],way[1])),...way,add(way.at(-1),sub(way.at(-1),way.at(-2)))];
 const dense=[];
 for(let i=1;i<P.length-2;i++){
  const [p0,p1,p2,p3]=[P[i-1],P[i],P[i+1],P[i+2]];
  const t0=0,t1=t0+Math.sqrt(dist(p0,p1))||1e-3,t2=t1+Math.sqrt(dist(p1,p2))||1e-3,t3=t2+Math.sqrt(dist(p2,p3))||1e-3;
  for(let k=0;k<24;k++){
   const t=t1+(t2-t1)*k/24;
   const A1=lerp(p0,p1,(t-t0)/(t1-t0)),A2=lerp(p1,p2,(t-t1)/(t2-t1)),A3=lerp(p2,p3,(t-t2)/(t3-t2));
   const B1=lerp(A1,A2,(t-t0)/(t2-t0)),B2=lerp(A2,A3,(t-t1)/(t3-t1));
   dense.push(lerp(B1,B2,(t-t1)/(t2-t1)));
  }
 }
 dense.push(way.at(-1));
 return resample(dense,spacing);
}
/** constant-arc-length resampling, keeping both ends */
export function resample(pts,spacing){
 const c=cumulative(pts),total=c.at(-1),n=Math.max(2,Math.round(total/spacing)+1),out=[];
 for(let s=0,j=0;s<n;s++){const d=total*s/(n-1);while(j<pts.length-2&&c[j+1]<d)j++;const f=(d-c[j])/((c[j+1]-c[j])||1);out.push(lerp(pts[j],pts[j+1],f));}
 return out;
}
/** Gaussian smoothing of an ordered point list, ends fixed */
export function smooth(pts,sigma=2,passes=1){
 let cur=pts.map(p=>[...p]);
 for(let pass=0;pass<passes;pass++){
  const n=cur.length,next=cur.map(p=>[...p]);
  for(let i=1;i<n-1;i++){let sw=0,p=[0,0,0];for(let j=Math.max(0,i-3*sigma);j<=Math.min(n-1,i+3*sigma);j++){const w=Math.exp(-((i-j)**2)/(2*sigma*sigma));sw+=w;p=add(p,mul(cur[j],w));}next[i]=mul(p,1/sw);}
  cur=next;
 }
 return cur;
}
/** piecewise-linear profile: anchors [[t,value]...] sorted by t, evaluated at t */
export function profile(anchors,t){
 if(t<=anchors[0][0])return anchors[0][1];
 for(let i=1;i<anchors.length;i++)if(t<=anchors[i][0]){const [t0,v0]=anchors[i-1],[t1,v1]=anchors[i];return v0+(v1-v0)*(t-t0)/(t1-t0||1);}
 return anchors.at(-1)[1];
}
