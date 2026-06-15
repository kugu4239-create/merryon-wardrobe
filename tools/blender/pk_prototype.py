import bpy, bmesh, math, glob, mathutils, sys
V=mathutils.Vector
bpy.ops.wm.read_factory_settings(use_empty=True); sc=bpy.context.scene
texdir="/tmp/tex/fabric256/"; NRM=glob.glob(texdir+"*_NormalGL.jpg")[0]; RGH=glob.glob(texdir+"*_Roughness.jpg")[0]; COL=glob.glob(texdir+"*_Color.jpg")[0]
COLOR=(0.86,0.80,0.66)   # 밝은 베이지 (PK 원피스)

def fabric(name,rgb,fac=0.16):
    mat=bpy.data.materials.new(name); mat.use_nodes=True; nt=mat.node_tree; b=nt.nodes.get("Principled BSDF")
    tc=nt.nodes.new("ShaderNodeTexCoord"); mp=nt.nodes.new("ShaderNodeMapping"); mp.inputs['Scale'].default_value=(7,7,7); nt.links.new(tc.outputs['Generated'],mp.inputs['Vector'])
    def t(p,nc=False):
        n=nt.nodes.new("ShaderNodeTexImage"); n.image=bpy.data.images.load(p)
        if nc:n.image.colorspace_settings.name='Non-Color'
        nt.links.new(mp.outputs['Vector'],n.inputs['Vector']); return n
    ci=t(COL); mix=nt.nodes.new("ShaderNodeMixRGB"); mix.blend_type='MULTIPLY'; mix.inputs['Fac'].default_value=fac; mix.inputs['Color1'].default_value=(rgb[0],rgb[1],rgb[2],1)
    nt.links.new(ci.outputs['Color'],mix.inputs['Color2']); nt.links.new(mix.outputs['Color'],b.inputs['Base Color'])
    ri=t(RGH,True); nt.links.new(ri.outputs['Color'],b.inputs['Roughness'])
    ni=t(NRM,True); nm=nt.nodes.new("ShaderNodeNormalMap"); nm.inputs['Strength'].default_value=0.4; nt.links.new(ni.outputs['Color'],nm.inputs['Color']); nt.links.new(nm.outputs['Normal'],b.inputs['Normal'])
    return mat
MAT=fabric("pk",COLOR)
SEAMMAT=fabric("seam",(COLOR[0]*0.82,COLOR[1]*0.82,COLOR[2]*0.82),0.2)   # 시접(겉으로 눌린 천)
THREAD=bpy.data.materials.new("thr"); THREAD.use_nodes=True
tb=THREAD.node_tree.nodes.get("Principled BSDF"); tb.inputs["Base Color"].default_value=(0.35,0.30,0.22,1); tb.inputs["Roughness"].default_value=0.7
GOLD=bpy.data.materials.new("Gold"); GOLD.use_nodes=True
gb=GOLD.node_tree.nodes.get("Principled BSDF"); gb.inputs["Base Color"].default_value=(0.79,0.66,0.43,1); gb.inputs["Metallic"].default_value=1; gb.inputs["Roughness"].default_value=0.3

def cyl_between(A,B,radius,depthpad=0.0,open=False,subd=0,verts=18):
    A=V(A); B=V(B); d=B-A; L=d.length+depthpad; mid=(A+B)/2
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=radius,depth=L,location=mid,end_fill_type='NOTHING' if open else 'NGON')
    ob=bpy.context.active_object
    q=V((0,0,1)).rotation_difference(d.normalized()); ob.rotation_euler=q.to_euler()
    if subd:
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.subdivide(number_cuts=subd); bpy.ops.object.mode_set(mode='OBJECT')
    return ob

# ===== 겉시접 플랜지(바깥으로 눌려 집힌 시접) + 윗실(탑스티치) =====
def flange(pts, outdir, w=0.010, name="Fl"):
    pts=[V(p) for p in pts]
    bm=bmesh.new(); vs=[]
    for p in pts:
        n=outdir(p);
        if n.length<1e-6: n=V((0,0,1))
        n=n.normalized()
        a=bm.verts.new(p); b=bm.verts.new(p+n*w); vs.append((a,b))
    for i in range(len(vs)-1):
        a0,b0=vs[i]; a1,b1=vs[i+1]; bm.faces.new([a0,a1,b1,b0])
    me=bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o=bpy.data.objects.new(name,me); sc.collection.objects.link(o)
    o.modifiers.new("sol","SOLIDIFY").thickness=0.003
    bpy.context.view_layer.objects.active=o; bpy.ops.object.shade_flat(); o.data.materials.append(SEAMMAT)
    # 탑스티치: 플랜지 밑동을 따라 박은 윗실
    line=[(p+outdir(p).normalized()*0.0015) if outdir(p).length>1e-6 else p for p in pts]
    cu=bpy.data.curves.new("ts","CURVE"); cu.dimensions='3D'; spl=cu.splines.new('POLY'); spl.points.add(len(line)-1)
    for k,p in enumerate(line): spl.points[k].co=(p.x,p.y,p.z,1)
    cu.bevel_depth=0.0014; cu.bevel_resolution=1; c=bpy.data.objects.new("ts",cu); sc.collection.objects.link(c); c.data.materials.append(THREAD)
    return o

# ===== 마네킹 =====
bpy.ops.mesh.primitive_uv_sphere_add(segments=22,ring_count=14,radius=0.2,location=(0,0,1.05)); torso=bpy.context.active_object
for v in torso.data.vertices: v.co.y*=0.5; v.co.z*=1.6
for v in torso.data.vertices:
    rel=v.co.z-1.05
    if rel<0:
        f=max(0.72,1.0+rel*0.55); v.co.x*=f; v.co.y*=f
bpy.ops.object.transform_apply(scale=True); torso.modifiers.new("SS","SUBSURF").levels=1; torso.modifiers.new("C","COLLISION"); torso.collision.thickness_outer=0.012
bpy.ops.mesh.primitive_cylinder_add(radius=0.056,depth=0.26,location=(0,0,1.42)); bpy.context.active_object.modifiers.new("C","COLLISION")
SX=0.2; SZ=1.28; ALEN=0.22   # 일반 반소매 길이
arms=[]
for s in (-1,1):
    A=(s*SX,0,SZ); B=(s*(SX+0.17),0,SZ-ALEN)
    arm=cyl_between(A,B,0.05); arm.modifiers.new("C","COLLISION"); arm.collision.thickness_outer=0.008; arms.append((A,B))

# ===== 몸판(셔츠원피스, 약 A라인) =====
W=0.44; NX=10; NY=22; H=1.12; ztop=1.34; yf=0.16
bm=bmesh.new()
def panel(y):
    g=[[None]*(NX+1) for _ in range(NY+1)]
    for j in range(NY+1):
        for i in range(NX+1):
            tt=j/NY; ww=W*(1.0-0.16*math.exp(-((tt-0.4)/0.13)**2)); ww*=(1.0+0.45*max(0.0,tt-0.5))
            g[j][i]=bm.verts.new(((i/NX-0.5)*ww,y,ztop-tt*H))
    for j in range(NY):
        for i in range(NX): bm.faces.new([g[j][i],g[j][i+1],g[j+1][i+1],g[j+1][i]])
    return g
front=panel(+yf); back=panel(-yf)
# 어깨 i: 끝(0,NX)=암홀, 가운데(mid)=넥. NX=10 → 넥홀 i=4,5,6
NM=[4,5,6]; SHO=[i for i in range(1,NX) if i not in NM]
for i in SHO:
    xm=front[0][i].co.x*0.92; front[0][i].co=(xm,0,ztop); back[0][i].co=(xm,0,ztop)
# 좁고 높은 라운드 넥(폴로 베이스): 가운데일수록 안쪽으로 모아 올림
for i in NM:
    f=1.0-0.5*math.exp(-((i-5)/1.2)**2); xm=front[0][i].co.x*0.55
    front[0][i].co=(xm,0.03,ztop+0.012*(1-f)); back[0][i].co=(xm,-0.03,ztop+0.012*(1-f))
nloop=[front[0][3].co.copy()]+[front[0][i].co.copy() for i in NM]+[front[0][7].co.copy()]+[back[0][i].co.copy() for i in (6,5,4)]
sho_pts=[[front[0][i].co.copy() for i in range(0,4)],[front[0][i].co.copy() for i in range(7,NX+1)]]
bm.verts.ensure_lookup_table()
for i in SHO: bm.edges.new([front[0][i],back[0][i]])
for j in range(4,NY+1): bm.edges.new([front[j][0],back[j][0]]); bm.edges.new([front[j][NX],back[j][NX]])
me=bpy.data.meshes.new("Body"); bm.to_mesh(me); bm.free(); g=bpy.data.objects.new("Body",me); sc.collection.objects.link(g)
stride=NX+1; backoff=(NY+1)*stride
vg=g.vertex_groups.new(name="Pin"); vg.add([i for i in range(NX+1)]+[backoff+i for i in range(NX+1)],1.0,'REPLACE')
md=g.modifiers.new("Cloth","CLOTH"); s=md.settings; s.vertex_group_mass="Pin"; s.mass=0.2; s.quality=10
s.tension_stiffness=30; s.compression_stiffness=30; s.shear_stiffness=10; s.bending_stiffness=0.6
s.use_sewing_springs=True; s.sewing_force_max=2.5
cs=md.collision_settings; cs.use_self_collision=True; cs.self_distance_min=0.004; cs.distance_min=0.01
bpy.context.view_layer.objects.active=g; bpy.ops.object.shade_smooth(); g.modifiers.new("S","SUBSURF").render_levels=1; g.data.materials.append(MAT)

# ===== 일반 반소매(퍼프 아님): 리지드 테이퍼 튜브(암홀 넓고 커프 좁음) =====
def cone_between(A,B,r1,r2,verts=16):
    A=V(A); B=V(B); d=B-A; L=d.length; mid=(A+B)/2
    bpy.ops.mesh.primitive_cone_add(vertices=verts,radius1=r1,radius2=r2,depth=L,location=mid,end_fill_type='NOTHING')
    ob=bpy.context.active_object; q=V((0,0,1)).rotation_difference(d.normalized()); ob.rotation_euler=q.to_euler()
    return ob
sleeve_seams=[]
for (A,B) in arms:
    Ain=(A[0]*0.86, A[1], A[2]+0.02)     # 암홀 쪽(몸판에 약간 겹침)
    Bo =(B[0]*1.02, B[1], B[2]-0.01)
    sl=cone_between(Ain,Bo,0.085,0.062,16)
    bpy.context.view_layer.objects.active=sl; bpy.ops.object.shade_smooth(); sl.data.materials.append(MAT)
    sleeve_seams.append((Ain,Bo,(V(B)-V(A))))

# ===== bake =====
sc.frame_start=1; sc.frame_end=80
for f in range(1,81): sc.frame_set(f)
print("baked",sc.frame_current)
for o in bpy.data.objects:
    if o.modifiers.get("C"): o.hide_render=True

# 변형 정점 읽기(서브서프 off)
def eval_world(obj, idxs):
    sub=obj.modifiers.get("S");
    if sub: sub.show_viewport=False
    dg=bpy.context.evaluated_depsgraph_get(); ev=obj.evaluated_get(dg); m=ev.to_mesh()
    pts=[(obj.matrix_world@m.vertices[i].co).copy() for i in idxs]
    ev.to_mesh_clear()
    if sub: sub.show_viewport=True
    return pts
gx=0.0
def radial(p): return V((p.x-gx,p.y,0))
def up(p): return V((0,0,1))
def down(p): return V((0,-0.3,-1))
# 옆선(좌/우) 겉시접
L=eval_world(g,[j*stride+0 for j in range(4,NY+1)]); flange(L,radial,0.011,"sideL")
R=eval_world(g,[j*stride+NX for j in range(4,NY+1)]); flange(R,radial,0.011,"sideR")
# 어깨 겉시접
for pts in sho_pts: flange(pts,up,0.009,"sho")
# 밑단 겉시접(헴)
hemf=eval_world(g,[NY*stride+i for i in range(NX+1)]); hemb=eval_world(g,[backoff+NY*stride+i for i in range(NX,-1,-1)])
flange(hemf+hemb+[hemf[0]],down,0.012,"hem")
# 소매 암홀/커프스 겉시접 링
def ring_pts(center,axis,r,nseg=16):
    axis=V(axis).normalized(); up=V((0,0,1))
    if abs(axis.dot(up))>0.9: up=V((1,0,0))
    u=axis.cross(up).normalized(); w=axis.cross(u).normalized(); c=V(center)
    return [c+u*math.cos(t)*r+w*math.sin(t)*r for t in [2*math.pi*k/nseg for k in range(nseg+1)]]
for (Ain,Bo,axis) in sleeve_seams:
    flange(ring_pts(Ain,axis,0.084),lambda p,A=axis:-V(A),0.008,"armhole")   # 암홀: 어깨쪽으로 눌림
    flange(ring_pts(Bo,axis,0.062),lambda p,A=axis:V(A),0.007,"cuff")        # 커프스: 손쪽으로 눌림
# 앞중심 플래킷(단추단) — 앞판 가운데 세로줄
cf=eval_world(g,[j*stride+(NX//2) for j in range(0,NY//3+1)])
flange(cf,lambda p:V((0,1,0)),0.018,"placket")
for k in range(0,len(cf)-1):
    p=cf[k]; bpy.ops.mesh.primitive_cylinder_add(radius=0.011,depth=0.006,location=(p.x,p.y+0.024,p.z),rotation=(math.radians(90),0,0))
    bpy.context.active_object.data.materials.append(GOLD)

# ===== PK(폴로) 카라: 넥라인을 따라 일관된 바깥법선으로 세운 뒤 접힌 밴드 =====
col=[V(p) for p in nloop]
nC=len(col)
def outN(i):
    a=col[max(0,i-1)]; b=col[min(nC-1,i+1)]; t=(b-a); t.z=0
    if t.length<1e-6: n=V((col[i].x-gx,col[i].y,0))
    else: n=V((t.y,-t.x,0))
    if n.length<1e-6: n=V((0,1,0))
    n=n.normalized()
    if n.dot(V((col[i].x-gx,col[i].y,0)))<0: n=-n   # 항상 몸 바깥쪽
    return n
cbm=bmesh.new(); cv=[]
for i,p in enumerate(col):
    n=outN(i)
    base=cbm.verts.new(p)
    top=cbm.verts.new(p+n*0.012+V((0,0,0.026)))    # 스탠드(목 뒤로 세움)
    fold=cbm.verts.new(p+n*0.055+V((0,0,-0.004)))  # 어깨 위로 접혀 누운 카라(턴다운)
    cv.append((base,top,fold))
for i in range(nC-1):
    a0,b0,c0=cv[i]; a1,b1,c1=cv[i+1]
    cbm.faces.new([a0,a1,b1,b0]); cbm.faces.new([b0,b1,c1,c0])
cme=bpy.data.meshes.new("Collar"); cbm.to_mesh(cme); cbm.free(); co=bpy.data.objects.new("Collar",cme); sc.collection.objects.link(co)
co.modifiers.new("sol","SOLIDIFY").thickness=0.004
bpy.context.view_layer.objects.active=co; bpy.ops.object.shade_smooth(); co.data.materials.append(MAT)

# ===== 옷걸이 =====
rodz=ztop+0.06
for piece in (cyl_between((-SX*0.9,0,ztop-0.02),(0,0,ztop+0.03),0.006),
              cyl_between((SX*0.9,0,ztop-0.02),(0,0,ztop+0.03),0.006),
              cyl_between((0,0,ztop+0.03),(0,0,rodz),0.006)): piece.data.materials.append(GOLD)
bpy.ops.mesh.primitive_torus_add(major_radius=0.03,minor_radius=0.006,location=(0,0,rodz),major_segments=16,minor_segments=8)
hk=bpy.context.active_object; hk.rotation_euler=(0,math.radians(90),0); hk.data.materials.append(GOLD)
bpy.ops.mesh.primitive_cylinder_add(radius=0.009,depth=1.0,location=(0,0,rodz),rotation=(0,math.pi/2,0)); bpy.context.active_object.data.materials.append(GOLD)

# ===== 카메라/조명/렌더 =====
camd=bpy.data.cameras.new("C"); cam=bpy.data.objects.new("C",camd); sc.collection.objects.link(cam)
cam.location=(0,-2.3,0.95); cam.rotation_euler=(math.radians(90),0,0); camd.lens=42; sc.camera=cam
sd=bpy.data.lights.new("S","SUN"); sd.energy=0.9; so=bpy.data.objects.new("S",sd); sc.collection.objects.link(so); so.rotation_euler=(math.radians(46),math.radians(18),0)
fd=bpy.data.lights.new("F","AREA"); fd.energy=12; fd.size=2.4; fo=bpy.data.objects.new("F",fd); sc.collection.objects.link(fo); fo.location=(0.4,-2,1.15); fo.rotation_euler=(math.radians(88),0,math.radians(10))
sc.world=bpy.data.worlds.new("W"); sc.world.use_nodes=True; sc.world.node_tree.nodes["Background"].inputs[0].default_value=(0.5,0.46,0.42,1); sc.world.node_tree.nodes["Background"].inputs[1].default_value=0.4
sc.view_settings.view_transform='AgX'; sc.view_settings.exposure=0.0
sc.render.engine='CYCLES'; sc.cycles.samples=26; sc.cycles.device='CPU'; sc.render.resolution_x=680; sc.render.resolution_y=820; sc.render.filepath='/tmp/pw/pk.png'
bpy.ops.render.render(write_still=True); print("RENDERED")
