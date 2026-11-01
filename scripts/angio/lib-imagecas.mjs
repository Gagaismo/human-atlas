// Cursos medios de las coronarias (ImageCAS-X, scripts/angio/data/imagecas-mean.json), colocados en el marco del tórax
// conservando la orientación de la población (sin rotación por caso). El ajuste fino al epicardio vive en fitEpicardium(). Marco del atlas: X izquierda, Y superior, Z anterior, mm.
import {readFileSync,existsSync} from 'node:fs';
import {add,sub,mul,dist,resample,smooth,arcLength} from './lib-curves.mjs';

export const LANDMARK_KEYS=['lmOstium','rcaOstium','lmBif','ladEnd','crux'];
export const MEAN_URL=new URL('./data/imagecas-mean.json',import.meta.url);
export const loadMean=()=>JSON.parse(readFileSync(MEAN_URL,'utf8'));

// Orientación: las medias de ImageCAS-X conservan la orientación del paciente (marco LPS del escáner), así que el árbol se
// COLOCA por traslación (y, si la calibración con CARDIAG lo justifica, una rotación global pequeña, documentada en
// scripts/angio/data/orientation.json); no se registra al corazón de BodyParts3D: el corazón se deforma al árbol (lib-warp.mjs).
export const ORIENTATION_URL=new URL('./data/orientation.json',import.meta.url);
export const loadOrientation=()=>existsSync(ORIENTATION_URL)?JSON.parse(readFileSync(ORIENTATION_URL,'utf8')):{rotationDeg:[0,0,0]};
/** rotación (grados) alrededor de X, Y, Z aplicada en el orden Rz·Ry·Rx */
export function eulerMatrix([rx,ry,rz]){
 const a=rx*Math.PI/180,b=ry*Math.PI/180,c=rz*Math.PI/180,sa=Math.sin(a),ca=Math.cos(a),sb=Math.sin(b),cb=Math.cos(b),sc=Math.sin(c),cc=Math.cos(c);
 const X=[[1,0,0],[0,ca,-sa],[0,sa,ca]],Y=[[cb,0,sb],[0,1,0],[-sb,0,cb]],Z=[[cc,-sc,0],[sc,cc,0],[0,0,1]];
 const mm=(A,B)=>A.map(r=>[0,1,2].map(j=>r[0]*B[0][j]+r[1]*B[1][j]+r[2]*B[2][j]));
 return mm(Z,mm(Y,X));
}
const mid=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2];

/** Colocación de un grupo de dominancia: traslación (+ rotación global opcional) que lleva el punto medio de los dos ostios
 *  de la media al de los ostios de `targets` (marco del corazón); escala 1 (milímetros de la cohorte). Los tres grupos
 *  comparten el marco medio de la cohorte, así coinciden entre sí. */
export function makeRegistration(mean,dominance,targets,{frameGroup='right',rotationDeg=loadOrientation().rotationDeg}={}){
 const lm=mean.groups[frameGroup].landmarks,R=eulerMatrix(rotationDeg);
 const pivot=mid(lm.lmOstium,lm.rcaOstium),dst=mid(targets.lmOstium,targets.rcaOstium);
 const apply=p=>{const q=sub(p,pivot);return add([0,1,2].map(r=>R[r][0]*q[0]+R[r][1]*q[1]+R[r][2]*q[2]),dst);};
 const placed=LANDMARK_KEYS.map(k=>apply(lm[k])),residualRms=Math.sqrt(LANDMARK_KEYS.reduce((a,k,i)=>a+dist(placed[i],targets[k])**2,0)/LANDMARK_KEYS.length);
 const group=key=>{
  const own=mean.groups[dominance].labels[key];
  // ramas poco frecuentes en un grupo pequeño: se toma la media del grupo derecho (mismo marco medio)
  if(own&&own.n>=12)return {label:own,from:dominance};
  const r=mean.groups.right.labels[key];
  return r?{label:r,from:'right'}:own?{label:own,from:dominance}:null;
 };
 return {
  scale:1,residualRms,targets,rotationDeg,apply,placedLandmarks:Object.fromEntries(LANDMARK_KEYS.map((k,i)=>[k,placed[i]])),
  /** curso medio colocado (sin ajuste al epicardio) o null */
  course(key){const g=group(key);if(!g)return null;return {points:g.label.points.map(apply),n:g.label.n,from:g.from,attachOnParent:g.label.attachOnParent??null,lengthMm:g.label.lengthMm,radiusMm:g.label.radiusMm??null};},
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
