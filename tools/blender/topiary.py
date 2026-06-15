import bpy, bmesh, math, random, mathutils
random.seed(7)
bpy.ops.wm.read_factory_settings(use_empty=True); sc=bpy.context.scene
def mat(name,rgb,rough=0.85):
    m=bpy.data.materials.new(name); m.use_nodes=True; b=m.node_tree.nodes.get("Principled BSDF")
    b.inputs['Base Color'].default_value=(rgb[0],rgb[1],rgb[2],1); b.inputs['Roughness'].default_value=rough
    return m
CERAMIC=mat("ceramic",(0.92,0.88,0.80),0.5)
TRUNK=mat("trunk",(0.42,0.32,0.22),0.9)
LEAF=mat("leaf",(0.30,0.45,0.22),0.8)
LEAF2=mat("leaf2",(0.38,0.54,0.28),0.8)
ROSE=mat("rose",(0.78,0.32,0.42),0.6)
allobj=[]
# 화분(테이퍼 + 림)
bpy.ops.mesh.primitive_cone_add(vertices=28, radius1=0.2, radius2=0.15, depth=0.34, location=(0,0,0.17)); pot=bpy.context.active_object
bpy.ops.object.shade_smooth(); pot.data.materials.append(CERAMIC); allobj.append(pot)
bpy.ops.mesh.primitive_torus_add(major_radius=0.2, minor_radius=0.018, location=(0,0,0.34), major_segments=28, minor_segments=8); rim=bpy.context.active_object
rim.data.materials.append(CERAMIC); allobj.append(rim)
bpy.ops.mesh.primitive_cylinder_add(radius=0.022, depth=0.42, location=(0,0,0.5)); tr=bpy.context.active_object
bpy.ops.object.shade_smooth(); tr.data.materials.append(TRUNK); allobj.append(tr)

# 잎으로 덮인 구 — 작은 잎 plane 다수
def leaf_ball(cz, R, count):
    leaves=[]
    bm=bmesh.new()
    for i in range(count):
        # 구면 임의점
        u=random.uniform(0,2*math.pi); v=math.acos(random.uniform(-1,1))
        n=mathutils.Vector((math.sin(v)*math.cos(u), math.sin(v)*math.sin(u), math.cos(v)))
        p=mathutils.Vector((0,0,cz))+n*R*random.uniform(0.92,1.04)
        # 잎 plane(작은 사각) — 바깥 향하게
        sz=random.uniform(0.018,0.032)
        # 두 삼각형
        t=n.cross(mathutils.Vector((0,0,1)));
        if t.length<1e-3: t=mathutils.Vector((1,0,0))
        t.normalize(); b2=n.cross(t).normalized()
        rot=random.uniform(0,2*math.pi); tt=t*math.cos(rot)+b2*math.sin(rot); bb=t*-math.sin(rot)+b2*math.cos(rot)
        v1=bm.verts.new(p + tt*sz + bb*sz*0.5); v2=bm.verts.new(p - tt*sz + bb*sz*0.5)
        v3=bm.verts.new(p - tt*sz - bb*sz*0.5); v4=bm.verts.new(p + tt*sz - bb*sz*0.5)
        bm.faces.new([v1,v2,v3,v4])
    me=bpy.data.meshes.new("leaves"); bm.to_mesh(me); bm.free()
    o=bpy.data.objects.new("leaves",me); sc.collection.objects.link(o)
    o.data.materials.append(LEAF if random.random()<0.5 else LEAF2)
    bpy.context.view_layer.objects.active=o; bpy.ops.object.shade_flat(); allobj.append(o)
    # 베이스 구(잎 사이 빈틈 메움)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=R*0.93, location=(0,0,cz)); base=bpy.context.active_object
    bpy.ops.object.shade_smooth(); base.data.materials.append(LEAF); allobj.append(base)
    # 장미 액센트
    for r in range(5):
        u=random.uniform(0,2*math.pi); v=math.acos(random.uniform(0.1,0.9))
        n=mathutils.Vector((math.sin(v)*math.cos(u), math.sin(v)*math.sin(u), math.cos(v)))
        p=mathutils.Vector((0,0,cz))+n*R*0.98
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.022, location=p); ro=bpy.context.active_object
        bpy.ops.object.shade_smooth(); ro.data.materials.append(ROSE); allobj.append(ro)
leaf_ball(0.92, 0.26, 230)
leaf_ball(1.3, 0.2, 150)

sc.render.engine='CYCLES'; sc.cycles.samples=6; sc.cycles.device='CPU'
bpy.ops.object.select_all(action='DESELECT')
for o in allobj: o.select_set(True)
bpy.context.view_layer.objects.active=allobj[0]
bpy.ops.export_scene.gltf(filepath='/tmp/pw/topiary.glb', use_selection=True, export_apply=True); print("EXPORTED")
