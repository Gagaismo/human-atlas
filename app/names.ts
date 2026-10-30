import type {Atlas} from './anatomy';

/** Normalized English name → Spanish name. "{s}" in a key stands for left/right; "{N:g}" in a value is the
 * N-th side of the English name, agreeing in gender and number (m, f, mp, fp). */
export type NameTable = Record<string,string>;
type Gender = 'm'|'f'|'mp'|'fp';
const SIDES:Record<string,Record<Gender,string>> = {
 left:{m:'izquierdo',f:'izquierda',mp:'izquierdos',fp:'izquierdas'},
 right:{m:'derecho',f:'derecha',mp:'derechos',fp:'derechas'},
};

export function nameKey(name:string){
 const sides:string[]=[];
 const key=name.toLowerCase().replace(/\b(left|right)\b/g,side=>{sides.push(side);return '{s}';}).trim();
 return {key,sides};
}

export function spanishName(name:string,table:NameTable){
 const {key,sides}=nameKey(name),es=table[key];
 if(!es)return name;
 const text=es.replace(/\{(\d):(m|f|mp|fp)\}/g,(_,n:string,g:Gender)=>SIDES[sides[Number(n)-1]]?.[g]??'');
 return text.charAt(0).toUpperCase()+text.slice(1);
}

/** Returns a copy of the atlas with Spanish names, keeping the source names in nameEn. */
export function localizeAtlas(atlas:Atlas,table:NameTable):Atlas{
 return {
  ...atlas,
  parts:atlas.parts.map(p=>({...p,nameEn:p.name,name:spanishName(p.name,table)})),
  concepts:atlas.concepts.map(c=>({...c,nameEn:c.name,name:spanishName(c.name,table)})),
 };
}

/** Lowercase, accent-free text for search. */
export function fold(text:string){return text.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();}
