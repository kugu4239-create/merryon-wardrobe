import bpy, bmesh, math, random
random.seed(4)
bpy.ops.wm.read_factory_settings(use_empty=True); sc=bpy.context.scene
CREAM=(0.92,0.88,0.80)
m=bpy.data.materials.new("cloth"); m.use_nodes=True; b=m.node_tree.nodes.get("Principled BSDF")
b.inputs['Base Color'].default_value=(CREAM[0],CREAM[1],CREAM[2],1); b.inputs['Roughness'].default_value=0.78
if 'Sheen Weight' in b.inputs: b.inputs['Sheen Weight'].default_value=0.6
# 레일에 걸쳐 아래로 흐르는 천 — 상단 원점(z=0)에서 z=-H 까지 하강
W,H,NX,NY=0.62,1.12,44,30
phases=[random.uniform(-0.5,0.5) for _ in range(10)]
bm=bmesh.new(); verts=[]
for j in range(NY+1):
    for i in range(NX+1):
        u=i/NX; t=j/NY   # t=0 상단(레일), t=1 밑단
        x=(u-0.5)*W*(1.0+0.12*t)            # 아래로 갈수록 살짝 넓게(드레이프)
        z=-H*t
        fold=0.045*math.sin(u*math.pi*2*5.0)+0.022*math.sin(u*math.pi*2*11+phases[i%10])
        y=fold*(0.35+0.65*t)                # 주름은 아래로 갈수록 깊게
        if t<0.07:                          # 상단: 레일에 걸쳐 앞으로 살짝 말림
            y+=-0.05*(1-t/0.07)
        if t>0.93:                          # 밑단 불규칙 hem
            z+=0.035*math.sin(u*math.pi*4+phases[2])
        verts.append(bm.verts.new((x,y,z)))
def vid(j,i): return j*(NX+1)+i
for j in range(NY):
    for i in range(NX):
        bm.faces.new([verts[vid(j,i)],verts[vid(j,i+1)],verts[vid(j+1,i+1)],verts[vid(j+1,i)]])
me=bpy.data.meshes.new("cloth"); bm.to_mesh(me)
uvl=me.uv_layers.new(name="UV")
for poly in me.polygons:
    for li in poly.loop_indices:
        vi=me.loops[li].vertex_index; j=vi//(NX+1); i=vi%(NX+1)
        uvl.data[li].uv=(i/NX,1-j/NY)
bm.free()
o=bpy.data.objects.new("cloth",me); sc.collection.objects.link(o)
o.modifiers.new("sol","SOLIDIFY").thickness=0.008
o.modifiers.new("s","SUBSURF").levels=1
bpy.context.view_layer.objects.active=o; bpy.ops.object.shade_smooth()
o.data.materials.append(m)
bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
bpy.ops.export_scene.gltf(filepath='/tmp/pw/cloth.glb', use_selection=True, export_apply=True); print("EXPORTED")
