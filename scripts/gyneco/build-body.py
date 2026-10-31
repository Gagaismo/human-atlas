# Builds the rigged female body of the gynecology self-exam demo from the MakeHuman / MPFB2 assets (CC0).
#
# blender -b --factory-startup --disable-autoexec --python-exit-code 1 -P scripts/gyneco/build-body.py -- \
#   --mpfb <dir with data/3dobjs, data/rigs/standard, data/targets from mpfb2 v2.0.18> --out public/models/gyneco [--cup 0.5]
#
# Inputs (src/mpfb/data of https://github.com/makehumancommunity/mpfb2 at tag v2.0.18, assets licensed CC0 1.0):
#   3dobjs/base.obj                      the MakeHuman base mesh (body + helper groups; joint cubes give the bone positions)
#   rigs/standard/rig.game_engine.json   one bone per limb segment plus fingers (upperarm_l, lowerarm_l, hand_l, middle_01_l...)
#   rigs/standard/weights.game_engine.json
#   targets/macrodetails/*-female-young.target.gz, targets/breast/*.target.gz, targets/torso/*.target.gz (vertex offsets)
# Output: body.glb.gz (skinned mesh + armature, glTF y up, +z front, meters, feet on y = 0, aligned to the HRA female frame
# used by app/gyneco: left breast at +x, sternum front at z = 0.104 at y = 1.3 so the HRA breast structures sit under the
# skin) and body.json (license, source, transform, bone tails, landmarks, byte size).
import bpy, gzip, json, os, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
args = dict(zip(argv[::2], argv[1::2]))
MPFB, OUT = args['--mpfb'], args['--out']
CUP = float(args.get('--cup', '0.5'))
os.makedirs(OUT, exist_ok=True)

HEIGHT = 1.72              # HRA female skin height (m)
STERNUM_Z, STERNUM_Y = 0.104, 1.3  # HRA skin at the midline, mid-chest (scripts/gyneco/validate.mjs re-measures it)
BODY_VERTICES = 13380      # MakeHuman base mesh: vertices 0..13379 are the body, the rest are helpers
KEEP_GROUPS = ('body', 'helper-l-eye', 'helper-r-eye')
SOURCE = {
    'name': 'MakeHuman base mesh, game-engine rig and targets, via MPFB2 v2.0.18',
    'url': 'https://github.com/makehumancommunity/mpfb2/tree/v2.0.18/src/mpfb/data',
    'license': 'CC0 1.0 Universal',
    'licenseUrl': 'https://github.com/makehumancommunity/mpfb2/blob/v2.0.18/LICENSE.md',
    'licenseQuote': 'The assets are defined as any data contributing to the output from MPFB. This includes: The base mesh and proxies, Targets and modifiers, Textures, Clothes (any MHCLO-based asset), Rigs, poses and expressions, JSON data with mesh information. These assets have been released under CC0 1.0 Universal.',
    'files': ['data/3dobjs/base.obj', 'data/rigs/standard/rig.game_engine.json', 'data/rigs/standard/weights.game_engine.json'],
}
# Macro shape: young female, the three MakeHuman ethnic targets mixed equally (the MakeHuman default), a touch heavier
# and wider like the Visible Human Female, the cup chosen so the HRA breast structures stay inside the skin.
TARGETS = [('macrodetails/caucasian-female-young', 1 / 3), ('macrodetails/african-female-young', 1 / 3), ('macrodetails/asian-female-young', 1 / 3),
           ('macrodetails/universal-female-young-averagemuscle-maxweight', 0.3), ('torso/torso-scale-horiz-incr', 0.3),
           ('breast/female-young-averagemuscle-averageweight-maxcup-averagefirmness', CUP)]

# 1. Base mesh and helper groups (joint cubes), then the targets. The factory scene (cube, camera, light) goes first.
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
V, groups, group = [], {}, None
with open(os.path.join(MPFB, 'data/3dobjs/base.obj'), encoding='utf-8') as f:
    for line in f:
        if line.startswith('v '):
            V.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('g '):
            group = line.split()[1]; groups.setdefault(group, [])
        elif line.startswith('f '):
            groups[group].append([int(p.split('/')[0]) - 1 for p in line.split()[1:]])
assert len(V) == 19158 and max(i for face in groups['body'] for i in face) == BODY_VERTICES - 1, 'unexpected base.obj'
for name, weight in TARGETS:
    path = os.path.join(MPFB, 'data/targets', name + '.target.gz')
    SOURCE['files'].append('data/targets/' + name + '.target.gz')
    with gzip.open(path, 'rt', encoding='utf-8') as f:
        for line in f:
            p = line.split()
            if len(p) == 4:
                i = int(p[0]); V[i][0] += float(p[1]) * weight; V[i][1] += float(p[2]) * weight; V[i][2] += float(p[3]) * weight

# 2. Frame: MakeHuman is in decimeters, y up, +z front, left at +x. Scale to the HRA height, feet on the ground, and shift z so
# the sternum front matches the HRA skin. Blender is z up with the front at -y; the glTF exporter turns that into y up, +z front.
body = V[:BODY_VERTICES]
floor = min(v[1] for v in body); scale = HEIGHT / (max(v[1] for v in body) - floor)
sternum = max(v[2] for v in body if abs(v[0] * scale) < .025 and abs((v[1] - floor) * scale - STERNUM_Y) < .01)
shift_z = STERNUM_Z - sternum * scale
def to_gltf(v): return (v[0] * scale, (v[1] - floor) * scale, v[2] * scale + shift_z)
def to_blender(v): g = to_gltf(v); return Vector((g[0], -g[2], g[1]))
def gltf_of(b): return [round(b.x, 5), round(b.z, 5), round(-b.y, 5)]

# 3. Mesh: body and eyeballs, quads kept (the glTF exporter triangulates), smooth shading, one level of Catmull-Clark.
used = sorted({i for g in KEEP_GROUPS for face in groups[g] for i in face})
remap = {i: n for n, i in enumerate(used)}
faces = [[remap[i] for i in face] for g in KEEP_GROUPS for face in groups[g]]
mesh = bpy.data.meshes.new('Body'); mesh.from_pydata([to_blender(V[i]) for i in used], [], faces)
for p in mesh.polygons: p.use_smooth = True
mesh.validate(); mesh.update()
obj = bpy.data.objects.new('Body', mesh); bpy.context.scene.collection.objects.link(obj)

# 4. Armature from the rig definition: joint cubes (centroid of an 8-vertex helper group) or vertex means give head and tail.
rig = json.load(open(os.path.join(MPFB, 'data/rigs/standard/rig.game_engine.json'), encoding='utf-8'))
def joint(spec):
    if spec['strategy'] == 'CUBE':
        ids = {i for face in groups[spec['cube_name']] for i in face}
    elif spec['strategy'] == 'MEAN':
        ids = set(spec['vertex_indices'])
    else:
        raise SystemExit('unsupported joint strategy ' + spec['strategy'])
    return sum((to_blender(V[i]) for i in ids), Vector()) / len(ids)
arm_data = bpy.data.armatures.new('Armature'); arm = bpy.data.objects.new('Armature', arm_data)
bpy.context.scene.collection.objects.link(arm); bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for name, spec in rig.items():
    eb = arm_data.edit_bones.new(name); eb.head = joint(spec['head']); eb.tail = joint(spec['tail']); eb.roll = spec['roll']
for name, spec in rig.items():
    if spec['parent']:
        arm_data.edit_bones[name].parent = arm_data.edit_bones[spec['parent']]; arm_data.edit_bones[name].use_connect = spec.get('use_connect', False)
tails = {name: gltf_of(eb.tail) for name, eb in arm_data.edit_bones.items()}
heads = {name: gltf_of(eb.head) for name, eb in arm_data.edit_bones.items()}
bpy.ops.object.mode_set(mode='OBJECT')

# 5. Skin weights (vertex index, weight) per bone, renormalized; every kept vertex must be weighted.
weights = json.load(open(os.path.join(MPFB, 'data/rigs/standard/weights.game_engine.json'), encoding='utf-8'))['weights']
per_vertex = {}
for bone, entries in weights.items():
    assert bone in rig, 'weights for unknown bone ' + bone
    for i, w in entries:
        if i in remap and w > 0: per_vertex.setdefault(remap[i], []).append((bone, w))
assert len(per_vertex) == len(used), f'{len(used) - len(per_vertex)} vertices without weights'
vgroups = {name: obj.vertex_groups.new(name=name) for name in rig}
for n, entries in per_vertex.items():
    total = sum(w for _, w in entries)
    for bone, w in entries: vgroups[bone].add([n], w / total, 'REPLACE')
obj.parent = arm
mod = obj.modifiers.new('Subdivision', 'SUBSURF'); mod.levels = 1; mod.render_levels = 1
with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
    bpy.ops.object.modifier_apply(modifier=mod.name)
mod = obj.modifiers.new('Armature', 'ARMATURE'); mod.object = arm
bpy.context.view_layer.update()

# 6. Landmarks in the glTF frame, for the validator and the viewer: nipples (most forward breast vertex), ears (widest head
# vertex, its z is the coronal plane the raised hand must be behind), head top, chest back and front at mid-chest.
pts = [gltf_of(obj.matrix_world @ v.co) for v in obj.data.vertices]
def nipple(sign):
    return max((p for p in pts if .05 < sign * p[0] < .18 and 1.1 < p[1] < 1.4), key=lambda p: p[2])
ear = max((p for p in pts if p[1] > 1.5), key=lambda p: p[0])
mid = [p for p in pts if abs(p[0]) < .03 and abs(p[1] - STERNUM_Y) < .01]
landmarks = {'height': round(max(p[1] for p in pts), 4), 'nipple': {'l': nipple(1), 'r': nipple(-1)}, 'ear': ear,
             'headTop': tails['head'], 'chestBackZ': round(min(p[2] for p in mid), 4), 'chestFrontZ': round(max(p[2] for p in mid), 4),
             'backZ': round(min(p[2] for p in pts if .8 < p[1] < 1.6 and abs(p[0]) < .2), 4),
             'shoulder': {'l': heads['upperarm_l'], 'r': heads['upperarm_r']}}

# 7. Export: skinned mesh and armature, no materials or animation (the viewer colors the skin), then keep only the gzip.
glb = os.path.join(OUT, 'body.glb')
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_skins=True, export_animations=False, export_def_bones=False,
                          export_yup=True, export_apply=False, export_materials='NONE', export_texcoords=False, export_vertex_color='NONE',
                          export_morph=False, export_cameras=False, export_lights=False)
raw = open(glb, 'rb').read()
with gzip.open(glb + '.gz', 'wb', compresslevel=9) as g: g.write(raw)
os.remove(glb)
meta = {'model': 'body.glb.gz', 'modelBytes': len(raw), 'gzipBytes': os.path.getsize(glb + '.gz'), 'source': SOURCE,
        'targets': [{'target': t, 'weight': round(w, 4)} for t, w in TARGETS],
        'frame': 'glTF: meters, y up, +z front, left at +x, feet on y = 0; aligned to the HRA female (chest axis x = 0, z = 0)',
        'transform': {'scale': round(scale, 6), 'floor': round(floor, 5), 'shiftZ': round(shift_z, 5), 'note': 'gltf = (x, y - floor, z) * scale + (0, 0, shiftZ), applied to the MakeHuman decimeter frame'},
        'mesh': 'Body', 'vertices': len(obj.data.vertices), 'faces': len(obj.data.polygons),
        'bones': sorted(rig.keys()), 'heads': heads, 'tails': tails, 'landmarks': landmarks}
json.dump(meta, open(os.path.join(OUT, 'body.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f"body: {len(obj.data.vertices)} vertices, {len(obj.data.polygons)} faces, {len(rig)} bones, glb {len(raw)} bytes, gz {meta['gzipBytes']} bytes")
print('landmarks', json.dumps(landmarks))
