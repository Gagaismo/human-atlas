/** Anatomical section planes. Atlas axes: +x is the body's left, +y is up, +z is anterior. */
export type SectionPlane = 'sagittal'|'coronal'|'transverse';
export interface Section {plane:SectionPlane;position:number;flip:boolean}
/** A clipping plane: points with dot(normal, p) + constant >= 0 stay visible (three.js convention). */
export interface CutPlane {normal:[number,number,number];constant:number}
type Bounds = [number[],number[]];

const AXIS:Record<SectionPlane,0|1|2> = {sagittal:0,transverse:1,coronal:2};
/** Camera view that faces the cut face of a plane, for the kept half. */
export function sectionView(plane:SectionPlane,flip:boolean){
 return plane==='sagittal'?(flip?'right-side':'side'):plane==='coronal'?(flip?'back':'front'):(flip?'bottom':'top');
}
export const SECTION_NAMES:Record<SectionPlane,string> = {sagittal:'Sagital',coronal:'Coronal',transverse:'Transversal'};

export function atlasBounds(parts:{bounds:Bounds}[]):Bounds{
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(const p of parts)for(let i=0;i<3;i++){min[i]=Math.min(min[i],p.bounds[0][i]);max[i]=Math.max(max[i],p.bounds[1][i]);}
 return [min,max];
}

/** By default the plane keeps the right half (sagittal), the posterior half (coronal) or what lies below
 * the cut (transverse), so the matching camera view looks at the cut face; flip keeps the other side. */
export function sectionPlane(section:Section,bounds:Bounds):CutPlane{
 const axis=AXIS[section.plane],t=Math.min(1,Math.max(0,section.position));
 const cut=bounds[0][axis]+(bounds[1][axis]-bounds[0][axis])*t,sign=section.flip?1:-1;
 const normal:[number,number,number]=[0,0,0];normal[axis]=sign;
 return {normal,constant:-sign*cut};
}

export function keeps(plane:CutPlane,point:number[]){
 return plane.normal[0]*point[0]+plane.normal[1]*point[1]+plane.normal[2]*point[2]+plane.constant>=0;
}
