// Loads attachments.glb.gz with three's GLTFLoader, as the viewer does, and checks that every attachment in
// landmarks.json finds its mesh by the node name written in the file.
// Usage: node scripts/validate-attachment-meshes.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {sourceNodeName} from '../app/gltf-names.ts';

const dir=new URL('../public/models/descriptive/',import.meta.url);
const data=JSON.parse(readFileSync(new URL('landmarks.json',dir),'utf8'));
const glb=gunzipSync(readFileSync(new URL('attachments.glb.gz',dir)));
const gltf=await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset,glb.byteOffset+glb.byteLength),'');
const meshes=new Map();
gltf.scene.traverse(o=>{if(o.isMesh)meshes.set(sourceNodeName(gltf,o),o);});
assert.ok(data.attachments.some(a=>/[ .()]/.test(a.node)),'node names contain characters GLTFLoader rewrites');
const missing=data.attachments.filter(a=>!meshes.has(a.node)).map(a=>a.node);
assert.deepEqual(missing,[],'attachments without a mesh');
console.log(`attachment meshes ok: ${meshes.size} meshes for ${data.attachments.length} attachments`);
