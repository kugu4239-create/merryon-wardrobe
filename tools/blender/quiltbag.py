import bpy, bmesh, math, mathutils
bpy.ops.wm.read_factory_settings(use_empty=True); sc=bpy.context.scene
def mat_leather(name,rgb):
    m=bpy.data.materials.new(name); m.use_nodes=True; b=m.node_tree.nodes.get("Principled BSDF")
    b.inputs['Base Color'].default_value=(rgb[0],rgb[1],rgb[2],1); b.inputs['Roughness'].default_value=0.32
    if 'Specular IOR Level' in b.inputs: b.inputs['Specular IOR Level'].default_value=0.6
    if 'Coat Weight' in b.inputs: b.inputs['Coat Weight'].default_value=0.3
    return m
GOLD=bpy.data.materials.new("Gold"); GOLD.use_nodes=True
gb=GOLD.node_tree.nodes.get("Principled BSDF"); gb.inputs["Base Color"].default_value=(0.85,0.69,0.40,1); gb.inputs["Metallic"].default_value=1; gb.inputs["Roughness"].default_value=0.25
BLACK=mat_leather("blk",(0.02,0.02,0.025))
allobj=[]

# ---- 퀼팅 박스 바디 (다이아몬드 딤플) ----
W,Hh,D=0.30,0.20,0.10
nx,ny,nz=20,14,8
bm=bmesh.new()
# 박스 생성 후 면별 다이아몬드 딤플
bmesh.ops.create_cube(bm, size=1.0)
for v in bm.verts: v.co.x*=W/2; v.co.y*=D/2; v.co.z*=Hh/2
# subdivide
bmesh.ops.subdivide_edges(bm, edges=bm.edges, cuts=6, use_grid_fill=True)
# 다이아몬드 딤플: 앞/뒤 면(y=±D/2)
for v in bm.verts:
    if abs(abs(v.co.y)-D/2)<1e-4:
        u=v.co.x/ (W/2); w2=v.co.z/(Hh/2)
        # 다이아몬드 격자 딤플
        du=math.sin((u*3.5+w2*3.5)*math.pi); dv=math.sin((u*3.5-w2*3.5)*math.pi)
        d=(du*dv)
        v.co.y += (1 if v.co.y>0 else -1)*(-0.006*d)
me=bpy.data.meshes.new("bag"); bm.to_mesh(me); bm.free()
body=bpy.data.objects.new("bag",me); sc.collection.objects.link(body)
bev=body.modifiers.new("b","BEVEL"); bev.width=0.012; bev.segments=2
body.modifiers.new("s","SUBSURF").levels=1
bpy.context.view_layer.objects.active=body; bpy.ops.object.shade_smooth(); body.data.materials.append(BLACK); allobj.append(body)

# ---- 플랩 ----
bpy.ops.mesh.primitive_cube_add(size=1); fl=bpy.context.active_object
fl.scale=(W/2+0.004, D/2+0.006, 0.055); fl.location=(0,0,Hh/2-0.03)
bpy.ops.object.transform_apply(scale=True)
fl.modifiers.new("b","BEVEL").width=0.012; fl.modifiers.new("s","SUBSURF").levels=1
bpy.ops.object.shade_smooth(); fl.data.materials.append(BLACK); allobj.append(fl)

# ---- CC 턴락 클래스프 (골드) ----
bpy.ops.mesh.primitive_cylinder_add(radius=0.022, depth=0.012, location=(0,D/2+0.004,0.0)); c1=bpy.context.active_object
c1.rotation_euler=(math.radians(90),0,0); c1.data.materials.append(GOLD); allobj.append(c1)
bpy.ops.mesh.primitive_torus_add(major_radius=0.016, minor_radius=0.004, location=(0,D/2+0.01,0.0), major_segments=20, minor_segments=8); c2=bpy.context.active_object
c2.rotation_euler=(math.radians(90),0,0); c2.data.materials.append(GOLD); allobj.append(c2)

# ---- 골드 체인 손잡이 (깔끔한 튜브 아치) — 끝을 본체 안으로 박아 연결 ----
cur=bpy.data.curves.new("handle","CURVE"); cur.dimensions='3D'; sp=cur.splines.new('NURBS'); sp.points.add(4)
hx=W/2-0.07
zlow=Hh/2-0.05   # 본체 윗부분 안으로 들어가는 부착점
pts=[(-hx,0,zlow),(-hx*0.65,0,Hh/2+0.05),(0,0,Hh/2+0.075),(hx*0.65,0,Hh/2+0.05),(hx,0,zlow)]
for i,p in enumerate(pts): sp.points[i].co=(p[0],p[1],p[2],1)
sp.use_endpoint_u=True; sp.order_u=3; cur.bevel_depth=0.006; cur.bevel_resolution=3
ho=bpy.data.objects.new("handle",cur); sc.collection.objects.link(ho); ho.data.materials.append(GOLD); allobj.append(ho)
# 부착 고리(D링) — 본체 윗면에서 손잡이가 걸리는 연결부
for sgn in (-1,1):
    bpy.ops.mesh.primitive_torus_add(major_radius=0.013, minor_radius=0.0045, location=(sgn*hx,0,Hh/2-0.02), major_segments=14, minor_segments=7)
    o=bpy.context.active_object; o.rotation_euler=(math.radians(90),0,0); o.data.materials.append(GOLD); allobj.append(o)

sc.render.engine='CYCLES'; sc.cycles.samples=8; sc.cycles.device='CPU'
bpy.ops.object.select_all(action='DESELECT')
for o in allobj: o.select_set(True)
bpy.context.view_layer.objects.active=allobj[0]
bpy.ops.export_scene.gltf(filepath='/tmp/pw/bag.glb', use_selection=True, export_apply=True); print("EXPORTED")
