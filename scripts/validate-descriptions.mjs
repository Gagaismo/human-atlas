// Checks the Spanish descriptions: one entry per atlas part name of each described system, allowed fields
// in order, non-empty text, and the lookup used by the detail panel.
// Usage: node scripts/validate-descriptions.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DESCRIBED_SYSTEMS,FIELDS,descriptionKey,describe} from '../app/descriptions.ts';

const models=new URL('../public/models/',import.meta.url);
const atlas=JSON.parse(readFileSync(new URL('atlas.json',models),'utf8'));
// The female variant adds its own reproductive structures (public/models/female/female.json).
const female=JSON.parse(readFileSync(new URL('female/female.json',models),'utf8'));
const described=[...atlas.parts,...female.parts];
// The Z-Anatomy lymph nodes are merged into the atlas too (public/models/descriptive/lymph-parts.json).
const lymph=JSON.parse(readFileSync(new URL('descriptive/lymph-parts.json',models),'utf8'));
const tables={};
let total=0;
for(const system of DESCRIBED_SYSTEMS){
 const table=JSON.parse(readFileSync(new URL(`descriptions/${system}.json`,models),'utf8'));
 assert.equal(table.system,system);
 const pool=system==='reproductive'?described:system==='lymphatic'?[...atlas.parts,...lymph.parts]:atlas.parts;
 const expected=new Set(pool.filter(p=>p.system===system).map(p=>descriptionKey(p.name)));
 const keys=new Set(Object.keys(table.entries));
 assert.deepEqual([...expected].filter(k=>!keys.has(k)),[],`${system}: parts without a description`);
 assert.deepEqual([...keys].filter(k=>!expected.has(k)),[],`${system}: descriptions of names not in the atlas`);
 for(const [key,entry] of Object.entries(table.entries)){
  assert.ok(entry.resumen?.trim(),`${system}/${key}: empty resumen`);
  const order=entry.detalles.map(d=>FIELDS[system].indexOf(d.titulo));
  assert.ok(order.every(i=>i>=0),`${system}/${key}: unknown field in ${entry.detalles.map(d=>d.titulo)}`);
  assert.deepEqual(order,[...order].sort((a,b)=>a-b),`${system}/${key}: fields out of order`);
  assert.ok(entry.detalles.every(d=>d.texto.trim()),`${system}/${key}: empty field text`);
 }
 tables[system]=table;total+=keys.size;
}

assert.equal(descriptionKey('Left femur'),'femur');
assert.equal(descriptionKey('Branch of right coronary artery'),'branch of coronary artery');
const femur=describe(tables,'Left femur','skeletal');
assert.match(femur.resumen,/muslo/);
assert.ok(femur.detalles.some(d=>d.titulo==='Partes y accidentes'&&/trocánter/.test(d.texto)),'the femur lists its trochanters');
const biceps=describe(tables,'Long head of right biceps femoris','muscular');
assert.ok(biceps&&['Origen','Inserción','Inervación','Acción'].every(t=>biceps.detalles.some(d=>d.titulo===t)),'muscles give origin, insertion, innervation and action');
assert.equal(descriptionKey('Areola (left)'),'areola');
assert.ok(describe(tables,'Left anterior axillary nodes','lymphatic')?.detalles.some(d=>d.titulo==='Drena'),'lymph nodes say what they drain');
assert.ok(describe(tables,'Body of uterus','reproductive')?.detalles.some(d=>d.titulo==='Irrigación'&&/linf/i.test(d.texto)),'reproductive organs say where their lymph drains');
assert.ok(describe(tables,'Mammary lobes (right)','reproductive'),'female structures named with a side in parentheses are described');
assert.equal(describe(tables,'Heart','cardiac'),undefined,'systems without a table have no description');
assert.equal(describe(tables,'Not a part','skeletal'),undefined);
console.log(`descriptions ok: ${total} entries in ${DESCRIBED_SYSTEMS.length} systems`);
