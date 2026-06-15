import bpy, bmesh, math, glob, mathutils, sys
GROUP=int(sys.argv[-1]) if sys.argv[-1].isdigit() else 0
bpy.ops.wm.read_factory_settings(use_empty=True); sc=bpy.context.scene
texdir="/tmp/tex/fabric256/"; NRM=glob.glob(texdir+"*_NormalGL.jpg")[0]; RGH=glob.glob(texdir+"*_Roughness.jpg")[0]; COL=glob.glob(texdir+"*_Color.jpg")[0]

def fabric(name,rgb):
    mat=bpy.data.materials.new(name); mat.use_nodes=True; nt=mat.node_tree; b=nt.nodes.get("Principled BSDF")
    tc=nt.nodes.new("ShaderNodeTexCoord"); mp=nt.nodes.new("ShaderNodeMapping"); mp.inputs['Scale'].default_value=(6,6,6); nt.links.new(tc.outputs['Generated'],mp.inputs['Vector'])
    def t(p,nc=False):
        n=nt.nodes.new("ShaderNodeTexImage"); n.image=bpy.data.images.load(p)
        if nc:n.image.colorspace_settings.name='Non-Color'
        nt.links.new(mp.outputs['Vector'],n.inputs['Vector']); return n
    ci=t(COL); mix=nt.nodes.new("ShaderNodeMixRGB"); mix.blend_type='MULTIPLY'; mix.inputs['Fac'].default_value=0.16; mix.inputs['Color1'].default_value=(rgb[0],rgb[1],rgb[2],1)
    nt.links.new(ci.outputs['Color'],mix.inputs['Color2']); nt.links.new(mix.outputs['Color'],b.inputs['Base Color'])
    ri=t(RGH,True); nt.links.new(ri.outputs['Color'],b.inputs['Roughness'])
    ni=t(NRM,True); nm=nt.nodes.new("ShaderNodeNormalMap"); nm.inputs['Strength'].default_value=0.45; nt.links.new(ni.outputs['Color'],nm.inputs['Color']); nt.links.new(nm.outputs['Normal'],b.inputs['Normal'])
    return mat

GOLD=bpy.data.materials.new("Gold"); GOLD.use_nodes=True
gb=GOLD.node_tree.nodes.get("Principled BSDF"); gb.inputs["Base Color"].default_value=(0.79,0.66,0.43,1); gb.inputs["Metallic"].default_value=1; gb.inputs["Roughness"].default_value=0.3

def cyl_between(A,B,radius,depthpad=0.0,open=False,subd=0,verts=20):
    A=mathutils.Vector(A); B=mathutils.Vector(B); d=B-A; L=d.length+depthpad; mid=(A+B)/2
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=radius,depth=L,location=mid,end_fill_type='NOTHING' if open else 'NGON')
    ob=bpy.context.active_object
    q=mathutils.Vector((0,0,1)).rotation_difference(d.normalized()); ob.rotation_euler=q.to_euler()
    if subd:
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.subdivide(number_cuts=subd); bpy.ops.object.mode_set(mode='OBJECT')
    return ob

def ring_at(center,axis,major,minor,mat):
    bpy.ops.mesh.primitive_torus_add(major_radius=major,minor_radius=minor,location=center,major_segments=22,minor_segments=8)
    o=bpy.context.active_object
    q=mathutils.Vector((0,0,1)).rotation_difference(mathutils.Vector(axis).normalized()); o.rotation_euler=q.to_euler()
    bpy.ops.object.shade_smooth(); o.data.materials.append(mat); return o
def seam_curve(pts,mat,depth=0.010):
    cu=bpy.data.curves.new("S","CURVE"); cu.dimensions='3D'; spl=cu.splines.new('POLY'); spl.points.add(len(pts)-1)
    for k,p in enumerate(pts): spl.points[k].co=(p.x,p.y,p.z,1)
    cu.bevel_depth=depth; cu.bevel_resolution=2; o=bpy.data.objects.new("Seam",cu); sc.collection.objects.link(o); o.data.materials.append(mat); return o
def side_seam(g,NX,NY,mat,j0=5):
    sub=g.modifiers.get("S")
    if sub: sub.show_viewport=False
    deps=bpy.context.evaluated_depsgraph_get(); ev=g.evaluated_get(deps); m=ev.to_mesh(); stride=NX+1
    L=[(g.matrix_world @ m.vertices[j*stride+0].co).copy() for j in range(j0,NY+1)]
    R=[(g.matrix_world @ m.vertices[j*stride+NX].co).copy() for j in range(j0,NY+1)]
    ev.to_mesh_clear()
    if sub: sub.show_viewport=True
    seam_curve(L,mat,0.009); seam_curve(R,mat,0.009)
def hem_loop(g,NX,NY,mat,depth=0.011):
    sub=g.modifiers.get("S")
    if sub: sub.show_viewport=False
    deps=bpy.context.evaluated_depsgraph_get(); ev=g.evaluated_get(deps); m=ev.to_mesh(); stride=NX+1; backoff=(NY+1)*stride
    pts=[(g.matrix_world @ m.vertices[NY*stride+i].co).copy() for i in range(NX+1)]
    pts+=[(g.matrix_world @ m.vertices[backoff+NY*stride+i].co).copy() for i in range(NX,-1,-1)]
    ev.to_mesh_clear()
    if sub: sub.show_viewport=True
    cu=bpy.data.curves.new("H","CURVE"); cu.dimensions='3D'; spl=cu.splines.new('POLY'); spl.points.add(len(pts)-1)
    for k,p in enumerate(pts): spl.points[k].co=(p.x,p.y,p.z,1)
    spl.use_cyclic_u=True; cu.bevel_depth=depth; cu.bevel_resolution=2
    o=bpy.data.objects.new("Hem",cu); sc.collection.objects.link(o); o.data.materials.append(mat); return o

def torso(x):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16,radius=0.2,location=(x,0,1.05)); t=bpy.context.active_object
    for v in t.data.vertices: v.co.y*=0.5; v.co.z*=1.6
    for v in t.data.vertices:
        rel=v.co.z-1.05
        if rel<0:
            f=max(0.72,1.0+rel*0.55); v.co.x=(v.co.x-x)*f+x; v.co.y*=f
    bpy.ops.object.transform_apply(scale=True)
    t.modifiers.new("SS","SUBSURF").levels=1
    t.modifiers.new("C","COLLISION"); t.collision.thickness_outer=0.012
    bpy.ops.mesh.primitive_cylinder_add(radius=0.056,depth=0.26,location=(x,0,1.42)); bpy.context.active_object.modifiers.new("C","COLLISION")

allg=[]; binds=[]; seams=[]
def build(x,name,rgb,H,cinch,flare,neck,slv):
    MAT=fabric(name+"_m",rgb); SEAM=fabric(name+"_s",(rgb[0]*0.72,rgb[1]*0.72,rgb[2]*0.72))
    torso(x)
    SX=0.2; SZ=1.28; ztop=1.34
    # arms (collision proxies) only when garment has sleeves
    arms=[]
    if slv!='none':
        ALEN=0.5 if slv=='long' else 0.24
        for s in (-1,1):
            A=(x+s*SX,0,SZ); B=(x+s*(SX+0.2),0,SZ-ALEN)
            arm=cyl_between(A,B,0.045); arm.modifiers.new("C","COLLISION"); arm.collision.thickness_outer=0.008; arms.append((A,B))
    W=0.44; NX=12; NY=max(18,int(H*24)); yf=0.16
    bm=bmesh.new()
    def panel(y):
        g=[[None]*(NX+1) for _ in range(NY+1)]
        for j in range(NY+1):
            for i in range(NX+1):
                tt=j/NY; ww=W*(1.0-cinch*math.exp(-((tt-0.36)/0.12)**2)); ww*= (1.0+flare*max(0.0,tt-0.5))
                g[j][i]=bm.verts.new((x+(i/NX-0.5)*ww,y,ztop-tt*H))
        for j in range(NY):
            for i in range(NX): bm.faces.new([g[j][i],g[j][i+1],g[j+1][i+1],g[j+1][i]])
        return g
    front=panel(+yf); back=panel(-yf)
    SHO=list(range(1,5))+list(range(8,12))
    for i in SHO:
        xm=front[0][i].co.x; front[0][i].co=(xm,0,ztop); back[0][i].co=(xm,0,ztop)
    nd={'boat':0.048,'scoop':0.085,'high':0.03}[neck]; nz={'boat':0.012,'scoop':0.04,'high':-0.01}[neck]
    for i in (5,6,7):
        xm=front[0][i].co.x; front[0][i].co=(xm,nd,ztop-nz); back[0][i].co=(xm,-nd*0.7,ztop-nz*0.5)
    nloop=[front[0][4].co.copy()]+[front[0][i].co.copy() for i in (5,6,7)]+[front[0][8].co.copy()]+[back[0][i].co.copy() for i in (7,6,5)]
    sho_pts=[[front[0][i].co.copy() for i in range(0,5)],[front[0][i].co.copy() for i in range(8,13)]]
    bm.verts.ensure_lookup_table()
    for i in SHO: bm.edges.new([front[0][i],back[0][i]])
    for j in range(5,NY+1): bm.edges.new([front[j][0],back[j][0]]); bm.edges.new([front[j][NX],back[j][NX]])
    me=bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); g=bpy.data.objects.new(name,me); sc.collection.objects.link(g)
    stride=NX+1; backoff=(NY+1)*stride; vg=g.vertex_groups.new(name="Pin")
    vg.add([i for i in range(NX+1)]+[backoff+i for i in range(NX+1)],1.0,'REPLACE')
    md=g.modifiers.new("Cloth","CLOTH"); s=md.settings
    s.vertex_group_mass="Pin"; s.mass=0.18; s.quality=12
    s.tension_stiffness=26; s.compression_stiffness=26; s.shear_stiffness=8; s.bending_stiffness=0.45
    s.use_sewing_springs=True; s.sewing_force_max=2.5
    cs=md.collision_settings; cs.use_self_collision=True; cs.self_distance_min=0.004; cs.distance_min=0.01
    bpy.context.view_layer.objects.active=g; bpy.ops.object.shade_smooth(); g.modifiers.new("S","SUBSURF").render_levels=2
    g.data.materials.append(MAT); allg.append(g); binds.append((nloop,rgb))
    # sleeves: cloth tube draped over each arm
    armrings=[]; cuffs=[]
    for (A,B) in arms:
        Ain=(A[0]+(x-A[0])*0.22, A[1], A[2]+0.04)  # nudge top toward body center to overlap armhole
        axis=(mathutils.Vector(B)-mathutils.Vector(A)); armrings.append((Ain,axis)); cuffs.append((B,axis))
        sl=cyl_between(Ain,B,0.07,depthpad=0.03,open=True,subd=3,verts=18)
        Av=mathutils.Vector(Ain)
        pins=[v.index for v in sl.data.vertices if (sl.matrix_world @ v.co - Av).length < 0.08]
        svg=sl.vertex_groups.new(name="Pin"); svg.add(pins,1.0,'REPLACE')
        smd=sl.modifiers.new("Cloth","CLOTH"); ss=smd.settings; ss.vertex_group_mass="Pin"; ss.mass=0.1; ss.quality=10
        ss.tension_stiffness=34; ss.compression_stiffness=34; ss.shear_stiffness=10; ss.bending_stiffness=0.5
        sc2=smd.collision_settings; sc2.use_self_collision=True; sc2.distance_min=0.006
        bpy.context.view_layer.objects.active=sl; bpy.ops.object.shade_smooth(); sl.modifiers.new("S","SUBSURF").render_levels=2; sl.data.materials.append(MAT); allg.append(sl)
    seams.append((g,NX,NY,SEAM,sho_pts,armrings,cuffs))

# 팔레트: 블랙 / 네이비 / 밝은 베이지 / 크림 / 로즈 핑크   |   소매: long / short / none
BLACK=(0.045,0.045,0.05); NAVY=(0.09,0.12,0.23); BEIGE=(0.88,0.81,0.64); CREAM=(0.95,0.91,0.80); PINK=(0.91,0.58,0.63)
ALL=[
 ("dress_navy",NAVY,1.12,0.2,0.5,'boat','long'),
 ("dress_black",BLACK,1.22,0.22,0.55,'scoop','none'),
 ("blouse_beige",BEIGE,0.52,0.16,0.3,'boat','short'),
 ("dress_beige",BEIGE,1.1,0.22,0.55,'boat','long'),
 ("dress_navy2",NAVY,1.05,0.2,0.5,'scoop','short'),
 ("skirt_black",BLACK,0.82,0.0,0.85,'boat','none'),
 ("dress_cream",CREAM,1.26,0.18,0.6,'high','long'),
 ("blouse_beige2",BEIGE,0.55,0.2,0.35,'scoop','short'),
 ("dress_navy3",NAVY,1.0,0.26,0.45,'boat','none'),
 ("skirt_beige",BEIGE,0.95,0.0,0.95,'boat','none'),
 ("dress_black2",BLACK,1.15,0.24,0.6,'scoop','long'),
 ("jacket_beige",BEIGE,0.6,0.14,0.25,'high','long'),
 ("dress_pink",PINK,1.08,0.22,0.55,'boat','short'),
]
grp=ALL[GROUP*4:GROUP*4+4]
xs=[]
for k,(nm,col,H,ci,fl,nk,sv) in enumerate(grp):
    x=k*0.6 - 0.3*(len(grp)-1); xs.append(x); build(x, nm, col, H, ci, fl, nk, sv)

sc.frame_start=1; sc.frame_end=90
for f in range(1,91): sc.frame_set(f)
print("baked",sc.frame_current)
for o in bpy.data.objects:
    if o.modifiers.get("C"): o.hide_render=True
for nloop,rgb in binds:
    cu=bpy.data.curves.new("B","CURVE"); cu.dimensions='3D'; spl=cu.splines.new('POLY'); spl.points.add(len(nloop)-1)
    for kk,p in enumerate(nloop): spl.points[kk].co=(p.x,p.y,p.z,1)
    spl.use_cyclic_u=True; cu.bevel_depth=0.011; cu.bevel_resolution=2
    bo=bpy.data.objects.new("Bind",cu); sc.collection.objects.link(bo)
    m=bpy.data.materials.new("bm"); m.use_nodes=True; m.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value=(rgb[0]*0.78,rgb[1]*0.78,rgb[2]*0.78,1)
    bo.data.materials.append(m); allg.append(bo)
# per-garment finishes: shoulder seam / armhole ring / cuff / side seam / hem
nbefore=set(bpy.data.objects)
for (g,NX,NY,SEAM,sho_pts,armrings,cuffs) in seams:
    for pts in sho_pts: seam_curve(pts,SEAM,depth=0.010)
    for (center,axis) in armrings: ring_at(center,axis,0.075,0.012,SEAM)
    for (B,axis) in cuffs: ring_at(B,axis,0.06,0.011,SEAM)
    side_seam(g,NX,NY,SEAM)
    hem_loop(g,NX,NY,SEAM)
allg+= [o for o in bpy.data.objects if o not in nbefore]
# per-garment hangers + a shared rod
ztop=1.34; rodz=ztop+0.06; SX=0.2
for x in xs:
    for piece in (cyl_between((x-SX*0.95,0,ztop-0.02),(x,0,ztop+0.03),0.006),
                  cyl_between((x+SX*0.95,0,ztop-0.02),(x,0,ztop+0.03),0.006),
                  cyl_between((x,0,ztop+0.03),(x,0,rodz),0.006)):
        piece.data.materials.append(GOLD); allg.append(piece)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.03,minor_radius=0.006,location=(x,0,rodz),major_segments=18,minor_segments=8)
    hk=bpy.context.active_object; hk.rotation_euler=(0,math.radians(90),0); hk.data.materials.append(GOLD); allg.append(hk)
bpy.ops.mesh.primitive_cylinder_add(radius=0.009,depth=3.2,location=(0.0,0,rodz),rotation=(0,math.pi/2,0))
rod=bpy.context.active_object; rod.data.materials.append(GOLD); allg.append(rod)

camd=bpy.data.cameras.new("C"); cam=bpy.data.objects.new("C",camd); sc.collection.objects.link(cam)
cam.location=(0.0,-3.0,0.95); cam.rotation_euler=(math.radians(90),0,0); camd.lens=42; sc.camera=cam
sd=bpy.data.lights.new("S","SUN"); sd.energy=2.6; so=bpy.data.objects.new("S",sd); sc.collection.objects.link(so); so.rotation_euler=(math.radians(48),math.radians(16),0)
fd=bpy.data.lights.new("F","AREA"); fd.energy=150; fd.size=4; fo=bpy.data.objects.new("F",fd); sc.collection.objects.link(fo); fo.location=(0,-2.6,1.2); fo.rotation_euler=(math.radians(90),0,0)
sc.world=bpy.data.worlds.new("W"); sc.world.use_nodes=True; sc.world.node_tree.nodes["Background"].inputs[0].default_value=(0.5,0.45,0.4,1); sc.world.node_tree.nodes["Background"].inputs[1].default_value=1.0
sc.render.engine='CYCLES'; sc.cycles.samples=22; sc.cycles.device='CPU'; sc.render.resolution_x=1100; sc.render.resolution_y=620; sc.render.filepath=f'/tmp/pw/hq_{GROUP}.png'
bpy.ops.render.render(write_still=True); print("RENDERED")
bpy.ops.object.select_all(action='DESELECT')
for o in allg: o.select_set(True)
bpy.context.view_layer.objects.active=allg[0]
bpy.ops.export_scene.gltf(filepath=f'/tmp/pw/hq_{GROUP}.glb', use_selection=True, export_apply=True); print("EXPORTED")
