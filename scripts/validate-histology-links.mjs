// Checks which histology images the detail panel offers for an atlas structure: tissues named after the
// structure first, then tissues of its system.
// Usage: node scripts/validate-histology-links.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {relatedTissues} from '../app/histology.ts';

const catalog=JSON.parse(readFileSync(new URL('../public/histology/histology.json',import.meta.url),'utf8'));
const ids=(nameEn,system)=>relatedTissues(catalog,nameEn,system).map(t=>t.id);

assert.deepEqual(ids('Liver','digestive').slice(0,1),['higado'],'an organ shows its own histology first');
assert.ok(ids('Left femur','skeletal').includes('hueso-compacto'));
assert.ok(ids('Third thoracic vertebra','skeletal')[0]==='hueso-esponjoso','whole-word match inside a longer name');
assert.ok(ids('Heart','cardiac').includes('musculo-cardiaco'));
assert.ok(ids('Long head of left biceps femoris','muscular').includes('musculo-esqueletico-longitudinal'),'muscles fall back to their system');
assert.ok(ids('Left femoral artery','arterial').includes('arteria-muscular'));
assert.ok(ids('Left femur','skeletal').length<=4,'at most four suggestions');
assert.equal(new Set(ids('Urinary bladder','urinary')).size,ids('Urinary bladder','urinary').length,'no duplicates');
assert.deepEqual(ids('Left lung','sensory').slice(0,2).sort(),['epitelio-plano-simple','pulmon'],'names win over a foreign system');
assert.deepEqual(ids('Liver','digestive'),['higado'],'a structure with its own tissues shows only those');
assert.equal(ids('Long head of left biceps femoris','muscular')[0],'musculo-esqueletico-longitudinal','tissues whose main system matches come first');
assert.deepEqual(relatedTissues({tissues:[]},'Liver','digestive'),[]);
console.log('histology links ok');
