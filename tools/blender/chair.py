import bpy, math
bpy.ops.wm.read_factory_settings(use_empty=True); sc=bpy.context.scene
def mat(name,rgb,rough=0.5,metal=0.0):
    m=bpy.data.materials.new(name); m.use_nodes=True; b=m.node_tree.nodes.get("Principled BSDF")
    b.inputs['Base Color'].default_value=(rgb[0],rgb[1],rgb[2],1); b.inputs['Roughness'].default_value=rough; b.inputs['Metallic'].default_value=metal
    return m
WOOD=mat("wood",(0.93,0.90,0.83),0.45)        # 크림 페인티드 우드
VELV=mat("velv",(0.82,0.76,0.70),0.85)        # 베이지 벨벳
GOLD=mat("gold",(0.85,0.69,0.40),0.3,1.0)
allobj=[]; A=allobj.append
def cyl(r1,r2,depth,loc,m,verts=24):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth, location=loc)
    o=bpy.context.active_object; bpy.ops.object.shade_smooth(); o.data.materials.append(m); A(o); return o

SH=0.45; SR=0.225   # 좌석 높이 / 반경(라운드 좌석)
# 좌석 프레임(라운드 나무)
seat=cyl(SR,SR,0.05,(0,0,SH),WOOD,32); b=seat.modifiers.new("b","BEVEL"); b.width=0.012; b.segments=2
# 에이프런(좌석 아래 림 — 다리·좌석 연결)
cyl(SR-0.012,SR-0.025,0.06,(0,0,SH-0.055),WOOD,32)
# 푹신한 쿠션(라운드)
cush=cyl(SR-0.03,SR-0.05,0.045,(0,0,SH+0.05),VELV,32)
cb=cush.modifiers.new("b","BEVEL"); cb.width=0.03; cb.segments=3; cush.modifiers.new("s","SUBSURF").levels=2
# 시트 파이핑(웰트)
bpy.ops.mesh.primitive_torus_add(major_radius=SR-0.045, minor_radius=0.01, location=(0,0,SH+0.04), major_segments=40, minor_segments=10)
pip=bpy.context.active_object; bpy.ops.object.shade_smooth(); pip.data.materials.append(VELV); A(pip)

# 다리 4 (수직 테이퍼, 좌석 림 안쪽 바로 아래 — 확실히 연결)
legTop=SH+0.01
for k in range(4):
    a=math.pi/4 + k*math.pi/2
    lx=math.cos(a)*(SR-0.045); ly=math.sin(a)*(SR-0.045)
    cyl(0.024,0.014,legTop,(lx,ly,legTop/2),WOOD,14)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.016, location=(lx,ly,0.013)); f=bpy.context.active_object
    f.scale=(1,1,0.7); f.data.materials.append(GOLD); A(f)

# 등받이: 연결 포스트 + 오벌 프레임 + 패드 + 크레스트
bd=-SR+0.06; bz=SH+0.38
for sx in (-1,1):
    cyl(0.016,0.014,0.34,(sx*0.115, bd, SH+0.17),WOOD,10)
bpy.ops.mesh.primitive_torus_add(major_radius=0.155, minor_radius=0.018, location=(0,bd,bz), major_segments=32, minor_segments=10)
ring=bpy.context.active_object; ring.scale=(1,1,1.25); ring.rotation_euler=(math.radians(90),0,0); bpy.ops.object.shade_smooth(); ring.data.materials.append(WOOD); A(ring)
bpy.ops.mesh.primitive_cylinder_add(radius=0.145, depth=0.045, location=(0,bd+0.012,bz)); pad=bpy.context.active_object
pad.scale=(1,1,1.22); pad.rotation_euler=(math.radians(90),0,0); pad.modifiers.new("s","SUBSURF").levels=2; bpy.ops.object.shade_smooth(); pad.data.materials.append(VELV); A(pad)
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.038, location=(0,bd,bz+0.21)); cr=bpy.context.active_object
cr.scale=(1.6,0.6,0.7); bpy.ops.object.shade_smooth(); cr.data.materials.append(WOOD); A(cr)


sc.render.engine='CYCLES'
bpy.ops.object.select_all(action='DESELECT')
for o in allobj: o.select_set(True)
bpy.context.view_layer.objects.active=allobj[0]
bpy.ops.object.join()
bpy.ops.export_scene.gltf(filepath='/tmp/pw/chair.glb', use_selection=True, export_apply=True); print("EXPORTED")
