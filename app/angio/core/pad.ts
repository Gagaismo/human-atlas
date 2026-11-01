// Angle-pad maps (S6): foreshortening, overlap and combined clarity of one segment over the whole (a, b) range.
// Pure functions over typed arrays so the UI can run them in chunks (computePadRows) or inside a Web Worker and
// transfer the Float32Arrays back (`pad.foreshortening.buffer` etc.).
//
// Layout: column i ↔ a = A_MIN + i·step (OAD 90 … OAI 90), row j ↔ b = B_MIN + j·step (CAU 45 … CRA 45);
// index = j·na + i. The UI flips rows to put CRA on top. `combined` is the clarity (1 − foreshortening)(1 − overlap):
// high (light) where the segment is both long and unobstructed.
import {A_LIMIT,B_LIMIT} from './geometry';
import {DEFAULT_STEP,createScratch,evaluateView,prepareTarget,prepareTree} from './metrics';
import type {PreparedTree,Target} from './metrics';
import type {CoronaryTree,Visibility} from './types';

export const A_MIN=-A_LIMIT,A_MAX=A_LIMIT,B_MIN=-B_LIMIT,B_MAX=B_LIMIT;
export const DEFAULT_PAD_STEP=3;

export interface Pad{step:number;na:number;nb:number;foreshortening:Float32Array;overlap:Float32Array;combined:Float32Array}
export interface BestView{a:number;b:number;foreshortening:number;overlap:number}

export function createPad(step=DEFAULT_PAD_STEP):Pad{
 const na=Math.floor((A_MAX-A_MIN)/step+1e-9)+1,nb=Math.floor((B_MAX-B_MIN)/step+1e-9)+1;
 return {step,na,nb,foreshortening:new Float32Array(na*nb),overlap:new Float32Array(na*nb),combined:new Float32Array(na*nb)};
}
export const padAngleA=(pad:Pad,i:number)=>A_MIN+i*pad.step;
export const padAngleB=(pad:Pad,j:number)=>B_MIN+j*pad.step;
/** Index of the cell nearest to (a, b). */
export function padIndex(pad:Pad,a:number,b:number):number{
 const i=Math.min(pad.na-1,Math.max(0,Math.round((a-A_MIN)/pad.step))),j=Math.min(pad.nb-1,Math.max(0,Math.round((b-B_MIN)/pad.step)));
 return j*pad.na+i;
}

/** Fill rows [j0, j1) of `pad` for the target (chunkable). */
export function computePadRows(prep:PreparedTree,target:Target,pad:Pad,j0:number,j1:number):void{
 const scratch=createScratch(prep);
 for(let j=j0;j<Math.min(j1,pad.nb);j++)for(let i=0;i<pad.na;i++){
  const m=evaluateView(prep,target,padAngleA(pad,i),padAngleB(pad,j),scratch),k=j*pad.na+i;
  pad.foreshortening[k]=m.foreshortening;pad.overlap[k]=m.overlap;pad.combined[k]=m.combined;
 }
}

export function computePad(prep:PreparedTree,target:Target,step=DEFAULT_PAD_STEP):Pad{
 const pad=createPad(step);computePadRows(prep,target,pad,0,pad.nb);return pad;
}

/** Cell with the highest clarity; ties (within 1e-4) go to the angle closest to AP. */
export function bestOfPad(pad:Pad):BestView{
 let best=-1,bc=-Infinity,bd=Infinity;
 for(let j=0;j<pad.nb;j++)for(let i=0;i<pad.na;i++){
  const k=j*pad.na+i,c=pad.combined[k],dd=Math.abs(padAngleA(pad,i))/A_LIMIT+Math.abs(padAngleB(pad,j))/B_LIMIT;
  if(c>bc+1e-4||(c>bc-1e-4&&dd<bd)){if(c>bc)bc=c;best=k;bd=dd;}
 }
 const i=best%pad.na,j=Math.floor(best/pad.na);
 return {a:padAngleA(pad,i),b:padAngleB(pad,j),foreshortening:pad.foreshortening[best],overlap:pad.overlap[best]};
}

/** Clearest view of a segment: the angles where it is both long and unobstructed. Null if the segment is not visible. */
export function bestView(tree:CoronaryTree,segmentId:string,vis:Visibility,step=DEFAULT_PAD_STEP,sampleStep=DEFAULT_STEP):BestView|null{
 const prep=prepareTree(tree,vis,sampleStep),target=prepareTarget(prep,segmentId);
 return target?bestOfPad(computePad(prep,target,step)):null;
}
