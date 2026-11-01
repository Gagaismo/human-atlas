// Mejores vistas (claridad = largo y despejado) de DA media, Cx proximal y CD media en las tres dominancias, con el núcleo de app/angio/core.
// Uso: node best-views.mjs [directorio de árboles]
import * as mod from 'node:module';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
mod.registerHooks(await import('../../gyneco/ts-resolve.mjs'));
const P=await import('../../../app/angio/core/pad.ts'),M=await import('../../../app/angio/core/metrics.ts'),G=await import('../../../app/angio/core/geometry.ts');
const dir=process.argv[2]?pathToFileURL(process.argv[2].replace(/\/?$/,'/')):new URL('../../../public/models/angio/',import.meta.url);
for(const dom of ['right','left','co']){
 const tree=JSON.parse(readFileSync(new URL(`coronary-${dom}.json`,dir),'utf8'));
 const row=[];
 for(const [seg,system] of [['lad-mid','left'],['lcx-prox','left'],['rca-mid','right']]){
  const vis={system,ramus:false,grafts:new Set()},b=P.bestView(tree,seg,vis);
  // y la mejor dentro de las ventanas de uso clínico habitual (|rotación| <= 60), donde el mapa de claridad no cae en proyecciones casi laterales
  const prep=M.prepareTree(tree,vis),tg=M.prepareTarget(prep,seg),pad=P.computePad(prep,tg);let bc=-1,bi=0,bj=0;
  for(let j=0;j<pad.nb;j++)for(let i=0;i<pad.na;i++){const a=P.padAngleA(pad,i);if(Math.abs(a)>60)continue;const c=pad.combined[j*pad.na+i];if(c>bc+1e-4){bc=c;bi=i;bj=j;}}
  const k=bj*pad.na+bi,a2=P.padAngleA(pad,bi),b2=P.padAngleB(pad,bj);
  const f=(x,y,fs,ov)=>`${G.fmtAngles(x,y)} (${(fs*100).toFixed(0)} %/${(ov*100).toFixed(0)} %)`;
  row.push(`${seg}: ${b?f(b.a,b.b,b.foreshortening,b.overlap):'sin vista'}; |rot|<=60: ${f(a2,b2,pad.foreshortening[k],pad.overlap[k])}`);
 }
 console.log(dom.padEnd(6),row.join(' | '));
}
