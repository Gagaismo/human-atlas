// Comparación visual: nuestra proyección (derecha) junto a la captura de referencia (izquierda, work/angioview-ref, solo
// para mirar, nunca se ship). Uso: node qa-compare.mjs <etiqueta> [directorio de árboles]
// Escribe work/qa/t9-compare-<etiqueta>-<vista>.png y una hoja con todas.
import * as mod from 'node:module';
import {readFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import sharp from 'sharp';
mod.registerHooks(await import('../../gyneco/ts-resolve.mjs'));
const G=await import('../../../app/angio/core/geometry.ts');
const tag=process.argv[2]??'t9';
const treeDir=process.argv[3]?pathToFileURL(process.argv[3].replace(/\/?$/,'/')):new URL('../../../public/models/angio/',import.meta.url);
const root=new URL('../../../',import.meta.url),f=p=>fileURLToPath(new URL(p,root));
mkdirSync(f('work/qa/'),{recursive:true});
const SIZE=560;
// [nombre, a, b, sistema, dominancia, referencia, recorte opcional {left,top,width,height}]
const CASES=[
 ['lao40-left',40,-2,'left','left','angio-lao40-cau2-left-domleft.png'],
 ['lao40-right',40,-2,'right','right','angio-lao40-cau2-right.png'],
 ['lao40-both',40,-2,'both','right','angio-lao40-cau2-both.png'],
 ['rao15-left',-15,-27,'left','right','angio-rao15-cau27-left.png'],
 ['rao15-right',-15,-27,'right','right','angio-rao15-cau27-right.png'],
 ['rao15-both',-15,-27,'both','right','angio-rao15-cau27-both.png'],
 ['rao30-left',-30,-30,'left','right','main-rao30-cau30.png',{left:636,top:160,width:562,height:562}],
];
const only=process.argv[4]?new Set(process.argv[4].split(',')):null;
const load=d=>JSON.parse(readFileSync(new URL(`coronary-${d}.json`,treeDir),'utf8'));
const trees={};
function svgFor(tree,a,b,sys,label){
 const ax=G.imageAxes(a,b),vs=tree.vessels.filter(v=>v.variant!=='ramus'&&(sys==='both'||v.system===sys));
 // campo centrado en la caja del árbol inyectado (como la app)
 const lo=[1e9,1e9],hi=[-1e9,-1e9];for(const v of vs)for(const p of v.points){const q=G.projectWith(ax,p);lo[0]=Math.min(lo[0],q.x);hi[0]=Math.max(hi[0],q.x);lo[1]=Math.min(lo[1],q.y);hi[1]=Math.max(hi[1],q.y);}
 const cx=(lo[0]+hi[0])/2,cy=(lo[1]+hi[1])/2,k=SIZE/G.FIELD_SIZE;
 const P=p=>{const q=G.projectWith(ax,p);return [SIZE/2+(q.x-cx)*k,SIZE/2-(q.y-cy)*k,q.m];};
 let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><rect width="100%" height="100%" fill="#bdbdbd"/>`;
 for(const v of vs)for(let i=1;i<v.points.length;i++){
  const A=P(v.points[i-1]),B=P(v.points[i]),r=v.radii[i]+v.radii[i-1];
  s+=`<line x1="${A[0].toFixed(1)}" y1="${A[1].toFixed(1)}" x2="${B[0].toFixed(1)}" y2="${B[1].toFixed(1)}" stroke="${process.env.QA_COLOR?({da:'#c00',cx:'#05c',cd:'#080',tci:'#a0a',ri:'#c80'})[v.family]??'#222':'#2a2a2a'}" stroke-opacity="0.8" stroke-width="${Math.max(1.2,r*k*A[2]*0.62).toFixed(2)}" stroke-linecap="round"/>`;
 }
 return s+`<text x="10" y="22" font-family="monospace" font-size="16" fill="#222">${label}</text></svg>`;
}
const files=[];
for(const [name,a,b,sys,dom,ref,crop] of CASES){
 if(only&&!only.has(name))continue;
 trees[dom]??=load(dom);
 const ours=await sharp(Buffer.from(svgFor(trees[dom],a,b,sys,`${dom} · ${G.fmtAngles(a,b)} · ${sys}`))).png().toBuffer();
 let r=sharp(f(`work/angioview-ref/${ref}`));if(crop)r=r.extract(crop);
 const left=await r.resize(SIZE,SIZE,{fit:'contain',background:'#222'}).png().toBuffer();
 const out=f(`work/qa/t9-compare-${tag}-${name}.png`);
 await sharp({create:{width:SIZE*2+10,height:SIZE,channels:3,background:'#000'}}).composite([{input:left,left:0,top:0},{input:ours,left:SIZE+10,top:0}]).png().toFile(out);
 files.push(out);
}
console.log(files.join('\n'));
