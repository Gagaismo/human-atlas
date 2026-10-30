import type {Atlas,Part,Sex,SystemId} from './anatomy';

/** Structures packed as an extra atlas geometry chunk (scripts/lib/pack-chunk.mjs). */
export interface ExtraParts {
 chunk:Atlas['chunks'][number];
 parts:(Omit<Part,'chunk'|'nameEn'|'sex'>&{nameEs:string;system:SystemId})[];
}
/** The female variant (scripts/female/to-chunk.mjs). */
export interface FemaleParts extends ExtraParts {source:string;license:string;licenseUrl:string;sourceUrl:string;replaces:string[]}

const capitalize=(text:string)=>text.charAt(0).toUpperCase()+text.slice(1);

/** Returns a copy of the atlas with the extra structures appended as a new chunk and as searchable
 * concepts, with Spanish names and the source names in nameEn. */
export function appendParts(atlas:Atlas,extra:ExtraParts,sex?:Sex):Atlas{
 const chunk=atlas.chunks.length;
 const added=extra.parts.map(({nameEs,...p}):Part=>({...p,chunk,name:capitalize(nameEs),nameEn:p.name,...(sex?{sex}:{})}));
 return {
  ...atlas,
  chunks:[...atlas.chunks,extra.chunk],
  parts:[...atlas.parts,...added],
  concepts:[...atlas.concepts,...added.map(p=>({id:p.id,name:p.name,nameEn:p.nameEn,elements:[p.id]}))],
 };
}

/** Appends the female structures and marks the male structures they replace male-only. Shared structures
 * keep no sex. */
export function withFemale(atlas:Atlas,female:FemaleParts):Atlas{
 const replaced=new Set(female.replaces);
 return appendParts({...atlas,parts:atlas.parts.map(p=>replaced.has(p.id)?{...p,sex:'male' as const}:p)},female,'female');
}

export function shownFor(part:Pick<Part,'sex'>,sex:Sex){return !part.sex||part.sex===sex;}
