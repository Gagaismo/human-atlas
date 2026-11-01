// Comprobación visual: proyecta cada dominancia con la geometría del C-arm de app/angio/core/geometry.ts y escribe PNG
// (líneas oscuras sobre gris claro) en work/qa/t5-<etiqueta>-<dominancia>-<vista>-<sistema>.png.
// Uso: node qa-projections.mjs <etiqueta> [dominancias=right,left,co]
import * as mod from 'node:module';
import {readFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import sharp from 'sharp';
mod.registerHooks(await import('../../gyneco/ts-resolve.mjs'));
const G=await import('../../../app/angio/core/geometry.ts');

const tag=process.argv[2]??'after',doms=(process.argv[3]??'right,left,co').split(',');
const treeDir=process.argv[4]?pathToFileURL(process.argv[4].replace(/\/?$/,'/')):new URL('../../../public/models/angio/',import.meta.url);
const VIEWS={
 'oad15cau27':[-15,-27],'oad30cau30':[-30,-30],'oai45cau35':[45,-35],'oai50':[50,0],'apcra30':[0,30],
};
const COMBOS=[['oad15cau27','left'],['oad15cau27','right'],['oad15cau27','both'],['oad30cau30','left'],['oai45cau35','left'],['oai50','right'],['apcra30','left'],['apcra30','right']];
const SIZE=520,MM=250;
const qa=n=>fileURLToPath(new URL(`../../../work/qa/${n}`,import.meta.url));
mkdirSync(new URL('../../../work/qa/',import.meta.url),{recursive:true});

const load=d=>JSON.parse(readFileSync(new URL(`coronary-${d}.json`,treeDir),'utf8'));
const heart=JSON.parse(readFileSync(new URL('../../../public/models/angio/heart.json',import.meta.url),'utf8'));
const bin=readFileSync(new URL('../../../public/models/angio/heart.bin',import.meta.url));
const buf=bin.buffer.slice(bin.byteOffset,bin.byteOffset+bin.byteLength);
const cloud=[];
for(const p of heart.parts.filter(p=>/^Pared ventricular|^Aur[ií]cula .*pared|^Aorta asc|^Tronco pulm/.test(p.name))){const pos=new Float32Array(buf,p.positions,p.vertexCount*3);for(let i=0;i<pos.length;i+=7)cloud.push([pos[i],pos[i+1],pos[i+2]]);}

function svgFor(tree,a,b,sys,label){
 const ax=G.imageAxes(a,b),k=SIZE/MM,P=p=>{const q=G.projectWith(ax,p);return [SIZE/2+q.x*k,SIZE/2-q.y*k,q.m];};
 let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><rect width="100%" height="100%" fill="#c9c9c9"/>`;
 for(const p of cloud){const [x,y]=P(p);s+=`<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="2" height="2" fill="#bdbdbd"/>`;}
 for(const v of tree.vessels){
  if(v.variant==='ramus')continue;
  if(sys!=='both'&&v.system!==sys)continue;
  for(let i=1;i<v.points.length;i++){
   const A=P(v.points[i-1]),B=P(v.points[i]),r=(v.radii[i]+v.radii[i-1]);
   s+=`<line x1="${A[0].toFixed(1)}" y1="${A[1].toFixed(1)}" x2="${B[0].toFixed(1)}" y2="${B[1].toFixed(1)}" stroke="#1d1d1d" stroke-opacity="0.78" stroke-width="${Math.max(1.2,r*k*A[2]*0.62).toFixed(2)}" stroke-linecap="round"/>`;
  }
 }
 if(process.env.QA_LABELS)for(const v of tree.vessels){if(v.variant==='ramus'||(sys!=='both'&&v.system!==sys))continue;const q=P(v.points[Math.floor(v.points.length*0.6)]);s+=`<text x="${(q[0]+4).toFixed(0)}" y="${(q[1]-3).toFixed(0)}" font-family="monospace" font-size="14" fill="#c00" font-weight="bold">${v.short}</text>`;}
 s+=`<text x="10" y="22" font-family="monospace" font-size="16" fill="#222">${label}</text></svg>`;
 return s;
}
for(const d of doms){
 const tree=load(d);
 for(const [vn,sys] of COMBOS){
  const [a,b]=VIEWS[vn];
  const file=qa(`t5-${tag}-${d}-${vn}-${sys}.png`);
  await sharp(Buffer.from(svgFor(tree,a,b,sys,`${d} · ${G.fmtAngles(a,b)} · ${sys}`))).png().toFile(file);
 }
 // hoja de contacto
 const cells=await Promise.all(COMBOS.map(([vn,sys])=>sharp(qa(`t5-${tag}-${d}-${vn}-${sys}.png`)).resize(300,300).toBuffer()));
 await sharp({create:{width:300*4,height:300*2,channels:3,background:'#c9c9c9'}}).composite(cells.map((input,i)=>({input,left:(i%4)*300,top:Math.floor(i/4)*300}))).png().toFile(qa(`t5-${tag}-${d}-sheet.png`));
}
console.log('listo',tag,doms.join(','));
