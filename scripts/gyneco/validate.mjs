// Checks of the gynecology mode: the self-exam palpation timeline covers the whole area, the leaflet content is
// verbatim and sourced, and the female parts the scene needs exist.
// Usage: node scripts/gyneco/validate.mjs   (Node 22.18+)
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CENTERS,LEAFLET_CREDIT,SECTIONS} from '../../app/gyneco/content.ts';
import {partGeometry} from '../../app/gyneco/model.ts';
import {ChestSurface} from '../../app/gyneco/surface.ts';
import {DURATION,PAD_RADIUS,PATTERN,PRESSURES,REGIONS,RHO,STEP_ORDER,STEPS,STOPS,STRIP_SPACING,TRAIL,buildTimeline,sampleAt} from '../../app/gyneco/palpation.ts';

let checks=0;const check=(ok,message)=>{assert.ok(ok,message);checks++;};
const dist=(a,b)=>Math.hypot(RHO*(a.theta-b.theta),a.y-b.y);
const deg=r=>r*180/Math.PI;

// --- Palpation timeline ---
check(PATTERN==='strips','the default pattern must be vertical strips');
check(DURATION>=35&&DURATION<=45,`the demo must last 35–45 s, got ${DURATION.toFixed(1)} s`);
check(PAD_RADIUS>0&&STRIP_SPACING<=PAD_RADIUS*Math.SQRT2+1e-9,'stops must be close enough that a pad radius covers every cell between them');
assert.throws(()=>buildTimeline({pattern:'circles'}),/pattern/i);checks++;
assert.throws(()=>buildTimeline({pattern:'wedges'}),/pattern/i);checks++;

// The area: sternum to midaxillary line, clavicle to below the inframammary fold, plus the axilla.
const [breast,axilla]=REGIONS;
check(deg(breast.thetaMin)<=6,`the medial edge must reach the sternum, got ${deg(breast.thetaMin).toFixed(1)}°`);
check(deg(breast.thetaMax)>=78,`the lateral edge must reach the midaxillary line, got ${deg(breast.thetaMax).toFixed(1)}°`);
check(breast.yTop>=1.4,'the top edge must reach the clavicle');
check(breast.yBottom<=1.15,'the bottom edge must go below the inframammary fold');
check(axilla&&axilla.thetaMin>=breast.thetaMax-.2&&axilla.yTop>1.3,'the axilla must be a separate region at the lateral, upper edge');

// Every cell of every region is within one pad radius of some stop.
for(const [i,r] of REGIONS.entries()){
 const step=.004;let cells=0,worst=0;
 for(let y=r.yBottom;y<=r.yTop+1e-9;y+=step)for(let a=r.thetaMin*RHO;a<=r.thetaMax*RHO+1e-9;a+=step){
  const cell={theta:a/RHO,y};let best=Infinity;for(const s of STOPS)best=Math.min(best,dist(cell,s));
  worst=Math.max(worst,best);cells++;
  assert.ok(best<=PAD_RADIUS+1e-9,`region ${i}: cell (${deg(cell.theta).toFixed(1)}°, ${y.toFixed(3)} m) is ${best.toFixed(3)} m from the nearest stop, pad radius ${PAD_RADIUS}`);
 }
 checks++;check(cells>100,`region ${i} grid was not sampled`);
}

// Each stop shows suave, media, firme in that order; every circle runs its phase from 0 to 1.
const stopTimes=STOPS.map(s=>({s,from:s.start,to:s.dwellEnd}));
for(const [i,{s,from,to}] of stopTimes.entries()){
 const seen=[],phases=[];let last=null,lastPhase=-1;
 for(let t=from;t<to-1e-9;t+=.005){
  const x=sampleAt(t);
  check(Math.abs(x.theta-s.theta)<1e-9&&Math.abs(x.y-s.y)<1e-9,`stop ${i}: the center must stay on the stop while pressing`);
  if(x.pressure!==last){seen.push(x.pressure);last=x.pressure;phases.push([]);lastPhase=-1;}
  check(x.circlePhase>=lastPhase-1e-12,`stop ${i}: circle phase must not go backwards inside a circle`);lastPhase=x.circlePhase;phases.at(-1).push(x.circlePhase);
 }
 assert.deepEqual(seen,[...PRESSURES],`stop ${i}: pressures must be suave, media, firme in order, got ${seen}`);
 for(const p of phases)check(Math.min(...p)<.05&&Math.max(...p)>.95,`stop ${i}: each circle must complete a turn`);
}
check(sampleAt(STOPS[0].start).step==='circles'&&sampleAt(STOPS[1].start).step==='strips','the first stop teaches the circles; the rest are strips');

// Continuity: the center never jumps more than a strip spacing between 20 ms samples; pads lift while traveling.
{
 let prev=sampleAt(0),worst=0;
 for(let t=.02;t<=DURATION;t+=.02){const x=sampleAt(t);worst=Math.max(worst,dist(prev,x));prev=x;}
 check(worst<=STRIP_SPACING,`the path jumps ${worst.toFixed(3)} m between samples, more than a strip spacing ${STRIP_SPACING.toFixed(3)} m`);
 // Consecutive stops of the same region are neighbours: up/down lanes, no skipped lane.
 for(let i=1;i<STOPS.length;i++)if(STOPS[i].area===STOPS[i-1].area)check(dist(STOPS[i],STOPS[i-1])<=STRIP_SPACING+1e-9,`stops ${i-1} and ${i} are ${dist(STOPS[i],STOPS[i-1]).toFixed(3)} m apart`);
 // Strips alternate direction: lane k goes down, lane k+1 goes up.
 const lanes=[...new Set(STOPS.filter(s=>s.area==='breast').map(s=>s.lane))];
 for(const l of lanes){const ys=STOPS.filter(s=>s.area==='breast'&&s.lane===l).map(s=>s.y);const down=ys[0]>ys.at(-1);check(down===(l%2===0),`lane ${l} must run ${l%2===0?'down':'up'}`);check(new Set(ys.map(y=>y.toFixed(6))).size===ys.length,`lane ${l} must not repeat a stop`);}
 check(lanes.length>=4,'at least four vertical strips are needed to cover the breast');
}

// sampleAt clamps outside the timeline.
assert.deepEqual(sampleAt(-10),sampleAt(0));checks++;
assert.deepEqual(sampleAt(DURATION+50),sampleAt(DURATION));checks++;
check(sampleAt(Number.NaN).step===STEPS[0].id,'NaN must clamp to the start');

// Steps cover the timeline in order, each with a Spanish caption, and sampleAt reports the matching step.
assert.deepEqual(STEPS.map(s=>s.id),[...STEP_ORDER]);checks++;
check(STEPS[0].start===0&&Math.abs(STEPS.at(-1).end-DURATION)<1e-9,'steps must span the whole timeline');
for(const [i,s] of STEPS.entries()){
 check(s.caption.trim().length>20&&s.title.trim().length>3,`step ${s.id} needs a title and a caption`);
 check(/[áéíóúñ¿¡]|\b(los|las|de|la|el|con|tus|tu|en)\b/i.test(s.caption),`step ${s.id}: caption must be Spanish`);
 check(s.end>s.start,`step ${s.id} must have a positive length`);
 if(i)check(Math.abs(s.start-STEPS[i-1].end)<1e-9,`step ${s.id} must start where ${STEPS[i-1].id} ends`);
}
for(let t=0;t<=DURATION;t+=.1){const x=sampleAt(t),s=STEPS.find(s=>t>=s.start&&t<s.end)??STEPS.at(-1);check(x.step===s.id,`t=${t.toFixed(1)}: sampleAt says ${x.step}, steps say ${s.id}`);}
check(STEPS.some(s=>/suave/.test(s.caption)&&/media/.test(s.caption)&&/firme/.test(s.caption)),'a caption must name the three pressures');
check(STEPS.some(s=>/axila/i.test(s.caption)&&s.id==='axilla'),'the axilla step must mention the axilla');
check(/acostad/i.test(STEPS.at(-1).caption)&&/de pie/i.test(STEPS.at(-1).caption),'the last step must mention both positions');

// The covered trail grows in time and visits every stop.
check(TRAIL.length>50&&TRAIL.every((p,i)=>i===0||p.t>=TRAIL[i-1].t),'the trail must be time-ordered');
for(const s of STOPS)check(TRAIL.some(p=>dist(p,s)<1e-9),'the trail must pass through every stop');

// --- Content ---
const leaflet=readFileSync(new URL('../../docs/research/folleto-octubre-rosa.md',import.meta.url),'utf8').replace(/\s+/g,' ');
const ids=SECTIONS.map(s=>s.id);
assert.deepEqual(ids,['autoexamen','signos','controles','mitos','mamografia','anatomia']);checks++;
// Text copied from the leaflet is verbatim; ids, titles, labels and sources are ours.
const textOf=v=>typeof v==='string'?[v]:Array.isArray(v)?v.flatMap(textOf):v&&typeof v==='object'?Object.entries(v).filter(([k])=>!['id','title','label','sources','validated','verdict'].includes(k)).flatMap(([,x])=>textOf(x)):[];
for(const sec of SECTIONS){
 check(sec.validated===false,`${sec.id}: authored content must be flagged validated:false until a teacher reviews it`);
 check(sec.sources.length>=1&&sec.sources.every(x=>x.label.trim()),`${sec.id}: needs at least one source`);
 check(sec.title.trim()&&sec.label.trim(),`${sec.id}: needs a title and a list label`);
 if(sec.id==='anatomia')continue;
 check(sec.sources.some(x=>x.label===LEAFLET_CREDIT),`${sec.id}: must credit the leaflet`);
 for(const text of textOf(sec))check(leaflet.includes(text.replace(/\s+/g,' ').trim()),`${sec.id}: text is not verbatim from the leaflet: "${text}"`);
}
check(LEAFLET_CREDIT==='Folleto Octubre Rosa — IFMSA Tucumán (SCOPH) y Secretaría de Asuntos Estudiantiles UTN Tucumán, 2026','the leaflet credit must name IFMSA Tucumán (SCOPH) and UTN Tucumán');
const all=SECTIONS.flatMap(textOf).join('\n');
for(const quote of ['UN HALLAZGO NO SIGNIFICA NECESARIAMENTE CANCER, PERO TODO CAMBIO NECESITA SER EVALUADO','El autoexamen ayuda a conocer tus mamas, pero no reemplaza el examen clínico ni la mamografía.','Recuerda: El cáncer de mama también afecta a los hombres. ¡La autoexploración es para todos!','LA DETECCION TEMPRANA SALVA VIDAS','Usá las yemas de tus dedos y palpa toda la mama o área pectoral con movimientos circulares, aplicando presión suave, media y firme.','Hazlo en posición acostada y de pie para detectar cualquier cambio o bulto.'])check(all.includes(quote),`missing verbatim quote: ${quote}`);
const signs=SECTIONS.find(s=>s.id==='signos').items,myths=SECTIONS.find(s=>s.id==='mitos').myths;
check(signs.length===8,'the leaflet lists eight warning signs');
check(myths.length===4&&myths.every(m=>m.verdict==='Falso'),'the leaflet lists four myths, all false');
check(SECTIONS.find(s=>s.id==='controles').items.length===4,'the leaflet lists four screening rules');
const centers=SECTIONS.find(s=>s.id==='mamografia').items;
check(centers.length===13&&centers===CENTERS&&new Set(centers).size===13,'all 13 mammography centers must be listed once');
check(centers.some(c=>/Trailer de la Mujer/.test(c))&&centers.some(c=>/Nicolás Avellaneda/.test(c)),'the centers must include the mobile unit and Hospital Nicolás Avellaneda');

// --- Female model parts the scene needs ---
const female=JSON.parse(readFileSync(new URL('../../public/models/female/female-parts.json',import.meta.url),'utf8'));
const byId=new Map(female.parts.map(p=>[p.id,p]));
const NEEDED=['VHF-skin',...['l','r'].flatMap(s=>['breast-fat','mammary-lobes','lactiferous-ducts','areola','nipple','uterine-tube','ovary','hip-bone'].map(n=>`VHF-${n}-${s}`)),'VHF-uterine-fundus','VHF-uterine-body','VHF-uterine-cornua','VHF-lower-uterine-segment','VHF-cervix','VHF-cervicovaginal-junction','VHF-urinary-bladder','VHF-sacrum','VHF-coccyx'];
for(const id of NEEDED)check(byId.has(id)&&byId.get(id).vertexCount>0&&byId.get(id).nameEs,`the female model lacks ${id}`);
// The left breast is +x: the scene mirrors the palpation path for the other side.
check(byId.get('VHF-nipple-l').bounds[0][0]>0&&byId.get('VHF-nipple-r').bounds[1][0]<0,'the left breast must be on +x');
check(female.chunk.url&&female.chunk.gzip,'the female chunk must have a plain and a gzip file');


// --- Skin surface: every stop and trail point of both breasts lands on the skin, with an outward normal ---
{
 const bin=readFileSync(new URL('../../public/models/female/female-chunk.bin',import.meta.url));
 const buffer=bin.buffer.slice(bin.byteOffset,bin.byteOffset+bin.byteLength);
 check(buffer.byteLength===female.chunk.bytes,'the female chunk must have the size the manifest declares');
 const surface=new ChestSurface(partGeometry(buffer,byId.get('VHF-skin')));
 check(surface.triangles>1000,'the chest sub-mesh must hold the skin triangles of the chest region');
 for(const side of [1,-1])for(const [what,list] of [['stop',STOPS],['trail point',TRAIL]])for(const p of list){
  const hit=surface.hit(p.theta,p.y,side),where=`${what} θ=${deg(p.theta).toFixed(1)}° y=${p.y.toFixed(3)} side ${side}`;
  assert.ok(hit,`no skin at ${where}`);
  const dir={x:side*Math.sin(p.theta),y:0,z:Math.cos(p.theta)};
  assert.ok(hit.normal.dot(dir)>.15,`the normal at ${where} must point out of the chest`);
  assert.ok(Math.abs(hit.normal.length()-1)<1e-6&&hit.distance>.03&&hit.distance<.3,`${where}: the hit must have a unit normal at a plausible distance`);
  checks++;
 }
 // The nipple sits inside the covered region and a ray through it lands on the skin right there.
 const nb=byId.get('VHF-nipple-l').bounds,mid=i=>(nb[0][i]+nb[1][i])/2,nx=mid(0),ny=mid(1),nz=mid(2),nt=Math.atan2(nx,nz);
 check(nt>REGIONS[0].thetaMin&&nt<REGIONS[0].thetaMax&&ny>REGIONS[0].yBottom&&ny<REGIONS[0].yTop,'the nipple must fall inside the palpation region');
 const hitNipple=surface.hit(nt,ny,1);
 check(hitNipple&&Math.hypot(hitNipple.point.x-nx,hitNipple.point.y-ny,hitNipple.point.z-nz)<.02,'a ray through the nipple must land on it');
}

console.log(`gyneco: ${checks} checks, ${STOPS.length} stops, ${DURATION.toFixed(1)} s`);
