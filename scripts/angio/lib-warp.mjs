// Deformación del corazón al árbol (S18): el árbol medio de ImageCAS-X conserva la orientación de la población y es el que manda;
// el corazón de BodyParts3D (ventrículos, aurículas, raíz aórtica, aorta ascendente, tronco pulmonar) se deforma suavemente para
// que su epicardio siga al árbol (vasos 1–3 mm por fuera) y los dos ostios queden sobre los senos aórticos. El esqueleto no se mueve.
//   1. ICP rígido (rotación + traslación, sin escala) de los puntos del árbol sobre el epicardio original;
//   2. residuo no rígido: RBF gaussiana regularizada (ridge) con pares (punto del epicardio → posición bajo el vaso) y (pared
//      aórtica → ostio);
//   3. el efecto se desvanece con la distancia al corazón, así el cayado y los vasos del cuello siguen en su sitio.
import {similarity} from './imagecas/lib-fit.mjs';
import {add,sub,mul,dist,dot} from './lib-curves.mjs';
import {Surface} from './lib-geom.mjs';

const outwardOf=c=>dot(c.normal,c.point)<0?mul(c.normal,-1):c.normal; // marco del istmo: origen dentro del corazón

/** Ridge RBF gaussiana: A = (K + diag(lambda / w))^-1 D. Devuelve p → desplazamiento. */
export function gaussianRbf(centres,disp,{sigma,lambda=0.3,weights}){
 const n=centres.length,w=weights??new Array(n).fill(1);
 const K=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>Math.exp(-(dist(centres[i],centres[j])**2)/(2*sigma*sigma))+(i===j?lambda/w[i]:0)));
 const A=K.map((row,i)=>[...row,...disp[i]]);
 for(let c=0;c<n;c++){
  let p=c;for(let r=c+1;r<n;r++)if(Math.abs(A[r][c])>Math.abs(A[p][c]))p=r;
  [A[c],A[p]]=[A[p],A[c]];
  for(let r=c+1;r<n;r++){const f=A[r][c]/A[c][c];if(f===0)continue;for(let k=c;k<n+3;k++)A[r][k]-=f*A[c][k];}
 }
 const W=Array.from({length:n},()=>[0,0,0]);
 for(let r=n-1;r>=0;r--)for(let k=0;k<3;k++){let s=A[r][n+k];for(let c=r+1;c<n;c++)s-=A[r][c]*W[c][k];W[r][k]=s/A[r][r];}
 return p=>{let d=[0,0,0];for(let i=0;i<n;i++){const dd=(p[0]-centres[i][0])**2+(p[1]-centres[i][1])**2+(p[2]-centres[i][2])**2;if(dd>(4*sigma)**2)continue;d=add(d,mul(W[i],Math.exp(-dd/(2*sigma*sigma))));}return d;};
}

const smoothstep=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};

/** @param epiTris/aortaTris triángulos del epicardio y de la aorta ascendente (marco de la malla original)
 *  @param points muestras del árbol sobre el epicardio (cursos medios colocados, sin ajustar) ; @param ostia puntos de los dos ostios */
export function buildHeartWarp({epiTris,aortaTris,points,ostia,off=1.6,sigma=16,lambda=0.05,maxPair=22,fade=[90,210],log=()=>{}}){
 const epi=new Surface(epiTris,6);
 // 1. ICP rígido: G lleva los puntos del árbol hasta el epicardio + off (el corazón se mueve con G^-1)
 let G=null,pairs=0;
 for(let it=0;it<25;it++){
  const src=[],dst=[];
  for(const p of points){const q=G?G.apply(p):p,c=epi.closest(q,maxPair);if(!c||c.dist>maxPair)continue;src.push(p);dst.push(add(c.point,mul(outwardOf(c),off)));}
  pairs=src.length;
  G=similarity(src,dst,{noScale:true});
 }
 const Rt=[0,1,2].map(i=>[0,1,2].map(j=>G.R[j][i])); // G^-1 : p → R^T (p − t)
 const rigid=p=>{const q=sub(p,G.t);return [0,1,2].map(r=>Rt[r][0]*q[0]+Rt[r][1]*q[1]+Rt[r][2]*q[2]);};
 const rotDeg=Math.acos(Math.min(1,Math.max(-1,(G.R[0][0]+G.R[1][1]+G.R[2][2]-1)/2)))*180/Math.PI;
 log(`rigid: ${rotDeg.toFixed(1)}° rotation, translation ${G.t.map(v=>v.toFixed(1))}, ${pairs}/${points.length} points paired`);
 // 2. residuo no rígido sobre el corazón ya movido
 const moveTris=t=>t.map(tri=>tri.map(rigid));
 const epi1=new Surface(moveTris(epiTris),6),aorta1=new Surface(moveTris(aortaTris),6);
 const centres=[],disp=[],wts=[];let before=[];
 for(const p of points){
  const c=epi1.closest(p,maxPair);if(!c||c.dist>maxPair)continue;
  const n=outwardOf(c);before.push(dot(sub(p,c.point),n));
  centres.push(c.point);disp.push(sub(add(p,mul(n,-off)),c.point));wts.push(1);
 }
 for(const o of ostia){const c=aorta1.closest(o,40);centres.push(c.point);disp.push(sub(o,c.point));wts.push(8);}
 const rbf=gaussianRbf(centres,disp,{sigma,lambda,weights:wts});
 const full=p=>{const q=rigid(p);return add(q,rbf(q));};
 const apply=p=>{const d=Math.hypot(p[0],p[1],p[2]),w=1-smoothstep(fade[0],fade[1],d);const f=full(p);return w>=1?f:add(p,mul(sub(f,p),w));};
 // diagnóstico: distancia con signo de los puntos del árbol al epicardio deformado (+ = por fuera) y de los ostios a la pared
 const warped=epiTris.map(t=>t.map(apply)),epi2=new Surface(warped,6);
 const sd=points.map(p=>{const c=epi2.closest(p,40);return c?dot(sub(p,c.point),outwardOf(c)):NaN;}).filter(Number.isFinite);
 const stats=a=>{const m=a.reduce((x,y)=>x+y,0)/a.length,s=Math.sqrt(a.reduce((x,y)=>x+(y-m)**2,0)/a.length);return `${m.toFixed(2)}±${s.toFixed(2)} (min ${Math.min(...a).toFixed(1)}, max ${Math.max(...a).toFixed(1)})`;};
 const aorta2=new Surface(aortaTris.map(t=>t.map(apply)),6);
 const ost=ostia.map(o=>aorta2.closest(o,40).dist);
 log(`tree-to-epicardium signed distance mm: before ICP-only ${stats(before)}; after warp ${stats(sd)}; ostia to aortic wall ${ost.map(v=>v.toFixed(2))} mm`);
 return {apply,rigidRotationDeg:rotDeg,stats:{pairs,treeToEpicardiumMm:{mean:+(sd.reduce((a,b)=>a+b,0)/sd.length).toFixed(2),max:+Math.max(...sd.map(Math.abs)).toFixed(2)},ostiaToWallMm:ost.map(v=>+v.toFixed(2))},params:{off,sigma,lambda,fade,controlPoints:centres.length}};
}
