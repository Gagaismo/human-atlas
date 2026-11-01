// Data contract of the coronary tree (produced by scripts/angio/build-anatomy.mjs) and the shared state types of the
// angiography core. Frame: millimetres, X = patient left, Y = superior (head), Z = anterior, origin = heart isocentre.
export type Vec3=[number,number,number];

export interface Segment{id:string;syntax:string;name:string;short:string;
 /** Start of the segment along its vessel. A value ≤ 1 for `to` means arc-length fractions (0–1); otherwise both are fractional point indices (see tree.segmentRange). */
 from:number;to:number}

export interface Vessel{id:string;name:string;short:string;system:'left'|'right'|'graft';family:'tci'|'da'|'cx'|'ri'|'cd'|'graft';
 parent:string|null;parentArc:number|null;points:Vec3[];radii:number[];segments:Segment[];variant?:'ramus';source:string}

export interface CoronaryTree{
 meta:{units:'mm';frame:string;dominance:'right'|'left'|'co';isocentre:string;source:string;license:string;generator:string};
 vessels:Vessel[];
 landmarks:{lmOstium:Vec3;rcaOstium:Vec3;apex:Vec3;crux:Vec3;aorticRootCentre:Vec3;lmBifurcation:Vec3}}

export type System='left'|'right'|'both';
export type GraftId='lima'|'svg-om'|'svg-pda';
export type Dominance='right'|'left'|'co';
export type Family=Vessel['family'];

/** Which vessels are opacified / drawn. */
export interface Visibility{system:System;ramus:boolean;grafts:ReadonlySet<GraftId>}
