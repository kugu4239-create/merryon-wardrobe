import bpy, bmesh, math, sys
LOGO = '--logo' in sys.argv
bpy.ops.wm.read_factory_settings(use_empty=True); sc=bpy.context.scene
CREAM=(0.90,0.86,0.77)
def drape_mat():
    m=bpy.data.materials.new("drape"); m.use_nodes=True; b=m.node_tree.nodes.get("Principled BSDF")
    b.inputs['Base Color'].default_value=(CREAM[0],CREAM[1],CREAM[2],1); b.inputs['Roughness'].default_value=0.72
    if 'Sheen Weight' in b.inputs: b.inputs['Sheen Weight'].default_value=0.55
    return m
def logo_mat():
    m=bpy.data.materials.new("logo"); m.use_nodes=True; nt=m.node_tree; b=nt.nodes.get("Principled BSDF")
    b.inputs['Roughness'].default_value=0.72
    if 'Sheen Weight' in b.inputs: b.inputs['Sheen Weight'].default_value=0.55
    tc=nt.nodes.new("ShaderNodeTexCoord"); mp=nt.nodes.new("ShaderNodeMapping")
    # 로고(5:1)를 UV 중앙 폭0.5 높이0.1 영역에 배치 → out=scale*uv+loc
    mp.inputs['Location'].default_value=(-0.5,-5.0,0); mp.inputs['Scale'].default_value=(2.0,10.0,1.0)
    nt.links.new(tc.outputs['UV'],mp.inputs['Vector'])
    img=nt.nodes.new("ShaderNodeTexImage"); img.image=bpy.data.images.load('/tmp/cut/merryon_logo_t.png'); img.extension='CLIP'
    nt.links.new(mp.outputs['Vector'],img.inputs['Vector'])
    mix=nt.nodes.new("ShaderNodeMixRGB"); mix.inputs['Color1'].default_value=(CREAM[0],CREAM[1],CREAM[2],1)
    mix.inputs['Color2'].default_value=(0.12,0.10,0.10,1)
    nt.links.new(img.outputs['Alpha'],mix.inputs['Fac']); nt.links.new(mix.outputs['Color'],b.inputs['Base Color'])
    return m

# 그리드 → 사인파 세로 주름(시뮬 없이 안정적)
W,H,NX,NY=1.8,2.75,56,16
bm=bmesh.new(); g=[[None]*(NX+1) for _ in range(NY+1)]
import random; random.seed(3)
phases=[random.uniform(-0.4,0.4) for _ in range(8)]
for j in range(NY+1):
    for i in range(NX+1):
        u=i/NX; x=(u-0.5)*W; z=H*(1-j/NY)
        # 주름: x 따라 사인, 상단으로 갈수록 깊고 좁게(게더), 하단은 완만
        gather=0.55+0.45*(j/NY)            # 상단(j=0)에서 폭 좁힘
        fold=0.05*math.sin(u*math.pi*2*6.0)+0.018*math.sin(u*math.pi*2*13.0+phases[i%8])
        depth=fold*(0.6+0.7*(1-j/NY))      # 상단 주름 깊게
        bm.verts.new((x*gather, depth, z))
        g[j][i]=None
verts=[v for v in bm.verts]
# 면 구성
bm.verts.ensure_lookup_table()
def vid(j,i): return j*(NX+1)+i
for j in range(NY):
    for i in range(NX):
        bm.faces.new([verts[vid(j,i)],verts[vid(j,i+1)],verts[vid(j+1,i+1)],verts[vid(j+1,i)]])
me=bpy.data.meshes.new("curtain"); bm.to_mesh(me)
# UV
uvl=me.uv_layers.new(name="UV")
for poly in me.polygons:
    for li in poly.loop_indices:
        vi=me.loops[li].vertex_index; j=vi//(NX+1); i=vi%(NX+1)
        uvl.data[li].uv=(i/NX, 1-j/NY)
bm.free()
o=bpy.data.objects.new("curtain",me); sc.collection.objects.link(o)
o.modifiers.new("sol","SOLIDIFY").thickness=0.012
o.modifiers.new("s","SUBSURF").levels=1
bpy.context.view_layer.objects.active=o; bpy.ops.object.shade_smooth()
o.data.materials.append(logo_mat() if LOGO else drape_mat())
out='/tmp/pw/curtain_logo.glb' if LOGO else '/tmp/pw/curtain_plain.glb'
bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active=o
bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_apply=True); print("EXPORTED", out)
# 프리뷰(logo만)
if LOGO:
    cam=bpy.data.cameras.new("C"); co=bpy.data.objects.new("C",cam); sc.collection.objects.link(co)
    co.location=(0,-3.0,1.4); co.rotation_euler=(math.radians(88),0,0); cam.lens=42; sc.camera=co
    sd=bpy.data.lights.new("S","SUN"); sd.energy=3; so=bpy.data.objects.new("S",sd); sc.collection.objects.link(so); so.rotation_euler=(math.radians(55),math.radians(12),0)
    sc.world=bpy.data.worlds.new("W"); sc.world.use_nodes=True; sc.world.node_tree.nodes["Background"].inputs[1].default_value=0.6
    sc.render.engine='CYCLES'; sc.cycles.samples=12; sc.cycles.device='CPU'; sc.render.resolution_x=420; sc.render.resolution_y=560; sc.render.filepath='/tmp/pw/cprev.png'
    bpy.ops.render.render(write_still=True); print("RENDERED")
