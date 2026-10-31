import * as T from 'three';

/** One part of the female chunk (public/models/female/female-parts.json); offsets are bytes into the chunk. */
export interface FemalePart {id:string;name:string;nameEs:string;system:string;positions:number;normals:number;indices:number;vertexCount:number;indexCount:number;bounds:[number[],number[]]}
export interface FemaleManifest {chunk:{url:string;bytes:number;gzip?:string;gzipBytes?:number};parts:FemalePart[]}

/** Positions are Float32 xyz, normals Int16 normalized xyz, indices Uint32. */
export function partGeometry(buffer:ArrayBuffer,p:FemalePart){
 const g=new T.BufferGeometry();
 g.setAttribute('position',new T.BufferAttribute(new Float32Array(buffer,p.positions,p.vertexCount*3),3));
 g.setAttribute('normal',new T.BufferAttribute(new Int16Array(buffer,p.normals,p.vertexCount*3),3,true));
 g.setIndex(new T.BufferAttribute(new Uint32Array(buffer,p.indices,p.indexCount),1));
 return g;
}
