// Builds public/models/names-es.json from the line-aligned sources: names-en.txt holds the normalized
// English names ("{s}" stands for left/right) and names-es-*.txt their Spanish translations, in order.
// Usage: node scripts/i18n/build-names.mjs
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';

const dir=new URL('./',import.meta.url);
const lines=file=>readFileSync(new URL(file,dir),'utf8').replace(/\r/g,'').split('\n').filter((l,i,a)=>l!==''||i<a.length-1);
const en=lines('names-en.txt');
const es=readdirSync(dir).filter(f=>/^names-es-\d+\.txt$/.test(f)).sort().flatMap(lines);
if(en.length!==es.length)throw new Error(`names-en.txt has ${en.length} lines but the Spanish files have ${es.length}`);
const table=Object.fromEntries(en.map((key,i)=>[key,es[i]]));
writeFileSync(new URL('../../public/models/names-es.json',dir),JSON.stringify(table)+'\n');
console.log(`wrote ${en.length} Spanish names`);
