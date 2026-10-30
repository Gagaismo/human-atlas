import type {Atlas,Part,Sex,SystemId} from './anatomy';

/** The female variant packed as an extra atlas chunk (scripts/female/to-chunk.mjs). */
export interface FemaleParts {
 source:string;license:string;licenseUrl:string;sourceUrl:string;
 chunk:Atlas['chunks'][number];
 parts:(Omit<Part,'chunk'|'nameEn'|'sex'>&{nameEs:string;system:SystemId})[];
 replaces:string[];
}

const capitalize=(text:string)=>text.charAt(0).toUpperCase()+text.slice(1);

/** Returns a copy of the atlas with the female structures appended as a new chunk, and the male structures
 * they replace marked male-only. Shared structures keep no sex. */
export function withFemale(atlas:Atlas,female:FemaleParts):Atlas{
 const chunk=atlas.chunks.length,replaced=new Set(female.replaces);
 const added=female.parts.map(({nameEs,...p}):Part=>({...p,chunk,name:capitalize(nameEs),nameEn:p.name,sex:'female'}));
 return {
  ...atlas,
  chunks:[...atlas.chunks,female.chunk],
  parts:[...atlas.parts.map(p=>replaced.has(p.id)?{...p,sex:'male' as const}:p),...added],
  concepts:[...atlas.concepts,...added.map(p=>({id:p.id,name:p.name,nameEn:p.nameEn,elements:[p.id]}))],
 };
}

export function shownFor(part:Pick<Part,'sex'>,sex:Sex){return !part.sex||part.sex===sex;}
