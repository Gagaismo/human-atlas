# Inspect a .blend: armatures, bone hierarchy, object types and name samples. Usage: blender -b --factory-startup --disable-autoexec FILE -P inspect.py -- OUT.json
import bpy, sys, json, collections
out = sys.argv[sys.argv.index('--') + 1]
res = {'objects': collections.Counter(o.type for o in bpy.data.objects), 'armatures': {}, 'meshes': [], 'empties': [], 'collections': [c.name for c in bpy.data.collections][:400]}
res['objects'] = dict(res['objects'])
for o in bpy.data.objects:
    if o.type == 'ARMATURE':
        bones = [{'name': b.name, 'parent': b.parent.name if b.parent else None, 'head': list(o.matrix_world @ b.head_local), 'tail': list(o.matrix_world @ b.tail_local), 'deform': b.use_deform} for b in o.data.bones]
        res['armatures'][o.name] = {'data': o.data.name, 'bones': bones, 'children': len(o.children)}
    elif o.type == 'MESH':
        bb = [o.matrix_world @ __import__('mathutils').Vector(c) for c in o.bound_box]
        res['meshes'].append({'name': o.name, 'verts': len(o.data.vertices), 'parent': o.parent.name if o.parent else None, 'parent_bone': o.parent_bone, 'parent_type': o.parent_type, 'mods': [m.type + ':' + (getattr(m, 'object', None).name if getattr(m, 'object', None) else '') for m in o.modifiers], 'groups': len(o.vertex_groups), 'min': [min(v[i] for v in bb) for i in range(3)], 'max': [max(v[i] for v in bb) for i in range(3)], 'cols': [c.name for c in o.users_collection]})
    elif o.type == 'EMPTY':
        res['empties'].append({'name': o.name, 'parent': o.parent.name if o.parent else None, 'parent_bone': o.parent_bone, 'loc': list(o.matrix_world.translation)})
json.dump(res, open(out, 'w'), indent=0)
print('OK', res['objects'])
