// Checks the female variant as merged into the atlas: the extra geometry chunk, the parts it adds, the male
// parts it replaces, and which parts each sex shows.
// Usage: node scripts/validate-sex.mjs   (after node scripts/female/to-chunk.mjs)
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {shownFor,withFemale} from '../app/female.ts';
import {localizeAtlas} from '../app/names.ts';

const models=new URL('../public/models/',import.meta.url);
const read=path=>JSON.parse(readFileSync(new URL(path,models),'utf8'));
const atlas=read('atlas.json'),female=read('female/female-parts.json'),source=read('female/female.json');
const merged=withFemale(localizeAtlas(atlas,read('names-es.json')),female);

// The chunk files hold every part's buffers, aligned, with the declared sizes.
const bin=readFileSync(new URL(female.chunk.url.replace(/^\/models\//,''),models));
assert.equal(bin.byteLength,female.chunk.bytes);
assert.deepEqual(gunzipSync(readFileSync(new URL(female.chunk.gzip.replace(/^\/models\//,''),models))),bin,'gzip matches the raw chunk');
assert.equal(female.parts.length,source.parts.length,'one atlas part per female structure');
for(const p of female.parts){
 assert.equal(p.positions%4,0);assert.equal(p.normals%2,0);assert.equal(p.indices%4,0);
 assert.ok(p.indices+p.indexCount*4<=bin.byteLength,`${p.id} buffers fit in the chunk`);
 const positions=new Float32Array(bin.buffer,bin.byteOffset+p.positions,p.vertexCount*3),indices=new Uint32Array(bin.buffer,bin.byteOffset+p.indices,p.indexCount);
 assert.ok(indices.every(i=>i<p.vertexCount),`${p.id} indices stay within its vertices`);
 const min=[0,1,2].map(c=>Math.min(...positions.filter((_,i)=>i%3===c))),max=[0,1,2].map(c=>Math.max(...positions.filter((_,i)=>i%3===c)));
 const declared=source.parts.find(s=>s.id===p.id).bounds;
 [0,1,2].forEach(c=>{assert.ok(Math.abs(min[c]-declared[0][c])<.01&&Math.abs(max[c]-declared[1][c])<.01,`${p.id} geometry matches female.json bounds`);});
}

// Merge: female parts come last, in a new chunk, with Spanish names; replaced male parts are male-only.
assert.equal(merged.chunks.length,atlas.chunks.length+1);
assert.equal(merged.parts.length,atlas.parts.length+female.parts.length);
const uterus=merged.parts.find(p=>p.id==='VHF-uterine-body');
assert.equal(uterus?.chunk,atlas.chunks.length);
assert.equal(uterus?.sex,'female');
assert.equal(uterus?.name,'Cuerpo del útero');
assert.equal(uterus?.nameEn,'Body of uterus');
assert.ok(merged.concepts.some(c=>c.id==='VHF-uterine-body'&&c.elements[0]==='VHF-uterine-body'),'female parts are searchable concepts');
const replaced=new Set(female.replaces);
assert.ok(merged.parts.filter(p=>replaced.has(p.id)).every(p=>p.sex==='male'),'replaced parts are male-only');
assert.ok(merged.parts.filter(p=>!replaced.has(p.id)&&!p.id.startsWith('VHF-')).every(p=>p.sex===undefined),'shared parts have no sex');
assert.ok(merged.parts.some(p=>p.system==='reproductive'&&p.sex==='male'),'male reproductive parts are replaced');
assert.equal(atlas.parts.some(p=>p.sex),false,'withFemale does not mutate its input');

// Which parts each sex shows.
const prostate=merged.parts.find(p=>p.nameEn==='Prostate'),femur=merged.parts.find(p=>p.nameEn==='Left femur');
assert.deepEqual([shownFor(prostate,'male'),shownFor(prostate,'female')],[true,false]);
assert.deepEqual([shownFor(uterus,'male'),shownFor(uterus,'female')],[false,true]);
assert.deepEqual([shownFor(femur,'male'),shownFor(femur,'female')],[true,true]);
console.log(`sex variants ok: ${female.parts.length} female parts replace ${replaced.size} male parts`);
