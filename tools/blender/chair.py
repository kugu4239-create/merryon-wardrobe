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

SH=0.46; SW=0.44; SD=0.42
# ---- 시트 프레임 + 쿠션 ----
bpy.ops.mesh.primitive_cube_add(size=1); fr=bpy.context.active_object
fr.scale=(SW/2, SD/2, 0.04); fr.location=(0,0,SH); bpy.ops.object.transform_apply(scale=True)
fr.modifiers.new("b","BEVEL").width=0.012; bpy.ops.object.shade_smooth(); fr.data.materials.append(WOOD); add(fr)
bpy.ops.mesh.primitive_cube_add(size=1); cu=bpy.context.active_object
cu.scale=(SW/2-0.03, SD/2-0.03, 0.035); cu.location=(0,0,SH+0.055); bpy.ops.object.transform_apply(scale=True)
cu.modifiers.new("b","BEVEL").width=0.02; cu.modifiers.new("s","SUBSURF").levels=2; bpy.ops.object.shade_smooth(); cu.data.materials.append(VELV); add(cu)

# ---- 카브리올(휜) 다리 ----
def cabriole(x,y,mx,my):
    # 단정한 테이퍼 다리(위 굵고 아래 가늘게) + 바깥 살짝 스플레이
    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.028, radius2=0.016, depth=SH, location=(x,y,SH/2))
    o=bpy.context.active_object; o.rotation_euler=(my*0.06, 0, -mx*0.06)
    bpy.ops.object.shade_smooth(); o.data.materials.append(WOOD); add(o)
    # 골드 페럴(발끝)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.016, location=(x, y, 0.014)); f=bpy.context.active_object
    f.data.materials.append(GOLD); add(f)
for sx in (-1,1):
    for sy in (-1,1):
        cabriole(sx*(SW/2-0.06), sy*(SD/2-0.06), sx, sy)

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
