import type {SystemId} from './anatomy';

export const TISSUE_CATEGORIES = ['Epitelial','Conectivo','Muscular','Nervioso','Órganos'] as const;
export interface Tissue {
 id:string;nombre:string;categoria:(typeof TISSUE_CATEGORIES)[number];descripcion:string;tincion:string;aumento?:string;especie?:string;
 image:string;width:number;height:number;
 credit:{author:string;license:string;licenseUrl:string;source:string;modification:string};
 related:{systems:SystemId[];names:string[]};
}
export interface HistologyCatalog {tissues:Tissue[]}

/** Same key as descriptionKey: lowercase English name without left/right (kept local so Node can run the checks). */
const baseName=(nameEn:string)=>nameEn.toLowerCase().replace(/\b(left|right)\b ?/g,'').trim();
const escape=(text:string)=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

/** Tissues for an atlas structure: those whose related names appear as whole words in its English name or,
 * when none does, those of its system, main system first; at most four. */
export function relatedTissues(catalog:HistologyCatalog,nameEn:string,system:SystemId,limit=4):Tissue[]{
 const key=baseName(nameEn);
 const byName=catalog.tissues.filter(t=>t.related.names.some(n=>new RegExp(`\\b${escape(n)}\\b`).test(key)));
 if(byName.length)return byName.slice(0,limit);
 const rank=(t:Tissue)=>t.related.systems.indexOf(system);
 return catalog.tissues.filter(t=>rank(t)>=0).sort((a,b)=>rank(a)-rank(b)).slice(0,limit);
}

let load:Promise<HistologyCatalog|undefined>|undefined;
export function loadHistology(){
 load??=fetch('/histology/histology.json').then(r=>r.ok?r.json() as Promise<HistologyCatalog>:undefined).catch(()=>{load=undefined;return undefined;});
 return load;
}
