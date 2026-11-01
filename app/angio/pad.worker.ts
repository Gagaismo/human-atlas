// Computes the angle-pad map of one segment off the main thread (S6). Rows are posted progressively so the pad fills in.
import {computePadRows,createPad} from './core/pad';
import {prepareTarget,prepareTree} from './core/metrics';
import type {CoronaryTree,GraftId,System} from './core/types';

export interface PadRequest{id:number;tree:CoronaryTree;system:System;ramus:boolean;grafts:GraftId[];segmentId:string;step:number}
/** `hidden` = the segment is not part of the visible tree, so there is nothing to compute. */
export type PadReply={id:number;hidden:true}|{id:number;hidden?:false;na:number;nb:number;j0:number;j1:number;f:Float32Array;o:Float32Array;c:Float32Array}

const ROWS=3,port=self as unknown as Worker;
let current=0;

port.onmessage=(e:MessageEvent<PadRequest>)=>{
 const q=e.data;current=q.id;
 const prep=prepareTree(q.tree,{system:q.system,ramus:q.ramus,grafts:new Set(q.grafts)}),target=prepareTarget(prep,q.segmentId);
 if(!target){port.postMessage({id:q.id,hidden:true} satisfies PadReply);return;}
 const pad=createPad(q.step);
 const next=(j0:number)=>{
  if(current!==q.id||j0>=pad.nb)return;
  const j1=Math.min(pad.nb,j0+ROWS);
  computePadRows(prep,target,pad,j0,j1);
  const a=j0*pad.na,b=j1*pad.na,f=pad.foreshortening.slice(a,b),o=pad.overlap.slice(a,b),c=pad.combined.slice(a,b);
  port.postMessage({id:q.id,na:pad.na,nb:pad.nb,j0,j1,f,o,c} satisfies PadReply,[f.buffer,o.buffer,c.buffer]);
  setTimeout(()=>next(j1),0);
 };
 next(0);
};
