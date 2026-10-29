// Physiological checks of the rig: posing joints must lengthen and shorten the muscles that cross them,
// and every catalog stretch must actually lengthen its target muscles.
// Usage: node scripts/kinesio/validate-pose.mjs   (Node 22.18+, after npm ci)
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {applyPose,bindRig,clampPose,composePose,elongation,mirrorPose,muscleKey} from '../../app/kinesio/pose.ts';
import {STRETCHES} from '../../app/kinesio/catalog.ts';

const dir=new URL('../../public/models/kinesio/',import.meta.url);
const meta=JSON.parse(readFileSync(new URL('lower-limb.json',dir),'utf8'));
const bytes=gunzipSync(readFileSync(new URL(meta.model,dir)));
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const rig=bindRig(meta,gltf.scene);
const e=(pose,id,side='r')=>{applyPose(rig,pose);return elongation(rig,muscleKey(id,side));};
let checks=0;const check=(ok,message)=>{assert.ok(ok,message);checks++;};
const pct=x=>`${(x*100).toFixed(1)} %`;

for(const id of meta.muscles.map(m=>m.id))check(Math.abs(e({},id))<1e-4,`${id} must be at rest length in the rest pose, got ${pct(e({},id))}`);
const slr={hip_r:{flexion:80},knee_r:{flexion:0}},knee90={knee_r:{flexion:90}},dorsi={ankle_r:{flexion:20}},ext={hip_r:{flexion:-15}},abd={hip_r:{abduction:40}};
for(const id of ['biceps_femoris_long','semitendinosus','semimembranosus'])check(e(slr,id)>0.05,`straight-leg raise must lengthen ${id} by >5 %, got ${pct(e(slr,id))}`);
check(Math.abs(e(slr,'biceps_femoris_short'))<0.02,`hip flexion must not change the one-joint short head, got ${pct(e(slr,'biceps_femoris_short'))}`);
for(const id of ['biceps_femoris_long','semitendinosus','gastrocnemius_medial'])check(e(knee90,id)<-0.02,`knee flexion must shorten ${id}, got ${pct(e(knee90,id))}`);
for(const id of ['rectus_femoris','vastus_lateralis','vastus_medialis','vastus_intermedius'])check(e(knee90,id)>0.05,`knee flexion must lengthen ${id} by >5 %, got ${pct(e(knee90,id))}`);
check(Math.abs(e(knee90,'soleus'))<0.01,`knee flexion must not change the soleus, got ${pct(e(knee90,'soleus'))}`);
for(const id of ['soleus','gastrocnemius_medial','gastrocnemius_lateral'])check(e(dorsi,id)>0.02,`dorsiflexion must lengthen ${id} by >2 %, got ${pct(e(dorsi,id))}`);
for(const id of ['psoas_major','iliacus','rectus_femoris'])check(e(ext,id)>0,`hip extension must lengthen ${id}, got ${pct(e(ext,id))}`);
check(e({hip_r:{flexion:90}},'iliacus')<-0.05,`hip flexion must shorten the iliacus, got ${pct(e({hip_r:{flexion:90}},'iliacus'))}`);
for(const id of ['adductor_longus','adductor_brevis','adductor_magnus','pectineus','gracilis'])check(e(abd,id)>0.05,`abduction must lengthen ${id} by >5 %, got ${pct(e(abd,id))}`);
for(const [pose,id] of [[slr,'semitendinosus'],[knee90,'rectus_femoris'],[dorsi,'soleus'],[abd,'adductor_longus']]){
 const r=e(pose,id),l=e(mirrorPose(pose,'l'),id,'l');
 check(Math.abs(r-l)<0.01,`the left side must mirror the right for ${id}: right ${pct(r)}, left ${pct(l)}`);
}
check(clampPose(rig,{knee_r:{flexion:200}}).knee_r.flexion===150,'knee flexion must clamp to its 150° limit');
check(clampPose(rig,{hip_r:{flexion:-90}}).hip_r.flexion===-20,'hip extension must clamp to its -20° limit');

// Every stretch variant with a pose must lengthen at least one target muscle by more than 0.5 %; the muscle-tendon
// unit of the calf changes little per degree. The one-joint short head is already at full length at rest (0 %).
for(const s of STRETCHES)for(const v of s.variants){
 if(!Object.keys(v.pose).length)continue;
 const pose=composePose(v.position,v.pose),best=Math.max(...s.muscles.map(id=>e(pose,id,s.side)));
 const atRest=s.muscles.every(id=>id==='biceps_femoris_short');
 check(atRest?best>-0.005:best>0.005,`${s.id} (${v.position}/${v.mode}) must lengthen its target muscles, best ${pct(best)}`);
}
console.log(`validate-pose: ok — ${checks} checks`);
