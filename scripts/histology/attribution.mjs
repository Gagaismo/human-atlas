// Prints the histology credits table for public/ATTRIBUTION.md from public/histology/histology.json.
// Usage: node scripts/histology/attribution.mjs
import {readFileSync} from 'node:fs';

const catalog=JSON.parse(readFileSync(new URL('../../public/histology/histology.json',import.meta.url),'utf8'));
const cell=text=>String(text).replace(/\|/g,'\\|').replace(/\s+/g,' ').trim();
console.log('| Image | Tissue | Author | License | Source | Changes |');
console.log('|---|---|---|---|---|---|');
for(const t of catalog.tissues)console.log(`| \`${t.image.replace(/^\//,'')}\` | ${cell(t.nombre)} | ${cell(t.credit.author)} | [${cell(t.credit.license)}](${t.credit.licenseUrl}) | [Wikimedia Commons](${t.credit.source}) | ${cell(t.credit.modification)} |`);
