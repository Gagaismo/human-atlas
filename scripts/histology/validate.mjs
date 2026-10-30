// Checks the histology section data: the manifest schema, the image files (WebP, size, dimensions),
// the open licenses and credits, the link to the atlas (systems and part names) and the required tissues.
// Usage: node scripts/histology/validate.mjs
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';

const root=new URL('../../public/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('histology/histology.json',root),'utf8'));
const atlas=JSON.parse(readFileSync(new URL('models/atlas.json',root),'utf8'));

const CATEGORIES=['Epitelial','Conectivo','Muscular','Nervioso','Órganos'];
const SYSTEMS=['skeletal','muscular','arterial','venous','nervous','digestive','respiratory','urinary','reproductive','lymphatic','endocrine','integumentary','connective','sensory','cardiac'];
// Only CC0, public domain, CC BY and CC BY-SA; each license name must come with the matching license URL.
const LICENSES=[
  {name:/^CC0( 1\.0)?$/,url:/^https:\/\/creativecommons\.org\/publicdomain\/zero\/1\.0(\/|$)/},
  {name:/^Public domain$/,url:/^https:\/\/creativecommons\.org\/publicdomain\/mark\/1\.0(\/|$)/},
  {name:/^CC BY \d\.\d$/,url:/^https:\/\/creativecommons\.org\/licenses\/by\/\d\.\d(\/|$)/},
  {name:/^CC BY-SA \d\.\d$/,url:/^https:\/\/creativecommons\.org\/licenses\/by-sa\/\d\.\d(\/|$)/},
];
const MAX_BYTES=300*1024,MAX_TOTAL=9*1024*1024,MAX_SIDE=1400;
// Tissue types the section has to cover (ids), grouped for the report.
const REQUIRED=[
  'epitelio-plano-simple','epitelio-cubico-simple','epitelio-cilindrico-simple','epitelio-seudoestratificado-ciliado',
  'epitelio-plano-estratificado-queratinizado','epitelio-plano-estratificado-no-queratinizado','epitelio-de-transicion',
  'conectivo-laxo','conectivo-denso-regular','conectivo-denso-irregular','tejido-adiposo','cartilago-hialino','cartilago-elastico',
  'fibrocartilago','hueso-compacto','hueso-esponjoso','sangre-frotis',
  'musculo-esqueletico-longitudinal','musculo-esqueletico-transversal','musculo-cardiaco','musculo-liso',
  'neuronas-asta-anterior','nervio-periferico',
  'piel','higado','rinon','pulmon','estomago','intestino-delgado','colon','tiroides','bazo','ganglio-linfatico',
  'arteria-muscular','vena-con-valvula',
];

const isText=v=>typeof v==='string'&&v.trim().length>0;
const isHttps=v=>{try{return new URL(v).protocol==='https:'}catch{return false}};
// Same normalisation the atlas uses for names: lowercase, left/right removed.
const norm=name=>name.toLowerCase().replace(/\b(left|right)\b/g,'').replace(/\s+/g,' ').trim();
const atlasNames=new Set([...atlas.parts.map(p=>norm(p.name)),...atlas.concepts.map(c=>norm(c.name))]);

// Reads the pixel size from the WebP header (lossy VP8, lossless VP8L or extended VP8X).
const webpSize=buf=>{
  assert.equal(buf.toString('ascii',0,4),'RIFF','not a RIFF container');
  assert.equal(buf.toString('ascii',8,12),'WEBP','not a WebP file');
  const kind=buf.toString('ascii',12,16);
  if(kind==='VP8 ')return [buf.readUInt16LE(26)&0x3fff,buf.readUInt16LE(28)&0x3fff];
  if(kind==='VP8L'){const b=buf.readUInt32LE(21);return [(b&0x3fff)+1,((b>>>14)&0x3fff)+1];}
  if(kind==='VP8X')return [buf.readUIntLE(24,3)+1,buf.readUIntLE(27,3)+1];
  throw new Error(`unknown WebP chunk ${kind}`);
};

assert.equal(manifest.source,'Wikimedia Commons','source');
assert.ok(Array.isArray(manifest.tissues)&&manifest.tissues.length>0,'tissues');

const ids=new Set();
let total=0;
const perCategory=Object.fromEntries(CATEGORIES.map(c=>[c,0]));
const perLicense={};
for(const t of manifest.tissues){
  const at=`tissue ${t.id}`;
  for(const key of ['id','nombre','categoria','descripcion','tincion','especie','estado','image'])assert.ok(isText(t[key]),`${at}: ${key} must be non-empty text`);
  assert.match(t.id,/^[a-z0-9]+(-[a-z0-9]+)*$/,`${at}: id must be ascii kebab-case`);
  assert.ok(!ids.has(t.id),`${at}: duplicate id`);
  ids.add(t.id);
  assert.ok(CATEGORIES.includes(t.categoria),`${at}: invalid category ${t.categoria}`);
  perCategory[t.categoria]++;
  assert.ok(t.aumento===undefined||isText(t.aumento),`${at}: aumento, when present, must be non-empty text`);
  assert.equal(t.estado,'a validar',`${at}: every caption stays flagged "a validar"`);
  assert.ok((t.descripcion.match(/[.!?](\s|$)/g)||[]).length>=2,`${at}: descripcion needs at least two sentences`);

  // Image file
  assert.equal(t.image,`/histology/${t.id}.webp`,`${at}: image path`);
  const file=new URL(`histology/${t.id}.webp`,root);
  const size=statSync(file).size;
  assert.ok(size<=MAX_BYTES,`${at}: ${size} bytes exceeds ${MAX_BYTES}`);
  total+=size;
  const [w,h]=webpSize(readFileSync(file));
  assert.deepEqual([t.width,t.height],[w,h],`${at}: declared ${t.width}x${t.height} but file is ${w}x${h}`);
  assert.ok(Math.max(w,h)<=MAX_SIDE,`${at}: longest side ${Math.max(w,h)} exceeds ${MAX_SIDE}`);

  // License and credit
  const c=t.credit;
  assert.ok(c&&typeof c==='object','credit');
  for(const key of ['author','license','licenseUrl','source','modification'])assert.ok(isText(c[key]),`${at}: credit.${key} must be non-empty text`);
  const rule=LICENSES.find(l=>l.name.test(c.license));
  assert.ok(rule,`${at}: license ${c.license} is not in the allowlist (CC0, Public domain, CC BY, CC BY-SA)`);
  assert.ok(rule.url.test(c.licenseUrl),`${at}: licenseUrl ${c.licenseUrl} does not match ${c.license}`);
  assert.ok(isHttps(c.licenseUrl),`${at}: licenseUrl must be https`);
  assert.ok(isHttps(c.source),`${at}: source must be https`);
  assert.equal(new URL(c.source).hostname,'commons.wikimedia.org',`${at}: source must be a Commons file page`);
  assert.match(new URL(c.source).pathname,/^\/wiki\/File:/,`${at}: source must be a Commons file page`);
  assert.match(c.modification,/WebP/,`${at}: credit.modification must record the WebP conversion`);
  perLicense[c.license]=(perLicense[c.license]||0)+1;

  // Link to the atlas
  const r=t.related;
  assert.ok(r&&Array.isArray(r.systems)&&Array.isArray(r.names),`${at}: related.systems and related.names`);
  assert.ok(r.systems.length>0,`${at}: at least one related system`);
  for(const s of r.systems)assert.ok(SYSTEMS.includes(s),`${at}: unknown system ${s}`);
  for(const n of r.names){
    assert.equal(n,norm(n),`${at}: name "${n}" must be lowercase without left/right`);
    assert.ok(atlasNames.has(n),`${at}: name "${n}" is not in atlas.json`);
  }
}

assert.ok(total<=MAX_TOTAL,`total ${total} bytes exceeds ${MAX_TOTAL}`);
for(const c of CATEGORIES)assert.ok(perCategory[c]>0,`no image for category ${c}`);
const missing=REQUIRED.filter(id=>!ids.has(id));
assert.deepEqual(missing,[],`required tissues missing: ${missing.join(', ')}`);

// Every image is credited in public/ATTRIBUTION.md (regenerate the table with scripts/histology/attribution.mjs).
const attribution=readFileSync(new URL('ATTRIBUTION.md',root),'utf8');
const uncredited=manifest.tissues.filter(t=>!attribution.includes(t.credit.source)||!attribution.includes(`histology/${t.id}.webp`)).map(t=>t.id);
assert.deepEqual(uncredited,[],'images missing from public/ATTRIBUTION.md');

console.log(`histology ok: ${manifest.tissues.length} images, total ${(total/1024/1024).toFixed(2)} MB (max ${(Math.max(...manifest.tissues.map(t=>statSync(new URL(`histology/${t.id}.webp`,root)).size))/1024).toFixed(0)} KB each)`);
console.log('by category:',Object.entries(perCategory).map(([k,v])=>`${k} ${v}`).join(', '));
console.log('by license:',Object.entries(perLicense).map(([k,v])=>`${k} ${v}`).join(', '));
