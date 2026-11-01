// Calibración con CARDIAG: ajusta una rotación global pequeña del árbol (marco del paciente, grados alrededor de X, Y, Z) que minimiza
// el error angular medio entre la dirección proyectada de los segmentos SYNTAX clave (1, 2, 4, 5, 6, 7, 11) y la observada en
// las angiografías reales con ángulos conocidos. Ajusta con el conjunto de entrenamiento de CARDIAG y reporta también el de prueba.
// Uso: node fit-orientation.mjs <features-all.json> <dir con train_split.txt/test_split.txt> [dir de árboles] [--write]
//  --write guarda scripts/angio/data/orientation.json (la rotación se aplica al construir el árbol, lib-imagecas.mjs).
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {evaluate,summarize,loadTree,loadFeatures,KEY_SEGS} from './lib-eval.mjs';
import {eulerMatrix} from '../lib-imagecas.mjs';
const [featPath,splitDir,treeArg]=process.argv.slice(2).filter(a=>!a.startsWith('--'));
const write=process.argv.includes('--write');
const treeDir=treeArg?pathToFileURL(treeArg.replace(/\/?$/,'/')):new URL('../../../public/models/angio/',import.meta.url);
const feats=loadFeatures(featPath);
const ids=n=>new Set(readFileSync(`${splitDir}/${n}_split.txt`,'utf8').split(/\s+/).filter(Boolean).map(x=>x.replace(/\D/g,'').padStart(3,'0')));
const train=ids('train'),test=ids('test'),val=ids('val');
const pick=s=>feats.filter(f=>s.has(f.case));
const trees={right:loadTree(treeDir,'right')};
const CAP=60;
const loss=(fs,rot)=>{
 const rows=evaluate(fs,trees,{R:eulerMatrix(rot)});
 const by={};for(const r of rows)(by[r.seg]??=[]).push(Math.min(CAP,r.err));
 const m=Object.values(by).map(v=>v.reduce((a,b)=>a+b,0)/v.length);return m.reduce((a,b)=>a+b,0)/m.length;
};
const trainF=pick(new Set([...train,...val])),testF=pick(test);
console.log('casos entrenamiento',trainF.length,'prueba',testF.length);
// Nelder-Mead sobre 3 ángulos, con un pequeño coste por rotación grande (L2, 0.002 por grado²) para no inventar giros
const f=r=>loss(trainF,r)+0.002*(r[0]*r[0]+r[1]*r[1]+r[2]*r[2])/3;
let S=[[0,0,0],[8,0,0],[0,8,0],[0,0,8]].map(p=>({p,v:f(p)}));
for(let it=0;it<120;it++){
 S.sort((a,b)=>a.v-b.v);const c=[0,1,2].map(k=>(S[0].p[k]+S[1].p[k]+S[2].p[k])/3),w=S[3];
 const along=t=>c.map((x,k)=>x+t*(w.p[k]-x));
 const r=along(-1),fr=f(r);
 if(fr<S[0].v){const e=along(-2),fe=f(e);S[3]=fe<fr?{p:e,v:fe}:{p:r,v:fr};}
 else if(fr<S[2].v)S[3]={p:r,v:fr};
 else{const k=along(fr<w.v?-0.5:0.5),fk=f(k);if(fk<Math.min(fr,w.v))S[3]={p:k,v:fk};else for(let i=1;i<4;i++){const p=S[i].p.map((x,k)=>S[0].p[k]+0.5*(x-S[0].p[k]));S[i]={p,v:f(p)};}}
 if(Math.abs(S[3].v-S[0].v)<1e-4)break;
}
S.sort((a,b)=>a.v-b.v);
const rot=S[0].p.map(x=>+x.toFixed(1));
const rep=(fs,R)=>summarize(evaluate(fs,trees,{R:R?eulerMatrix(R):null}));
const res={rotationDeg:rot,
 before:{train:rep(trainF,null),test:rep(testF,null)},after:{train:rep(trainF,rot),test:rep(testF,rot)}};
console.log('rotación ajustada (grados X,Y,Z):',rot.join(', '));
console.log('antes  (prueba):',JSON.stringify(res.before.test));
console.log('después(prueba):',JSON.stringify(res.after.test));
console.log('antes  (entren.):',res.before.train.mean,'después:',res.after.train.mean);
if(write){writeFileSync(fileURLToPath(new URL('../data/orientation.json',import.meta.url)),JSON.stringify({rotationDeg:rot,note:'Rotación global (grados alrededor de X, Y, Z del marco del paciente, orden Rz·Ry·Rx, alrededor del punto medio de los ostios) aplicada al árbol medio de ImageCAS-X; ajustada con CARDIAG (scripts/angio/cardiag/fit-orientation.mjs).'},null,1)+'\n');console.log('escrito orientation.json');}

