// Checks the lymphatic structures merged into the atlas from Z-Anatomy: the extra chunk, sides taken from
// the geometry, Spanish names that agree with the side, and that they belong to the lymphatic system.
// Usage: node scripts/validate-lymph.mjs   (after node scripts/lymph/to-chunk.mjs)
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {appendParts} from '../app/female.ts';
import {sidedNames} from '../scripts/lymph/sides.mjs';

const models=new URL('../public/models/',import.meta.url);
const read=path=>JSON.parse(readFileSync(new URL(path,models),'utf8'));
const atlas=read('atlas.json'),lymph=read('descriptive/lymph-parts.json'),source=read('descriptive/landmarks.json');

const base=name=>name.toLowerCase().replace(/\b(left|right)\b ?/g,'').trim();
const existing=new Set(atlas.parts.filter(p=>p.system==='lymphatic').map(p=>base(p.name)));
const kept=source.lymph.filter(l=>!existing.has(base(l.name)));
assert.ok(source.lymph.length>kept.length,'the spleen and thymus already in the atlas are skipped');
assert.equal(lymph.parts.length,kept.length,'one atlas part per other lymphatic mesh');
assert.ok(lymph.parts.every(p=>!existing.has(base(p.name))),'no duplicates of atlas structures');
assert.ok(lymph.parts.filter(p=>/nodes?$/i.test(p.name)).length>=150,'lymph node groups');
assert.equal(readFileSync(new URL(lymph.chunk.url.replace(/^\/models\//,''),models)).byteLength,lymph.chunk.bytes);
assert.ok(lymph.parts.every(p=>p.system==='lymphatic'));
assert.equal(new Set(lymph.parts.map(p=>p.id)).size,lymph.parts.length,'unique ids');
lymph.parts.forEach((p,i)=>{
 if(/(^| )(left|right)( |$)/i.test(kept[i].name)){assert.equal(p.name,kept[i].name,'names that already carry a side keep it');return;}
 const x=(p.bounds[0][0]+p.bounds[1][0])/2;
 if(/^Left /.test(p.name))assert.ok(x>0,`${p.name} lies on the left (+x)`);
 if(/^Right /.test(p.name))assert.ok(x<0,`${p.name} lies on the right (−x)`);
 assert.doesNotMatch(p.nameEs,/izquierd.*izquierd|derech.*derech/,'side named once');
});
const single=kept.filter(l=>kept.filter(o=>o.name===l.name).length===1&&Math.abs((l.bounds[0][0]+l.bounds[1][0])/2)<.02);
assert.ok(single.length>0&&single.every(l=>lymph.parts.some(p=>p.name===l.name)),'unpaired midline node groups keep their name without a side');
assert.equal(new Set(lymph.parts.map(p=>p.name)).size,lymph.parts.length,'every structure has a distinct name (pairs get their side)');

// Spanish side agreement.
assert.deepEqual(sidedNames('Anterior axillary nodes','ganglios linfáticos axilares anteriores','left'),['Left anterior axillary nodes','ganglios linfáticos axilares anteriores izquierdos']);
assert.deepEqual(sidedNames('Anterior tibial node','ganglio linfático tibial anterior','right'),['Right anterior tibial node','ganglio linfático tibial anterior derecho']);
assert.deepEqual(sidedNames('Thoracic duct','conducto torácico','midline'),['Thoracic duct','conducto torácico']);
assert.deepEqual(sidedNames('Cisterna chyli','cisterna del quilo','left')[1],'cisterna del quilo izquierda');
assert.deepEqual(sidedNames('Left colic nodes','ganglios linfáticos cólicos izquierdos','left'),['Left colic nodes','ganglios linfáticos cólicos izquierdos']);

const merged=appendParts(atlas,lymph);
assert.equal(merged.parts.filter(p=>p.system==='lymphatic').length,atlas.parts.filter(p=>p.system==='lymphatic').length+lymph.parts.length);
const node=merged.parts.find(p=>p.nameEn==='Left anterior axillary nodes');
assert.equal(node?.name,'Ganglios linfáticos axilares anteriores izquierdos');
assert.equal(node?.sex,undefined,'lymphatics are shared by both sexes');
console.log(`lymph ok: ${lymph.parts.length} structures, ${lymph.chunk.gzipBytes} bytes gz`);
