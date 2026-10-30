import type {SystemId} from './anatomy';

/** Spanish educational description of an atlas part, pending review by a teacher. */
export interface Description {resumen:string;detalles:{titulo:string;texto:string}[]}
export interface DescriptionTable {system:SystemId;entries:Record<string,Description>}
export type DescriptionTables = Partial<Record<SystemId,DescriptionTable>>;

/** Fields each described system may use, in display order. */
export const FIELDS = {
 skeletal:['Forma','Partes','Partes y accidentes','Articulaciones','Inserciones musculares','Función'],
 muscular:['Origen','Inserción','Inervación','Acción','Irrigación'],
 arterial:['Origen','Trayecto','Ramas','Territorio'],
 venous:['Origen','Trayecto','Desembocadura','Territorio'],
 nervous:['Ubicación','Partes','Origen','Trayecto','Ramas','Inervación','Función'],
 reproductive:['Ubicación','Partes','Irrigación','Función'],
} as const satisfies Partial<Record<SystemId,readonly string[]>>;
export const DESCRIBED_SYSTEMS = Object.keys(FIELDS) as (keyof typeof FIELDS)[];

/** Descriptions are shared by both sides: the key is the English source name without left/right, also when
 * the side is written in parentheses, as in "Areola (left)". */
export function descriptionKey(nameEn:string){return nameEn.toLowerCase().replace(/\b(left|right)\b ?/g,'').replace(/\(\s*\)/g,'').replace(/\s+/g,' ').trim();}

export function describe(tables:DescriptionTables,nameEn:string,system:SystemId):Description|undefined{
 return tables[system]?.entries[descriptionKey(nameEn)];
}

const loads = new Map<string,Promise<DescriptionTable|undefined>>();
/** Fetches a system's table once; resolves undefined for systems without descriptions or on failure. */
export function loadDescriptions(system:SystemId){
 if(!(DESCRIBED_SYSTEMS as string[]).includes(system))return Promise.resolve(undefined);
 let load=loads.get(system);
 if(!load){load=fetch(`/models/descriptions/${system}.json`).then(r=>r.ok?r.json() as Promise<DescriptionTable>:undefined).catch(()=>{loads.delete(system);return undefined;});loads.set(system,load);}
 return load;
}
