// Loads and caches the coronary trees (public/models/angio) and merges the grafts into the right-dominant one.
import type {CoronaryTree,Dominance} from './core/types';

const BASE='/models/angio/';
const files=new Map<string,Promise<unknown>>(),trees=new Map<Dominance,Promise<CoronaryTree>>();

function getJson<T>(name:string):Promise<T>{
 let p=files.get(name);
 if(!p){
  p=fetch(BASE+name).then(r=>{if(!r.ok)throw new Error(`No se pudo cargar ${name}.`);return r.json();});
  p.catch(()=>files.delete(name));
  files.set(name,p);
 }
 return p as Promise<T>;
}

/** Every segment id of a tree. */
export const segmentIds=(tree:CoronaryTree)=>new Set(tree.vessels.flatMap(v=>v.segments.map(s=>s.id)));

/** Structural check of a tree; throws an Error in Spanish naming the first problem (ids, point/radius counts, parents, duplicate segment ids). */
export function validateTree(tree:CoronaryTree,label:string):void{
 if(!tree||!Array.isArray(tree.vessels)||!tree.vessels.length)throw new Error(`Los datos de ${label} están vacíos.`);
 const vessels=new Set(tree.vessels.map(v=>v.id)),segments=new Set<string>();
 for(const v of tree.vessels){
  if(!v.id||v.points.length<2||v.points.length!==v.radii.length)throw new Error(`Los datos de ${label} están dañados (vaso ${v.id||'sin id'}).`);
  if(v.parent!==null&&!vessels.has(v.parent))throw new Error(`Los datos de ${label} están dañados (el vaso ${v.id} no tiene origen).`);
  for(const s of v.segments){
   if(!s.id||segments.has(s.id))throw new Error(`Los datos de ${label} repiten el segmento ${s.id||'sin id'}.`);
   segments.add(s.id);
  }
 }
}

/** Tree of a dominance; with right dominance the graft vessels are appended (visibility decides which are drawn). */
export function loadTree(dom:Dominance):Promise<CoronaryTree>{
 let p=trees.get(dom);
 if(!p){
  p=(async()=>{
   const tree=await getJson<CoronaryTree>(`coronary-${dom}.json`);
   validateTree(tree,`la coronaria ${dom==='right'?'derecha':dom==='left'?'izquierda':'codominante'}`);
   if(dom!=='right')return tree;
   const grafts=await getJson<{vessels:CoronaryTree['vessels']}>('grafts-right.json');
   const merged={...tree,vessels:[...tree.vessels,...grafts.vessels]};
   validateTree(merged,'los puentes');
   return merged;
  })();
  p.catch(()=>trees.delete(dom));
  trees.set(dom,p);
 }
 return p;
}
