// Builds the female variant of the atlas (public/models/female/female.glb.gz + female.json) from the
// Human Reference Atlas (HuBMAP) 3D reference organs of the Visible Human female (VH_F), CC BY 4.0.
//
// Usage: node scripts/female/build.mjs <directory with the HRA .glb files> [output directory] [atlas.json]
//   defaults: output public/models/female, atlas public/models/atlas.json
// Inputs (downloaded from https://cdn.humanatlas.io/digital-objects/ref-organ/<slug>/<version>/assets/<file>.glb;
// the latest version of each organ at the time of writing is in INPUTS below):
//   3d-vh-f-skin, -pelvis, -uterus, -ovary-l/-r, -fallopian-tube-l/-r, -urinary-bladder, -mammary-gland-l/-r
// There is no vagina model in the HRA, so only the cervicovaginal junction of the uterus file is included.
//
// Frames. The HRA VH_F files are in metres with +x = the body's left, +y up and +z anterior (the same axes as
// the atlas): the left ovary sits at +x, the sacrum at -z, the head at +y. The script does not assume this: it
// tries the 24 proper axis permutations/sign flips and keeps the one whose bounding box fits the atlas bony
// pelvis best (the identity wins; it is printed). A proper rotation keeps the left/right chirality, so no
// mirroring is ever applied.
//
// Steps.
//  1. Pelvis fit. Source: the compact bone of the VH_F hip bones + sacrum + coccyx. Target: the atlas
//     "Left hip bone", "Right hip bone" and "Sacrum" bounds. Axis permutation + one uniform scale (least squares
//     over the three extents) + translation (bounding box centres). The residual of the six bbox faces is printed.
//     The uterus, tubes, ovaries, bladder, cervicovaginal junction and the pelvis itself use this transform.
//  2. Skin fit. Its own transform: uniform scale so the skin height equals the atlas "Skin" height, feet on
//     y = 0, bbox centred on the atlas skin in x and z. The mammary glands (same HRA frame as the skin) use it.
//     The script prints how far the pelvis lands from the fitted pelvis when it goes through the skin transform.
//  3. Each part: vertices welded by position, sub-meshes merged where one selectable structure is made of
//     several (e.g. ilium + ischium + pubis = hip bone), simplified with meshoptimizer to a triangle budget,
//     smooth normals recomputed, transformed to the atlas frame and written as one mesh node, no node transforms.
//  4. female.glb.gz (gzip level 9) and female.json (parts, bounds, replaces) are written.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {join} from 'node:path';
import {MeshoptSimplifier} from 'meshoptimizer';
import {readGlbFile,bounds,writeGlb} from './glb.mjs';

const root=new URL('../../',import.meta.url).pathname.replace(/^\/(\w:)/,'$1');
const [inputDir,outputDir=join(root,'public/models/female'),atlasPath=join(root,'public/models/atlas.json')]=process.argv.slice(2);
if(!inputDir){console.error('usage: node scripts/female/build.mjs <directory with the HRA .glb files> [output directory] [atlas.json]');process.exit(2);}

const LICENSE='CC BY 4.0',LICENSE_URL='https://creativecommons.org/licenses/by/4.0/';
const CDN='https://cdn.humanatlas.io/digital-objects/ref-organ';
const INPUTS={ // file -> HRA reference organ and latest version
 skin:['3d-vh-f-skin','skin-female','v1.5'],pelvis:['3d-vh-f-pelvis','pelvis-female','v1.3'],uterus:['3d-vh-f-uterus','uterus-female','v1.2'],
 ovaryL:['3d-vh-f-ovary-l','ovary-female-left','v1.3'],ovaryR:['3d-vh-f-ovary-r','ovary-female-right','v1.3'],
 tubeL:['3d-vh-f-fallopian-tube-l','fallopian-tube-female-left','v1.2'],tubeR:['3d-vh-f-fallopian-tube-r','fallopian-tube-female-right','v1.2'],
 bladder:['3d-vh-f-urinary-bladder','urinary-bladder-female','v1.2'],mammaryL:['3d-vh-f-mammary-gland-l','mammary-gland-female-left','v1.1'],
 mammaryR:['3d-vh-f-mammary-gland-r','mammary-gland-female-right','v1.1'],
};
const meshes=Object.fromEntries(Object.entries(INPUTS).map(([key,[file]])=>[key,readGlbFile(join(inputDir,`${file}.glb`))]));

// ---- parts: selector picks the source sub-meshes, tris is the triangle budget, frame is the transform used
const by=(key,test)=>meshes[key].filter(m=>test(m.name,m.path));
const uterusPart=name=>by('uterus',n=>n===`VH_F_${name}`);
const BONE=[0.89,0.86,0.78],ORGAN=[0.78,0.38,0.4],SKIN=[0.93,0.77,0.67],FAT=[0.97,0.86,0.62],GLAND=[0.9,0.58,0.5],DARK=[0.72,0.45,0.4];
const PARTS=[
 {id:'VHF-hip-bone-l',name:'Left hip bone',nameEs:'hueso coxal izquierdo',system:'skeletal',frame:'pelvis',tris:18000,color:BONE,src:by('pelvis',n=>/compact_bone_L$/.test(n))},
 {id:'VHF-hip-bone-r',name:'Right hip bone',nameEs:'hueso coxal derecho',system:'skeletal',frame:'pelvis',tris:18000,color:BONE,src:by('pelvis',n=>/compact_bone_R$/.test(n))},
 {id:'VHF-sacrum',name:'Sacrum',nameEs:'sacro',system:'skeletal',frame:'pelvis',tris:12000,color:BONE,src:by('pelvis',n=>n==='VH_F_sacrum')},
 {id:'VHF-coccyx',name:'Coccyx',nameEs:'cóccix',system:'skeletal',frame:'pelvis',tris:1400,color:BONE,src:by('pelvis',n=>n==='VH_F_coccyx')},
 {id:'VHF-uterine-fundus',name:'Fundus of uterus',nameEs:'fondo del útero',system:'reproductive',frame:'pelvis',tris:3000,color:ORGAN,src:uterusPart('fundus_of_uterus')},
 {id:'VHF-uterine-body',name:'Body of uterus',nameEs:'cuerpo del útero',system:'reproductive',frame:'pelvis',tris:5300,color:ORGAN,src:uterusPart('body_of_uterus')},
 {id:'VHF-uterine-cornua',name:'Cornua of uterus',nameEs:'cuernos del útero',system:'reproductive',frame:'pelvis',tris:660,color:ORGAN,src:uterusPart('cornua')},
 {id:'VHF-lower-uterine-segment',name:'Lower uterine segment',nameEs:'segmento uterino inferior',system:'reproductive',frame:'pelvis',tris:1400,color:ORGAN,src:uterusPart('lower_uterine_segment')},
 {id:'VHF-cervix',name:'Cervix of uterus',nameEs:'cuello del útero',system:'reproductive',frame:'pelvis',tris:3500,color:[0.7,0.32,0.36],src:uterusPart('cervix')},
 {id:'VHF-cervicovaginal-junction',name:'Cervicovaginal junction',nameEs:'unión cervicovaginal',system:'reproductive',frame:'pelvis',tris:3700,color:[0.82,0.5,0.5],src:uterusPart('cervicovaginal_junction')},
 {id:'VHF-uterine-tube-l',name:'Left uterine tube',nameEs:'trompa uterina izquierda',system:'reproductive',frame:'pelvis',tris:6000,color:[0.85,0.52,0.5],src:meshes.tubeL},
 {id:'VHF-uterine-tube-r',name:'Right uterine tube',nameEs:'trompa uterina derecha',system:'reproductive',frame:'pelvis',tris:6000,color:[0.85,0.52,0.5],src:meshes.tubeR},
 {id:'VHF-ovary-l',name:'Left ovary',nameEs:'ovario izquierdo',system:'reproductive',frame:'pelvis',tris:424,color:[0.88,0.7,0.6],src:meshes.ovaryL},
 {id:'VHF-ovary-r',name:'Right ovary',nameEs:'ovario derecho',system:'reproductive',frame:'pelvis',tris:410,color:[0.88,0.7,0.6],src:meshes.ovaryR},
 {id:'VHF-urinary-bladder',name:'Urinary bladder',nameEs:'vejiga urinaria',system:'urinary',frame:'pelvis',tris:8000,color:[0.86,0.72,0.42],
  src:by('bladder',n=>['VH_F_fundus_of_urinary_bladder_dome','VH_F_urinary_bladder_neck_smooth_muscle'].includes(n)||(n==='VH_F_fundus_of_urinary_bladder_base'))},
 {id:'VHF-skin',name:'Skin',nameEs:'piel',system:'integumentary',frame:'skin',tris:80000,color:SKIN,src:meshes.skin},
];
// The mammary gland is taught with the female reproductive system and must render opaque; only the
// areola and nipple belong to the (translucent) body surface.
const SURFACE=new Set(['areola','nipple']);
for(const [side,key,f,m] of [['l','mammaryL','izquierda','izquierdo'],['r','mammaryR','derecha','derecho']]){
 const S=side.toUpperCase(),Side=side==='l'?'Left':'Right';
 // nameEs ends with the side word in the right gender: g = 'f' or 'm'.
 const part=(slug,name,nameEs,g,tris,color,test)=>PARTS.push({id:`VHF-${slug}-${side}`,name:`${name} (${Side.toLowerCase()})`,nameEs:`${nameEs} ${g==='f'?f:m}`,system:SURFACE.has(slug)?'integumentary':'reproductive',frame:'skin',tris,color,src:by(key,test)});
 part('breast-fat','Adipose tissue of breast','tejido adiposo de la mama','f',9000,FAT,n=>n===`VH_F_fat_${S}`);
 part('mammary-lobes','Mammary lobes','lobulillos de la glándula mamaria','f',5000,GLAND,n=>n===`VH_F_mammary_lobes_${S}`);
 part('lactiferous-ducts','Lactiferous ducts','conductos galactóforos de la mama','f',4000,[0.95,0.78,0.5],n=>n===`VH_F_main_lactiferous_ducts_${S}`||n===`VH_F_main_lactiferous_sinuses_${S}`);
 part('areola','Areola','areola','f',1200,DARK,n=>n===`VH_F_areola_${S}`||n===`VH_F_areolar_tubercles_${S}`);
 part('nipple','Nipple','pezón','m',700,[0.66,0.4,0.36],n=>n===`VH_F_nipple_${S}`);
}
for(const p of PARTS)if(!p.src.length)throw new Error(`no source meshes for ${p.id}`);

// ---- geometry helpers
await MeshoptSimplifier.ready;
function weld(sources){ // -> {positions:Float32Array, indices:Uint32Array}; equal positions share a vertex
 const index=new Map(),positions=[],indices=[];
 for(const m of sources){
  const map=new Uint32Array(m.positions.length/3);
  for(let i=0;i<map.length;i++){
   const x=Math.fround(m.positions[i*3]),y=Math.fround(m.positions[i*3+1]),z=Math.fround(m.positions[i*3+2]),key=`${x},${y},${z}`;
   let v=index.get(key);if(v===undefined){v=positions.length/3;index.set(key,v);positions.push(x,y,z);}
   map[i]=v;
  }
  for(let i=0;i<m.indices.length;i+=3){
   const a=map[m.indices[i]],b=map[m.indices[i+1]],c=map[m.indices[i+2]];
   if(a!==b&&b!==c&&a!==c)indices.push(a,b,c);
  }
 }
 return {positions:Float32Array.from(positions),indices:Uint32Array.from(indices)};
}
function simplify({positions,indices},targetTriangles){
 let out=indices;
 if(indices.length/3>targetTriangles)[out]=MeshoptSimplifier.simplify(indices,positions,3,targetTriangles*3,0.2,[]);
 const remap=new Map(),newPositions=[],newIndices=new Uint32Array(out.length);
 out.forEach((v,i)=>{let n=remap.get(v);if(n===undefined){n=newPositions.length/3;remap.set(v,n);newPositions.push(positions[v*3],positions[v*3+1],positions[v*3+2]);}newIndices[i]=n;});
 return {positions:Float32Array.from(newPositions),indices:newIndices};
}
function smoothNormals({positions,indices}){
 const normals=new Float64Array(positions.length);
 for(let i=0;i<indices.length;i+=3){
  const [a,b,c]=[indices[i]*3,indices[i+1]*3,indices[i+2]*3];
  const ux=positions[b]-positions[a],uy=positions[b+1]-positions[a+1],uz=positions[b+2]-positions[a+2];
  const vx=positions[c]-positions[a],vy=positions[c+1]-positions[a+1],vz=positions[c+2]-positions[a+2];
  const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
  for(const k of [a,b,c]){normals[k]+=nx;normals[k+1]+=ny;normals[k+2]+=nz;}
 }
 for(let i=0;i<normals.length;i+=3){const l=Math.hypot(normals[i],normals[i+1],normals[i+2])||1;normals[i]/=l;normals[i+1]/=l;normals[i+2]/=l;}
 return Float32Array.from(normals);
}

// ---- atlas targets
const atlas=JSON.parse(readFileSync(atlasPath,'utf8'));
const atlasPart=name=>{const p=atlas.parts.find(p=>p.name===name);if(!p)throw new Error(`atlas part "${name}" not found`);return p;};
const unionBounds=list=>[[0,1,2].map(c=>Math.min(...list.map(b=>b[0][c]))),[0,1,2].map(c=>Math.max(...list.map(b=>b[1][c])))];
const atlasPelvis=unionBounds(['Left hip bone','Right hip bone','Sacrum'].map(n=>atlasPart(n).bounds));
const atlasSkin=atlasPart('Skin').bounds;

// ---- 1. pelvis fit
const PERMUTATIONS=[];
for(const perm of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]])for(const signs of [[1,1,1],[1,1,-1],[1,-1,1],[1,-1,-1],[-1,1,1],[-1,1,-1],[-1,-1,1],[-1,-1,-1]]){
 const inversions=perm.reduce((n,v,i)=>n+perm.slice(i+1).filter(w=>w<v).length,0);
 if((inversions%2?-1:1)*signs[0]*signs[1]*signs[2]===1)PERMUTATIONS.push({perm,signs}); // det +1: never mirrors
}
const applyRotation=({perm,signs},p)=>[0,1,2].map(c=>signs[c]*p[perm[c]]); // out[c]=sign[c]*in[perm[c]]
const rotateBounds=(R,b)=>{const corners=[];for(const x of [0,1])for(const y of [0,1])for(const z of [0,1])corners.push(applyRotation(R,[b[x][0],b[y][1],b[z][2]]));return unionBounds(corners.map(c=>[c,c]));};
const extent=b=>b[1].map((v,i)=>v-b[0][i]),centre=b=>b[0].map((v,i)=>(v+b[1][i])/2);
const pelvisSource=unionBounds([...by('pelvis',n=>/compact_bone_[LR]$|^VH_F_sacrum$|^VH_F_coccyx$/.test(n))].map(m=>bounds(m.positions)));
function fitPelvis(R){
 const e=extent(rotateBounds(R,pelvisSource)),t=extent(atlasPelvis);
 const scale=e.reduce((s,v,i)=>s+v*t[i],0)/e.reduce((s,v)=>s+v*v,0);
 const rc=centre(rotateBounds(R,pelvisSource)),translation=centre(atlasPelvis).map((v,i)=>v-scale*rc[i]);
 const fitted=rotateBounds(R,pelvisSource).map(corner=>corner.map((v,i)=>scale*v+translation[i]));
 const faces=[...fitted[0].map((v,i)=>v-atlasPelvis[0][i]),...fitted[1].map((v,i)=>v-atlasPelvis[1][i])];
 return {R,scale,translation,faces,rms:Math.sqrt(faces.reduce((s,v)=>s+v*v,0)/6)};
}
const pelvisFit=PERMUTATIONS.map(fitPelvis).sort((a,b)=>a.rms-b.rms)[0];
const rot=pelvisFit.R;
const mm=v=>(v*1000).toFixed(1);
console.log(`pelvis fit: axes out=[${rot.signs.map((s,c)=>`${s<0?'-':'+'}${'xyz'[rot.perm[c]]}`)}] scale ${pelvisFit.scale.toFixed(4)} translation [${pelvisFit.translation.map(v=>v.toFixed(4))}]`);
console.log(`  bbox residual per face (mm; min x y z, max x y z): ${pelvisFit.faces.map(mm).join(' ')}  rms ${mm(pelvisFit.rms)} mm`);

// ---- 2. skin fit
const skinSource=rotateBounds(rot,bounds(meshes.skin[0].positions));
const skinScale=(atlasSkin[1][1]-atlasSkin[0][1])/(skinSource[1][1]-skinSource[0][1]);
const skinCentre=centre(skinSource),atlasCentre=centre(atlasSkin);
const skinFit={R:rot,scale:skinScale,translation:[atlasCentre[0]-skinScale*skinCentre[0],-skinScale*skinSource[0][1],atlasCentre[2]-skinScale*skinCentre[2]]};
console.log(`skin fit: scale ${skinScale.toFixed(4)} translation [${skinFit.translation.map(v=>v.toFixed(4))}] (source height ${(skinSource[1][1]-skinSource[0][1]).toFixed(3)} m -> atlas ${(atlasSkin[1][1]-atlasSkin[0][1]).toFixed(3)} m)`);
const move=(fit,p)=>applyRotation(fit.R,p).map((v,i)=>fit.scale*v+fit.translation[i]);
const pelvisCentreFitted=move(pelvisFit,centre(pelvisSource)),pelvisCentreInSkin=move(skinFit,centre(pelvisSource));
console.log(`pelvis through the skin transform vs the fitted pelvis: centre offset [${pelvisCentreInSkin.map((v,i)=>mm(v-pelvisCentreFitted[i]))}] mm, distance ${mm(Math.hypot(...pelvisCentreInSkin.map((v,i)=>v-pelvisCentreFitted[i])))} mm`);

// ---- 3. parts
const fits={pelvis:pelvisFit,skin:skinFit};
const entries=[],records=[];
for(const part of PARTS){
 const fit=fits[part.frame],simple=simplify(weld(part.src),part.tris),normals=smoothNormals(simple);
 const positions=new Float32Array(simple.positions.length),n=new Float32Array(normals.length);
 for(let i=0;i<positions.length;i+=3){
  const p=move(fit,[simple.positions[i],simple.positions[i+1],simple.positions[i+2]]),q=applyRotation(fit.R,[normals[i],normals[i+1],normals[i+2]]);
  positions.set(p,i);n.set(q,i);
 }
 entries.push({name:part.id,positions,normals:n,indices:simple.indices,color:part.color});
 const [min,max]=bounds(positions);
 records.push({id:part.id,node:part.id,name:part.name,nameEs:part.nameEs,system:part.system,bounds:[min.map(v=>+v.toFixed(5)),max.map(v=>+v.toFixed(5))]});
 console.log(`  ${part.id}: ${part.src.length} sub-mesh(es) -> ${simple.indices.length/3} triangles, ${simple.positions.length/3} vertices`);
}

// ---- 4. replaces: derived from the atlas parts, never hard-coded ids
const replaces=atlas.parts.filter(p=>p.system==='reproductive'||p.system==='integumentary'
 ||(p.system==='skeletal'&&/^(Left|Right) hip bone$|^Sacrum$|^Coccyx$/.test(p.name))
 ||(p.system==='urinary'&&/^Urinary bladder$|^Urethra$/.test(p.name))).map(p=>p.id);

mkdirSync(outputDir,{recursive:true});
const glb=writeGlb(entries,'human-atlas scripts/female/build.mjs'),gz=gzipSync(glb,{level:9});
writeFileSync(join(outputDir,'female.glb.gz'),gz);
const json={
 source:'Human Reference Atlas (HuBMAP) — Visible Human female',
 license:LICENSE,licenseUrl:LICENSE_URL,sourceUrl:'https://lod.humanatlas.io/ref-organ',
 objects:Object.values(INPUTS).map(([file,slug,version])=>({slug,version,url:`${CDN}/${slug}/${version}/assets/${file}.glb`})),
 parts:records,replaces,
};
writeFileSync(join(outputDir,'female.json'),`${JSON.stringify(json,null,1)}\n`);
console.log(`wrote ${records.length} parts, ${(glb.length/1048576).toFixed(2)} MB raw, ${(gz.length/1048576).toFixed(2)} MB gz, replaces ${replaces.length} atlas parts`);
