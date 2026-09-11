import bpy,math,random
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parent.parent;S=R/'source';A=R.parent/'characters/source'
random.seed(17);bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
v=[];faces={};fuv={};uvs=[];g=''
for l in (A/'base.obj').read_text().splitlines():
 t=l.split()
 if not t:continue
 if t[0]=='v':v.append(Vector(tuple(map(float,t[1:4]))))
 if t[0]=='vt':uvs.append(tuple(map(float,t[1:3])))
 if t[0]=='g':g=t[1];faces.setdefault(g,[]);fuv.setdefault(g,[])
 if t[0]=='f':
  faces[g].append([int(x.split('/')[0])-1 for x in t[1:]]);fuv[g].append([int(x.split('/')[1])-1 for x in t[1:]])
def target(p):
 out={}
 for l in p.read_text().splitlines():
  t=l.split()
  if len(t)==4 and t[0].isdigit():out[int(t[0])]=Vector(tuple(map(float,t[1:])))
 return out
for age,w in [('old',.9),('young',.1)]:
 for i,d in target(A/f'caucasian-female-{age}.target').items():v[i]+=d*w
def center(g):
 ids=set(i for f in faces[g] for i in f);return sum((v[i] for i in ids),Vector())/len(ids)
E=center('joint-l-eye');N=center('joint-neck');H=center('joint-head');bottom=N.y-.22
cv=lambda p:Vector((p.x*.1,-p.z*.1,((E.y+(p.y-E.y)*.65 if p.y>E.y else p.y)-bottom)*.1))
def material(name,color,rough=.6):
 m=bpy.data.materials.new(name);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*color,1);b.inputs['Roughness'].default_value=rough;return m
skin=material('Reference skin',(0.5,.3,.2));side=material('Side skin',(.40,.225,.145));side.node_tree.nodes['Principled BSDF'].inputs['Subsurface Weight'].default_value=.06
tex=skin.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(S/'reference-neutral.png'));tex.image.pack();skin.node_tree.links.new(tex.outputs['Color'],skin.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
# Photo projection stays attached to vertices as the facial geometry moves.
selected=[(f,u) for f,u in zip(faces['body'],fuv['body']) if min(v[i].y for i in f)>N.y+.15]
fs=[f for f,u in selected]
ids=sorted(set(i for f in fs for i in f));idx={i:j for j,i in enumerate(ids)}
me=bpy.data.meshes.new('Face topology');me.from_pydata([cv(v[i]) for i in ids],[],[[idx[i] for i in f] for f in fs]);me.update()
head=bpy.data.objects.new('Elder head',me);bpy.context.collection.objects.link(head);head.data.materials.append(skin);head.data.materials.append(side)
uv=me.uv_layers.new(name='Reference projection')
for poly,f in zip(me.polygons,fs):
 a=sum((v[i] for i in f),Vector())/len(f);poly.use_smooth=True;poly.material_index=0
 for li,i in zip(poly.loop_indices,f):uv.data[li].uv=((625+v[i].x*239)/1266,1-(295+(E.y-v[i].y)*208)/714)
atlas=me.uv_layers.new(name='Skin atlas')
for poly,(f,u) in zip(me.polygons,selected):
 for li,ui in zip(poly.loop_indices,u):atlas.data[li].uv=uvs[ui]
me.uv_layers.active=atlas;atlas.active_render=True
weight=me.color_attributes.new(name='Photo blend',type='FLOAT_COLOR',domain='POINT')
clamp=lambda x:max(0,min(1,x))
for j,i in enumerate(ids):
 p=v[i];edge=.80-.22*clamp((p.y-E.y)/.35);w=clamp((p.z-H.z-.2)/.35)*clamp((edge-abs(p.x))/.14)*clamp((p.y-5.60)/.25)*clamp((E.y+.75-p.y)/.25)
 weight.data[j].color=(w,w,w,1)
nt=skin.node_tree;refuv=nt.nodes.new('ShaderNodeUVMap');refuv.uv_map='Reference projection';nt.links.new(refuv.outputs['UV'],tex.inputs['Vector'])
mix=nt.nodes.new('ShaderNodeMixRGB');mix.blend_type='MIX';mix.inputs[1].default_value=(.4,.225,.145,1)
color=nt.nodes.new('ShaderNodeVertexColor');color.layer_name='Photo blend'
nt.links.new(color.outputs['Color'],mix.inputs[0]);nt.links.new(tex.outputs['Color'],mix.inputs[2]);nt.links.new(mix.outputs[0],nt.nodes['Principled BSDF'].inputs['Base Color'])
head.shape_key_add(name='Basis')
smile=head.shape_key_add(name='Smile');smile.value=0;blink=head.shape_key_add(name='Blink');blink.value=0
smile_targets=[('mouth-corner-puller',.55),('mouth-upward-retraction',.22),('mouth-open',.08),('eye-left-slit',.18),('eye-right-slit',.18)]
for name,w in smile_targets:
 for i,d in target(S/(name+'.target')).items():
  if i in idx:smile.data[idx[i]].co+=Vector((d.x,-d.z,d.y*(.65 if v[i].y>E.y else 1)))*.1*w
for name in ['eye-left-closure','eye-right-closure']:
 for i,d in target(S/(name+'.target')).items():
  if i in idx:blink.data[idx[i]].co+=Vector((d.x,-d.z,d.y*(.65 if v[i].y>E.y else 1)))*.1
# Subdivide each expression identically, preserving UVs and morph topology.
sub=head.modifiers.new('Facial detail','SUBSURF');sub.levels=2
bpy.context.view_layer.objects.active=head
bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
base=bpy.data.meshes.new_from_object(head.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps)
coords={}
for name,key in [('Smile',smile),('Blink',blink)]:
 key.value=1;bpy.context.view_layer.update();ev=head.evaluated_get(deps);tmp=ev.to_mesh();coords[name]=[p.co.copy() for p in tmp.vertices];ev.to_mesh_clear();key.value=0
bpy.data.objects.remove(head,do_unlink=True);head=bpy.data.objects.new('Elder head · expressions',base);bpy.context.collection.objects.link(head);head.shape_key_add(name='Basis')
for name,co in coords.items():
 k=head.shape_key_add(name=name);k.value=0
 for point,pos in zip(k.data,co):point.co=pos

for vertex in head.data.vertices:
 if vertex.co.z<.04:vertex.co.z=.04
for block in head.data.shape_keys.key_blocks:
 for point in block.data:
  if point.co.z<.04:point.co.z=.04
# Bake a continuous skin atlas so the photograph does not end at a visible border.
bpy.ops.object.select_all(action='DESELECT');head.select_set(True);bpy.context.view_layer.objects.active=head
baked=bpy.data.images.new('Elder skin atlas',width=2048,height=2048,alpha=False)
bakeNode=skin.node_tree.nodes.new('ShaderNodeTexImage');bakeNode.image=baked;skin.node_tree.nodes.active=bakeNode
bpy.context.scene.render.engine='CYCLES';bpy.context.scene.cycles.samples=1
bpy.ops.object.bake(type='DIFFUSE',pass_filter={'COLOR'},margin=12)
baked.filepath_raw=str(S/'skin-atlas.png');baked.file_format='PNG';baked.save();baked.pack()
nt.links.new(bakeNode.outputs['Color'],nt.nodes['Principled BSDF'].inputs['Base Color'])
head.data.color_attributes.remove(head.data.color_attributes['Photo blend'])
atlasUV=nt.nodes.new('ShaderNodeUVMap');atlasUV.uv_map='Skin atlas';nt.links.new(atlasUV.outputs['UV'],bakeNode.inputs['Vector'])

def sphere(name,p,scale,mat):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=40,ring_count=24,location=p);o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(mat)
 for poly in o.data.polygons:poly.use_smooth=True
 return o
white=material('Eye white',(.67,.65,.59),.25);iris=material('Grey green iris',(.065,.14,.13),.33);pupil=material('Pupil',(.003,.004,.004),.2)
for key in ['l','r']:
 p=cv(center('joint-'+key+'-eye'));r=.0115
 sphere('Eye '+key,p,(r,r,r),white);p.y-=r*.95;sphere('Iris '+key,p,(.0048,.0019,.0048),iris);p.y-=.0015;sphere('Pupil '+key,p,(.0021,.0006,.0021),pupil)
enamel=material('Warm natural enamel',(.66,.60,.48),.33)
for n in range(10):
 x=(n-4.5)*.044;z=1.575-.7*x*x;y=6.055
 bpy.ops.mesh.primitive_cube_add(size=1,location=cv(Vector((x,y,z))))
 tooth=bpy.context.object;tooth.name='Upper tooth '+str(n);tooth.scale=(.0042,.004,.0078)
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 bevel=tooth.modifiers.new('Rounded enamel','BEVEL');bevel.width=.0008;bevel.segments=3
 tooth.data.materials.append(enamel)
 for poly in tooth.data.polygons:poly.use_smooth=True
# Individual silver hair fibers; no billboard or painted hair plane.
hairs=[material('Silver hair '+str(i),(.36+i*.07,.35+i*.07,.32+i*.075),.65) for i in range(5)]
def strand(points,mat,radius):
 data=bpy.data.curves.new('Silver strand','CURVE');data.dimensions='3D';data.resolution_u=3;data.bevel_depth=radius;data.bevel_resolution=1
 sp=data.splines.new('BEZIER');sp.bezier_points.add(len(points)-1)
 for b,p in zip(sp.bezier_points,points):b.co=cv(p);b.handle_left_type='AUTO';b.handle_right_type='AUTO'
 o=bpy.data.objects.new('Silver strand',data);bpy.context.collection.objects.link(o);o.data.materials.append(mat)
high=max(v[i].y for i in ids)
for n in range(1250):
 phi=random.uniform(0,2*math.pi);front=math.sin(phi)>.3
 end=random.uniform(1.05,1.45) if front else random.uniform(1.8,2.25)
 start=random.uniform(.05,.60);points=[]
 for k in range(10):
  t=k/9;theta=start+(end-start)*t;angle=phi
  if front:angle=phi+((0 if math.cos(phi)>0 else math.pi)-phi)*t*.82
  p=Vector((.90*math.sin(theta)*math.cos(angle),high-.69+.79*math.cos(theta),H.z+.99*math.sin(theta)*math.sin(angle)))
  p.x+=.028*math.sin(t*11+phi*3);p.z+=.025*math.cos(t*12+phi)
  if not front and t>.65:p.y-=(t-.65)*random.uniform(2.2,2.8);p.x+=math.cos(phi)*.14*math.sin((t-.65)*7)
  points.append(p)
 strand(points,random.choice(hairs),random.uniform(.00010,.00024))
# Eyebrows are sparse short silver-brown hairs, independent of the skin photograph.
brow=material('Soft brows',(.20,.15,.10),.8)
for sideSign in [-1,1]:
 for n in range(45):
  x=sideSign*(.13+n*.006);y=E.y+.16+.045*math.sin(n/44*math.pi)
  candidates=[p.z for p in v[:13380] if abs(p.x-x)<.035 and abs(p.y-y)<.04]
  z=max(candidates) if candidates else E.z+.08
  strand([Vector((x,y,z+.018)),Vector((x+sideSign*.02,y+.045,z+.016))],brow,.00012)
# Merge fibers by material for a bounded number of draw calls.
for mat in hairs+[brow]:
 objects=[o for o in bpy.context.scene.objects if o.type=='CURVE' and o.data.materials[0]==mat]
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.convert(target='MESH');bpy.ops.object.join()
# Export a neutral model with inspectable morph targets.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(R/'elder-head.glb'),export_format='GLB',use_selection=True,export_animations=False,export_morph=True)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=48;scene.render.resolution_x=1000;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.world.color=(.22,.22,.22);scene.view_settings.view_transform='AgX'
for name,loc,energy,size in [('Softbox',(-.5,-.7,.8),35,1.2),('Fill',(.5,-.3,.35),12,.8),('Rim',(.2,.4,.8),40,.7)]:
 light=bpy.data.lights.new(name,'AREA');light.energy=energy;light.size=size;o=bpy.data.objects.new(name,light);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,.18))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(0,-1,.17));cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=.39;cam.rotation_euler=(Vector((0,0,.16))-cam.location).to_track_quat('-Z','Y').to_euler();scene.camera=cam
scene.render.image_settings.file_format='PNG';bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(S/'elder-head.blend'),compress=True)
for expression in [0,1]:
 head.data.shape_keys.key_blocks['Smile'].value=expression;scene.render.filepath=str(R/'previews'/('smile.png' if expression else 'neutral.png'));bpy.ops.render.render(write_still=True)
head.data.shape_keys.key_blocks['Smile'].value=.7
cam.location=(.65,-.8,.17);cam.rotation_euler=(Vector((0,0,.16))-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(R/'previews'/'three-quarter.png');bpy.ops.render.render(write_still=True)
print('HEAD READY')
