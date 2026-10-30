/** Bone landmarks, muscle attachment areas and lymphatic structures extracted from Z-Anatomy
 * (scripts/zanatomy/build.mjs), in the atlas frame. */
export interface Landmark {id:string;name:string;nameEs:string;bone:string;position:[number,number,number];mirrored:boolean}
export interface Attachment {id:string;muscle:string;muscleEs:string;muscleParts:string[];kind:'origin'|'insertion';side:'left'|'right'|'midline';bones:string[];node:string;center:[number,number,number]}
export interface LymphStructure {id:string;name:string;nameEs:string;node:string;bounds:[number[],number[]]}
export interface DescriptiveData {source:string;license:string;landmarks:Landmark[];attachments:Attachment[];lymph:LymphStructure[]}

/** Landmarks on the selected bones. */
export function landmarksFor(data:DescriptiveData,selected:readonly string[]){
 const ids=new Set(selected);
 return data.landmarks.filter(l=>ids.has(l.bone));
}

/** Attachment areas of the selected muscles, or on the selected bones. */
export function attachmentsFor(data:DescriptiveData,selected:readonly string[]){
 const ids=new Set(selected);
 return data.attachments.filter(a=>a.muscleParts.some(id=>ids.has(id))||a.bones.some(id=>ids.has(id)));
}

type Box = [ArrayLike<number>,ArrayLike<number>];
/** Whether an area's bounding box lies on the given bones (their bounding boxes padded by pad meters). Some
 * areas span several bones or soft tissue and would float around a single isolated bone. */
export function drawnOnBones(area:Box,bones:Box[],pad=.02){
 return [0,1,2].every(c=>area[0][c]>=Math.min(...bones.map(b=>b[0][c]))-pad&&area[1][c]<=Math.max(...bones.map(b=>b[1][c]))+pad);
}

/** For the detail panel: one row per muscle, with the kinds of attachment it has on the selection. */
export function attachmentRows(attachments:readonly Attachment[]){
 const rows=new Map<string,{muscle:string;muscleEs:string;origin:boolean;insertion:boolean}>();
 for(const a of attachments){
  const row=rows.get(a.muscle)??{muscle:a.muscle,muscleEs:a.muscleEs,origin:false,insertion:false};
  row[a.kind]=true;rows.set(a.muscle,row);
 }
 return [...rows.values()].sort((a,b)=>a.muscleEs.localeCompare(b.muscleEs,'es'));
}

/** Landmarks that are openings, canals, grooves, notches or fossae: the panel says what passes through them. */
export const OPENING=/foramen|foramina|canal|groove|sulcus|notch|fissure|hiatus|meatus|incisure|aperture|opening|tunnel|orifice|porus|canaliculus|fossa/i;

/** What passes through each opening, keyed by the lowercase English landmark name. */
export interface OpeningTable {entries:Record<string,string>}
export function openingContent(table:OpeningTable,name:string){return table.entries[name.toLowerCase()];}

export const capitalize=(text:string)=>text.charAt(0).toUpperCase()+text.slice(1);
