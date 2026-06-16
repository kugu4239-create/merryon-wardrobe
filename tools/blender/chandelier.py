import bpy, math, random, mathutils
from mathutils import Vector
random.seed(7)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def mat(name, rgb, rough=0.5, metal=0.0, emit=None, transmission=0.0, ior=1.45):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs['Base Color'].default_value = (rgb[0], rgb[1], rgb[2], 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if 'Transmission Weight' in b.inputs: b.inputs['Transmission Weight'].default_value = transmission
    if 'IOR' in b.inputs: b.inputs['IOR'].default_value = ior
    if emit is not None:
        if 'Emission Color' in b.inputs: b.inputs['Emission Color'].default_value = (emit[0], emit[1], emit[2], 1)
        if 'Emission Strength' in b.inputs: b.inputs['Emission Strength'].default_value = emit[3]
    return m

GOLD = mat("gold", (0.86, 0.66, 0.34), 0.22, 1.0)
CRYS = mat("crystal", (0.92, 0.95, 1.0), 0.02, 0.0, transmission=1.0, ior=1.48)
BULB = mat("bulb", (1.0, 0.82, 0.52), 0.3, 0.0, emit=(1.0, 0.78, 0.45, 14.0))
allobj = []; A = allobj.append

def addmat(o, m): o.data.materials.append(m); A(o); return o

# --- 중앙 골드 구 ---
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.10, location=(0, 0, 0))
c = bpy.context.active_object; bpy.ops.object.shade_smooth(); addmat(c, GOLD)

# --- 상단 스템 + 캐노피 ---
bpy.ops.mesh.primitive_cylinder_add(radius=0.018, depth=0.95, location=(0, 0, 0.55)); addmat(bpy.context.active_object, GOLD)
bpy.ops.mesh.primitive_cylinder_add(radius=0.09, depth=0.04, location=(0, 0, 1.03)); addmat(bpy.context.active_object, GOLD)

def rod(dvec, length, loc0, r0=0.006, r1=0.0035):
    mid = loc0 + dvec * (length / 2.0)
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=r0, radius2=r1, depth=length, location=mid)
    o = bpy.context.active_object
    o.rotation_euler = dvec.to_track_quat('Z', 'Y').to_euler()
    bpy.ops.object.shade_smooth(); addmat(o, GOLD)
    return loc0 + dvec * length

# --- 댄들리온 방사 가지(피보나치 구) ---
N = 64
ga = math.pi * (3 - math.sqrt(5))
ctr = Vector((0, 0, 0))
for i in range(N):
    y = 1 - (i / (N - 1)) * 2
    rad = math.sqrt(max(0.0, 1 - y * y))
    th = ga * i
    d = Vector((math.cos(th) * rad, math.sin(th) * rad, y))
    # 위쪽 반구는 짧게(스템과 안 겹치게), 아래·옆은 길게
    L = 0.40 + 0.30 * (0.5 - 0.5 * d.z) + random.uniform(-0.04, 0.06)
    tip = rod(d, L, ctr)
    r = random.random()
    if r < 0.5:
        # 크리스탈 리프(길쭉한 아이소스피어)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.028, location=tip)
        o = bpy.context.active_object
        o.scale = (0.6, 0.6, 1.5)
        o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
        bpy.ops.object.shade_flat(); addmat(o, CRYS)
    elif r < 0.8:
        # 작은 전구(따뜻한 발광)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.026, location=tip)
        bpy.ops.object.shade_smooth(); addmat(bpy.context.active_object, BULB)
    else:
        # 크리스탈 비드
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.03, location=tip)
        bpy.ops.object.shade_flat(); addmat(bpy.context.active_object, CRYS)

# --- 아래로 매달린 크리스탈 드롭 ---
for k in range(9):
    a = (k / 9.0) * math.pi * 2
    rr = 0.12 + random.uniform(0, 0.1)
    dx, dy = math.cos(a) * rr, math.sin(a) * rr
    dz = -0.35 - random.uniform(0, 0.25)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.035, location=(dx, dy, dz))
    o = bpy.context.active_object; o.scale = (0.7, 0.7, 1.6); bpy.ops.object.shade_flat(); addmat(o, CRYS)

# ================= 렌더 셋업(프리뷰) =================
# 카메라
cam_data = bpy.data.cameras.new("cam"); cam = bpy.data.objects.new("cam", cam_data)
sc.collection.objects.link(cam); sc.camera = cam
cam.location = (2.4, -2.6, 0.2); cam.data.lens = 70
cam.rotation_euler = (math.radians(86), 0, math.radians(43))
# 라이트
ld = bpy.data.lights.new("key", 'AREA'); ld.energy = 240; ld.size = 3
lo = bpy.data.objects.new("key", ld); lo.location = (2.5, -3, 2.5); sc.collection.objects.link(lo)
lo.rotation_euler = (math.radians(45), 0, math.radians(35))
ld2 = bpy.data.lights.new("fill", 'AREA'); ld2.energy = 90; ld2.size = 4
lo2 = bpy.data.objects.new("fill", ld2); lo2.location = (-3, -1.5, 0.5); sc.collection.objects.link(lo2)
# 배경(은은한 웜 그레이)
sc.world = bpy.data.worlds.new("w"); sc.world.use_nodes = True
bg = sc.world.node_tree.nodes.get("Background"); bg.inputs[0].default_value = (0.16, 0.15, 0.14, 1); bg.inputs[1].default_value = 0.6
# 배경 평면(벽 느낌)
bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 3.2, 0)); wall = bpy.context.active_object
wall.rotation_euler = (math.radians(90), 0, 0); addmat(wall, mat("wall", (0.78, 0.73, 0.66), 0.7))

sc.render.engine = 'CYCLES'; sc.cycles.samples = 96; sc.cycles.device = 'CPU'
sc.cycles.use_denoising = True
sc.render.resolution_x = 620; sc.render.resolution_y = 760
sc.render.film_transparent = False
sc.view_settings.view_transform = 'Filmic'
sc.render.filepath = '/tmp/pw/chandelier_preview.png'
bpy.ops.render.render(write_still=True)

# GLB 내보내기(컨펌 후 사용 대비) — 가지/구 등만(카메라/라이트 제외)
bpy.ops.object.select_all(action='DESELECT')
for o in allobj: o.select_set(True)
bpy.context.view_layer.objects.active = allobj[0]
bpy.ops.export_scene.gltf(filepath='/tmp/pw/chandelier.glb', use_selection=True, export_apply=True)
print("DONE")
