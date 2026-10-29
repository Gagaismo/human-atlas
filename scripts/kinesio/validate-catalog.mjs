// Validates the clinical stretching catalog (app/kinesio/catalog.ts).
// Usage: node scripts/kinesio/validate-catalog.mjs [catalog module]   (Node 22.18+ strips the TypeScript types)
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const target=process.argv[2]?pathToFileURL(process.argv[2]).href:new URL('../../app/kinesio/catalog.ts',import.meta.url).href;
const {STRETCHES}=await import(target);
const types=readFileSync(new URL('../../app/kinesio/types.ts',import.meta.url),'utf8');
const union=name=>[...types.match(new RegExp(`export type ${name}\\s*=([^;]+);`))[1].matchAll(/'([a-z_]+)'/g)].map(m=>m[1]);
const muscleIds=union('MuscleId'),positions=union('PatientPosition'),modes=['activo','pasivo','inmovil'];
const RANGES={hip:{flexion:[-30,140],abduction:[-30,60],rotation:[-60,60]},knee:{flexion:[0,160]},ankle:{flexion:[-60,40]},pelvis:{}};
// Two-joint muscles must be shown with both joints positioned in at least one variant.
const TWO_JOINT={biceps_femoris_long:['hip','knee'],semitendinosus:['hip','knee'],semimembranosus:['hip','knee'],rectus_femoris:['hip','knee'],gracilis:['hip','knee'],gastrocnemius_medial:['knee','ankle'],gastrocnemius_lateral:['knee','ankle']};

const errors=[];const fail=message=>errors.push(message);
const ids=new Set(),covered=new Set(),groups=new Map();
for(const entry of STRETCHES){
 const where=`entry ${entry.id}`;
 if(ids.has(entry.id))fail(`${where}: duplicate id`);ids.add(entry.id);
 if(entry.validated!==false)fail(`${where}: validated must stay false until a kinesiologist reviews it`);
 if(!entry.citations?.length)fail(`${where}: needs at least one citation`);
 if(!entry.variants?.length)fail(`${where}: needs at least one variant`);
 for(const m of entry.muscles){if(!muscleIds.includes(m))fail(`${where}: unknown muscle ${m}`);covered.add(m);}
 if(!groups.has(entry.group))groups.set(entry.group,false);
 for(const [i,v] of (entry.variants??[]).entries()){
  const at=`${where} variant ${i+1} (${v.position}/${v.mode})`;
  if(!positions.includes(v.position))fail(`${at}: unknown position`);
  if(!modes.includes(v.mode))fail(`${at}: unknown mode`);
  if(v.mode==='inmovil')groups.set(entry.group,true);
  for(const key of ['setup','action','fixation'])if(typeof v[key]!=='string'||!v[key].trim())fail(`${at}: ${key} is empty`);
  for(const [joint,motions] of Object.entries(v.pose)){
   const kind=joint.split('_')[0],ranges=RANGES[kind];
   if(!ranges){fail(`${at}: unknown joint ${joint}`);continue;}
   for(const [motion,angle] of Object.entries(motions)){
    const range=ranges[motion];
    if(!range)fail(`${at}: ${joint} has no ${motion}`);
    else if(!Number.isFinite(angle)||angle<range[0]||angle>range[1])fail(`${at}: ${joint}.${motion} = ${angle} is outside ${range[0]}..${range[1]}`);
   }
  }
 }
 for(const m of entry.muscles){
  const needs=TWO_JOINT[m];if(!needs)continue;
  const both=entry.variants.some(v=>needs.every(k=>Object.keys(v.pose).some(j=>j===`${k}_${entry.side}`)));
  if(!both)fail(`${where}: ${m} crosses ${needs.join(' and ')}, but no variant positions both`);
 }
}
for(const m of muscleIds)if(!covered.has(m))fail(`muscle ${m} has no stretch entry`);
for(const [group,hasImmobile] of groups)if(!hasImmobile)fail(`group ${group}: needs an 'inmovil' variant (decúbito obligado)`);

if(errors.length){console.error(`validate-catalog: ${errors.length} problem(s)\n- ${errors.join('\n- ')}`);process.exit(1);}
console.log(`validate-catalog: ok — ${STRETCHES.length} entries, ${groups.size} groups, ${covered.size} muscles`);
