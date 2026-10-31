// Checks of the gynecology mode: the self-exam palpation timeline covers the whole area, the leaflet content is
// verbatim and sourced, and the female parts the scene needs exist.
// Usage: node scripts/gyneco/validate.mjs   (Node 22.18+)
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as C from '../../app/gyneco/content.ts';
import {partGeometry} from '../../app/gyneco/model.ts';
import {ChestSurface} from '../../app/gyneco/surface.ts';
import {DURATION,NIPPLE,PAD_RADIUS,PATTERN,PRESSURES,REGIONS,RHO,STEP_ORDER,STEPS,STOPS,STRIP_SPACING,TRAIL,buildTimeline,sampleAt} from '../../app/gyneco/palpation.ts';
const {CENTERS,LEAFLET_CREDIT,SECTIONS,SOURCES,CONFLICTS,CENTER_STATUS,UNT_NOTE}=C;

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
check(breast.yTop>=1.43,`the top edge must reach the clavicle (y ≥ 1.43 m), got ${breast.yTop}`);
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

console.log(`gyneco: ${checks} checks, ${STOPS.length} stops, ${DURATION.toFixed(1)} s`);
