// Checks the anatomical section planes against the atlas: which half each plane keeps, the slider range,
// the flip, and the camera view that faces the cut.
// Usage: node scripts/validate-section.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {atlasBounds,keeps,sectionPlane,sectionView} from '../app/section.ts';

const atlas=JSON.parse(readFileSync(new URL('../public/models/atlas.json',import.meta.url),'utf8'));
const center=name=>{const p=atlas.parts.find(x=>x.name===name);assert.ok(p,`missing ${name}`);return p.bounds[0].map((v,i)=>(v+p.bounds[1][i])/2);};
const bounds=atlasBounds(atlas.parts);
const mid=plane=>sectionPlane({plane,position:.5,flip:false},bounds);

// Sagittal: keeps the right half (−x) so the lateral view, from +x, faces the cut.
assert.equal(keeps(mid('sagittal'),center('Right femur')),true);
assert.equal(keeps(mid('sagittal'),center('Left femur')),false);
assert.equal(keeps(sectionPlane({plane:'sagittal',position:.5,flip:true},bounds),center('Left femur')),true,'flip keeps the other half');
// Coronal: keeps the posterior half (−z) so the anterior view faces the cut.
assert.equal(keeps(mid('coronal'),center('Tenth thoracic vertebra')),true);
assert.equal(keeps(mid('coronal'),center('Body of sternum')),false);
// Transverse: keeps what lies below the cut, seen from above.
const atChest=sectionPlane({plane:'transverse',position:1.25/bounds[1][1],flip:false},bounds);
assert.equal(keeps(atChest,center('Left femur')),true);
assert.equal(keeps(atChest,center('Left vertebral artery')),false);
// The slider spans the whole body and clamps outside 0–1.
assert.equal(keeps(sectionPlane({plane:'transverse',position:1,flip:false},bounds),center('Left vertebral artery')),true,'position 1 keeps everything');
assert.equal(keeps(sectionPlane({plane:'transverse',position:0,flip:false},bounds),center('Left femur')),false,'position 0 removes everything above the floor');
assert.deepEqual(sectionPlane({plane:'coronal',position:7,flip:false},bounds),sectionPlane({plane:'coronal',position:1,flip:false},bounds));
// The camera faces the cut: from the left side, the front or above, and from the opposite side when flipped.
assert.deepEqual(['sagittal','coronal','transverse'].map(p=>[sectionView(p,false),sectionView(p,true)]),[['side','right-side'],['front','back'],['top','bottom']]);
console.log('section planes ok');
