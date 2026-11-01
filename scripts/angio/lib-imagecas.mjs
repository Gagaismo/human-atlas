// Cursos medios de las coronarias (ImageCAS-X, scripts/angio/data/imagecas-mean.json) registrados sobre el corazón de
// BodyParts3D: semejanza sobre cinco puntos de referencia + corrección suave (RBF gaussiana) que los hace coincidir
// exactamente. El ajuste fino al epicardio vive en fitEpicardium(). Marco del atlas: X izquierda, Y superior, Z anterior, mm.
import {readFileSync} from 'node:fs';
import {similarity} from './imagecas/lib-fit.mjs';
import {add,sub,mul,dist,resample,smooth,arcLength} from './lib-curves.mjs';

export const LANDMARK_KEYS=['lmOstium','rcaOstium','lmBif','ladEnd','crux'];
export const MEAN_URL=new URL('./data/imagecas-mean.json',import.meta.url);
export const loadMean=()=>JSON.parse(readFileSync(MEAN_URL,'utf8'));

// RBF gaussiana: el desplazamiento residual en los puntos de referencia es exacto y decae con la distancia
function rbfWarp(centres,residuals,sigma){
 const n=centres.length,K=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>Math.exp(-(dist(centres[i],centres[j])**2)/(2*sigma*sigma))));
 // resolver K·W = R (eliminación gaussiana, 3 columnas)
 const A=K.map((row,i)=>[...row,...residuals[i]]);
 for(let c=0;c<n;c++){
  let p=c;for(let r=c+1;r<n;r++)if(Math.abs(A[r][c])>Math.abs(A[p][c]))p=r;
  [A[c],A[p]]=[A[p],A[c]];
  for(let r=c+1;r<n;r++){const f=A[r][c]/A[c][c];for(let k=c;k<n+3;k++)A[r][k]-=f*A[c][k];}
 }
 const W=Array.from({length:n},()=>[0,0,0]);
 for(let r=n-1;r>=0;r--)for(let k=0;k<3;k++){let s=A[r][n+k];for(let c=r+1;c<n;c++)s-=A[r][c]*W[c][k];W[r][k]=s/A[r][r];}
 return p=>{let d=[0,0,0];for(let i=0;i<n;i++){const g=Math.exp(-(dist(p,centres[i])**2)/(2*sigma*sigma));d=add(d,mul(W[i],g));}return d;};
}

/** Registro de un grupo de dominancia sobre el corazón. targets: {lmOstium,rcaOstium,lmBif,ladEnd,crux} (marco del corazón). */
// El marco se ajusta con los puntos de referencia del grupo derecho (el más numeroso) y se aplica a los tres grupos: están en
// el mismo marco medio de la cohorte, así los tres árboles coinciden entre sí. (En dominancia izquierda el punto «crux» de la
// cohorte, el origen de la DPI, no es el mismo punto anatómico que el crux de la CD.)
export function makeRegistration(mean,dominance,targets,{sigma=40,frameGroup='right'}={}){
 const lm=mean.groups[frameGroup].landmarks,src=LANDMARK_KEYS.map(k=>lm[k]),dst=LANDMARK_KEYS.map(k=>targets[k]);
 const T=similarity(src,dst,{weights:[2,2,2,2,2]});
 const moved=src.map(T.apply),res=dst.map((d,i)=>sub(d,moved[i]));
 const warp=rbfWarp(moved,res,sigma);
 const apply=p=>{const q=T.apply(p);return add(q,warp(q));};
 const residualRms=Math.sqrt(res.reduce((a,r)=>a+r[0]**2+r[1]**2+r[2]**2,0)/res.length);
 const group=key=>{
  const own=mean.groups[dominance].labels[key];
  // ramas poco frecuentes en un grupo pequeño: se toma la media del grupo derecho (mismo marco medio)
  if(own&&own.n>=12)return {label:own,from:dominance};
  const r=mean.groups.right.labels[key];
  return r?{label:r,from:'right'}:own?{label:own,from:dominance}:null;
 };
 return {
  scale:T.s,residualRms,targets,
  /** curso medio registrado (sin ajuste al epicardio) o null */
  course(key){const g=group(key);if(!g)return null;return {points:g.label.points.map(apply),n:g.label.n,from:g.from,attachOnParent:g.label.attachOnParent??null,lengthMm:g.label.lengthMm,radiusMm:g.label.radiusMm?g.label.radiusMm.map(r=>r*T.s):null};},
 };
}

/** Lleva una curva al epicardio: desplazamiento hacia lay(p,off) suavizado a lo largo de la curva (conserva la forma media). */
export function fitEpicardium(pts,lay,{off=1.4,sigma=6,iters=4,gain=0.85,maxMove=14}={}){
 let cur=resample(pts,1.5);
 for(let it=0;it<iters;it++){
  const d=cur.map(p=>{const q=lay(p,off),m=sub(q,p),l=Math.hypot(...m);return l>maxMove?mul(m,maxMove/l):m;});
  const sm=smoothVectors(d,sigma);
  cur=cur.map((p,i)=>add(p,mul(sm[i],gain)));
  cur=smooth(cur,2,1);
 }
 return cur;
}
function smoothVectors(v,sigma){
 const n=v.length;return v.map((_,i)=>{let sw=0,s=[0,0,0];for(let j=Math.max(0,i-3*sigma);j<=Math.min(n-1,i+3*sigma);j++){const w=Math.exp(-((i-j)**2)/(2*sigma*sigma));sw+=w;s=add(s,mul(v[j],w));}return mul(s,1/sw);});
}
export {arcLength};
