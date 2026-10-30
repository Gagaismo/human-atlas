# Extracts raw descriptive data from Z-Anatomy (CC BY-SA 4.0) in its own frame, in world space, for build.mjs.
#
# blender -b --factory-startup --disable-autoexec <Z-Anatomy/Startup.blend> --python-exit-code 1 \
#   -P scripts/zanatomy/extract.py -- <scratch dir>
#
# Writes to the scratch dir: landmarks.json (2-vertex leader lines "<Landmark>.j" of the skeletal system),
# bones.json (world bounds and decimated surface of the skeletal meshes, used to align each bone to BodyParts3D),
# attachments.json (origin/insertion patches "<Muscle>.o[n]l|r" and ".e[n]l|r") and lymph.json (lymphoid meshes).
import bpy, json, os, re, sys
from mathutils import Vector

OUT = sys.argv[sys.argv.index('--') + 1]
os.makedirs(OUT, exist_ok=True)
LYMPH_MAX_VERTS = 1200  # Bigger meshes (thymus lobes, intrapulmonary nodes) are decimated to about this.
ATTACH_MAX_VERTS = 90
BONE_MAX_VERTS = 4000  # Bone surfaces are only used to tell which bone a landmark or area lies on.
depsgraph = bpy.context.evaluated_depsgraph_get()

def top(o): return o.users_collection[0].name if o.users_collection else ''
def clean(name): return re.sub(r'^[(\[](.*)[)\]]$', r'\1', name).strip()

def evaluated(o):
    e = o.evaluated_get(depsgraph)
    m = e.to_mesh()
    verts = [o.matrix_world @ v.co for v in m.vertices]
    return e, m, verts

def triangles(o, max_verts):
    # World-space triangles of the evaluated mesh, decimated with a temporary object when it is too dense.
    e = o.evaluated_get(depsgraph)
    me = bpy.data.meshes.new_from_object(e)
    me.transform(o.matrix_world)
    tmp = bpy.data.objects.new('tmp', me)
    bpy.context.scene.collection.objects.link(tmp)
    if len(me.vertices) > max_verts:
        mod = tmp.modifiers.new('d', 'DECIMATE')
        mod.ratio = max_verts / len(me.vertices)
    bpy.context.view_layer.update()
    ev = tmp.evaluated_get(bpy.context.evaluated_depsgraph_get())
    out = bpy.data.meshes.new_from_object(ev)
    out.calc_loop_triangles()
    pos = [round(c, 5) for v in out.vertices for c in v.co]
    idx = [i for t in out.loop_triangles for i in t.vertices]
    bpy.data.objects.remove(tmp); bpy.data.meshes.remove(me); bpy.data.meshes.remove(out)
    return pos, idx

def bounds(verts):
    return [[min(v[i] for v in verts) for i in range(3)], [max(v[i] for v in verts) for i in range(3)]]

objs = [o for o in bpy.data.objects if o.type == 'MESH']
landmarks, bones, attachments, lymph, skipped = [], [], [], [], []
for o in objs:
    col = top(o)
    n = len(o.data.vertices)
    if col.startswith('1:') and n == 2 and o.name.endswith('.j'):
        e, m, verts = evaluated(o)
        landmarks.append({'name': clean(o.name[:-2]), 'raw': o.name, 'collection': [c.name for c in o.users_collection][:3], 'hooks': [md.object.name for md in o.modifiers if md.type == 'HOOK' and md.object], 'v': [[round(c, 6) for c in v] for v in verts]})
        e.to_mesh_clear()
    elif col.startswith('1:') and n > 2 and not o.name.endswith(('.j', '.i', '.g')):
        e, m, verts = evaluated(o)
        b = bounds(verts)
        e.to_mesh_clear()
        pos, idx = triangles(o, BONE_MAX_VERTS)
        bones.append({'name': o.name, 'verts': n, 'min': b[0], 'max': b[1], 'pos': pos, 'idx': idx})
    elif col.startswith('2:'):
        mt = re.match(r'^(.*)\.([oe])(\d*)([lr])$', o.name)
        if not mt: skipped.append(o.name); continue
        pos, idx = triangles(o, ATTACH_MAX_VERTS)
        attachments.append({'raw': o.name, 'muscle': clean(mt.group(1)), 'kind': 'origin' if mt.group(2) == 'o' else 'insertion', 'index': mt.group(3), 'side': mt.group(4), 'parent': o.parent.name if o.parent else '', 'pos': pos, 'idx': idx})
    elif col.startswith('6:') and n > 2 and not o.name.endswith(('.j', '.g')):
        pos, idx = triangles(o, LYMPH_MAX_VERTS)
        lymph.append({'raw': o.name, 'name': clean(re.sub(r'\.[lr]$', '', o.name)), 'side': o.name[-1] if re.search(r'\.[lr]$', o.name) else '', 'pos': pos, 'idx': idx})

for name, data in (('landmarks', landmarks), ('bones', bones), ('attachments', attachments), ('lymph', lymph)):
    with open(os.path.join(OUT, name + '.json'), 'w') as f: json.dump(data, f, separators=(',', ':'))
print('EXTRACT', {'landmarks': len(landmarks), 'bones': len(bones), 'attachments': len(attachments), 'lymph': len(lymph), 'attachments_skipped': skipped[:10], 'skipped_n': len(skipped)})
