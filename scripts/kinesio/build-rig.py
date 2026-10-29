# Builds the rigged lower-limb model for the kinesiology mode.
#
# blender -b --factory-startup --disable-autoexec <Z-Biomechanics/Startup.blend> --python-exit-code 1 \
#   -P scripts/kinesio/build-rig.py -- --anatomy <Z-Anatomy/Startup.blend> --out public/models/kinesio
#
# Z-Biomechanics provides the armature and the skeleton meshes rigidly parented to its bones. Z-Anatomy
# provides the muscle bellies (`<name>.l|r`) and their origin/insertion patches (`<name>.ol|or|el|er`).
# Both derive from BodyParts3D and share the rest-pose frame. Output: lower-limb.glb.gz and lower-limb.json.
import bpy, gzip, json, math, os, re, sys
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
args = dict(zip(argv[::2], argv[1::2]))
ANATOMY, OUT = args['--anatomy'], args['--out']
os.makedirs(OUT, exist_ok=True)

# Muscle id -> (Z-Anatomy base name, origin bone, insertion bone, bones the muscle crosses, marker aliases).
# Bones are right-side Z-Biomechanics names; `side_bone` maps them to the left side.
MUSCLES = {
    'biceps_femoris_long': ('Long head of biceps femoris', 'RHipJoint', 'Tibia.r', ['RHipJoint', 'RightUpLeg', 'Tibia.r'], {'e': 'Biceps femoris muscle'}),
    'biceps_femoris_short': ('Short head of biceps femoris', 'RightUpLeg', 'Tibia.r', ['RightUpLeg', 'Tibia.r'], {'e': 'Biceps femoris muscle'}),
    'semitendinosus': ('Semitendinosus muscle', 'RHipJoint', 'Tibia.r', ['RHipJoint', 'RightUpLeg', 'Tibia.r'], {}),
    'semimembranosus': ('Semimembranosus muscle', 'RHipJoint', 'Tibia.r', ['RHipJoint', 'RightUpLeg', 'Tibia.r'], {}),
    'rectus_femoris': ('Rectus femoris muscle', 'RHipJoint', 'Tibia.r', ['RHipJoint', 'RightUpLeg', 'Tibia.r'], {'e': 'Quadriceps femoris muscle'}),
    'vastus_lateralis': ('Vastus lateralis muscle', 'RightUpLeg', 'Tibia.r', ['RightUpLeg', 'Tibia.r'], {'e': 'Quadriceps femoris muscle'}),
    'vastus_medialis': ('Vastus medialis muscle', 'RightUpLeg', 'Tibia.r', ['RightUpLeg', 'Tibia.r'], {'e': 'Quadriceps femoris muscle'}),
    'vastus_intermedius': ('Vastus intermedius muscle', 'RightUpLeg', 'Tibia.r', ['RightUpLeg', 'Tibia.r'], {'e': 'Quadriceps femoris muscle'}),
    'psoas_major': ('Psoas major', 'L1', 'RightUpLeg', ['L1', 'L2', 'L3', 'L4', 'L5', 'RHipJoint', 'RightUpLeg'], {'e': 'Iliopsoas muscle'}),
    'iliacus': ('Iliacus muscle', 'RHipJoint', 'RightUpLeg', ['RHipJoint', 'RightUpLeg'], {'e': 'Iliopsoas muscle'}),
    'gastrocnemius_medial': ('Medial head of gastrocnemius', 'RightUpLeg', 'Calcaneus.r', ['RightUpLeg', 'Tibia.r', 'Calcaneus.r'], {'e': 'Triceps surae muscle'}),
    'gastrocnemius_lateral': ('Lateral head of gastrocnemius', 'RightUpLeg', 'Calcaneus.r', ['RightUpLeg', 'Tibia.r', 'Calcaneus.r'], {'e': 'Triceps surae muscle'}),
    'soleus': ('Soleus muscle', 'Tibia.r', 'Calcaneus.r', ['Tibia.r', 'Calcaneus.r'], {'e': 'Triceps surae muscle'}),
    'adductor_longus': ('Adductor longus', 'RHipJoint', 'RightUpLeg', ['RHipJoint', 'RightUpLeg'], {}),
    'adductor_brevis': ('Adductor brevis', 'RHipJoint', 'RightUpLeg', ['RHipJoint', 'RightUpLeg'], {}),
    'adductor_magnus': ('Adductor magnus', 'RHipJoint', 'RightUpLeg', ['RHipJoint', 'RightUpLeg', 'Tibia.r'], {}),
    'gracilis': ('Gracilis muscle', 'RHipJoint', 'Tibia.r', ['RHipJoint', 'RightUpLeg', 'Tibia.r'], {}),
    'pectineus': ('Pectineus muscle', 'RHipJoint', 'RightUpLeg', ['RHipJoint', 'RightUpLeg'], {}),
}
CONTEXT = {
    'gluteus_maximus': ('Gluteus maximus muscle', 'RHipJoint', 'RightUpLeg', ['RHipJoint', 'RightUpLeg']),
    'sartorius': ('Sartorius muscle', 'RHipJoint', 'Tibia.r', ['RHipJoint', 'RightUpLeg', 'Tibia.r']),
    'tibialis_anterior': ('Tibialis anterior muscle', 'Tibia.r', 'RightFoot', ['Tibia.r', 'RightFoot']),
}
# Muscles that wrap over the front of the hip: their path goes through a via point fixed on the pelvis, taken
# as the centroid of the belly where it crosses the height of the hip joint (as musculoskeletal models do).
VIA = {'psoas_major': 'RHipJoint', 'iliacus': 'RHipJoint'}
LEFT = {'RHipJoint': 'LHipJoint', 'RightUpLeg': 'LeftUpLeg', 'RightFoot': 'LeftFoot', 'Knee-Flexion.r': 'Knee-Flexion.l'}
def side_bone(name, side):
    if side == 'r': return name
    return LEFT.get(name, name[:-2] + '.l' if name.endswith('.r') else name)

def to_gltf(v):  # Blender Z-up (front -Y) to glTF Y-up (front +Z).
    return [round(v[0], 6), round(v[2], 6), round(-v[1], 6)]

arm = bpy.data.objects['Armature']
# 1. Rest pose: drop animation, constraints and pose so the bone meshes go back to the BodyParts3D frame.
arm.animation_data_clear()
for pb in arm.pose.bones:
    for c in list(pb.constraints): pb.constraints.remove(c)
    pb.matrix_basis = Matrix.Identity(4)
arm.data.pose_position = 'POSE'
skeleton = [o for o in arm.children if o.type == 'MESH' and o.parent_type == 'BONE']
for o in list(bpy.data.objects):
    if o is not arm and o not in skeleton: bpy.data.objects.remove(o, do_unlink=True)
for o in skeleton: o.name = 'bone__' + o.name  # Frees the Z-Anatomy names for the append below.
bpy.context.view_layer.update()

def world_bounds(o):
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)])

# 2. Append muscles and their origin/insertion patches from Z-Anatomy.
wanted = set()
for base, *_ in list(MUSCLES.values()) + list(CONTEXT.values()):
    for s in 'lr': wanted.add(f'{base}.{s}')
marker_re = re.compile(r'\.(o|e)\d*(l|r)$')
with bpy.data.libraries.load(ANATOMY, link=False) as (src, dst):
    names = [n for n in src.objects if n in wanted or marker_re.search(n) or n in ('Femur.r',)]
    dst.objects = names
appended = {o.name: o for o in dst.objects if o}
for o in appended.values():
    bpy.context.scene.collection.objects.link(o)
bpy.context.view_layer.update()

# The Z-Anatomy femur is only used to prove both files share the rest frame.
ref_min, ref_max = world_bounds(appended.pop('Femur.r'))
fem = next(o for o in skeleton if o.name == 'bone__Femur.r')
got_min, got_max = world_bounds(fem)
drift = max((ref_min - got_min).length, (ref_max - got_max).length)
assert drift < 0.005, f'Z-Biomechanics rest pose does not match Z-Anatomy (femur drift {drift:.4f} m)'
print(f'rest-frame check: femur drift {drift * 1000:.2f} mm')

def bake(o):  # Unparent, apply the world matrix to a private mesh copy and drop modifiers.
    mw = o.matrix_world.copy()
    o.parent = None
    o.data = o.data.copy(); o.data.transform(mw); o.matrix_world = Matrix.Identity(4)
    o.modifiers.clear()
    return o

def centroid(o):
    pts = [o.matrix_world @ v.co for v in o.data.vertices]
    return sum(pts, Vector()) / len(pts)

markers = {n: centroid(o) for n, o in appended.items() if marker_re.search(n)}
for n in list(markers): bpy.data.objects.remove(appended.pop(n), do_unlink=True)

def find_marker(base, kind, side, alias):
    # Prefer exact `<base>.<kind><side>` patches, then numbered ones, then the shared alias; match side by x sign.
    for b in (base, alias.get(kind)):
        if not b: continue
        hits = [p for n, p in markers.items() if n.startswith(b + '.') and re.fullmatch(rf'{re.escape(b)}\.{kind}\d*[lr]', n) and (p.x < 0) == (side == 'r')]
        if hits: return sum(hits, Vector()) / len(hits)
    return None

def bone_segment(name):
    b = arm.data.bones[name]
    return arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local

def seg_distance(p, a, b):
    ab = b - a; t = 0.0 if ab.length_squared == 0 else max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length

def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)

def extremes(o):  # Endpoints of the mesh along its longest bounding-box axis.
    pts = [v.co.copy() for v in o.data.vertices]
    lo, hi = Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)])
    axis = max(range(3), key=lambda i: hi[i] - lo[i])
    a, b = min(pts, key=lambda p: p[axis]), max(pts, key=lambda p: p[axis])
    return a, b

def skin(o, origin_bone, insertion_bone, bones, origin, insertion):
    # Line-of-action weights: the origin end follows the origin bone, the insertion end the insertion bone,
    # and the belly blends between every crossed bone by inverse distance to its segment.
    segs = {b: bone_segment(b) for b in bones}
    axis = insertion - origin
    for b in bones: o.vertex_groups.new(name=b)
    for v in o.data.vertices:
        p = v.co
        t = max(0.0, min(1.0, (p - origin).dot(axis) / axis.length_squared))
        idw = {b: 1.0 / max(seg_distance(p, *s), 1e-4) ** 4 for b, s in segs.items()}
        total = sum(idw.values()); w = {b: x / total for b, x in idw.items()}
        ao, ai = 1 - smoothstep(0.0, 0.25, t), smoothstep(0.75, 1.0, t)
        mix = 1 - ao - ai
        w = {b: x * mix for b, x in w.items()}
        w[origin_bone] += ao; w[insertion_bone] += ai
        top = sorted(((x, b) for b, x in w.items() if x >= 0.01), reverse=True)[:4]
        s = sum(x for x, _ in top)
        for x, b in top: o.vertex_groups[b].add([v.index], x / s, 'REPLACE')
    for v in o.data.vertices:
        ws = [(o.vertex_groups[g.group].name, g.weight) for g in v.groups]
        assert ws and all(n in bones for n, _ in ws), f'{o.name}: vertex {v.index} weighted outside {bones}'
        assert abs(sum(x for _, x in ws) - 1) < 1e-3, f'{o.name}: vertex {v.index} weights sum {sum(x for _, x in ws)}'
    o.parent = arm
    mod = o.modifiers.new('Armature', 'ARMATURE'); mod.object = arm

def decimate(o, ratio):
    m = o.modifiers.new('Decimate', 'DECIMATE'); m.ratio = ratio
    with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o]):
        bpy.ops.object.modifier_apply(modifier=m.name)

def marker_empty(name, pos, bone):
    e = bpy.data.objects.new(name, None); bpy.context.scene.collection.objects.link(e)
    e.parent = arm; e.parent_type = 'BONE'; e.parent_bone = bone
    bpy.context.view_layer.update()
    e.matrix_world = Matrix.Translation(pos)
    return e

meta_muscles, context_nodes = [], []
for group, table in (('muscle', MUSCLES), ('context', CONTEXT)):
    for mid, spec in table.items():
        base, ob, ib, bones = spec[:4]; alias = spec[4] if len(spec) > 4 else {}
        for side in 'lr':
            o = appended.get(f'{base}.{side}')
            assert o, f'missing Z-Anatomy mesh {base}.{side}'
            bake(o)
            sb = [side_bone(b, side) for b in bones]
            obone, ibone = side_bone(ob, side), side_bone(ib, side)
            origin, insertion = find_marker(base, 'o', side, alias), find_marker(base, 'e', side, alias)
            fallback = []
            if origin is None or insertion is None:
                a, b = extremes(o)
                oa = arm.matrix_world @ arm.data.bones[obone].head_local
                near, far = (a, b) if (a - oa).length < (b - oa).length else (b, a)
                if origin is None: origin = near; fallback.append('origin')
                if insertion is None: insertion = far; fallback.append('insertion')
            o.name = f'{group}__{mid}__{side}'
            if len(o.data.vertices) > 2500: decimate(o, 2500 / len(o.data.vertices))
            skin(o, obone, ibone, sb, origin, insertion)
            if group == 'context':
                context_nodes.append(o.name); continue
            on, iname = f'origin__{mid}__{side}', f'insertion__{mid}__{side}'
            marker_empty(on, origin, obone); marker_empty(iname, insertion, ibone)
            path, via = [origin], []
            if mid in VIA:
                hip_z = (arm.matrix_world @ arm.data.bones[side_bone('RightUpLeg', side)].head_local).z
                slab = [v.co for v in o.data.vertices if abs(v.co.z - hip_z) < 0.015]
                assert slab, f'{mid}:{side} does not cross the height of the hip joint'
                point = sum(slab, Vector()) / len(slab)
                via.append(f'via__{mid}__{side}'); marker_empty(via[0], point, side_bone(VIA[mid], side)); path.append(point)
            path.append(insertion)
            rest = sum((b - a).length for a, b in zip(path, path[1:]))
            meta_muscles.append({'id': mid, 'side': side, 'name': base, 'mesh': o.name, 'bones': sb, 'origin': on, 'insertion': iname,
                                 'via': via, 'restLength': round(rest, 5), 'fallback': fallback})

# 3. Skeleton: rigid bone meshes, decimated. The patella follows the tibia (patellar ligament) instead of the femur.
for o in skeleton:
    o.modifiers.clear()
    if o.data.users > 1: o.data = o.data.copy()
    n = len(o.data.vertices)
    if n > 300: decimate(o, max(0.3, 300 / n))
    if o.name.startswith('bone__Patella.'):
        mw = o.matrix_world.copy(); o.parent_bone = 'Tibia.' + o.name[-1]
        bpy.context.view_layer.update(); o.matrix_world = mw
bpy.context.view_layer.update()

# 4. Joints: pivots and anatomical axes in the glTF frame. Blender axes: X lateral(+left), Y posterior, Z up.
def joint(jid, bone, axes, limits):
    head = arm.matrix_world @ arm.data.bones[bone].head_local
    return {'id': jid, 'bone': bone, 'pivot': to_gltf(head), 'axes': {k: to_gltf(Vector(v)) for k, v in axes.items()}, 'limits': limits}
joints = [joint('pelvis', 'Hips', {}, {})]
for side, sgn in (('r', 1), ('l', -1)):
    joints.append(joint(f'hip_{side}', side_bone('RightUpLeg', side), {'flexion': (-1, 0, 0), 'abduction': (0, sgn, 0), 'rotation': (0, 0, sgn)},
                        {'flexion': [-20, 140], 'abduction': [-30, 45], 'rotation': [-60, 30]}))
    joints.append(joint(f'knee_{side}', side_bone('Knee-Flexion.r', side), {'flexion': (1, 0, 0)}, {'flexion': [0, 150]}))
    joints.append(joint(f'ankle_{side}', side_bone('RightFoot', side), {'flexion': (-1, 0, 0)}, {'flexion': [-50, 30]}))

lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
for o in bpy.context.scene.objects:
    if o.type == 'MESH':
        a, b = world_bounds(o); lo = Vector(map(min, lo, a)); hi = Vector(map(max, hi, b))
glo, ghi = to_gltf(lo), to_gltf(hi)
bounds = {'min': [min(glo[i], ghi[i]) for i in range(3)], 'max': [max(glo[i], ghi[i]) for i in range(3)]}

# 5. Export: skins, no animation or materials (the viewer colors by node name), then keep only the gzip.
glb = os.path.join(OUT, 'lower-limb.glb')
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_skins=True, export_animations=False, export_def_bones=False,
                          export_yup=True, export_apply=False, export_materials='NONE', export_texcoords=False, export_vertex_color="NONE", export_morph=False,
                          export_cameras=False, export_lights=False)
raw = open(glb, 'rb').read()
with gzip.open(glb + '.gz', 'wb', compresslevel=9) as g: g.write(raw)
os.remove(glb)  # The viewer fetches the .gz; decodeModelResponse checks the decoded size against modelBytes.
meta = {'model': 'lower-limb.glb.gz', 'modelBytes': len(raw), 'license': 'CC BY-SA 4.0 — derived from Z-Anatomy (Gauthier Kervyn et al.) and BodyParts3D (DBCLS, CC BY 4.0)',
        'joints': joints, 'muscles': meta_muscles, 'context': context_nodes, 'bounds': bounds}
json.dump(meta, open(os.path.join(OUT, 'lower-limb.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('fallbacks:', [f"{m['id']}:{m['side']}:{'/'.join(m['fallback'])}" for m in meta_muscles if m['fallback']])
print('skeleton meshes', len(skeleton), 'muscles', len(meta_muscles), 'context', len(context_nodes))
print('glb', len(raw), 'gz', os.path.getsize(glb + '.gz'))
