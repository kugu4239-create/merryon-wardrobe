import bpy, bmesh, math, glob, mathutils, sys
V=mathutils.Vector
GROUP=int(sys.argv[-1]) if sys.argv[-1].isdigit() else 0
bpy.ops.wm.read_factory_settings(use_empty=True); sc=bpy.context.scene
texdir="/tmp/tex/fabric256/"; NRM=glob.glob(texdir+"*_NormalGL.jpg")[0]; RGH=glob.glob(texdir+"*_Roughness.jpg")[0]; COL=glob.glob(texdir+"*_Color.jpg")[0]

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
THREAD=bpy.data.materials.new("thr"); THREAD.use_nodes=True
tb=THREAD.node_tree.nodes.get("Principled BSDF"); tb.inputs["Base Color"].default_value=(0.3,0.26,0.2,1); tb.inputs["Roughness"].default_value=0.7
GOLD=bpy.data.materials.new("Gold"); GOLD.use_nodes=True
gb=GOLD.node_tree.nodes.get("Principled BSDF"); gb.inputs["Base Color"].default_value=(0.79,0.66,0.43,1); gb.inputs["Metallic"].default_value=1; gb.inputs["Roughness"].default_value=0.3

def cyl_between(A,B,radius,depthpad=0.0,open=False,subd=0,verts=14):
    A=V(A); B=V(B); d=B-A; L=d.length+depthpad; mid=(A+B)/2
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=radius,depth=L,location=mid,end_fill_type='NOTHING' if open else 'NGON')
    ob=bpy.context.active_object; q=V((0,0,1)).rotation_difference(d.normalized()); ob.rotation_euler=q.to_euler()
    if subd:
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.subdivide(number_cuts=subd); bpy.ops.object.mode_set(mode='OBJECT')
    return ob
def cone_between(A,B,r1,r2,verts=14):
    A=V(A); B=V(B); d=B-A; L=d.length; mid=(A+B)/2
    bpy.ops.mesh.primitive_cone_add(vertices=verts,radius1=r1,radius2=r2,depth=L,location=mid,end_fill_type='NOTHING')
    ob=bpy.context.active_object; q=V((0,0,1)).rotation_difference(d.normalized()); ob.rotation_euler=q.to_euler(); return ob

allobj=[]
def flange(pts,outdir,w,seammat,name="Fl"):
    pts=[V(p) for p in pts]; bm=bmesh.new(); vs=[]
    for p in pts:
        n=outdir(p); n=n.normalized() if n.length>1e-6 else V((0,0,1))
        vs.append((bm.verts.new(p),bm.verts.new(p+n*w)))
    for i in range(len(vs)-1):
        a0,b0=vs[i]; a1,b1=vs[i+1]; bm.faces.new([a0,a1,b1,b0])
    me=bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); o=bpy.data.objects.new(name,me); sc.collection.objects.link(o)
    o.modifiers.new("sol","SOLIDIFY").thickness=0.003; bpy.context.view_layer.objects.active=o; bpy.ops.object.shade_flat(); o.data.materials.append(seammat); allobj.append(o)
    line=[(p+ (outdir(p).normalized()*0.0015 if outdir(p).length>1e-6 else V())) for p in pts]
    cu=bpy.data.curves.new("ts","CURVE"); cu.dimensions='3D'; spl=cu.splines.new('POLY'); spl.points.add(len(line)-1)
    for k,p in enumerate(line): spl.points[k].co=(p.x,p.y,p.z,1)
    cu.bevel_depth=0.0014; cu.bevel_resolution=1; c=bpy.data.objects.new("ts",cu); sc.collection.objects.link(c); c.data.materials.append(THREAD); allobj.append(c)
def ring_pts(center,axis,r,nseg=14):
    axis=V(axis).normalized(); upv=V((0,0,1))
    if abs(axis.dot(upv))>0.9: upv=V((1,0,0))
    u=axis.cross(upv).normalized(); w=axis.cross(u).normalized(); c=V(center)
    return [c+u*math.cos(2*math.pi*k/nseg)*r+w*math.sin(2*math.pi*k/nseg)*r for k in range(nseg+1)]

def torso(x):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,radius=0.2,location=(x,0,1.05)); t=bpy.context.active_object
    for v in t.data.vertices: v.co.y*=0.5; v.co.z*=1.6
    for v in t.data.vertices:
        rel=v.co.z-1.05
        if rel<0:
            f=max(0.72,1.0+rel*0.55); v.co.x=(v.co.x-x)*f+x; v.co.y*=f
    bpy.ops.object.transform_apply(scale=True); t.modifiers.new("SS","SUBSURF").levels=1
    t.modifiers.new("C","COLLISION"); t.collision.thickness_outer=0.012
    bpy.ops.mesh.primitive_cylinder_add(radius=0.056,depth=0.26,location=(x,0,1.42)); bpy.context.active_object.modifiers.new("C","COLLISION")

bodies=[]  # (g, x, NX, NY, stride, backoff, sho_pts, nloop, seammat, color, kind, slit)
def build(x,spec):
    nm,rgb,kind,H,sleeve,neck,slit=spec
    MAT=fabric(nm,rgb); SEAM=fabric(nm+"_s",(rgb[0]*0.82,rgb[1]*0.82,rgb[2]*0.82),0.2)
    is_skirt=(kind=='skirt')
    if not is_skirt: torso(x)
    W=0.44; NX=10; ztop=(1.05 if is_skirt else 1.34); NY=max(14,int(H*20)); yf=0.16
    bm=bmesh.new()
    def panel(y):
        grid=[[None]*(NX+1) for _ in range(NY+1)]
        for j in range(NY+1):
            for i in range(NX+1):
                tt=j/NY; ww=W*(1.0-0.16*math.exp(-((tt-0.4)/0.13)**2)); ww*=(1.0+(0.55 if is_skirt else 0.45)*max(0.0,tt-0.45))
                grid[j][i]=bm.verts.new((x+(i/NX-0.5)*ww,y,ztop-tt*H))
        for j in range(NY):
            for i in range(NX): bm.faces.new([grid[j][i],grid[j][i+1],grid[j+1][i+1],grid[j+1][i]])
        return grid
    front=panel(+yf); back=panel(-yf); stride=NX+1; backoff=(NY+1)*stride
    NM=[4,5,6]; SHO=[i for i in range(1,NX) if i not in NM]; nloop=None; sho_pts=None
    if not is_skirt:
        for i in SHO:
            xm=(front[0][i].co.x-x)*0.92+x; front[0][i].co=(xm,0,ztop); back[0][i].co=(xm,0,ztop)
        for i in NM:
            xm=(front[0][i].co.x-x)*0.55+x; front[0][i].co=(xm,0.03,ztop+0.008); back[0][i].co=(xm,-0.03,ztop+0.008)
        nloop=[front[0][3].co.copy()]+[front[0][i].co.copy() for i in NM]+[front[0][7].co.copy()]+[back[0][i].co.copy() for i in (6,5,4)]
        sho_pts=[[front[0][i].co.copy() for i in range(0,4)],[front[0][i].co.copy() for i in range(7,NX+1)]]
    bm.verts.ensure_lookup_table()
    if not is_skirt:
        for i in SHO: bm.edges.new([front[0][i],back[0][i]])
    # 옆선 봉제(슬릿이면 아랫부분 일부 미봉제)
    jstart=0 if is_skirt else 4
    slit_from=int(NY*(1.0-slit[1])) if (slit and slit[0]=='side') else NY+1
    for j in range(jstart,NY+1):
        if j<slit_from: bm.edges.new([front[j][NX],back[j][NX]])      # 오른쪽 옆선(슬릿은 여기 아래 미봉)
        bm.edges.new([front[j][0],back[j][0]])
    me=bpy.data.meshes.new(nm); bm.to_mesh(me); bm.free(); g=bpy.data.objects.new(nm,me); sc.collection.objects.link(g)
    pin=[i for i in range(NX+1)]+[backoff+i for i in range(NX+1)]
    vg=g.vertex_groups.new(name="Pin"); vg.add(pin,1.0,'REPLACE')
    md=g.modifiers.new("Cloth","CLOTH"); s=md.settings; s.vertex_group_mass="Pin"; s.mass=0.2; s.quality=9
    s.tension_stiffness=30; s.compression_stiffness=30; s.shear_stiffness=10; s.bending_stiffness=0.6
    s.use_sewing_springs=True; s.sewing_force_max=2.5
    cs=md.collision_settings; cs.use_self_collision=True; cs.self_distance_min=0.004; cs.distance_min=0.01
    bpy.context.view_layer.objects.active=g; bpy.ops.object.shade_smooth(); g.modifiers.new("S","SUBSURF").render_levels=1; g.data.materials.append(MAT); allobj.append(g)
    # 리지드 반소매 / 긴팔(천)
    sleeve_seams=[]
    if not is_skirt and sleeve!='none':
        SX=0.2; SZ=1.28; ALEN=0.22 if sleeve=='short' else 0.5
        for sgn in (-1,1):
            A=(x+sgn*SX,0,SZ); B=(x+sgn*(SX+0.17),0,SZ-ALEN)
            arm=cyl_between(A,B,0.05); arm.modifiers.new("C","COLLISION"); arm.collision.thickness_outer=0.008
            Ain=(A[0]+(x-A[0])*0.14, A[1], A[2]+0.02); Bo=((B[0]-x)*1.02+x, B[1], B[2]-0.01)
            if sleeve=='short':
                sl=cone_between(Ain,Bo,0.085,0.062,14); bpy.context.view_layer.objects.active=sl; bpy.ops.object.shade_smooth(); sl.data.materials.append(MAT); allobj.append(sl)
                sleeve_seams.append((Ain,Bo,(V(B)-V(A))))
            else:
                sl=cyl_between(Ain,B,0.07,depthpad=0.03,open=True,subd=3,verts=14)
                Av=V(Ain); pins=[v.index for v in sl.data.vertices if (sl.matrix_world@v.co-Av).length<0.08]
                svg=sl.vertex_groups.new(name="Pin"); svg.add(pins,1.0,'REPLACE')
                smd=sl.modifiers.new("Cloth","CLOTH"); ss=smd.settings; ss.vertex_group_mass="Pin"; ss.mass=0.1; ss.quality=8
                ss.tension_stiffness=34; ss.compression_stiffness=34; ss.bending_stiffness=0.5
                smd.collision_settings.distance_min=0.006
                bpy.context.view_layer.objects.active=sl; bpy.ops.object.shade_smooth(); sl.modifiers.new("S","SUBSURF").render_levels=1; sl.data.materials.append(MAT); allobj.append(sl)
                sleeve_seams.append((Ain,B,(V(B)-V(A))))
    bodies.append(dict(g=g,x=x,NX=NX,NY=NY,stride=stride,backoff=backoff,sho=sho_pts,nloop=nloop,seam=SEAM,mat=MAT,kind=kind,neck=neck,sleeve=sleeve,slit=slit,ss=sleeve_seams,H=H,ztop=ztop))

# ===== 스펙 =====
BLACK=(0.05,0.05,0.055); NAVY=(0.10,0.13,0.24); BEIGE=(0.86,0.80,0.66); CREAM=(0.95,0.91,0.80); PINK=(0.90,0.60,0.64); WHITE=(0.93,0.92,0.90)
ALL=[
 ("pk_beige",BEIGE,'dress',1.12,'short','pk',None),
 ("pk_navy",NAVY,'dress',1.10,'short','pk',None),
 ("dress_black",BLACK,'dress',1.16,'short','round',None),
 ("dress_pink",PINK,'dress',1.08,'short','round',None),
 ("dress_cream_sl",CREAM,'dress',1.20,'none','round',None),
 ("dress_navy_long",NAVY,'dress',1.14,'long','round',None),
 ("skirt_black",BLACK,'skirt',0.86,'none','none',('side',0.42)),
 ("skirt_beige",BEIGE,'skirt',0.92,'none','none',('side',0.5)),
 ("pk_white",WHITE,'dress',1.10,'short','pk',None),
 ("dress_beige_sh",BEIGE,'dress',1.06,'short','round',None),
 ("dress_black_long",BLACK,'dress',1.18,'long','round',None),
 ("skirt_navy",NAVY,'skirt',0.88,'none','none',('side',0.45)),
]
grp=ALL[GROUP*4:GROUP*4+4]; xs=[]
for k,spec in enumerate(grp):
    x=k*0.6-0.3*(len(grp)-1); xs.append(x); build(x,spec)

sc.frame_start=1; sc.frame_end=80
for f in range(1,81): sc.frame_set(f)
print("baked",sc.frame_current)
for o in bpy.data.objects:
    if o.modifiers.get("C"): o.hide_render=True

def eval_world(obj, idxs):
    sub=obj.modifiers.get("S")
    if sub: sub.show_viewport=False
    dg=bpy.context.evaluated_depsgraph_get(); ev=obj.evaluated_get(dg); m=ev.to_mesh()
    pts=[(obj.matrix_world@m.vertices[i].co).copy() for i in idxs]; ev.to_mesh_clear()
    if sub: sub.show_viewport=True
    return pts

# ===== 마감 + 카라 + 옷걸이 (옷마다) =====
def collar(nloop,x,seammat,mat):
    col=[V(p) for p in nloop]; nC=len(col)
    def outN(i):
        a=col[max(0,i-1)]; b=col[min(nC-1,i+1)]; t=(b-a); t.z=0
        n=V((t.y,-t.x,0)) if t.length>1e-6 else V((col[i].x-x,col[i].y,0))
        if n.length<1e-6: n=V((0,1,0))
        n=n.normalized()
        if n.dot(V((col[i].x-x,col[i].y,0)))<0: n=-n
        return n
    cbm=bmesh.new(); cv=[]
    for i,p in enumerate(col):
        n=outN(i)
        cv.append((cbm.verts.new(p),cbm.verts.new(p+n*0.012+V((0,0,0.026))),cbm.verts.new(p+n*0.055+V((0,0,-0.004)))))
    for i in range(nC-1):
        a0,b0,c0=cv[i]; a1,b1,c1=cv[i+1]; cbm.faces.new([a0,a1,b1,b0]); cbm.faces.new([b0,b1,c1,c0])
    cme=bpy.data.meshes.new("Collar"); cbm.to_mesh(cme); cbm.free(); co=bpy.data.objects.new("Collar",cme); sc.collection.objects.link(co)
    co.modifiers.new("sol","SOLIDIFY").thickness=0.004; bpy.context.view_layer.objects.active=co; bpy.ops.object.shade_smooth(); co.data.materials.append(mat); allobj.append(co)

for bd in bodies:
    g=bd['g']; x=bd['x']; NX=bd['NX']; NY=bd['NY']; stride=bd['stride']; backoff=bd['backoff']; SEAM=bd['seam']; gx=x
    rad=lambda p,gx=gx: V((p.x-gx,p.y,0)); up=lambda p:V((0,0,1)); down=lambda p:V((0,-0.3,-1))
    j0=0 if bd['kind']=='skirt' else 4
    L=eval_world(g,[j*stride+0 for j in range(j0,NY+1)]); flange(L,rad,0.011,SEAM,"sideL")
    # 슬릿이면 오른쪽 옆선은 슬릿 위까지만
    slit=bd['slit']; sf=int(NY*(1.0-slit[1])) if (slit and slit[0]=='side') else NY+1
    R=eval_world(g,[j*stride+NX for j in range(j0,min(NY+1,sf+1))]); flange(R,rad,0.011,SEAM,"sideR")
    hemf=eval_world(g,[NY*stride+i for i in range(NX+1)]); hemb=eval_world(g,[backoff+NY*stride+i for i in range(NX,-1,-1)])
    flange(hemf+hemb+[hemf[0]],down,0.012,SEAM,"hem")
    for (Ain,Bo,axis) in bd['ss']:
        flange(ring_pts(Ain,axis,0.084),lambda p,A=axis:-V(A),0.008,SEAM,"armhole")
        if bd['sleeve']=='short': flange(ring_pts(Bo,axis,0.062),lambda p,A=axis:V(A),0.007,SEAM,"cuff")
    if bd['kind']!='skirt':
        # 어깨 겉시접
        for pts in bd['sho']: flange(pts,up,0.009,SEAM,"sho")
        if bd['neck']=='pk':
            collar(bd['nloop'],x,SEAM,bd['mat'])
            cf=eval_world(g,[j*stride+(NX//2) for j in range(0,NY//3+1)])
            flange(cf,lambda p:V((0,1,0)),0.018,SEAM,"placket")
            for kk in range(0,len(cf)-1):
                p=cf[kk]; bpy.ops.mesh.primitive_cylinder_add(radius=0.011,depth=0.006,location=(p.x,p.y+0.024,p.z),rotation=(math.radians(90),0,0)); bpy.context.active_object.data.materials.append(GOLD); allobj.append(bpy.context.active_object)
        else:
            # 라운드넥 바인딩
            nb=bd['nloop']; cu=bpy.data.curves.new("nb","CURVE"); cu.dimensions='3D'; spl=cu.splines.new('POLY'); spl.points.add(len(nb)-1)
            for kk,p in enumerate(nb): spl.points[kk].co=(p.x,p.y,p.z,1)
            spl.use_cyclic_u=True; cu.bevel_depth=0.009; cu.bevel_resolution=1
            o=bpy.data.objects.new("neckb",cu); sc.collection.objects.link(o); o.data.materials.append(SEAM); allobj.append(o)
    # 옷걸이
    ztop=bd['ztop']
    if bd['kind']=='skirt':
        # 스커트: 클립 옷걸이
        bar=cyl_between((x-0.16,0,ztop+0.04),(x+0.16,0,ztop+0.04),0.006); bar.data.materials.append(GOLD); allobj.append(bar)
        for cx in (x-0.13,x+0.13):
            cl=cyl_between((cx,0,ztop+0.04),(cx,0,ztop-0.02),0.006); cl.data.materials.append(GOLD); allobj.append(cl)
        nk=cyl_between((x,0,ztop+0.04),(x,0,ztop+0.12),0.006); nk.data.materials.append(GOLD); allobj.append(nk)
        hookz=ztop+0.12
    else:
        for piece in (cyl_between((x-0.18,0,ztop-0.02),(x,0,ztop+0.03),0.006),
                      cyl_between((x+0.18,0,ztop-0.02),(x,0,ztop+0.03),0.006),
                      cyl_between((x,0,ztop+0.03),(x,0,ztop+0.10),0.006)): piece.data.materials.append(GOLD); allobj.append(piece)
        hookz=ztop+0.10
    bpy.ops.mesh.primitive_torus_add(major_radius=0.028,minor_radius=0.006,location=(x,0,hookz),major_segments=14,minor_segments=6)
    hk=bpy.context.active_object; hk.rotation_euler=(0,math.radians(90),0); hk.data.materials.append(GOLD); allobj.append(hk)

# 봉
bpy.ops.mesh.primitive_cylinder_add(radius=0.009,depth=3.2,location=(0,0,1.44),rotation=(0,math.pi/2,0)); rod=bpy.context.active_object; rod.data.materials.append(GOLD); allobj.append(rod)

# ===== 카메라/조명/렌더 =====
camd=bpy.data.cameras.new("C"); cam=bpy.data.objects.new("C",camd); sc.collection.objects.link(cam)
cam.location=(0,-3.0,0.9); cam.rotation_euler=(math.radians(90),0,0); camd.lens=44; sc.camera=cam
sd=bpy.data.lights.new("S","SUN"); sd.energy=0.9; so=bpy.data.objects.new("S",sd); sc.collection.objects.link(so); so.rotation_euler=(math.radians(46),math.radians(18),0)
fd=bpy.data.lights.new("F","AREA"); fd.energy=14; fd.size=4; fo=bpy.data.objects.new("F",fd); sc.collection.objects.link(fo); fo.location=(0.4,-2.6,1.2); fo.rotation_euler=(math.radians(88),0,0)
sc.world=bpy.data.worlds.new("W"); sc.world.use_nodes=True; sc.world.node_tree.nodes["Background"].inputs[0].default_value=(0.5,0.46,0.42,1); sc.world.node_tree.nodes["Background"].inputs[1].default_value=0.4
sc.view_settings.view_transform='AgX'
sc.render.engine='CYCLES'; sc.cycles.samples=20; sc.cycles.device='CPU'; sc.render.resolution_x=1100; sc.render.resolution_y=620; sc.render.filepath=f'/tmp/pw/w2_{GROUP}.png'
bpy.ops.render.render(write_still=True); print("RENDERED")
bpy.ops.object.select_all(action='DESELECT')
for o in allobj:
    try: o.select_set(True)
    except: pass
bpy.context.view_layer.objects.active=allobj[0]
bpy.ops.export_scene.gltf(filepath=f'/tmp/pw/w2_{GROUP}.glb', use_selection=True, export_apply=True, export_yup=True); print("EXPORTED")
