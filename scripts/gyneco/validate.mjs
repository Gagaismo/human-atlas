// Checks of the gynecology mode: the self-exam palpation timeline covers the whole area, the leaflet content is
// verbatim and sourced, the female parts the scene needs exist, and the rigged body (public/models/gyneco) performs the
// exam: the hand of the examined side rests behind the nape while the other hand's finger pads reach every stop.
// Usage: node scripts/gyneco/validate.mjs   (Node 22.18+, after npm ci)
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import * as mod from 'node:module';
import {gunzipSync} from 'node:zlib';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as C from '../../app/gyneco/content.ts';
import {partGeometry} from '../../app/gyneco/model.ts';
import {ChestSurface} from '../../app/gyneco/surface.ts';
import {DURATION,NIPPLE,PAD_RADIUS,PATTERN,PRESSURES,REGIONS,RHO,STEP_ORDER,STEPS,STOPS,STRIP_SPACING,TRAIL,buildTimeline,sampleAt} from '../../app/gyneco/palpation.ts';
const {CENTERS,LEAFLET_CREDIT,SECTIONS,SOURCES,CONFLICTS,CENTER_STATUS,UNT_NOTE}=C;
// body.ts imports its siblings without extensions (bundler style): resolve them to .ts for Node.
mod.registerHooks(await import('./ts-resolve.mjs'));
const {solveTwoBone,frameOf}=await import('../../app/gyneco/ik.ts');
const {BODY_BONES,PAD_HEIGHT,applyExamPose,bakeChest,bindBody,padTarget,resetPose}=await import('../../app/gyneco/body.ts');

let checks=0;const check=(ok,message)=>{assert.ok(ok,message);checks++;};
const dist=(a,b)=>Math.hypot(RHO*(a.theta-b.theta),a.y-b.y);
const deg=r=>r*180/Math.PI;

// --- Palpation timeline ---
check(PATTERN==='strips','the default pattern must be strips');
check(DURATION>=40&&DURATION<=55,`the demo must last 40–55 s, got ${DURATION.toFixed(1)} s`);
check(PAD_RADIUS>0&&STRIP_SPACING<=PAD_RADIUS*Math.SQRT2+1e-9,'stops must be close enough that a pad radius covers every cell between them');
assert.throws(()=>buildTimeline({pattern:'circles'}),/pattern/i);checks++;
assert.throws(()=>buildTimeline({pattern:'wedges'}),/pattern/i);checks++;

// The area (A5, P1): clavicle / supraclavicular fossa to below the inframammary fold, toward the axilla (tail of the breast).
const [breast,axilla]=REGIONS;
check(deg(breast.thetaMin)<=6,`the medial edge must start at the midline, got ${deg(breast.thetaMin).toFixed(1)}°`);
check(deg(breast.thetaMax)>=78,`the lateral edge must reach the side of the chest, got ${deg(breast.thetaMax).toFixed(1)}°`);
// The rigged body's clavicle lies at y ≈ 1.38–1.40 m (the HRA skin had it near 1.43 m; above 1.40 m the rays reach the neck).
check(breast.yTop>=1.39&&breast.yTop<=1.41,`the top edge must reach the clavicle of the body (y ≈ 1.40 m), got ${breast.yTop}`);
check(breast.yBottom<=1.15,'the bottom edge must go below the inframammary fold');
check(axilla&&axilla.thetaMin>=breast.thetaMax-.2&&deg(axilla.thetaMax)>=84&&axilla.yBottom<=1.32&&axilla.yTop>=1.36,'the axilla must be a separate region at the lateral, upper edge, inside the armpit (θ ≥ 84°, y 1.32–1.36 m)');

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

// Researched technique (L4): mirror inspection first, nipple check after the palpation, each in the right order.
assert.deepEqual(STEP_ORDER,['inspection','position','pads','circles','strips','axilla','nipple','repeat']);checks++;
const cap=id=>STEPS.find(s=>s.id===id).caption;
check(STEPS[0].id==='inspection'&&STEP_ORDER.indexOf('nipple')>STEP_ORDER.indexOf('axilla')&&STEP_ORDER.indexOf('nipple')<STEP_ORDER.indexOf('repeat'),'inspection comes first and the nipple step after the palpation');
check(/espejo/i.test(cap('inspection'))&&/brazos ca[ií]dos/i.test(cap('inspection'))&&/cadera/i.test(cap('inspection'))&&/brazos arriba/i.test(cap('inspection')),'inspection: mirror, arms down → hands on hips → arms up');
check(cap('inspection').search(/brazos ca[ií]dos/i)<cap('inspection').search(/cadera/i)&&cap('inspection').search(/cadera/i)<cap('inspection').search(/brazos arriba/i),'inspection: arms down, then hips, then arms up, in that order');
check(/tres dedos del medio de la mano opuesta/i.test(cap('pads')),'pads: the three middle fingers of the opposite hand');
check(/franjas/i.test(cap('strips'))&&/cuadrantes/.test(cap('strips'))&&/radial/.test(cap('strips'))&&/zigzag/.test(cap('strips'))&&/circular/.test(cap('strips'))&&/A5/.test(cap('strips')),'strips: strips that cover the whole breast; A5 also accepts quadrants, radial, zigzag, circular');
check(/cl[aá]v[ií]cula/i.test(cap('strips'))&&/pliegue/i.test(cap('strips'))&&/axila/i.test(cap('strips')),'strips: clavicle to below the inframammary fold, toward the axilla');
check(/cola de la mama/i.test(cap('axilla')),'axilla: names the tail of the breast');
check(/almohada/i.test(cap('position'))&&/detr[aá]s de la cabeza/i.test(cap('position')),'position: lying with a pillow under the shoulder and the arm behind the head');
check(/[ií]ndice y (el )?pulgar/i.test(cap('nipple'))&&/secreci[oó]n/i.test(cap('nipple'))&&/consult/i.test(cap('nipple')),'nipple: gentle pressure between index and thumb; discharge → consult');
{
 for(let t=0;t<STEPS[1].start;t+=.25)check(sampleAt(t).step==='inspection'&&sampleAt(t).pressure===null,'inspection: no finger pressure');
 const n=STEPS.find(s=>s.id==='nipple'),x=sampleAt(n.end-.01);
 check(x.step==='nipple'&&x.pressure==='suave','the nipple step ends pressing gently');
 check(Math.hypot(RHO*(x.theta-NIPPLE.theta),x.y-NIPPLE.y)<1e-9,'the nipple step ends on the nipple');
 check(n.end-n.start>=3&&n.end-n.start<=7,'the nipple step is a short hold');
}
for(const s of STEPS)check(!/franjas verticales|esternón|l[ií]nea axilar media/i.test(`${s.title} ${s.caption}`),`step ${s.id}: unsourced wording`);

// The covered trail grows in time and visits every stop.
check(TRAIL.length>50&&TRAIL.every((p,i)=>i===0||p.t>=TRAIL[i-1].t),'the trail must be time-ordered');
for(const s of STOPS)check(TRAIL.some(p=>dist(p,s)<1e-9),'the trail must pass through every stop');

// --- Content ---
const leaflet=readFileSync(new URL('../../docs/research/folleto-octubre-rosa.md',import.meta.url),'utf8').replace(/\s+/g,' ');
const report=readFileSync(new URL('../../docs/research/ginecologia.md',import.meta.url),'utf8');
const ids=SECTIONS.map(s=>s.id);
assert.deepEqual(ids,['autoexamen','signos','controles','mitos','mamografia','anatomia']);checks++;
// Text copied from the leaflet is verbatim; ids, titles, labels and sources are ours.
const textOf=v=>typeof v==='string'?[v]:Array.isArray(v)?v.flatMap(textOf):v&&typeof v==='object'?Object.entries(v).filter(([k])=>!['id','title','label','sources','validated','verdict','extras','conflicts','statuses','noResearch'].includes(k)).flatMap(([,x])=>textOf(x)):[];
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

// --- Researched sources, conflicts, center statuses (docs/research/ginecologia.md) ---
const srcList=Object.entries(SOURCES);
check(srcList.length>=30,'the researched sources must be registered');
for(const [id,x] of srcList){
 check(x.id===id,`source ${id}: the key and the id must match`);
 check(x.institution.trim()&&x.title.trim()&&x.label.includes(x.title),`source ${id}: needs an institution and a title`);
 if(x.kind==='leaflet'){check(x.label===LEAFLET_CREDIT,'the leaflet source carries the credit');continue;}
 if(x.kind==='atlas'){check(/^https?:\/\//.test(x.url),'the atlas source needs a URL');continue;}
 check(/^https?:\/\/\S+$/.test(x.url),`source ${id}: needs an http(s) URL`);
 check(report.includes(`| ${id} |`),`source ${id}: its id is not in the research report`);
 check(report.includes(x.url),`source ${id}: its URL differs from the research report`);
 check(x.retrieved==='2026-10-30','source '+id+': needs the retrieval date 2026-10-30');
}
assert.deepEqual(srcList.filter(([,x])=>x.backup).map(([id])=>id).sort(),['I1','P1','P2']);checks++;
const citedIn=sec=>{const out=new Set(),walk=v=>{if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object'){for(const [k,x] of Object.entries(v)){if(k==='sources'&&Array.isArray(x)&&x.every(i=>typeof i==='string'))x.forEach(i=>out.add(i));else if(k!=='sources')walk(x);}}};walk({extras:sec.extras,conflicts:(sec.conflicts??[]).map(id=>CONFLICTS.find(c=>c.id===id)),statuses:sec.statuses,myths:sec.myths});return out;};
for(const sec of SECTIONS){
 const own=sec.sources.map(x=>x.id);
 check(own.every(id=>SOURCES[id])&&new Set(own).size===own.length,`${sec.id}: every source id must exist once`);
 const researched=sec.sources.filter(x=>x.kind==='researched');
 check(researched.length>=1||(typeof sec.noResearch==='string'&&/informe/i.test(sec.noResearch)),`${sec.id}: must cite a researched source or say the report found none`);
 for(const id of citedIn(sec))check(own.includes(id),`${sec.id}: cites ${id} in the text but not in its source list`);
}
check(SECTIONS.filter(s=>s.id!=='anatomia').every(s=>s.sources.some(x=>x.kind==='researched')),'every non-anatomy section cites at least one researched source');
check(SECTIONS.find(s=>s.id==='anatomia').noResearch,'the anatomy section must say the report found no source for it');
// No UNT Facultad de Medicina material on the self-exam was found: say so.
check(/Facultad de Medicina/.test(UNT_NOTE)&&/U1/.test(UNT_NOTE)&&/U2/.test(UNT_NOTE)&&/INC/.test(UNT_NOTE)&&/Tucumán/.test(UNT_NOTE)&&/Mastología/.test(UNT_NOTE)&&/autoexamen/.test(UNT_NOTE),'UNT_NOTE must say no UNT Facultad de Medicina self-exam material was found and name the base');
check(['U1','U2'].every(id=>SECTIONS[0].sources.some(x=>x.id===id)),'the self-exam section cites the U1/U2 syllabus');
// Unsourced wording must not reach any UI string.
const everyString=v=>typeof v==='string'?[v]:Array.isArray(v)?v.flatMap(everyString):v&&typeof v==='object'?Object.values(v).flatMap(everyString):[];
for(const text of [...everyString(SECTIONS),...everyString(CONFLICTS),...everyString(CENTER_STATUS),UNT_NOTE])check(!/franjas verticales|esternón|l[ií]nea axilar media|círculos concéntricos/i.test(text),`unsourced wording in the UI: "${text}"`);
// Leaflet source ids shown by the myths: each myth cites the report.
check(myths.every(m=>Array.isArray(m.sources)&&m.sources.length>=1)&&myths.some(m=>m.sources.includes('A6')),'every myth cites a source and A6 (Ministerio de Salud, Mitos y verdades) is used');
// Conflicts, each with both sides attributed.
assert.deepEqual(CONFLICTS.map(c=>c.id),['timing','mammography','selfexam','clinical']);checks++;
for(const c of CONFLICTS){
 check(c.topic.trim()&&c.sides.length>=2,`${c.id}: needs a topic and at least two sides`);
 for(const s of c.sides)check(s.who.trim()&&s.says.trim()&&s.sources.length>=1&&s.sources.every(id=>SOURCES[id]),`${c.id}: every side names who says it, what, and its sources`);
 check(SECTIONS.some(s=>s.conflicts?.includes(c.id)),`${c.id}: must be shown in a section`);
}
const conflict=id=>CONFLICTS.find(c=>c.id===id),sideIds=id=>new Set(conflict(id).sides.flatMap(s=>s.sources)),sideText=id=>conflict(id).sides.map(s=>`${s.who} ${s.says}`).join(' ');
check(['F','T8','I1','P1','S1'].every(i=>sideIds('timing').has(i))&&/2 y 5 días después de terminar/.test(sideText('timing'))&&/3 y 5 días/.test(sideText('timing'))&&/7 y 10 días/.test(sideText('timing'))&&/después de la menstruación/.test(conflict('timing').agreement),'timing: leaflet 2–5 after the end vs 3–5 from the start (T8, I1, P1) vs 7–10 (S1), and what all agree on');
check(['A1','T1','S1'].every(i=>sideIds('mammography').has(i))&&/50/.test(sideText('mammography'))&&/69/.test(sideText('mammography'))&&/40/.test(sideText('mammography'))&&/70/.test(sideText('mammography'))&&/sin pedido/.test(sideText('mammography')),'mammography: INC 50–69 vs Tucumán 40–70 without referral vs societies from 40');
check(/INC/.test(sideText('selfexam'))&&/Mastología/.test(sideText('selfexam'))&&/PAMI/.test(sideText('selfexam'))&&/Folleto/.test(sideText('selfexam'))&&/no reemplaza/.test(conflict('selfexam').agreement),'self-exam: promoted (leaflet) vs self-awareness (SAM, PAMI) vs INC does not name it; none replaces the clinical exam or the mammography');
check(/20 años/.test(sideText('clinical'))&&/30 años/.test(sideText('clinical'))&&sideIds('clinical').has('S1'),'clinical exam: leaflet from 20 vs 2006 consensus from 30');
// Cervical screening and HPV vaccine, with the report's wording.
const controls=SECTIONS.find(s=>s.id==='controles'),controlsText=everyString(controls.extras).join('\n');
for(const quote of ['A partir de los 25 años se recomienda realizar el PAP.','Los dos primeros controles se hacen con un año de diferencia.','el PAP puede repetirse cada 3 años','Cuando el resultado es negativo, se recomienda repetir el estudio cada cinco años.','Única dosis a los 11 años.'])check(controlsText.includes(quote)&&report.includes(quote),`controls: missing the report's wording "${quote}"`);
check(/30 años/.test(controlsText)&&/VPH/.test(controlsText),'controls: the HPV test from 30');
check(['A2','A4'].every(id=>citedIn(controls).has(id)),'controls: cervical screening cites A2 and the vaccine A4');
// Every center has a status; the 13 names stay verbatim from the leaflet.
check(CENTER_STATUS.length===13,'every one of the 13 centers needs a status');
for(const [i,s] of CENTER_STATUS.entries()){
 check(['confirmado','parcial','no confirmado'].includes(s.status)&&s.detail.trim(),`center ${i}: needs a status and a detail`);
 check(s.status==='no confirmado'||s.sources.length>=1&&s.sources.every(id=>SOURCES[id]),`center ${i}: a confirmed or partial center needs a source`);
 check(leaflet.includes(CENTERS[i]),`center ${i}: the name must stay verbatim from the leaflet`);
}
const statusOf=re=>CENTER_STATUS[CENTERS.findIndex(c=>re.test(c))].status;
check(statusOf(/CAM Parque Independencia/)==='no confirmado'&&statusOf(/Ramon Carrillo/)==='parcial'&&CENTER_STATUS.filter(s=>s.status==='confirmado').length===11,'11 confirmed, Ramon Carrillo partial, CAM Parque Independencia not confirmed');
const mammo=everyString(SECTIONS.find(s=>s.id==='mamografia').extras).join('\n');
check(/18 nodos/.test(mammo)&&/móvil/.test(mammo),'mammography: mentions the 18 provincial nodes and the mobile unit');

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
 check(Math.abs(NIPPLE.theta-nt)<.02&&Math.abs(NIPPLE.y-ny)<.006,`NIPPLE (${deg(NIPPLE.theta).toFixed(1)}°, ${NIPPLE.y}) must match the model nipple (${deg(nt).toFixed(1)}°, ${ny.toFixed(3)})`);
 const hitNipple=surface.hit(nt,ny,1);
 check(hitNipple&&Math.hypot(hitNipple.point.x-nx,hitNipple.point.y-ny,hitNipple.point.z-nz)<.02,'a ray through the nipple must land on it');
}

// --- Rigged body (scripts/gyneco/build-body.py): file, license, bones, size budget ---
const bodyDir=new URL('../../public/models/gyneco/',import.meta.url);
const body=JSON.parse(readFileSync(new URL('body.json',bodyDir),'utf8'));
{
 check(body.source.license==='CC0 1.0 Universal'&&/mpfb2/.test(body.source.licenseUrl)&&/CC0 1\.0 Universal/.test(body.source.licenseQuote)&&/github\.com\/makehumancommunity\/mpfb2\/tree\/v2\.0\.18/.test(body.source.url)&&/MakeHuman/.test(body.source.name),'body.json must record the MPFB2 source, its CC0 license, the license URL and the quoted license line');
 const gz=statSync(new URL(body.model,bodyDir)).size;
 check(gz===body.gzipBytes&&gz<=3*1024*1024,`body.glb.gz is ${gz} bytes; body.json says ${body.gzipBytes}; the budget is 3 MiB`);
 check(body.transform.scale>.1&&body.transform.scale<.12&&typeof body.transform.shiftZ==='number'&&/MakeHuman/.test(body.transform.note),'body.json must record the transform from the MakeHuman frame');
 check(BODY_BONES.every(b=>body.bones.includes(b)&&body.heads[b]&&body.tails[b]),'body.json must list every bone the scene poses, with heads and tails');
 // Sources UI and README credit the body.
 check(SOURCES.MH&&SOURCES.MH.kind==='atlas'&&/MakeHuman/.test(SOURCES.MH.label)&&/CC0/.test(SOURCES.MH.label)&&/mpfb2/.test(SOURCES.MH.url)&&SECTIONS.find(s=>s.id==='autoexamen').sources.some(x=>x.id==='MH'),'the self-exam section must credit the MakeHuman/MPFB2 body (CC0) in its sources');
 const readme=readFileSync(new URL('../../README.md',import.meta.url),'utf8');
 check(/build-body\.py/.test(readme)&&/MakeHuman/.test(readme)&&/CC0/.test(readme),'README must document build-body.py and credit the MakeHuman body');
}
const glb=gunzipSync(readFileSync(new URL(body.model,bodyDir)));
check(glb.length===body.modelBytes&&glb.toString('latin1',0,4)==='glTF',`body.glb.gz must decode to ${body.modelBytes} bytes of binary glTF`);
{
 const jsonLength=glb.readUInt32LE(12),gltf=JSON.parse(glb.toString('utf8',20,20+jsonLength)),names=new Set(gltf.nodes.map(n=>n.name));
 for(const b of BODY_BONES)check(names.has(b),`the body lacks the bone ${b}`);
 const skinned=gltf.nodes.filter(n=>n.skin!==undefined&&n.mesh!==undefined);
 check(skinned.length===1&&gltf.nodes[skinned[0]?.mesh!==undefined?gltf.nodes.indexOf(skinned[0]):0]&&gltf.meshes[skinned[0].mesh].primitives.every(p=>p.attributes.JOINTS_0!==undefined&&p.attributes.WEIGHTS_0!==undefined&&p.attributes.NORMAL!==undefined),'the body must be one skinned mesh with joints, weights and normals');
 check(gltf.meshes.length===1&&gltf.meshes[0].name==='Body','only the body mesh may be exported (no default cube)');
 const joints=new Set(gltf.skins[skinned[0].skin].joints.map(j=>gltf.nodes[j].name));
 for(const b of BODY_BONES)check(joints.has(b),`the skin must bind ${b}`);
}

// --- Posed body: the HRA breast structures sit under the new skin, every stop lands on it, the IK reaches every stop ---
{
 const gltf=await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset,glb.byteOffset+glb.byteLength),'');
 const rig=bindBody(body,gltf.scene);
 const finite=v=>[v.x,v.y,v.z].every(Number.isFinite);
 const noNaN=label=>{for(const [name,b] of rig.bones){check(finite(b.position)&&[b.quaternion.x,b.quaternion.y,b.quaternion.z,b.quaternion.w].every(Number.isFinite),`${label}: bone ${name} has NaN`);}};
 // Rest pose: bone heads where body.json says (frame and names agree with the Blender build).
 resetPose(rig);rig.root.updateMatrixWorld(true);
 for(const b of BODY_BONES){const p=rig.bones.get(b).getWorldPosition(new THREE.Vector3()),h=body.heads[b];check(p.distanceTo(new THREE.Vector3(...h))<.002,`${b}: rest head ${p.toArray().map(x=>x.toFixed(3))} differs from body.json ${h}`);}
 const L=body.landmarks;
 check(Math.abs(L.height-1.72)<.01&&Math.abs(L.headTop[1]-1.72)<.02,`the body must be 1.72 m tall like the HRA female, got ${L.height}`);
 check(Math.abs(L.nipple.l[0]-.113)<.02&&Math.abs(L.nipple.l[1]-1.228)<.015&&L.nipple.l[2]>.147&&L.nipple.l[2]<.18,`the left nipple ${L.nipple.l} must sit just in front of the HRA nipple (0.113, 1.228, 0.147)`);
 check(L.nipple.r[0]<-.1&&Math.abs(L.nipple.r[0]+L.nipple.l[0])<1e-3,'the body must be symmetric, left breast at +x');
 const hra=new Map(female.parts.map(p=>[p.id,p])),bin=readFileSync(new URL('../../public/models/female/female-chunk.bin',import.meta.url)),buffer=bin.buffer.slice(bin.byteOffset,bin.byteOffset+bin.byteLength);
 const hraSurface=new ChestSurface(partGeometry(buffer,hra.get('VHF-skin')));
 const sternum=hraSurface.hit(.03,1.3,1);
 check(Math.abs(L.chestFrontZ-sternum.point.z)<.01,`the body sternum (z ${L.chestFrontZ}) must match the HRA skin (z ${sternum.point.z.toFixed(3)}) at mid-chest`);
 const skins={};
 for(const side of ['l','r']){
  const s=side==='l'?1:-1;
  const geometry=bakeChest(rig,side),surface=new ChestSurface(geometry);skins[side]=surface;
  check(surface.triangles>2000,`${side}: the baked chest must keep the skin triangles of the chest`);
  // Every stop and trail point of the timeline lands on the posed skin with an outward normal.
  for(const [what,list] of [['stop',STOPS],['trail point',TRAIL]])for(const p of list){
   const hit=surface.hit(p.theta,p.y,s),where=`${what} θ=${deg(p.theta).toFixed(1)}° y=${p.y.toFixed(3)} side ${side}`;
   assert.ok(hit,`no body skin at ${where}`);
   assert.ok(hit.normal.dot(new THREE.Vector3(s*Math.sin(p.theta),0,Math.cos(p.theta)))>.15,`the body normal at ${where} must point out of the chest`);
   assert.ok(hit.distance>.03&&hit.distance<.3,`${where}: implausible body skin distance ${hit.distance.toFixed(3)}`);
   checks++;
  }
  // The HRA breast structures stay under the body skin (the fat may show by a hair at its flat edges).
  for(const [part,tolerance] of [['areola',0],['nipple',0],['mammary-lobes',0],['lactiferous-ducts',0],['breast-fat',-.01]]){
   const pos=partGeometry(buffer,hra.get(`VHF-${part}-${side}`)).getAttribute('position'),step=Math.max(1,Math.floor(pos.count/300));let worst=Infinity,tested=0;
   for(let i=0;i<pos.count;i+=step){const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),theta=Math.atan2(s*x,z),r=Math.hypot(x,z);if(theta<0||theta>1.5||y<1.1||y>1.45)continue;const hit=surface.hit(theta,y,s);if(!hit)continue;worst=Math.min(worst,hit.distance-r);tested++;}
   check(tested>50&&worst>=tolerance,`${side}: VHF-${part} pokes ${(-worst*1000).toFixed(0)} mm through the body skin (tolerance ${-tolerance*1000} mm, ${tested} vertices)`);
  }
  const bodyNipple=surface.hit(NIPPLE.theta,NIPPLE.y,s);
  check(bodyNipple&&bodyNipple.point.distanceTo(new THREE.Vector3(...L.nipple[side]))<.015,`${side}: the NIPPLE ray must land on the body nipple`);
 }
 // The exam pose, standing and lying (the lying body is the standing body rotated with its holder): the raised hand is
 // behind the nape and the palpating pads reach every stop within 5 mm with a human elbow angle.
 const holder=new THREE.Group();holder.add(rig.root);
 for(const lying of [false,true]){
  holder.rotation.set(lying?-Math.PI/2:0,0,0);holder.position.set(0,lying?.8:0,lying?.86:0);holder.updateMatrixWorld(true);
  for(const side of ['l','r']){
   const s=side==='l'?1:-1,surface=skins[side],label=`${lying?'lying':'standing'} ${side}`;
   let worstPad=0,worstAngle=[180,0];
   for(const [i,stop] of STOPS.entries()){
    const hit=surface.hit(stop.theta,stop.y,s),sample=sampleAt(stop.start+stop.circleSeconds*1.5),target=padTarget(hit,sample,PAD_HEIGHT.media);
    const report=applyExamPose(rig,{step:sample.step,side,pad:target,normal:hit.normal,t:sample.step==='circles'?stop.start:stop.start,demo:true});
    noNaN(`${label} stop ${i}`);
    const err=report.pad.distanceTo(target);worstPad=Math.max(worstPad,err);
    assert.ok(err<=.005,`${label} stop ${i}: the middle pad is ${(err*1000).toFixed(1)} mm from its target`);
    assert.ok(!report.clamped&&report.elbowAngle>=30&&report.elbowAngle<=175,`${label} stop ${i}: elbow angle ${report.elbowAngle.toFixed(0)}° (clamped ${report.clamped})`);
    worstAngle=[Math.min(worstAngle[0],report.elbowAngle),Math.max(worstAngle[1],report.elbowAngle)];
    // Raised arm: the hand of the examined side is behind the coronal plane of the ears and above the shoulders.
    const hand=report.raisedHand;
    assert.ok(hand.z<L.ear[2]-.02&&hand.y>L.shoulder[side][1]+.05&&Math.abs(hand.x)<.12,`${label} stop ${i}: the raised hand ${hand.toArray().map(x=>x.toFixed(3))} is not behind the nape (ear z ${L.ear[2]}, shoulder y ${L.shoulder[side][1]})`);
    assert.ok(report.raisedElbow.y>L.shoulder[side][1]&&s*report.raisedElbow.x>.15,`${label} stop ${i}: the raised elbow must point up and out, got ${report.raisedElbow.toArray().map(x=>x.toFixed(3))}`);
    checks++;
   }
   if(!lying)console.log(`gyneco body ${side}: pad error ≤ ${(worstPad*1000).toFixed(1)} mm, elbow ${worstAngle[0].toFixed(0)}–${worstAngle[1].toFixed(0)}°`);
   // Nipple step: index pad on the nipple, thumb opposed to it.
   const n=STEPS.find(x=>x.id==='nipple'),sample=sampleAt(n.end-.5),hit=surface.hit(sample.theta,sample.y,s),target=padTarget(hit,sample,PAD_HEIGHT.suave);
   const report=applyExamPose(rig,{step:'nipple',side,pad:target,normal:hit.normal,t:n.end-.5,demo:true});noNaN(`${label} nipple`);
   check(report.pad.distanceTo(target)<=.005,`${label}: the index pad is ${(report.pad.distanceTo(target)*1000).toFixed(1)} mm from the nipple`);
   check(report.thumb&&report.thumb.distanceTo(target)<=.03,`${label}: the thumb must oppose the index at the nipple, it is ${(report.thumb.distanceTo(target)*1000).toFixed(0)} mm away`);
   // Inspection: arms down, hands on the hips, arms up, in that order, both hands; no raised arm yet.
   const insp=STEPS[0],phases=[[insp.start+.5,'down'],[insp.start+insp.end/2,'hips'],[insp.end-.5,'up']];
   for(const [t,phase] of phases){
    const r=applyExamPose(rig,{step:'inspection',side,pad:null,normal:null,t,demo:true});noNaN(`${label} inspection ${phase}`);
    for(const hand of [r.hands.l,r.hands.r]){
     if(phase==='down')check(hand.y<L.shoulder.l[1]-.3&&Math.abs(hand.x)<.3,`${label}: inspection starts with the arms down, hand at ${hand.toArray().map(x=>x.toFixed(2))}`);
     if(phase==='hips')check(hand.y>.8&&hand.y<1.1&&Math.abs(hand.x)<.25&&Math.abs(hand.x)>.08,`${label}: then the hands rest on the hips, hand at ${hand.toArray().map(x=>x.toFixed(2))}`);
     if(phase==='up')check(hand.y>L.headTop[1],`${label}: then the arms go up above the head, hand at ${hand.toArray().map(x=>x.toFixed(2))}`);
    }
   }
   // Outside the demo the body stands at ease.
   const ease=applyExamPose(rig,{step:'inspection',side,pad:null,normal:null,t:0,demo:false});
   check(ease.hands.l.y<1.1&&ease.hands.r.y<1.1,`${label}: outside the self-exam both arms hang down`);
  }
 }
 // The IK solver itself: reach, clamping, elbow angle and the frame helper.
 {
  const S=new THREE.Vector3(0,1.4,0),pole=new THREE.Vector3(0,0,-1);
  const straight=solveTwoBone(S,new THREE.Vector3(0,.9,0),.25,.25,pole);check(Math.abs(straight.elbowAngle-180)<1e-3&&!straight.clamped&&straight.wrist.distanceTo(new THREE.Vector3(0,.9,0))<1e-9,'a target at full reach gives a straight arm');
  const bent=solveTwoBone(S,new THREE.Vector3(0,1.4,.3),.25,.25,new THREE.Vector3(0,1,0));check(Math.abs(bent.elbowAngle-2*Math.asin(.15/.25)*180/Math.PI)<1e-3&&bent.elbow.y<1.4&&Math.abs(bent.elbow.distanceTo(S)-.25)<1e-9&&Math.abs(bent.elbow.distanceTo(bent.wrist)-.25)<1e-9,'the elbow bends toward the pole (below the shoulder here) and keeps both bone lengths');
  const far=solveTwoBone(S,new THREE.Vector3(0,0,0),.25,.25,pole);check(far.clamped&&Math.abs(far.wrist.distanceTo(S)-.5)<1e-9&&far.wrist.y<S.y,'an unreachable target is pulled onto the reach sphere');
  const q=frameOf(new THREE.Vector3(0,0,1),new THREE.Vector3(0,1,0)),x=new THREE.Vector3(1,0,0).applyQuaternion(q),y=new THREE.Vector3(0,1,0).applyQuaternion(q);check(x.distanceTo(new THREE.Vector3(0,0,1))<1e-9&&y.distanceTo(new THREE.Vector3(0,1,0))<1e-9,'frameOf maps x to along and y to the normal');
 }
}

console.log(`gyneco: ${checks} checks, ${STOPS.length} stops, ${DURATION.toFixed(1)} s`);
