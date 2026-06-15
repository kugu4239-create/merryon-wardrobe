import bpy, bmesh, math, random, mathutils
random.seed(5)
bpy.ops.wm.read_factory_settings(use_empty=True); sc=bpy.context.scene
def mat(name,rgb,rough=0.5):
    m=bpy.data.materials.new(name); m.use_nodes=True; b=m.node_tree.nodes.get("Principled BSDF")
    b.inputs['Base Color'].default_value=(rgb[0],rgb[1],rgb[2],1); b.inputs['Roughness'].default_value=rough
    if 'Sheen Weight' in b.inputs: b.inputs['Sheen Weight'].default_value=0.5
    return m
PINKS=[mat('p1',(0.96,0.80,0.86)),mat('p2',(0.92,0.70,0.79)),mat('p3',(0.87,0.56,0.67)),
       mat('cream',(0.97,0.93,0.87)),mat('blush',(0.95,0.84,0.85))]
LEAF=mat('leaf',(0.40,0.53,0.33),0.8); LEAF2=mat('leaf2',(0.33,0.45,0.27),0.8)
allobj=[]

# ---- 컵형 꽃잎 메쉬(밑 좁고 위 둥글게, 양옆 말림) ----
def petal_mesh():
    bm=bmesh.new(); NX,NY=6,7; g=[]
    for j in range(NY+1):
        row=[]
        for i in range(NX+1):
            w=j/NY; u=i/NX-0.5
            width=math.sin(min(w*1.15,1.0)*math.pi*0.92)*0.5+0.12
            x=u*2*width; y=w
            z=(u*2)**2*0.26*width + 0.12*math.sin(w*math.pi)   # 컵(양옆 말림)+앞배
            row.append(bm.verts.new((x,y,z)))
        g.append(row)
    for j in range(NY):
        for i in range(NX):
            bm.faces.new([g[j][i],g[j][i+1],g[j+1][i+1],g[j+1][i]])
    me=bpy.data.meshes.new("petal"); bm.to_mesh(me); bm.free(); return me
PMESH=petal_mesh()

def rose(cx,cy,cz,R,m):
    rings=[(3,0.015,10,0.5,0.10),(5,0.06,30,0.66,0.04),(7,0.12,54,0.86,-0.02),(9,0.19,80,1.05,-0.10)]
    for ri,(count,br,tilt,psc,zo) in enumerate(rings):
        for k in range(count):
            ang=k*(2*math.pi/count)+ri*0.55+random.uniform(-0.1,0.1)
            o=bpy.data.objects.new("pet",PMESH.copy()); sc.collection.objects.link(o)
            s=R*psc
            o.scale=(s,s*1.25,s)
            o.rotation_euler=(math.radians(tilt+random.uniform(-6,6)),0,ang)
            o.location=(cx+math.cos(ang)*br*R, cy+math.sin(ang)*br*R, cz+zo*R)
            bpy.context.view_layer.objects.active=o; bpy.ops.object.shade_smooth()
            o.data.materials.append(m); allobj.append(o)
    # 작은 그린 꽃받침(아래)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=R*0.16, location=(cx,cy,cz-R*0.12))
    s=bpy.context.active_object; s.scale=(1,1,0.5); s.data.materials.append(LEAF2); allobj.append(s)

# ---- 부케: 돔 형태로 장미들 배치 ----
R=0.34; spots=[]
heads=[(0,0,0.30,0.16),(0.13,0.05,0.24,0.13),(-0.12,0.07,0.25,0.13),(0.05,-0.13,0.22,0.12),
       (-0.08,-0.10,0.20,0.12),(0.16,-0.04,0.16,0.11),(-0.16,-0.02,0.17,0.11),(0.02,0.15,0.18,0.12),
       (0.10,0.13,0.13,0.10),(-0.10,0.14,0.12,0.10),(0.0,-0.02,0.40,0.15),(0.20,0.08,0.10,0.09),
       (-0.19,0.10,0.11,0.09),(0.08,-0.20,0.10,0.09)]
for (hx,hy,hz,hr) in heads:
    rose(hx,hy,hz,hr,random.choice(PINKS))
# 잎 — 부케 둘레로 삐져나오게
for l in range(16):
    a=(l/16)*2*math.pi+random.uniform(-0.2,0.2); lr=R*random.uniform(0.95,1.18)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=random.uniform(0.06,0.09), location=(math.cos(a)*lr, math.sin(a)*lr, random.uniform(-0.02,0.07)))
    o=bpy.context.active_object; o.scale=(0.4,1.4,0.14); o.rotation_euler=(random.uniform(-0.3,0.3),0,a)
    bpy.ops.object.shade_smooth(); o.data.materials.append(LEAF if random.random()<0.5 else LEAF2); allobj.append(o)
# 줄기 다발(아래)
bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=0.05, radius2=0.08, depth=0.24, location=(0,0,-0.16))
st=bpy.context.active_object; st.data.materials.append(LEAF2); allobj.append(st)

bpy.ops.object.select_all(action='DESELECT')
for o in allobj: o.select_set(True)
bpy.context.view_layer.objects.active=allobj[0]
bpy.ops.object.join()
bpy.ops.export_scene.gltf(filepath='/tmp/pw/bouquet.glb', use_selection=True, export_apply=True); print("EXPORTED")
