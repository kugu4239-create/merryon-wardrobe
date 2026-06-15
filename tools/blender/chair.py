import bpy, bmesh, math, mathutils
bpy.ops.wm.read_factory_settings(use_empty=True); sc=bpy.context.scene
def mat(name,rgb,rough=0.5,metal=0.0):
    m=bpy.data.materials.new(name); m.use_nodes=True; b=m.node_tree.nodes.get("Principled BSDF")
    b.inputs['Base Color'].default_value=(rgb[0],rgb[1],rgb[2],1); b.inputs['Roughness'].default_value=rough; b.inputs['Metallic'].default_value=metal
    return m
WOOD=mat("wood",(0.93,0.90,0.83),0.45)          # 크림 페인티드 우드
VELV=mat("velv",(0.80,0.75,0.68),0.8)            # 베이지 벨벳 시트
GOLD=mat("gold",(0.85,0.69,0.40),0.25,1.0)
allobj=[]
def add(o): allobj.append(o); return o

SH=0.45; SW=0.50; SD=0.46
SEAT_T=0.028   # 좌석 프레임 반두께(얇은 구조판)
# ---- 시트: 얇은 좌석 프레임 + 그 위에 도톰하고 푹신한 쿠션(엉덩이 자리) ----
bpy.ops.mesh.primitive_cube_add(size=1); fr=bpy.context.active_object
fr.scale=(SW/2, SD/2, SEAT_T); fr.location=(0,0,SH); bpy.ops.object.transform_apply(scale=True)
_bv=fr.modifiers.new("b","BEVEL"); _bv.width=0.014; _bv.segments=2
bpy.ops.object.shade_smooth(); fr.data.materials.append(WOOD); add(fr)
# 푹신한 좌석 쿠션 — 도톰한 라운드 필로우(가장자리 둥글게 + 윗면 살짝 돔)
cuZ=SH+SEAT_T+0.045
bpy.ops.mesh.primitive_cube_add(size=1); cu=bpy.context.active_object
cu.scale=(SW/2-0.008, SD/2-0.008, 0.05); cu.location=(0,0,cuZ); bpy.ops.object.transform_apply(scale=True)
_cb=cu.modifiers.new("b","BEVEL"); _cb.width=0.05; _cb.segments=4; cu.modifiers.new("s","SUBSURF").levels=2
bpy.ops.object.shade_smooth(); cu.data.materials.append(VELV); add(cu)
# 시트 파이핑(쿠션 둘레 웰트) — 프렌치 디테일
bpy.ops.mesh.primitive_torus_add(major_radius=SW/2-0.03, minor_radius=0.011, location=(0,0,cuZ-0.025), major_segments=40, minor_segments=10)
pip=bpy.context.active_object; pip.scale=(1.0, (SD-0.06)/(SW-0.06), 1.0)
bpy.ops.object.shade_smooth(); pip.data.materials.append(VELV); add(pip)
# 가운데 버튼 텁(단정한 1점)
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.013, location=(0,0,cuZ+0.028)); bt=bpy.context.active_object
bt.scale=(1,1,0.5); bpy.ops.object.shade_smooth(); bt.data.materials.append(WOOD); add(bt)

# ---- 다리 4개: 수직 테이퍼 — 좌석판 코너 아래, 윗끝을 좌석판 속으로 확실히 박음 ----
legTopZ=SH+SEAT_T-0.005   # 좌석판 윗면 근처까지(완전 관통 결합)
def leg(x,y):
    # 곧은 수직 다리(테이퍼 최소) — 받침이 똑바로 보이게
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.024, depth=legTopZ, location=(x,y,legTopZ/2))
    o=bpy.context.active_object
    bpy.ops.object.shade_smooth(); o.data.materials.append(WOOD); add(o)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.018, location=(x, y, 0.012)); f=bpy.context.active_object
    f.scale=(1,1,0.7); f.data.materials.append(GOLD); add(f)
for sx in (-1,1):
    for sy in (-1,1):
        leg(sx*(SW/2-0.05), sy*(SD/2-0.05))

# ---- 등받이: 카브드 오벌 프레임 + 업홀스터 패드 + 크레스트 ----
bz=SH+0.34; bd=-SD/2+0.04
bpy.ops.mesh.primitive_torus_add(major_radius=0.16, minor_radius=0.018, location=(0,bd,bz), major_segments=32, minor_segments=10)
ring=bpy.context.active_object; ring.scale=(1.0,1.0,1.25); ring.rotation_euler=(math.radians(90),0,0)
bpy.ops.object.shade_smooth(); ring.data.materials.append(WOOD); add(ring)
# 패드(오벌 안)
bpy.ops.mesh.primitive_cylinder_add(radius=0.15, depth=0.05, location=(0,bd+0.01,bz)); pad=bpy.context.active_object
pad.scale=(1.0,1.0,1.22); pad.rotation_euler=(math.radians(90),0,0); pad.modifiers.new("s","SUBSURF").levels=2
bpy.ops.object.shade_smooth(); pad.data.materials.append(VELV); add(pad)
# 상단 크레스트(카브드 장식)
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.04, location=(0,bd,bz+0.22)); cr=bpy.context.active_object
cr.scale=(1.5,0.6,0.7); bpy.ops.object.shade_smooth(); cr.data.materials.append(WOOD); add(cr)
# 등받이 연결 기둥
for sx in (-1,1):
    bpy.ops.mesh.primitive_cylinder_add(radius=0.016, depth=0.3, location=(sx*0.12, bd, SH+0.16)); p=bpy.context.active_object
    p.data.materials.append(WOOD); add(p)

sc.render.engine='CYCLES'; sc.cycles.samples=8; sc.cycles.device='CPU'
bpy.ops.object.select_all(action='DESELECT')
for o in allobj: o.select_set(True)
bpy.context.view_layer.objects.active=allobj[0]
bpy.ops.export_scene.gltf(filepath='/tmp/pw/chair.glb', use_selection=True, export_apply=True); print("EXPORTED")
