// Checks the Spanish name table: alignment with the English keys, side placeholders, coverage of every
// atlas name, and the rendered Spanish of known structures.
// Usage: node scripts/i18n/validate-names.mjs   (run build-names.mjs first)
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nameKey,spanishName,localizeAtlas} from '../../app/names.ts';

const models=new URL('../../public/models/',import.meta.url);
const table=JSON.parse(readFileSync(new URL('names-es.json',models),'utf8'));
const atlas=JSON.parse(readFileSync(new URL('atlas.json',models),'utf8'));

for(const [key,es] of Object.entries(table)){
 const sides=(key.match(/\{s\}/g)??[]).length,tokens=es.match(/\{[^}]*\}/g)??[];
 assert.equal(tokens.length,sides,`side placeholders differ for "${key}" → "${es}"`);
 tokens.forEach((t,i)=>assert.match(t,new RegExp(`^\\{${i+1}:(m|f|mp|fp)\\}$`),`bad side token ${t} in "${es}"`));
 assert.ok(es.trim()&&es===es.trim(),`empty or padded translation for "${key}"`);
 assert.doesNotMatch(es,/izquierd|derech/,`hard-coded side in "${es}"`);
}

const names=[...atlas.parts.map(p=>p.name),...atlas.concepts.map(c=>c.name)];
const missing=names.filter(n=>!(nameKey(n).key in table));
assert.deepEqual(missing,[],`${missing.length} atlas names have no Spanish translation`);

assert.deepEqual(nameKey('Right portal vein'),{key:'{s} portal vein',sides:['right']});
assert.equal(spanishName('Left zygomatic bone',table),'Hueso cigomático izquierdo');
assert.equal(spanishName('Right portal vein',table),'Vena porta derecha');
assert.equal(spanishName('Left lung',table),'Pulmón izquierdo');
assert.equal(spanishName('heart',table),'Corazón');
assert.equal(spanishName('Branch of left middle cerebral artery to right angular gyrus',{['branch of {s} middle cerebral artery to {s} angular gyrus']:'rama de la arteria cerebral media {1:f} al giro angular {2:m}'}),'Rama de la arteria cerebral media izquierda al giro angular derecho');
assert.equal(spanishName('Not an atlas structure',table),'Not an atlas structure','unknown names fall back to the English name');

const localized=localizeAtlas(atlas,table);
assert.equal(localized.parts.length,atlas.parts.length);
const femur=localized.parts.find(p=>p.nameEn==='Left femur');
assert.equal(femur?.name,'Fémur izquierdo');
assert.ok(localized.concepts.every(c=>c.nameEn&&c.name),'every concept keeps its English name');
assert.equal(atlas.parts[0].nameEn,undefined,'localizeAtlas does not mutate its input');
console.log(`names ok: ${Object.keys(table).length} entries cover ${new Set(names).size} atlas names`);
