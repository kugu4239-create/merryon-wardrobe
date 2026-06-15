import bpy, bmesh, math, glob, mathutils, sys
bpy.ops.wm.read_factory_settings(use_empty=True); sc=bpy.context.scene
texdir="/tmp/tex/fabric256/"; NRM=glob.glob(texdir+"*_NormalGL.jpg")[0]
def fabric(name,rgb):
    m=bpy.data.materials.new(name); m.use_nodes=True; nt=m.node_tree; b=nt.nodes.get("Principled BSDF")
    b.inputs['Base Color'].default_value=(rgb[0],rgb[1],rgb[2],1); b.inputs['Roughness'].default_value=0.82
    if 'Sheen Weight' in b.inputs: b.inputs['Sheen Weight'].default_value=0.4
    tc=nt.nodes.new("ShaderNodeTexCoord"); mp=nt.nodes.new("ShaderNodeMapping"); mp.inputs['Scale'].default_value=(8,8,8); nt.links.new(tc.outputs['Generated'],mp.inputs['Vector'])
    ni=nt.nodes.new("ShaderNodeTexImage"); ni.image=bpy.data.images.load(NRM); ni.image.colorspace_settings.name='Non-Color'; nt.links.new(mp.outputs['Vector'],ni.inputs['Vector'])
    nm=nt.nodes.new("ShaderNodeNormalMap"); nm.inputs['Strength'].default_value=0.4; nt.links.new(ni.outputs['Color'],nm.inputs['Color']); nt.links.new(nm.outputs['Normal'],b.inputs['Normal'])
    return m
# floor collision
bpy.ops.mesh.primitive_plane_add(size=6, location=(0,0,0)); fl=bpy.context.active_object; fl.modifiers.new("C","COLLISION")
# small soft obstacle so the scarf crumples (a low cylinder)
bpy.ops.mesh.primitive_cylinder_add(radius=0.12, depth=0.06, location=(0.15,0.0,0.03)); ob=bpy.context.active_object; ob.modifiers.new("C","COLLISION")
allobj=[]
def scarf(name,rgb,loc,rot,L=1.5,Wd=0.34):
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=48, y_subdivisions=12, size=1, location=loc); g=bpy.context.active_object
    g.scale=(L/2,Wd/2,1); g.rotation_euler=(0,0,rot); bpy.ops.object.transform_apply(scale=True,rotation=True)
    g.location.z=0.6  # drop height (정렬용)
    cl=g.modifiers.new("Cloth","CLOTH"); s=cl.settings
    s.mass=0.12; s.quality=10; s.tension_stiffness=8; s.compression_stiffness=8; s.shear_stiffness=4; s.bending_stiffness=0.06
    cs=cl.collision_settings; cs.use_self_collision=True; cs.distance_min=0.004; cs.self_distance_min=0.004
    g.modifiers.new("S","SUBSURF").render_levels=2
    bpy.context.view_layer.objects.active=g; bpy.ops.object.shade_smooth(); g.data.materials.append(fabric(name+"_m",rgb))
    allobj.append(g); return g
# 두 개: 크림 + 더스티로즈 (살짝 겹치게)
scarf("scarf_cream",(0.90,0.85,0.72),(0.0,0.0,0),1.6,0.36)
scarf("scarf_rose",(0.83,0.62,0.63),(0.08,0.18,0.5),1.4,0.3)
sc.frame_start=1; sc.frame_end=70
for f in range(1,71): sc.frame_set(f)
print("baked")
for o in bpy.data.objects:
    if o.modifiers.get("C"): o.hide_render=True
bpy.ops.object.select_all(action='DESELECT')
for o in allobj: o.select_set(True)
bpy.context.view_layer.objects.active=allobj[0]
bpy.ops.export_scene.gltf(filepath='/tmp/pw/scarves.glb', use_selection=True, export_apply=True); print("EXPORTED")
