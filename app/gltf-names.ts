import type * as T from 'three';
import type {GLTF} from 'three/examples/jsm/loaders/GLTFLoader.js';

/** GLTFLoader sanitizes node names (spaces to "_", drops "." and brackets) and dedupes them; this returns
 * the name written in the file, so meshes can be matched with the names in our JSON manifests. */
export function sourceNodeName(gltf:GLTF,object:T.Object3D){
 const index=gltf.parser.associations.get(object)?.nodes;
 return index===undefined?object.name:(gltf.parser.json.nodes[index]?.name??object.name);
}
