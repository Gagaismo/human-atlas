// Checks what the viewer shows for a selection: the landmarks of a selected bone and the attachment areas
// of a selected muscle or on a selected bone, using the extracted Z-Anatomy data.
// Usage: node scripts/validate-descriptive-links.mjs   (after npm run build:descriptive)
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {attachmentRows,attachmentsFor,drawnOnBones,landmarksFor} from '../app/descriptive.ts';
import {bounds,readMeshes} from './female/glb.mjs';

const models=new URL('../public/models/',import.meta.url);
const atlas=JSON.parse(readFileSync(new URL('atlas.json',models),'utf8'));
const data=JSON.parse(readFileSync(new URL('descriptive/landmarks.json',models),'utf8'));
const id=name=>{const p=atlas.parts.find(x=>x.name===name);assert.ok(p,`atlas has ${name}`);return p.id;};

const femur=landmarksFor(data,[id('Left femur')]);
assert.ok(femur.some(l=>/greater trochanter/i.test(l.name)),'the femur shows its greater trochanter');
assert.ok(femur.every(l=>l.bone===id('Left femur')&&l.nameEs.trim()),'only landmarks of the femur, all named in Spanish');
assert.ok(landmarksFor(data,[id('Right femur')]).length>0,'the other femur gets its (mirrored) landmarks too');
assert.deepEqual(landmarksFor(data,[]),[]);

const longHead=attachmentsFor(data,[id('Long head of left biceps femoris')]);
assert.ok(longHead.some(a=>a.kind==='origin'&&a.bones.includes(id('Left hip bone'))),'long head of biceps femoris arises from the hip bone');
assert.ok(longHead.some(a=>a.kind==='insertion'&&a.bones.includes(id('Left fibula'))),'and inserts on the fibula');
assert.ok(longHead.every(a=>a.side!=='right'),'a left muscle shows left attachments only');

const onHip=attachmentRows(attachmentsFor(data,[id('Left hip bone')]));
assert.ok(onHip.length>=10,'many muscles attach to the hip bone');
assert.ok(onHip.some(r=>/biceps femoris/i.test(r.muscle)&&r.origin),'the hip bone lists the biceps femoris origin');
assert.deepEqual(onHip.map(r=>r.muscleEs),[...onHip.map(r=>r.muscleEs)].sort((a,b)=>a.localeCompare(b,'es')),'rows sorted in Spanish');
// Selecting a bone draws only the areas that lie on it: the rectus abdominis insertion spans the costal
// cartilages and would float in the air around an isolated hip bone.
const boxes=new Map(readMeshes(gunzipSync(readFileSync(new URL('descriptive/attachments.glb.gz',models)))).map(m=>[m.name,bounds(m.positions)]));
const hip=atlas.parts.find(p=>p.name==='Left hip bone');
const onHipBone=attachmentsFor(data,[hip.id]),drawn=onHipBone.filter(a=>drawnOnBones(boxes.get(a.node),[hip.bounds]));
assert.ok(drawn.length>=20,'most hip bone areas are drawn');
assert.ok(!drawn.some(a=>/rectus abdominis/i.test(a.muscle)&&a.kind==='insertion'),'the rectus abdominis insertion is not drawn around the hip bone');
assert.ok(drawn.some(a=>/biceps femoris/i.test(a.muscle)),'the biceps femoris origin is drawn on the hip bone');
console.log(`descriptive links ok: femur ${femur.length} landmarks, hip bone ${onHip.length} muscles`);
