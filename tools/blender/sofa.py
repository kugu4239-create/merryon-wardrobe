import bpy, bmesh, math, glob, mathutils
V=mathutils.Vector
bpy.ops.wm.read_factory_settings(use_empty=True); sc=bpy.context.scene
texdir="/tmp/tex/fabric256/"; NRM=glob.glob(texdir+"*_NormalGL.jpg")[0]; RGH=glob.glob(texdir+"*_Roughness.jpg")[0]
BEIGE=(0.80,0.72,0.57); CREAM=(0.90,0.85,0.72)

def velvet(name,rgb):
    mat=bpy.data.materials.new(name); mat.use_nodes=True; nt=mat.node_tree; b=nt.nodes.get("Principled BSDF")
    b.inputs['Base Color'].default_value=(rgb[0],rgb[1],rgb[2],1); b.inputs['Roughness'].default_value=0.62
    if 'Sheen Weight' in b.inputs: b.inputs['Sheen Weight'].default_value=0.5
    if 'Sheen Roughness' in b.inputs: b.inputs['Sheen Roughness'].default_value=0.3
    tc=nt.nodes.new("ShaderNodeTexCoord"); mp=nt.nodes.new("ShaderNodeMapping"); mp.inputs['Scale'].default_value=(10,10,10); nt.links.new(tc.outputs['Generated'],mp.inputs['Vector'])
    ni=nt.nodes.new("ShaderNodeTexImage"); ni.image=bpy.data.images.load(NRM); ni.image.colorspace_settings.name='Non-Color'; nt.links.new(mp.outputs['Vector'],ni.inputs['Vector'])
    nm=nt.nodes.new("ShaderNodeNormalMap"); nm.inputs['Strength'].default_value=0.25; nt.links.new(ni.outputs['Color'],nm.inputs['Color']); nt.links.new(nm.outputs['Normal'],b.inputs['Normal'])
    return mat
GOLD=bpy.data.materials.new("Gold"); GOLD.use_nodes=True
gb=GOLD.node_tree.nodes.get("Principled BSDF"); gb.inputs["Base Color"].default_value=(0.83,0.68,0.42,1); gb.inputs["Metallic"].default_value=1; gb.inputs["Roughness"].default_value=0.28
FAB=velvet("velvet",BEIGE); FAB2=velvet("velvet2",CREAM)
allobj=[]

def tufted_panel(name, w, h, nx, ny, depth):
    # 정면이 +y(앞)인 패널. 다이아몬드 버튼 위치를 깊게 당겨 터프팅(쿠션감) + 버튼 자리.
    bm=bmesh.new(); g=[[None]*(nx+1) for _ in range(ny+1)]
    btn=[]
    # 다이아몬드 버튼 격자
    for bj in range(1,ny):
        for bi in range(1,nx):
            if (bi+bj)%2==1: continue
            btn.append(((bi/nx-0.5)*w,(bj/ny-0.5)*h))
    ru=w/nx*1.05; rv=h/ny*1.05
    for j in range(ny+1):
        for i in range(nx+1):
            u=(i/nx-0.5)*w; v=(j/ny-0.5)*h; d=0.0
            for (bxu,bxv) in btn:
                r2=((u-bxu)/ru)**2+((v-bxv)/rv)**2; d=max(d,math.exp(-r2*1.3))
            g[j][i]=bm.verts.new((u,-depth*d,v))
    for j in range(ny):
        for i in range(nx): bm.faces.new([g[j][i],g[j][i+1],g[j+1][i+1],g[j+1][i]])
    me=bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); o=bpy.data.objects.new(name,me); sc.collection.objects.link(o)
    o.modifiers.new("sol","SOLIDIFY").thickness=0.05
    sub=o.modifiers.new("s","SUBSURF"); sub.levels=2; sub.render_levels=2
    bpy.context.view_layer.objects.active=o; bpy.ops.object.shade_smooth(); o.data.materials.append(FAB); allobj.append(o)
    return o, btn, depth

def rbox(name,sx,sy,sz,loc,mat=FAB,bevel=0.04,sub=1):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.active_object; o.scale=(sx,sy,sz)
    bpy.ops.object.transform_apply(scale=True)
    bm=o.modifiers.new("bev","BEVEL"); bm.width=bevel; bm.segments=3
    if sub: o.modifiers.new("s","SUBSURF").levels=sub
    o.name=name; bpy.context.view_layer.objects.active=o; bpy.ops.object.shade_smooth(); o.data.materials.append(mat); allobj.append(o); return o

def cyl(name,r,depth,loc,rot,mat=FAB,sub=1):
    bpy.ops.mesh.primitive_cylinder_add(radius=r,depth=depth,location=loc,rotation=rot,vertices=24); o=bpy.context.active_object
    if sub: o.modifiers.new("s","SUBSURF").levels=sub
    o.name=name; bpy.context.view_layer.objects.active=o; bpy.ops.object.shade_smooth(); o.data.materials.append(mat); allobj.append(o); return o

# ===== 체스터필드 소파 (폭 1.9, 깊이 0.86; 등·암 같은 높이) =====
SW=1.9; SD=0.86; TOP=0.74; SEAT=0.42; ROLL=0.13
ARMZ=TOP-ROLL    # 암 롤 중심
BACKH=TOP-ROLL-SEAT+0.02   # 터프 패널 높이(좌면~롤 아래)
backY=-SD/2+0.14
# 베이스 프레임(좌면 박스)
rbox("base",SW,SD,0.18,(0,0,0.30),bevel=0.03,sub=1)
# 좌면 쿠션 2개
for sgn in (-1,1):
    rbox("cushion",SW/2-0.08,SD-0.26,0.14,(sgn*(SW/4),0.06,0.46),FAB2,bevel=0.06,sub=2)
# 롤 암(좌우) — 굵은 가로 롤 + 암 몸통
for sgn in (-1,1):
    cyl("arm",ROLL,SD-0.04,(sgn*(SW/2-0.11),0,ARMZ),(math.radians(90),0,0),FAB,sub=2)
    rbox("armbody",0.22,SD,ARMZ-0.30,(sgn*(SW/2-0.11),0,0.40),FAB,bevel=0.06,sub=1)
# 등받이 터프팅 패널 (정면 +y)
back,btn,bd=tufted_panel("back",SW-0.34,BACKH,14,5,0.09)
back.location=(0,backY,SEAT+BACKH/2); bpy.context.view_layer.objects.active=back; bpy.ops.object.transform_apply(location=True)
# 등 상단 롤
cyl("backroll",ROLL,SW-0.30,(0,backY,TOP-ROLL+0.02),(0,math.radians(90),0),FAB,sub=2)
# 버튼(골드, 다이아몬드) — 딤플 바닥에
for (bu,bv) in btn:
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.016,location=(bu,backY-bd+0.02,SEAT+BACKH/2+bv)); bt=bpy.context.active_object
    bt.scale=(1,0.55,1); bpy.ops.object.shade_smooth(); bt.data.materials.append(GOLD); allobj.append(bt)
# 골드 다리(4)
for sx in (-1,1):
    for sy in (-1,1):
        cyl("leg",0.028,0.22,(sx*(SW/2-0.16),sy*(SD/2-0.14),0.11),(0,0,0),GOLD,sub=0)

# ===== 렌더 =====
camd=bpy.data.cameras.new("C"); cam=bpy.data.objects.new("C",camd); sc.collection.objects.link(cam)
cam.location=(2.0,-2.6,1.25); cam.rotation_euler=(math.radians(74),0,math.radians(38)); camd.lens=40; sc.camera=cam
sd=bpy.data.lights.new("S","SUN"); sd.energy=1.1; so=bpy.data.objects.new("S",sd); sc.collection.objects.link(so); so.rotation_euler=(math.radians(50),math.radians(20),math.radians(10))
fd=bpy.data.lights.new("F","AREA"); fd.energy=60; fd.size=3; fo=bpy.data.objects.new("F",fd); sc.collection.objects.link(fo); fo.location=(1.5,-2.5,2.0); fo.rotation_euler=(math.radians(60),0,math.radians(20))
sc.world=bpy.data.worlds.new("W"); sc.world.use_nodes=True; sc.world.node_tree.nodes["Background"].inputs[0].default_value=(0.52,0.48,0.44,1); sc.world.node_tree.nodes["Background"].inputs[1].default_value=0.5
sc.view_settings.view_transform='AgX'
sc.render.engine='CYCLES'; sc.cycles.samples=24; sc.cycles.device='CPU'; sc.render.resolution_x=900; sc.render.resolution_y=650; sc.render.filepath='/tmp/pw/sofa.png'
bpy.ops.render.render(write_still=True); print("RENDERED")
bpy.ops.object.select_all(action='DESELECT')
for o in allobj:
    try: o.select_set(True)
    except: pass
bpy.context.view_layer.objects.active=allobj[0]
bpy.ops.export_scene.gltf(filepath='/tmp/pw/sofa.glb', use_selection=True, export_apply=True); print("EXPORTED")
