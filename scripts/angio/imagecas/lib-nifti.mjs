// Lector mínimo de NIfTI-1 (.nii.gz) de ImageCAS-X: cabecera, afín vóxel→mundo y datos enteros. Solo lee datos.
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';

export function readNifti(path){
 const raw=readFileSync(path),b=path.endsWith('.gz')?gunzipSync(raw):raw;
 const le=b.readInt32LE(0)===348,i16=o=>le?b.readInt16LE(o):b.readInt16BE(o),f32=o=>le?b.readFloatLE(o):b.readFloatBE(o);
 const dim=[1,2,3].map(k=>i16(40+2*k)),datatype=i16(70),pix=[1,2,3].map(k=>f32(76+4*k)),voxOffset=Math.round(f32(108));
 const sformCode=i16(254),qformCode=i16(252);
 let A; // fila-mayor 3x4: mundo = A · [i,j,k,1]
 if(sformCode>0){A=[0,1,2].map(r=>[0,1,2,3].map(c=>f32(280+16*r+4*c)));}
 else{ // qform
  const qb=f32(256),qc=f32(260),qd=f32(264),qa=Math.sqrt(Math.max(0,1-qb*qb-qc*qc-qd*qd)),qfac=f32(76)<0?-1:1;
  const R=[[qa*qa+qb*qb-qc*qc-qd*qd,2*(qb*qc-qa*qd),2*(qb*qd+qa*qc)],[2*(qb*qc+qa*qd),qa*qa+qc*qc-qb*qb-qd*qd,2*(qc*qd-qa*qb)],[2*(qb*qd-qa*qc),2*(qc*qd+qa*qb),qa*qa+qd*qd-qc*qc-qb*qb]];
  const px=[pix[0],pix[1],pix[2]*qfac];
  A=[0,1,2].map(r=>[R[r][0]*px[0],R[r][1]*px[1],R[r][2]*px[2],f32(268+4*r)]);
 }
 const n=dim[0]*dim[1]*dim[2],bytes={2:1,4:2,8:4,512:2,16:4}[datatype];
 let data;
 if(datatype===2)data=new Uint8Array(b.buffer,b.byteOffset+voxOffset,n);
 else if(datatype===4)data=new Int16Array(b.buffer.slice(b.byteOffset+voxOffset,b.byteOffset+voxOffset+n*2));
 else if(datatype===512)data=new Uint16Array(b.buffer.slice(b.byteOffset+voxOffset,b.byteOffset+voxOffset+n*2));
 else throw new Error('datatype no soportado '+datatype);
 return {dim,pix,A,data,datatype,sformCode,qformCode};
}
