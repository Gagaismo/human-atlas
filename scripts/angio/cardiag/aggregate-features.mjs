// Agrega los rasgos por caso de CARDIAG (extract-features.py) en estadísticas por celda de ángulos y las escribe en
// scripts/angio/data/cardiag-features.json: lo ÚNICO de CARDIAG que se versiona (sin imágenes, sin geometría ni ids por paciente).
// Celdas de 20° x 20° (rotación primaria x angulación secundaria, convención DICOM: primario + = OAI, secundario + = CRA);
// por segmento SYNTAX clave y celda: n, dirección media (circular, grados, x derecha / y arriba, proximal → distal) y desvío circular.
// Uso: node aggregate-features.mjs <features-all.json> <dir con *_split.txt> [--before <dir de árboles>] [--after <dir de árboles>]
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {evaluate,summarize,loadTree,observedAngle,segmentEnds,predictAngle,angDiff,KEY_SEGS} from './lib-eval.mjs';
const args=process.argv.slice(2),flag=n=>{const i=args.indexOf(n);return i>=0?args[i+1]:null;};
const [featPath,splitDir]=args.filter((a,i)=>!a.startsWith('--')&&!(args[i-1]??'').startsWith('--'));
const feats=JSON.parse(readFileSync(featPath,'utf8'));
const W=20,CELL_MIN=8;
const cellOf=(p,s)=>[Math.round(p/W)*W,Math.round(s/W)*W];
const cells={};
for(const fr of feats)for(const seg of KEY_SEGS){
 const f=fr.segs[seg];if(!f||f.elong<1.8||f.n<300)continue;
 const isRight=['01','02','04'].includes(seg);if((fr.side==='right')!==isRight)continue;
 const [cp,cs]=cellOf(fr.primary,fr.secondary),k=`${seg}|${cp}|${cs}`;
 (cells[k]??=[]).push(observedAngle(f)*Math.PI/180);
}
const circ=a=>{const c=a.reduce((x,t)=>x+Math.cos(t),0)/a.length,s=a.reduce((x,t)=>x+Math.sin(t),0)/a.length,R=Math.hypot(c,s);return {mean:Math.atan2(s,c)*180/Math.PI,sd:Math.sqrt(-2*Math.log(Math.max(R,1e-6)))*180/Math.PI};};
const out={};
for(const [k,a] of Object.entries(cells)){if(a.length<CELL_MIN)continue;const [seg,cp,cs]=k.split('|'),c=circ(a);(out[seg]??=[]).push({primary:+cp,secondary:+cs,n:a.length,dirDeg:+c.mean.toFixed(1),sdDeg:+Math.min(c.sd,180).toFixed(1)});}
for(const v of Object.values(out))v.sort((a,b)=>a.primary-b.primary||a.secondary-b.secondary);
const doc={
 meta:{
  source:'CARDIAG (Lau DB et al., Zenodo 2026, doi:10.5281/zenodo.19958730), 645 coronary angiograms from 5 centres with SYNTAX segment annotations and acquisition metadata',
  license:'CC BY 4.0 (CARDIAG); only derived aggregate statistics are shipped: no images, no per-patient data',
  note:'Dirección 2D (proximal → distal, grados, x derecha / y arriba) de segmentos SYNTAX por celda de 20° x 20° de ángulos del arco en C. Convención DICOM verificada: primario + = OAI, secundario + = CRA (a = primario, b = secundario en app/angio/core/geometry.ts).',
  generator:['scripts/angio/cardiag/fetch-members.py','scripts/angio/cardiag/extract-features.py','scripts/angio/cardiag/aggregate-features.mjs'],
  cases:feats.length,casesRight:feats.filter(f=>f.side==='right').length,casesLeft:feats.filter(f=>f.side==='left').length,centres:new Set(feats.map(f=>f.center)).size,
  cellDeg:W,minCasesPerCell:CELL_MIN,segments:{'01':'CD proximal','02':'CD media','04':'DP','05':'TCI','06':'DA proximal','07':'DA media','11':'Cx proximal'},
  primaryAngleRangeDeg:[Math.min(...feats.map(f=>f.primary)),Math.max(...feats.map(f=>f.primary))].map(v=>+v.toFixed(1)),
  secondaryAngleRangeDeg:[Math.min(...feats.map(f=>f.secondary)),Math.max(...feats.map(f=>f.secondary))].map(v=>+v.toFixed(1)),
 },
 cells:out,
};
// error contra las medias por celda: dirección proyectada de nuestro árbol en el centro de cada celda vs la media observada (ponderado por n)
const cellError=tree=>{const per={};let tot=0,n=0;for(const [seg,list] of Object.entries(out)){const e=segmentEnds(tree,seg);if(!e)continue;let t=0,m=0;for(const c of list){const err=angDiff(predictAngle(e,null,c.primary,c.secondary),c.dirDeg);t+=err*c.n;m+=c.n;}per[seg]=+(t/m).toFixed(1);tot+=t;n+=m;}return {mean:+(tot/n).toFixed(1),perSegment:per};};
const before=flag('--before'),after=flag('--after');
if(before&&after){
 const rep=d=>summarize(evaluate(feats,{right:loadTree(pathToFileURL(d.replace(/\/?$/,'/')),'right')}));
 doc.calibration={
  metric:'error angular medio (grados) entre la dirección proyectada de cada segmento clave en nuestro árbol (dominancia derecha) y la observada, sobre todos los fotogramas con ese segmento visible (elongación >= 1,8, >= 300 px)',
  segmentsKey:KEY_SEGS,
  beforeProcrustesTree:rep(before),afterPopulationOrientationTree:rep(after),
  cellMeanErrorBefore:cellError(loadTree(pathToFileURL(before.replace(/\/?$/,'/')),'right')),cellMeanErrorAfter:cellError(loadTree(pathToFileURL(after.replace(/\/?$/,'/')),'right')),
  globalRotationFit:'ajuste de una rotación global (3 ángulos) con Nelder-Mead sobre entrenamiento+validación de CARDIAG: (−1,2°, 2,5°, 2,8°), mejora 0,3° en prueba (22,2° → 21,9°): por debajo del ruido, no se aplica',
 };
}else{try{const o=JSON.parse(readFileSync(fileURLToPath(new URL('../data/cardiag-features.json',import.meta.url)),'utf8'));if(o.calibration)doc.calibration=o.calibration;}catch{}}
writeFileSync(fileURLToPath(new URL('../data/cardiag-features.json',import.meta.url)),JSON.stringify(doc)+'\n');
console.log('celdas',Object.values(out).reduce((a,v)=>a+v.length,0),'por segmento',Object.entries(out).map(([k,v])=>`${k}:${v.length}`).join(' '));
if(doc.calibration)console.log('error medio antes',doc.calibration.beforeProcrustesTree?.mean,'después',doc.calibration.afterPopulationOrientationTree?.mean);
