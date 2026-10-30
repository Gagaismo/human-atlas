// Checks the "what passes through" content of bone openings: one entry per opening-like landmark name
// (foramina, canals, grooves, notches, fissures, fossae), each with its contents, and the panel lookup.
// Usage: node scripts/validate-openings.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {OPENING,openingContent} from '../app/descriptive.ts';

const models=new URL('../public/models/',import.meta.url);
const data=JSON.parse(readFileSync(new URL('descriptive/landmarks.json',models),'utf8'));
const table=JSON.parse(readFileSync(new URL('descriptions/openings.json',models),'utf8'));
const expected=new Set(data.landmarks.map(l=>l.name.toLowerCase()).filter(n=>OPENING.test(n)));
const keys=new Set(Object.keys(table.entries));
assert.deepEqual([...expected].filter(k=>!keys.has(k)),[],'openings without content');
assert.deepEqual([...keys].filter(k=>!expected.has(k)),[],'content for names that are not openings');
for(const [key,text] of Object.entries(table.entries))assert.ok(typeof text==='string'&&text.trim().length>10,`${key}: empty content`);

assert.match(openingContent(table,'Foramen ovale')??'',/mandibular/i,'the foramen ovale lets the mandibular nerve through');
assert.match(openingContent(table,'Foramen magnum')??'',/médula|bulbo/i);
assert.match(openingContent(table,'Groove for ulnar nerve')??'',/cubital|ulnar/i);
assert.equal(openingContent(table,'Greater trochanter'),undefined,'landmarks that are not openings have no contents');
console.log(`openings ok: ${keys.size} entries`);
