// Minimal binary glTF reader/writer shared by build.mjs and validate.mjs (no textures, one buffer).
import {readFileSync} from 'node:fs';

const COMPONENTS={5120:[1,'getInt8'],5121:[1,'getUint8'],5122:[2,'getInt16'],5123:[2,'getUint16'],5125:[4,'getUint32'],5126:[4,'getFloat32']};
const WIDTH={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};

export function parseGlb(buffer){
 if(buffer.toString('latin1',0,4)!=='glTF')throw new Error('not a binary glTF file');
 const jsonLength=buffer.readUInt32LE(12),gltf=JSON.parse(buffer.toString('utf8',20,20+jsonLength));
 const binStart=20+jsonLength+8,bin=buffer.subarray(binStart,binStart+buffer.readUInt32LE(20+jsonLength));
 return {gltf,bin};
}

function readAccessor({gltf,bin},index){
 const a=gltf.accessors[index],view=gltf.bufferViews[a.bufferView],[size,method]=COMPONENTS[a.componentType],width=WIDTH[a.type];
 const stride=view.byteStride??size*width,base=(view.byteOffset??0)+(a.byteOffset??0);
 const dv=new DataView(bin.buffer,bin.byteOffset,bin.byteLength);
 const norm=a.normalized?{5120:127,5121:255,5122:32767,5123:65535}[a.componentType]:1;
 const out=new Float64Array(a.count*width);
 for(let i=0;i<a.count;i++)for(let c=0;c<width;c++){const v=dv[method](base+i*stride+c*size,true)/norm;out[i*width+c]=a.normalized?Math.max(-1,v):v;}
 return {data:out,count:a.count,width};
}

function multiply(a,b){ // column-major 4x4
 const r=new Array(16).fill(0);
 for(let c=0;c<4;c++)for(let rr=0;rr<4;rr++)for(let k=0;k<4;k++)r[c*4+rr]+=a[k*4+rr]*b[c*4+k];
 return r;
}
function localMatrix(n){
 if(n.matrix)return n.matrix;
 const [x,y,z,w]=n.rotation??[0,0,0,1],[sx,sy,sz]=n.scale??[1,1,1],[tx,ty,tz]=n.translation??[0,0,0];
 return [(1-2*(y*y+z*z))*sx,2*(x*y+z*w)*sx,2*(x*z-y*w)*sx,0, 2*(x*y-z*w)*sy,(1-2*(x*x+z*z))*sy,2*(y*z+x*w)*sy,0, 2*(x*z+y*w)*sz,2*(y*z-x*w)*sz,(1-2*(x*x+y*y))*sz,0, tx,ty,tz,1];
}

// Every mesh primitive in world space: [{name, path, positions:Float64Array, indices:Uint32Array}].
// `path` lists the ancestor node names, so callers can tell compact from spongy bone.
export function readMeshes(buffer){
 const file=parseGlb(buffer),{gltf}=file,meshes=[];
 const visit=(index,parentMatrix,path)=>{
  const node=gltf.nodes[index],matrix=multiply(parentMatrix,localMatrix(node));
  if(node.mesh!==undefined)for(const primitive of gltf.meshes[node.mesh].primitives){
   const p=readAccessor(file,primitive.attributes.POSITION),positions=new Float64Array(p.data.length);
   for(let i=0;i<p.count;i++){
    const x=p.data[i*3],y=p.data[i*3+1],z=p.data[i*3+2];
    positions[i*3]=matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12];
    positions[i*3+1]=matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13];
    positions[i*3+2]=matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14];
   }
   const indices=primitive.indices!==undefined?Uint32Array.from(readAccessor(file,primitive.indices).data):Uint32Array.from({length:p.count},(_,i)=>i);
   meshes.push({name:node.name,path:path.join('/'),positions,indices});
  }
  for(const child of node.children??[])visit(child,matrix,[...path,node.name]);
 };
 for(const root of gltf.scenes[gltf.scene??0].nodes)visit(root,[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],[]);
 return meshes;
}

export function bounds(positions){
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<positions.length;i+=3)for(let c=0;c<3;c++){const v=positions[i+c];if(v<min[c])min[c]=v;if(v>max[c])max[c]=v;}
 return [min,max];
}

// Writes one mesh node per entry, no node transforms. Positions are float32, normals are normalized int8,
// indices are uint16 when the mesh has fewer than 65536 vertices.
// entries: [{name, positions:Float32Array, normals:Float32Array, indices:Uint32Array, color:[r,g,b], alpha?}]
export function writeGlb(entries,generator){
 const chunks=[],bufferViews=[],accessors=[],meshes=[],nodes=[],materials=[],materialIndex=new Map();
 let offset=0;
 const push=(typed,target)=>{
  const bytes=Buffer.from(typed.buffer,typed.byteOffset,typed.byteLength),pad=(4-bytes.length%4)%4;
  bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length,target});
  chunks.push(bytes,Buffer.alloc(pad));offset+=bytes.length+pad;
  return bufferViews.length-1;
 };
 for(const e of entries){
  const key=JSON.stringify([e.color,e.alpha??1]);
  if(!materialIndex.has(key)){
   materialIndex.set(key,materials.length);
   materials.push({name:`mat-${materials.length}`,pbrMetallicRoughness:{baseColorFactor:[...e.color,e.alpha??1],metallicFactor:0,roughnessFactor:0.7},doubleSided:true,...(e.alpha&&e.alpha<1?{alphaMode:'BLEND'}:{})});
  }
  const vertexCount=e.positions.length/3,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<e.positions.length;i+=3)for(let c=0;c<3;c++){const v=e.positions[i+c];if(v<min[c])min[c]=v;if(v>max[c])max[c]=v;}
  const normals=new Int8Array(vertexCount*4);
  for(let i=0;i<vertexCount;i++)for(let c=0;c<3;c++)normals[i*4+c]=Math.round(Math.max(-1,Math.min(1,e.normals[i*3+c]))*127);
  const wide=vertexCount>=65536,indices=wide?Uint32Array.from(e.indices):Uint16Array.from(e.indices);
  const pv=push(Float32Array.from(e.positions),34962),nv=push(normals,34962),iv=push(indices,34963);
  bufferViews[nv].byteStride=4;
  accessors.push({bufferView:pv,componentType:5126,count:vertexCount,type:'VEC3',min,max});
  accessors.push({bufferView:nv,componentType:5120,normalized:true,count:vertexCount,type:'VEC3'});
  accessors.push({bufferView:iv,componentType:wide?5125:5123,count:e.indices.length,type:'SCALAR'});
  meshes.push({name:e.name,primitives:[{attributes:{POSITION:accessors.length-3,NORMAL:accessors.length-2},indices:accessors.length-1,material:materialIndex.get(key)}]});
  nodes.push({name:e.name,mesh:meshes.length-1});
 }
 const json={asset:{version:'2.0',generator},scene:0,scenes:[{nodes:nodes.map((_,i)=>i)}],nodes,meshes,materials,accessors,bufferViews,buffers:[{byteLength:offset}]};
 let jsonBytes=Buffer.from(JSON.stringify(json),'utf8');
 jsonBytes=Buffer.concat([jsonBytes,Buffer.alloc((4-jsonBytes.length%4)%4,0x20)]);
 const bin=Buffer.concat(chunks),head=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);
 head.write('glTF',0,'latin1');head.writeUInt32LE(2,4);head.writeUInt32LE(12+8+jsonBytes.length+8+bin.length,8);
 jh.writeUInt32LE(jsonBytes.length,0);jh.write('JSON',4,'latin1');bh.writeUInt32LE(bin.length,0);bh.write('BIN\0',4,'latin1');
 return Buffer.concat([head,jh,jsonBytes,bh,bin]);
}

export const readGlbFile=path=>readMeshes(readFileSync(path));
