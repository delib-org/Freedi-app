"""Blender 5: build CC0 anatomy-based village cast and portable glTF assets.
Run: blender -b --python build_characters.py
MakeHuman coordinates: X right, Y up, Z front. Blender: X right, -Y front, Z up.
"""
import bpy, math, random, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent.parent
SRC=ROOT/'source'
random.seed(41)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
verts=[]; faces={}; uv=[]; faceuv={}; group=''
for line in (SRC/'base.obj').read_text().splitlines():
 t=line.split()
 if not t: continue
 if t[0]=='v': verts.append(Vector(tuple(map(float,t[1:4]))))
 elif t[0]=='vt':uv.append(tuple(map(float,t[1:3])))
 elif t[0]=='g': group=t[1];faces.setdefault(group,[]);faceuv.setdefault(group,[])
 elif t[0]=='f':
  faces[group].append([int(s.split('/')[0])-1 for s in t[1:]])
  faceuv[group].append([int(s.split('/')[1])-1 for s in t[1:]])

def mat(name,color,rough=.65,metal=0):
 color=tuple(((x+.055)/1.055)**2.4 if x>.04045 else x/12.92 for x in color)
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
 return m

def mesh(name,vs,fs,material):
 data=bpy.data.meshes.new(name);data.from_pydata(vs,[],fs);data.update()
 ob=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(ob);ob.data.materials.append(material)
 for p in data.polygons:p.use_smooth=True
 return ob

def sphere(name,loc,scale,material):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16,location=loc)
 ob=bpy.context.object;ob.name=name;ob.scale=scale;ob.data.materials.append(material)
 for p in ob.data.polygons:p.use_smooth=True
 return ob

def curve(name,points,radius,material):
 data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D';data.resolution_u=4;data.bevel_depth=radius;data.bevel_resolution=1
 sp=data.splines.new('BEZIER');sp.bezier_points.add(len(points)-1)
 for p,co in zip(sp.bezier_points,points):p.co=co;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
 ob=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(ob);ob.data.materials.append(material);return ob

CAST=[
 dict(id='ezra',name='Ezra',sex='male',old=.94,mix=.18,skin=(.58,.36,.23),hair=(.67,.65,.58),shirt=(.64,.66,.57),pants=(.16,.20,.19),height=1.77,style='kippah',beard=True),
 dict(id='miriam',name='Miriam',sex='female',old=.88,mix=.25,skin=(.68,.44,.30),hair=(.58,.56,.51),shirt=(.20,.35,.33),pants=(.16,.22,.23),height=1.66,style='scarf',beard=False),
 dict(id='naama',name='Naama',sex='female',old=.06,mix=.12,skin=(.78,.55,.40),hair=(.085,.043,.025),shirt=(.66,.37,.22),pants=(.10,.16,.21),height=1.70,style='bun',beard=False),
 dict(id='amir',name='Amir',sex='male',old=.08,mix=.87,skin=(.25,.12,.067),hair=(.026,.019,.017),shirt=(.28,.40,.45),pants=(.22,.20,.16),height=1.83,style='curls',beard=False),
 dict(id='ruth',name='Ruth',sex='female',old=.77,mix=.90,skin=(.32,.17,.10),hair=(.52,.49,.45),shirt=(.45,.32,.41),pants=(.19,.17,.23),height=1.67,style='short',beard=False),
 dict(id='noam',name='Noam',sex='male',old=.24,mix=.06,skin=(.75,.53,.40),hair=(.16,.085,.041),shirt=(.71,.66,.53),pants=(.17,.23,.28),height=1.78,style='kippah',beard=True),
]
roots=[];stats=[]
for ci,c in enumerate(CAST):
 before=set(bpy.data.objects)
 v=[a.copy() for a in verts]
 for age,aw in [('young',1-c['old']),('old',c['old'])]:
  for race,rw in [('african',c['mix']),('caucasian',1-c['mix']),('universal',1)]:
   fn=f"{race}-{c['sex']}-{age}"+('-averagemuscle-averageweight' if race=='universal' else '')+'.target'
   for line in (SRC/fn).read_text().splitlines():
    t=line.split()
    if len(t)==4 and not t[0].startswith('#'):v[int(t[0])]+=Vector(tuple(map(float,t[1:])))*(aw*rw)
 body_ids=set(i for f in faces['body'] for i in f)
 low=min(v[i].y for i in body_ids);high=max(v[i].y for i in body_ids);s=c['height']/(high-low)
 def center(g):
  ids=set(i for f in faces[g] for i in f);return sum((v[i] for i in ids),Vector())/len(ids)
 shoulder=center('joint-l-shoulder');hip=center('joint-pelvis')
 def pose(p):
  p=p.copy();side=1 if p.x>=0 else -1
  # Relax the A-pose arms with continuous shoulder blending.
  w=max(0,min(1,(abs(p.x)-shoulder.x+.19)/.65))
  if p.y<hip.y-2:w=0
  a=-side*math.radians(24)*w;px=p.x-side*shoulder.x;py=p.y-shoulder.y
  p.x=side*shoulder.x+px*math.cos(a)-py*math.sin(a);p.y=shoulder.y+px*math.sin(a)+py*math.cos(a)
  return Vector((p.x*s,-p.z*s,(p.y-low)*s))
 skin=mat(c['name']+' skin',c['skin'],.61)
 skin.node_tree.nodes.get('Principled BSDF').inputs['Subsurface Weight'].default_value=.08
 lip=mat(c['name']+' lips',tuple(x*.71 for x in c['skin']),.59)
 hair=mat(c['name']+' hair',c['hair'],.79)
 cloth=mat(c['name']+' linen',c['shirt'],.89);trouser=mat(c['name']+' trousers',c['pants'],.91)
 leather=mat(c['name']+' leather',(.065,.045,.031),.69)
 white=mat(c['name']+' eye ivory',(.72,.74,.70),.26);iris=mat(c['name']+' iris',(.095,.060,.025),.32);black=mat(c['name']+' pupil',(.008,.007,.006),.22)
 def subset(name,fs,material,offset=0,fn=None):
  ids=sorted(set(i for f in fs for i in f));lookup={k:j for j,k in enumerate(ids)}
  vs=[]
  for i in ids:
   p=v[i].copy()
   if fn:p=fn(p)
   vs.append(pose(p))
  ob=mesh(c['name']+' '+name,vs,[[lookup[i] for i in f] for f in fs],material)
  if offset:
   sol=ob.modifiers.new('Tailored thickness','SOLIDIFY');sol.thickness=offset
  return ob
 visiblefaces=[]
 for f in faces['body']:
  a=sum((v[i] for i in f),Vector())/len(f)
  if a.y>center('joint-neck').y-.65 or (abs(a.x)>2.4 and a.y>hip.y-2):visiblefaces.append(f)
 body=subset('anatomy',visiblefaces,skin)
 sub=body.modifiers.new('Smooth anatomical surface','SUBSURF');sub.levels=1
 # Tailored garments: clean sewn ring topology, independent of anatomical details.
 def avg(f):return sum((v[i] for i in f),Vector())/len(f)
 neck=center('joint-neck').y;waist=hip.y+.55
 def tube(name,rings,material,segments=40):
  points=[];polys=[]
  for ri,(cx,y,cz,rx,rz) in enumerate(rings):
   for k in range(segments):
    a=k*2*math.pi/segments
    fold=.016*math.sin(a*9+ri*.6)
    points.append(pose(Vector((cx+(rx+fold)*math.cos(a),y,cz+(rz+fold)*math.sin(a)))))
   if ri:
    for k in range(segments):
     a=(ri-1)*segments+k;b=(ri-1)*segments+(k+1)%segments
     polys.append((a,b,b+segments,a+segments))
  ob=mesh(c['name']+' '+name,points,polys,material)
  sub=ob.modifiers.new('Soft fabric folds','SUBSURF');sub.levels=2
  solid=ob.modifiers.new('Sewn fabric thickness','SOLIDIFY');solid.thickness=.006
  return ob
 sw=shoulder.x
 hem=waist-.3
 # A loose linen overshirt, broad enough to hang naturally from the chest.
 rings=[(0,hem,.25,sw*1.22,1.13),(0,hem+.10,.25,sw*1.22,1.13),
  (0,waist+.8,.22,sw*.98,.96),(0,shoulder.y-.75,.25,sw*1.04,1.05),
  (0,shoulder.y-.18,.23,sw*1.18,.89),(0,shoulder.y+.15,.20,sw*1.12,.74),
  (0,neck-.40,.15,.73,.86),(0,neck-.32,.15,.73,.86)]
 tube('linen tunic',rings,cloth)
 for side in [-1,1]:
  # Overlapping shoulder seams and elbow-length sleeves.
  prefix='l' if side==1 else 'r'
  elbow=center('joint-'+prefix+'-elbow');hand=center('joint-'+prefix+'-hand')
  start=Vector((side*sw,shoulder.y+.1,.21));direction=(elbow-start).normalized()
  u=direction.cross(Vector((0,0,1))).normalized();w=direction.cross(u).normalized()
  sleeveverts=[];sleevefaces=[];n=32
  for ri,(t,r) in enumerate([(0,.65),(.08,.65),(.55,.49),(1.05,.40),(1.1,.40)]):
   a=start.lerp(elbow,t)
   for k in range(n):sleeveverts.append(pose(a+r*(math.cos(k*2*math.pi/n)*u+math.sin(k*2*math.pi/n)*w)))
   if ri:
    for k in range(n):sleevefaces.append(((ri-1)*n+k,(ri-1)*n+(k+1)%n,ri*n+(k+1)%n,ri*n+k))
  sleevefaces.append(tuple(range(n-1,-1,-1)))
  sleeve=mesh(c['name']+' '+prefix+' linen sleeve',sleeveverts,sleevefaces,cloth)
  sleeve.modifiers.new('Sleeve smoothing','SUBSURF').levels=2
  sleeve.modifiers.new('Sleeve hem','SOLIDIFY').thickness=.006
  knee=center('joint-'+prefix+'-knee');ankle=center('joint-'+prefix+'-ankle')
  thigh=center('joint-'+prefix+'-upper-leg')
  leg=[(side*.79,waist+.10,.25,.88,.91),
       (side*.83,hip.y-.6,.20,.85,.91),
       (knee.x,knee.y+1.0,knee.z,.62,.69),
       (knee.x,knee.y,knee.z,.58,.61),
       (ankle.x,ankle.y+.25,ankle.z,.44,.46),
       (ankle.x,ankle.y+.12,ankle.z,.44,.46)]
  tube(prefix+' trouser leg',leg,trouser)
 for side in [-1,1]:
  foot=[pose(v[i]) for i in body_ids if v[i].y<low+.50 and v[i].x*side>0]
  minx=min(p.x for p in foot);maxx=max(p.x for p in foot);miny=min(p.y for p in foot);maxy=max(p.y for p in foot)
  mid=((minx+maxx)/2,(miny+maxy)/2,.042)
  sphere(c['name']+' leather loafer',mid,((maxx-minx)/2+.009,(maxy-miny)/2+.012,.047),leather)
  sphere(c['name']+' shoe sole',(mid[0],mid[1],.013),((maxx-minx)/2+.010,(maxy-miny)/2+.014,.017),leather)
 for k in range(6):
  y=hem+.4+k*(neck-hem-.9)/6
  z=1.23 if y<shoulder.y else .90
  sphere(c['name']+' shirt button',pose(Vector((0,y,z))),(.005,.003,.005),leather)
 # Anatomical eye centers from the morph-aware joint helper cages.
 for side in ['l','r']:
  eye=center('joint-'+side+'-eye');r=.116*s
  sphere(c['name']+' '+side+' sclera',pose(eye),(r,r,r),white)
  front=pose(eye);front.y-=r*.94
  sphere(c['name']+' '+side+' iris',front,(r*.47,r*.17,r*.47),iris)
  front.y-=r*.12;sphere(c['name']+' '+side+' pupil',front,(r*.23,r*.08,r*.23),black)
  # Eyebrows hug the brow ridge; dark individual strokes.
  points=[]
  for k in range(7):
   x=eye.x+(-.19+k*.063);y=eye.y+.20+.035*math.sin(k/6*math.pi)
   candidates=[p.z for p in v[:13380] if abs(p.x-x)<.065 and abs(p.y-y)<.06]
   z=max(candidates) if candidates else eye.z+.085
   points.append(pose(Vector((x,y,z+.018))))
  curve(c['name']+' eyebrow',points,.0015,hair)
 # Hair cap taken directly from scalp topology, so it hugs each unique head.
 eyeY=(center('joint-l-eye').y+center('joint-r-eye').y)/2
 headcenter=center('joint-head')
 scalpfaces=[f for f in faces['body'] if (avg(f).y>eyeY+.43 or (avg(f).y>eyeY-.15 and avg(f).z<headcenter.z+.15))]
 def hairshape(p):
  p.x*=1.035;p.z=headcenter.z+(p.z-headcenter.z)*1.045;p.y+=.045;return p
 if c['style']!='scarf':
  cap=subset('sculpted hair',scalpfaces,hair,.008,hairshape)
  smooth=cap.modifiers.new('Soft hairline','SMOOTH');smooth.factor=1;smooth.iterations=5
  cap.modifiers.new('Hair smoothing','SUBSURF').levels=1
 if c['style']=='bun':
  sphere(c['name']+' gathered hair',pose(Vector((0,eyeY+.12,headcenter.z-.85))),(.082,.061,.07),hair)
 if c['style']=='curls':
  for f in random.sample(scalpfaces,min(70,len(scalpfaces))):
   p=pose(hairshape(avg(f)));sphere(c['name']+' curl',p,(.006,.006,.006),hair)
 if c['style']=='kippah':
  kippah=mat(c['name']+' knitted kippah',(.085,.12,.16),.94)
  capfaces=[f for f in scalpfaces if avg(f).y>high-.24 and avg(f).z<headcenter.z+.4]
  subset('kippah',capfaces,kippah,.019,hairshape).modifiers.new('Kippah smoothing','SUBSURF').levels=1
 if c['style']=='scarf':
  scarf=mat('Miriam woven ochre scarf',(.63,.43,.20),.94)
  scarfob=subset('head scarf',scalpfaces,scarf,.02,lambda p:hairshape(p)+Vector((p.x*.04,.025,(p.z-headcenter.z)*.04)))
  smooth=scarfob.modifiers.new('Woven edge','SMOOTH');smooth.factor=1;smooth.iterations=8
  scarfob.modifiers.new('Scarf smoothing','SUBSURF').levels=1
  # Draped narrow tails at the nape, with folded edges.
  for side in [-1,1]:
   pts=[pose(Vector((side*.55,eyeY+.10,headcenter.z-.55))),pose(Vector((side*.57,eyeY-.7,headcenter.z-.65))),pose(Vector((side*.65,neck-.45,headcenter.z-.48)))]
   curve('Miriam scarf fold',pts,.026,scarf)
 if c['beard']:
  # Closely cropped chin beard, with the mouth kept unobstructed.
  body.data.materials.append(hair)
  chinY=neck+.45
  for poly,f in zip(body.data.polygons,visiblefaces):
   a=avg(f)
   if chinY<a.y<chinY+.30 and a.z>headcenter.z+.40 and abs(a.x)<.5:poly.material_index=len(body.data.materials)-1
 # The upper tunic follows the shoulder anatomy as a sewn yoke.
 body.data.materials.append(cloth)
 for poly,f in zip(body.data.polygons,visiblefaces):
  a=avg(f)
  if a.y<neck+.03 and abs(a.x)<2.0:poly.material_index=len(body.data.materials)-1
 # Bake modifiers and curves into portable meshes (no Blender-only shaders).
 objs=list(set(bpy.data.objects)-before)
 bpy.ops.object.select_all(action='DESELECT')
 for ob in objs:ob.select_set(True)
 bpy.context.view_layer.objects.active=body;bpy.ops.object.convert(target='MESH')
 objs=list(set(bpy.data.objects)-before)
 # Join by material: portable assets use few draw calls, with named features retained as materials.
 mats={ob.data.materials[0] for ob in objs if ob.type=='MESH'}
 joined=[]
 batches=[[ob for ob in objs if ob.type=='MESH' and ob.data.materials[0]==material] for material in mats]
 for batch in batches:
  bpy.ops.object.select_all(action='DESELECT')
  for ob in batch:ob.select_set(True)
  bpy.context.view_layer.objects.active=batch[0];bpy.ops.object.join()
  ob=bpy.context.object
  if len(ob.data.polygons)>1000:
   dec=ob.modifiers.new('Web mesh optimization','DECIMATE');dec.ratio=.72 if ob==body else .65;bpy.ops.object.modifier_apply(modifier=dec.name)
  joined.append(ob)
 root=bpy.data.objects.new(c['name'],None);bpy.context.collection.objects.link(root)
 for ob in joined:ob.parent=root
 bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
 for ob in joined:ob.select_set(True)
 bpy.ops.export_scene.gltf(filepath=str(ROOT/'models'/f"{c['id']}.glb"),use_selection=True,export_format='GLB',export_animations=False,export_yup=True)
 stats.append(dict(id=c['id'],height=c['height'],vertices=sum(len(o.data.vertices) for o in joined),triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in joined)))
 root.location.x=(ci-2.5)*.90;roots.append(root)

# Editable lineup and an offline inspection render.
floor=mat('Warm limestone stage',(.26,.28,.25),.92)
bpy.ops.mesh.primitive_plane_add(size=200);bpy.context.object.data.materials.append(floor)
world=bpy.context.scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.37,.43,.48,1);world.node_tree.nodes['Background'].inputs[1].default_value=.45
for name,loc,power,size,col in [('Key',(-3,-4,6),700,5,(1,.86,.71)),('Fill',(4,-2,3),350,4,(.77,.87,1)),('Rim',(1,3,5),800,3,(1,.91,.76))]:
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=col
 ob=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(ob);ob.location=loc;ob.rotation_euler=(Vector((0,0,1))-ob.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(3,-10,3.4));camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,1))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=6.3;bpy.context.scene.camera=camera
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32
scene.render.resolution_x=2100;scene.render.resolution_y=950;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SRC/'village-cast.blend'),compress=True)
(ROOT/'models'/'manifest.json').write_text(json.dumps(stats,indent=2))
scene.render.filepath=str(ROOT/'previews'/'cast.png');bpy.ops.render.render(write_still=True)
# Portrait strip for evaluating eyes, hair, face silhouettes and age.
camera.location=(0,-10,1.62);camera.rotation_euler=(Vector((0,0,1.58))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=5.8
scene.render.resolution_x=2400;scene.render.resolution_y=500;scene.render.filepath=str(ROOT/'previews'/'portraits.png');bpy.ops.render.render(write_still=True)
for c,root in zip(CAST,roots):
 camera.location=(root.location.x+.35,-2.8,c['height']-.12)
 camera.rotation_euler=(Vector((root.location.x,0,c['height']-.15))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=.52
 scene.render.resolution_x=650;scene.render.resolution_y=750;scene.render.filepath=str(ROOT/'previews'/f"{c['id']}.png");bpy.ops.render.render(write_still=True)
print('CAST COMPLETE',json.dumps(stats))
