// Comparación de rasgos 2D de CARDIAG con la proyección de nuestros árboles (geometría de app/angio/core/geometry.ts).
// Rasgo = dirección (proximal → distal) de un segmento SYNTAX en la imagen, ángulo en grados con x a la derecha, y arriba.
import * as mod from 'node:module';
import {readFileSync} from 'node:fs';
mod.registerHooks(await import('../../gyneco/ts-resolve.mjs'));
export const G=await import('../../../app/angio/core/geometry.ts');

export const SEG_MAP={ // CARDIAG segment → [vessel id, our segment id]
 '01':['rca','rca-prox'],'02':['rca','rca-mid'],'03':['rca','rca-dist'],'04':['pda','pda'],
 '05':['lm','lm'],'06':['lad','lad-prox'],'07':['lad','lad-mid'],'08':['lad','lad-apical'],'11':['lcx','lcx-prox'],'13':['lcx','lcx-dist'],'09':['d1','d1'],
};
export const KEY_SEGS=['01','02','04','05','06','07','11'];
export const loadTree=(dir,d)=>JSON.parse(readFileSync(new URL(`coronary-${d}.json`,dir),'utf8'));
export const loadFeatures=p=>JSON.parse(readFileSync(p,'utf8'));
const interp=(pts,t)=>{const x=Math.min(1,Math.max(0,t))*(pts.length-1),i=Math.min(pts.length-2,Math.floor(x)),f=x-i;return pts[i].map((v,k)=>v+(pts[i+1][k]-v)*f);};
// arc-length parametrisation like app/angio/core (segment from/to are arc fractions)
function arcPoint(pts,t){const c=[0];for(let i=1;i<pts.length;i++)c.push(c[i-1]+Math.hypot(...pts[i].map((v,k)=>v-pts[i-1][k])));const s=t*c.at(-1);let j=0;while(j<pts.length-2&&c[j+1]<s)j++;const f=(s-c[j])/((c[j+1]-c[j])||1);return pts[j].map((v,k)=>v+(pts[j+1][k]-v)*f);}
export function segmentEnds(tree,cardiagId){
 const m=SEG_MAP[cardiagId];if(!m)return null;
 const v=tree.vessels.find(x=>x.id===m[0]);if(!v)return null;
 const s=v.segments.find(x=>x.id===m[1]);if(!s)return null;
 // chord over the central 90 % of the segment (the mask ends are 5th/95th percentile means)
 const w=s.to-s.from;return [arcPoint(v.points,s.from+0.05*w),arcPoint(v.points,s.to-0.05*w)];
}
export const angleDeg=(dx,dy)=>Math.atan2(dy,dx)*180/Math.PI;
export const angDiff=(a,b)=>{let d=a-b;d=((d+180)%360+360)%360-180;return Math.abs(d);};
/** apply R (3x3) about the origin to the ends */
const rot=(R,p)=>R?[0,1,2].map(r=>R[r][0]*p[0]+R[r][1]*p[1]+R[r][2]*p[2]):p;
/** predicted direction angle of the segment at the frame's angles; sign flips as options for the convention check */
export function predictAngle(ends,R,a,b){
 const ax=G.imageAxes(a,b),P=ends.map(p=>G.projectWith(ax,rot(R,p)));
 return angleDeg(P[1].x-P[0].x,P[1].y-P[0].y);
}
export const observedAngle=f=>angleDeg(f.far[0]-f.near[0],f.far[1]-f.near[1]);
/** errors per CARDIAG segment: array of {seg, err, frame} over frames. opts: sa,sb sign multipliers, minElong, R, trees */
export function evaluate(features,trees,{R=null,sa=1,sb=1,segs=KEY_SEGS,minElong=1.8,minN=300}={}){
 const out=[];
 const ends=Object.fromEntries(segs.map(s=>[s,segmentEnds(trees.right,s)]));
 for(const fr of features){
  for(const s of segs){
   const f=fr.segs[s];if(!f||!ends[s]||f.elong<minElong||f.n<minN)continue;
   const isRight=['01','02','03','04'].includes(s);
   if((fr.side==='right')!==isRight)continue;
   out.push({seg:s,case:fr.case,err:angDiff(predictAngle(ends[s],R,sa*fr.primary,sb*fr.secondary),observedAngle(f))});
  }
 }
 return out;
}
export function summarize(rows){
 const by={};for(const r of rows)(by[r.seg]??=[]).push(r.err);
 const sum=Object.fromEntries(Object.entries(by).map(([k,v])=>[k,{n:v.length,mean:+(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1),median:+[...v].sort((a,b)=>a-b)[Math.floor(v.length/2)].toFixed(1)}]));
 const all=Object.values(sum).map(s=>s.mean);sum.mean=+(all.reduce((a,b)=>a+b,0)/all.length).toFixed(1);return sum;
}
