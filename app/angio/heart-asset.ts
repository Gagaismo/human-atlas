// Loader of the compact heart + thoracic skeleton asset (public/models/angio/heart.json + heart.bin[.gz], layout in heart.json meta).
import * as T from 'three';
import {decodeModelResponse} from '../model-download';

export type HeartGroup='heart'|'great-vessel'|'skeleton';
export interface HeartPart{id:string;name:string;group:HeartGroup;geometry:T.BufferGeometry}

interface PartMeta{id:string;name:string;group:HeartGroup;positions:number;normals:number;indices:number;vertexCount:number;indexCount:number}
interface HeartMeta{meta:{bytes:number;url:string;gzip?:string;gzipBytes?:number};parts:PartMeta[]}

const JSON_URL='/models/angio/heart.json';
let cache:Promise<HeartPart[]>|null=null;

/** Loads the heart parts once (the promise is cached; a failed load is forgotten so a later mount can retry). */
export function loadHeartAsset():Promise<HeartPart[]>{
 if(!cache)cache=fetchHeart().catch(e=>{cache=null;throw e;});
 return cache;
}

async function fetchHeart():Promise<HeartPart[]>{
 const response=await fetch(JSON_URL);
 if(!response.ok)throw new Error('heart.json');
 const {meta,parts}=await response.json() as HeartMeta;
 let buffer:ArrayBuffer|null=null;
 if(meta.gzip&&typeof DecompressionStream!=='undefined'){
  try{buffer=await decodeModelResponse(await fetch(meta.gzip),meta.bytes,true);}catch{buffer=null;}
 }
 if(!buffer)buffer=await decodeModelResponse(await fetch(meta.url),meta.bytes,false);
 const bin=buffer;
 return parts.map(p=>{
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(bin.slice(p.positions,p.positions+p.vertexCount*12)),3));
  geometry.setAttribute('normal',new T.BufferAttribute(new Float32Array(bin.slice(p.normals,p.normals+p.vertexCount*12)),3));
  geometry.setIndex(new T.BufferAttribute(new Uint32Array(bin.slice(p.indices,p.indices+p.indexCount*4)),1));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return {id:p.id,name:p.name,group:p.group,geometry};
 });
}
