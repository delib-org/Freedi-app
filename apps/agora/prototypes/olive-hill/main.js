import * as THREE from './vendor/three.module.js';
import { Soundscape } from './sound.js';
import { ProposalBoard } from './board.js';

const $ = id => document.getElementById(id);
const canvas = $('world');
let renderer;
try { renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'}); }
catch { $('loading').innerHTML='<p>הדפדפן לא הצליח להפעיל תלת־מימד. נסו דפדפן עם האצת חומרה.</p>'; throw new Error('WebGL unavailable'); }
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
const scene=new THREE.Scene();scene.background=new THREE.Color('#b9d1d2');scene.fog=new THREE.FogExp2('#b6cac3',.0065);
const camera=new THREE.PerspectiveCamera(53,innerWidth/innerHeight,.1,600);
scene.add(new THREE.HemisphereLight('#d7eef3','#797048',2.1));
const sun=new THREE.DirectionalLight('#ffe5b3',3.5);sun.position.set(-28,45,22);sun.castShadow=true;
Object.assign(sun.shadow.camera,{left:-48,right:48,top:48,bottom:-48,near:1,far:130});sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.00025;sun.shadow.normalBias=.035;scene.add(sun);scene.add(sun.target);
let seed=3471;const rand=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646};
const mat=(color,roughness=.92)=>new THREE.MeshStandardMaterial({color,roughness});
const stone=mat('#d0bea0'),wood=mat('#67503c'),trim=mat('#456760'),tile=mat('#ae6748'),dark=mat('#273a34'),plaster=mat('#e5d7b6');
function mesh(geo,material,x=0,y=0,z=0,parent=scene){const m=new THREE.Mesh(geo,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function box(w,h,d,material,x,y,z,parent){return mesh(new THREE.BoxGeometry(w,h,d),material,x,y,z,parent);}
function height(x,z){const r=Math.hypot(x,z);const raw=3.8+Math.sin(x*.045)*2.9+Math.cos(z*.062)*1.6-Math.max(0,r-24)*.035;const t=THREE.MathUtils.smoothstep(r,5,13);return THREE.MathUtils.lerp(5.4,raw,t);}
function pathX(z){return 2+Math.sin(z*.10)*4;}

// A continuous rolling terrain; the clearing around the cottage is level.
const terrainGeo=new THREE.PlaneGeometry(300,300,200,200);terrainGeo.rotateX(-Math.PI/2);
const terrainPos=terrainGeo.attributes.position;const terrainColors=[];
for(let i=0;i<terrainPos.count;i++){const x=terrainPos.getX(i),z=terrainPos.getZ(i);terrainPos.setY(i,height(x,z));const c=new THREE.Color('#8d9962');c.lerp(new THREE.Color('#c1b286'),Math.max(0,1-Math.abs(x-pathX(z))/3)*(z>4?1:0));c.multiplyScalar(.86+rand()*.2);terrainColors.push(c.r,c.g,c.b);}
terrainGeo.setAttribute('color',new THREE.Float32BufferAttribute(terrainColors,3));terrainGeo.computeVertexNormals();mesh(terrainGeo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));
// The footpath is actual geometry, conforming to the hillside.
const pv=[],pi=[];for(let i=0;i<=100;i++){const z=3+i*.52;for(const s of [-1,1])pv.push(pathX(z)+s*(1.05+.15*Math.sin(i*.75)),height(pathX(z)+s,z)+.035,z);if(i<100){const k=i*2;pi.push(k,k+2,k+1,k+1,k+2,k+3);}}
const pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.Float32BufferAttribute(pv,3));pg.setIndex(pi);pg.computeVertexNormals();mesh(pg,mat('#c8b893'));

// Distance layers: sea and mountainous islands dissolve into atmospheric haze.
mesh(new THREE.PlaneGeometry(1600,1600).rotateX(-Math.PI/2),mat('#86b9c1',.42),0,-5,-300);
for(let i=0;i<16;i++){const m=mesh(new THREE.SphereGeometry(1,24,12),mat(i<8?'#91a8a6':'#a9b8b2'),-250+i*35,-8,-190-rand()*100);m.scale.set(23+rand()*35,12+rand()*24,20+rand()*25);m.castShadow=false;}
const skyGeo=new THREE.SphereGeometry(480,32,24);
const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color('#76acc9')},bottom:{value:new THREE.Color('#f4dfb5')}},vertexShader:'varying vec3 p; void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 p;uniform vec3 top;uniform vec3 bottom;void main(){float h=normalize(p).y;gl_FragColor=vec4(mix(bottom,top,smoothstep(-.04,.75,h)),1.);}'});scene.add(new THREE.Mesh(skyGeo,skyMat));
const sunDisk=mesh(new THREE.SphereGeometry(9,24,16),new THREE.MeshBasicMaterial({color:'#fff0cb'}),-180,125,-290);sunDisk.castShadow=false;

// Fine wind-bent blades, instanced rather than separate draw calls.
const bladeGeo=new THREE.BufferGeometry();bladeGeo.setAttribute('position',new THREE.Float32BufferAttribute([-.045,0,0,.045,0,0,-.026,.28,.025,.026,.28,.025,0,.64,.11],3));bladeGeo.setIndex([0,1,2,1,3,2,2,3,4]);bladeGeo.computeVertexNormals();
const grassMat=new THREE.MeshStandardMaterial({color:'#829557',side:THREE.DoubleSide,roughness:1});
const wind={value:0};grassMat.onBeforeCompile=s=>{s.uniforms.uTime=wind;s.vertexShader='uniform float uTime;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfloat phase=instanceMatrix[3].x*.4+instanceMatrix[3].z*.3; transformed.x += sin(uTime*1.5+phase)*position.y*position.y*.22;');};
const grass=new THREE.InstancedMesh(bladeGeo,grassMat,58000);const dummy=new THREE.Object3D();let gn=0;
for(let i=0;i<85000&&gn<58000;i++){const x=(rand()-.5)*145,z=(rand()-.5)*145;if(Math.hypot(x,z)<6.3||(z>3&&Math.abs(x-pathX(z))<1.2))continue;dummy.position.set(x,height(x,z),z);dummy.rotation.set(0,rand()*6.28,0);const s=.5+rand()*1.1;dummy.scale.set(s,.55+rand()*.9,s);dummy.updateMatrix();grass.setMatrixAt(gn,dummy.matrix);grass.setColorAt(gn,new THREE.Color().setHSL(.19+rand()*.055,.23+rand()*.18,.27+rand()*.17));gn++;}grass.count=gn;grass.receiveShadow=true;grass.frustumCulled=false;scene.add(grass);

// Olive trees: twisting trunks, tapering branches and individual silver leaves.
const bark=mat('#6c6953');
function branch(a,b,r1,r2,parent){const len=a.distanceTo(b);const m=mesh(new THREE.CylinderGeometry(r2,r1,len,7),bark,0,0,0,parent);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());return m;}
const leafGeo=new THREE.SphereGeometry(1,5,3);const leafMat=new THREE.MeshStandardMaterial({color:'#9daa7d',roughness:.85});const leaves=new THREE.InstancedMesh(leafGeo,leafMat,90000);let ln=0;
const trees=[[-9,7],[10,12],[-12,-4],[12,-7],[-17,22],[17,26],[-19,-18],[22,-15],[-29,4],[31,7],[-34,32],[32,40]];
for(let i=0;i<35;i++){const x=(rand()-.5)*170,z=(rand()-.5)*150;if(Math.hypot(x,z)>26)trees.push([x,z]);}
for(const [tx,tz] of trees){const group=new THREE.Group();group.position.set(tx,height(tx,tz),tz);scene.add(group);const scale=.8+rand()*.5;const centers=[];
 branch(new THREE.Vector3(0,0,0),new THREE.Vector3(.18,2.4*scale,.1),.42*scale,.25*scale,group);
 for(let j=0;j<5;j++){const angle=j*1.256+rand()*.5;const tip=new THREE.Vector3(Math.cos(angle)*1.8*scale,(3.1+rand()*.9)*scale,Math.sin(angle)*1.8*scale);branch(new THREE.Vector3(.18,1.6*scale,0),tip,.19*scale,.055*scale,group);centers.push(tip);for(let k=0;k<3;k++){const t=tip.clone().add(new THREE.Vector3((rand()-.5)*2,.5+rand(),(rand()-.5)*2));branch(tip,t,.06,.018,group);centers.push(t);}}
 for(const center of centers){for(let j=0;j<85&&ln<90000;j++){const angle=rand()*6.28,cos=rand()*2-1,rr=Math.cbrt(rand())*1.13*scale;dummy.position.set(tx+center.x+Math.cos(angle)*Math.sqrt(1-cos*cos)*rr,group.position.y+center.y+cos*rr*.55,tz+center.z+Math.sin(angle)*Math.sqrt(1-cos*cos)*rr);dummy.rotation.set(rand()*2,rand()*6.28,rand()*2);dummy.scale.set(.08+rand()*.065,.022,.20+rand()*.12);dummy.updateMatrix();leaves.setMatrixAt(ln,dummy.matrix);leaves.setColorAt(ln,new THREE.Color().setHSL(.20+rand()*.035,.12+rand()*.17,.32+rand()*.23));ln++;}}
 for(let j=0;j<4;j++){const a=j*1.57;branch(new THREE.Vector3(Math.cos(a)*.8,.03,Math.sin(a)*.8),new THREE.Vector3(0,.6,0),.06,.17,group);}}
leaves.count=ln;leaves.castShadow=true;leaves.receiveShadow=true;leaves.frustumCulled=false;scene.add(leaves);

// Cottage: plaster over individual stone courses, blue-green woodwork, tiled roof.
const cabin=new THREE.Group();cabin.position.set(0,5.4,0);scene.add(cabin);
box(7.7,.25,6.6,stone,0,.1,0,cabin);box(6.4,3.7,5.1,plaster,0,2,-.65,cabin);
const stoneMats=Array.from({length:7},()=>mat(new THREE.Color('#c7b596').multiplyScalar(.85+rand()*.23)));
for(let row=0;row<7;row++){for(let col=0;col<12;col++){const x=-3.15+col*.55+(row%2)*.24;if(x>3.2)continue;if(x>-.72&&x<.72&&row<5)continue;box(.48+rand()*.04,.39+rand()*.055,.13,stoneMats[(rand()*7)|0],x,.4+row*.46,1.93,cabin);}}
for(const side of [-1,1])for(let row=0;row<7;row++)for(let j=0;j<9;j++)box(.13,.41,.48,stoneMats[(rand()*7)|0],side*3.23,.4+row*.46,-2.8+j*.55,cabin);
box(1.35,2.45,.15,dark,0,1.44,2.01,cabin);for(let i=0;i<6;i++)box(.19,2.35,.09,wood,-.53+i*.21,1.4,2.12,cabin);
for(const x of [-.8,.8])box(.15,2.65,.24,stone,x,1.48,2.14,cabin);box(1.8,.2,.3,stone,0,2.88,2.14,cabin);
mesh(new THREE.SphereGeometry(.06,12,8),mat('#ba994d'),.44,1.35,2.21,cabin);
for(const x of [-2.12,2.12]){box(1.05,1.3,.17,dark,x,2.15,2.04,cabin);for(const side of [-1,1]){const shutter=box(.52,1.4,.1,trim,x+side*.79,2.15,2.13,cabin);shutter.rotation.y=side*.2;for(let k=0;k<7;k++)box(.42,.025,.04,wood,x+side*.79,1.61+k*.17,2.20,cabin);}box(1.3,.13,.42,stone,x,1.45,2.13,cabin);box(.045,1.3,.12,wood,x,2.15,2.15,cabin);box(1.05,.045,.12,wood,x,2.15,2.15,cabin);}
const roofSlope=.45;
for(const side of [-1,1]){const roof=box(4.05,.16,6.2,wood,side*1.8,4.35,-.6,cabin);roof.rotation.z=-side*roofSlope;
for(let row=0;row<10;row++)for(let col=0;col<22;col++){const x=side*(.14+row*.37);const y=5.17-Math.abs(x)*Math.tan(roofSlope);const t=mesh(new THREE.CylinderGeometry(.125,.14,.49,8,1,true,0,Math.PI),tile,x,y,-3.54+col*.277,cabin);t.rotation.set(Math.PI/2,side*roofSlope,0);t.scale.x=1.25;}}
box(.7,2,.75,stone,2,4.9,-1.5,cabin);box(.9,.15,.92,wood,2,5.94,-1.5,cabin);
for(const x of [-3.3,3.3]){box(.16,2.9,.16,wood,x,1.6,3.9,cabin);}box(6.85,.2,.2,wood,0,3.05,3.9,cabin);
for(let i=0;i<16;i++){const slat=box(.16,.09,2.45,wood,-3.35+i*.445,3.3,3,cabin);slat.rotation.x=.17;}
// Selective ink contours keep the detailed 3D scene within the manga direction.
const ink=new THREE.LineBasicMaterial({color:'#35463b',transparent:true,opacity:.32});
cabin.traverse(object=>{if(object.isMesh&&object.geometry.type==='BoxGeometry'){const contour=new THREE.LineSegments(new THREE.EdgesGeometry(object.geometry,35),ink);object.add(contour);}});
box(2.6,.13,.55,wood,-2,1.0,3.4,cabin);for(const x of [-3,-1])box(.12,.85,.4,wood,x,.5,3.4,cabin);
// Clay pots, low garden wall and lavender in the clearing.
const terracotta=mat('#b77855');for(const [x,z,s] of [[3.9,2.8,.65],[-3.8,3.2,.48],[3.8,1.6,.43]]){mesh(new THREE.CylinderGeometry(s*.7,s*.48,s*1.4,16),terracotta,x,5.4+s*.7,z);mesh(new THREE.TorusGeometry(s*.7,.055,7,24).rotateX(Math.PI/2),terracotta,x,5.4+s*1.4,z);}
for(let i=0;i<30;i++){const x=-6.8-i*.5,z=-3.8+Math.sin(i*.13)*2;for(let j=0;j<2;j++)box(.48,.33,.5,stoneMats[i%7],x,height(x,z)+.17+j*.33,z);}
const flowerMat=mat('#a796bf');for(let i=0;i<110;i++){const x=3.8+(rand()-.5)*1.2,z=2+(rand()-.5)*2;mesh(new THREE.SphereGeometry(.08,5,4),flowerMat,x,height(x,z)+.65+rand()*.3,z);}
// Pebbles catch small shadows along the path.
const pebbles=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),stone,650);for(let i=0;i<650;i++){const z=6+rand()*55,x=pathX(z)+(rand()-.5)*3.4;dummy.position.set(x,height(x,z)+.025,z);dummy.rotation.set(rand()*3,rand()*3,0);dummy.scale.set(.025+rand()*.065,.02+rand()*.035,.04+rand()*.08);dummy.updateMatrix();pebbles.setMatrixAt(i,dummy.matrix);}pebbles.receiveShadow=true;scene.add(pebbles);

// Hand-painted figure on a transparent camera-facing plane, inside the 3D clearing.
const woman=new THREE.Group();woman.position.set(1.8,5.43,3.55);scene.add(woman);
const manager=new THREE.LoadingManager();let assetFailed=false;manager.onError=()=>{assetFailed=true;};
const texture=new THREE.TextureLoader(manager).load('./assets/wise-greek-elder.png');texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=renderer.capabilities.getMaxAnisotropy();
const figure=new THREE.Mesh(new THREE.PlaneGeometry(2.0,3.0),new THREE.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.08,side:THREE.DoubleSide}));figure.position.y=1.5;woman.add(figure);
const shadowCanvas=document.createElement('canvas');shadowCanvas.width=128;shadowCanvas.height=128;const sc=shadowCanvas.getContext('2d');const gradient=sc.createRadialGradient(64,64,5,64,64,64);gradient.addColorStop(0,'rgba(20,30,15,.4)');gradient.addColorStop(1,'rgba(20,30,15,0)');sc.fillStyle=gradient;sc.fillRect(0,0,128,128);mesh(new THREE.PlaneGeometry(1.6,1).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}),1.8,5.45,3.55);
// The writing desk rises only after the encounter.
const desk=new THREE.Group();desk.position.set(1.8,3.4,5.4);desk.visible=false;scene.add(desk);box(2,.14,1,wood,0,1,0,desk);for(const x of [-.8,.8])for(const z of [-.35,.35])box(.1,1,.1,wood,x,.5,z,desk);box(.65,.008,.47,mat('#f8edcf'),0,1.079,0,desk);const pen=box(.015,.018,.38,dark,.46,1.085,0,desk);pen.rotation.y=-.2;

const dustGeo=new THREE.BufferGeometry(),dust=[];for(let i=0;i<200;i++)dust.push((rand()-.5)*65,7+rand()*8,(rand()-.5)*65);dustGeo.setAttribute('position',new THREE.Float32BufferAttribute(dust,3));const motes=new THREE.Points(dustGeo,new THREE.PointsMaterial({color:'#fff3bc',size:.055,transparent:true,opacity:.6}));scene.add(motes);
const birds=[];for(let i=0;i<7;i++){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute([-.5,0,0,0,-.12,0,.5,0,0],3));const b=new THREE.Line(geo,new THREE.LineBasicMaterial({color:'#516761'}));scene.add(b);birds.push(b);}

let yaw=0,pitch=-.03,auto=false,near=false,complete=false,writing=false,high=true;
camera.position.set(12,height(12,30)+1.75,30);camera.lookAt(0,7,1);const euler=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ');yaw=euler.y;pitch=euler.x;
const keys=new Set();let drag=null;const sound=new Soundscape();
const board=new ProposalBoard({scene,height,
  onOpen:()=>{writing=true;auto=false;keys.clear();drag=null;$('bubble').hidden=true;$('completion').hidden=true;},
  onClose:()=>{writing=$('desk').open||board.busy;if(!writing)canvas.focus();},
  onWrite:()=>{desk.visible=true;openDesk();},
  onFlightEnd:()=>sound.chime(),
});
const boardRay=new THREE.Raycaster();let clickOrigin=null;
canvas.addEventListener('pointerdown',ev=>clickOrigin={x:ev.clientX,y:ev.clientY});
canvas.addEventListener('pointerup',ev=>{if(!clickOrigin||writing)return;const moved=Math.hypot(ev.clientX-clickOrigin.x,ev.clientY-clickOrigin.y);clickOrigin=null;if(moved>6)return;const rect=canvas.getBoundingClientRect();boardRay.setFromCamera(new THREE.Vector2((ev.clientX-rect.left)/rect.width*2-1,-(ev.clientY-rect.top)/rect.height*2+1),camera);if(boardRay.intersectObject(board.panel).length)board.open();});
function aim(){camera.quaternion.setFromEuler(new THREE.Euler(pitch,yaw,0,'YXZ'));}
function setSound(){sound.toggle().then(active=>{$('sound').setAttribute('aria-pressed',String(active));$('sound').querySelector('span').textContent=active?'השתקת צלילים':'הפעלת צלילים';}).catch(()=>{$('sound').querySelector('span').textContent='לא ניתן להפעיל צלילים';});}
$('sound').onclick=setSound;
$('quality').onclick=()=>{high=!high;renderer.setPixelRatio(high?Math.min(devicePixelRatio,2):1);renderer.setSize(innerWidth,innerHeight);grass.count=high?gn:Math.floor(gn*.55);renderer.shadowMap.enabled=high;$('quality').textContent=high?'איכות גבוהה':'איכות חסכונית';};
function walk(){if(writing)return;auto=!auto;$('walk').textContent=auto?'לעצור ולהסתכל מסביב':near?'לשוחח עם החכמה':'ללכת אל הבקתה';if(near){auto=false;encounter();}canvas.focus();}
$('walk').onclick=walk;
canvas.addEventListener('pointerdown',ev=>{drag={x:ev.clientX,y:ev.clientY};canvas.setPointerCapture(ev.pointerId);auto=false;});
canvas.addEventListener('pointermove',ev=>{if(!drag||writing)return;yaw-=(ev.clientX-drag.x)*.004;pitch=THREE.MathUtils.clamp(pitch-(ev.clientY-drag.y)*.003,-.65,.65);drag={x:ev.clientX,y:ev.clientY};aim();});
canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
addEventListener('keydown',ev=>{if(writing)return;if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyE'].includes(ev.code)){ev.preventDefault();keys.add(ev.code);auto=false;if(ev.code==='KeyE'&&near)encounter();}});
addEventListener('keyup',ev=>keys.delete(ev.code));addEventListener('blur',()=>{keys.clear();drag=null;});
for(const b of document.querySelectorAll('[data-move]')){const code={forward:'KeyW',left:'KeyA',backward:'KeyS',right:'KeyD'}[b.dataset.move];b.onpointerdown=ev=>{ev.preventDefault();b.setPointerCapture(ev.pointerId);keys.add(code);auto=false;};b.onpointerup=b.onpointercancel=()=>keys.delete(code);}
function encounter(){auto=false;$('bubble').hidden=false;desk.visible=true;$('progress').style.width=complete?'100%':'66%';$('stage').textContent=complete?'03 / 03 · תודה':'02 / 03 · הרעיון';$('objective').textContent=complete?'תודה ששיתפתם במחשבה שלכם.':'החכמה מקשיבה. מה הפתרון שלכם?';$('walk').textContent='לשוחח עם החכמה';}
function openDesk(){writing=true;keys.clear();auto=false;$('desk').showModal();try{$('answer').value=localStorage.getItem('agora-olive-hill-answer')||'';}catch{}updateCount();setTimeout(()=>$('answer').focus(),80);}
$('write').onclick=openDesk;function updateCount(){$('count').textContent=`${$('answer').value.length} / 2000`;}$('answer').oninput=updateCount;
$('close').onclick=()=>$('desk').close();$('desk').addEventListener('close',()=>{writing=board.busy;if(!writing)canvas.focus();});
$('answer-form').onsubmit=ev=>{ev.preventDefault();const answer=$('answer').value.trim();if(!answer){$('answer').setCustomValidity('כתבו כמה מילים לפני השליחה.');$('answer').reportValidity();return;}$('answer').setCustomValidity('');try{localStorage.setItem('agora-olive-hill-answer',answer);}catch{$('save-error').hidden=false;return;}$('save-error').hidden=true;complete=true;$('desk').close();$('speech').textContent='תודה לך. כל רעיון פותח דרך חדשה.';$('write').textContent='לקרוא את ההצעה שלי';encounter();board.fly(answer,new THREE.Vector3(1.8,6.55,5.4));};
$('answer').addEventListener('input',()=>$('answer').setCustomValidity(''));
$('again').onclick=openDesk;$('explore').onclick=()=>{$('completion').hidden=true;canvas.focus();};
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
document.addEventListener('visibilitychange',()=>{keys.clear();sound.visibility(document.hidden);});
let last=performance.now(),elapsed=0;const projected=new THREE.Vector3();
function animate(now){requestAnimationFrame(animate);const dt=Math.min((now-last)/1000,.04);last=now;if(document.hidden)return;elapsed+=dt;wind.value=elapsed;motes.rotation.y=elapsed*.008;
const previous=camera.position.clone();let moving=false;
if(auto&&!writing){const nextZ=Math.max(8,camera.position.z-4);const goal=new THREE.Vector3(nextZ>8?pathX(nextZ):2.2,0,nextZ);const dx=goal.x-camera.position.x,dz=goal.z-camera.position.z;const d=Math.hypot(dx,dz);if(d>.15){camera.position.x+=dx/d*dt*2.7;camera.position.z+=dz/d*dt*2.7;const desired=Math.atan2(camera.position.x-woman.position.x,camera.position.z-woman.position.z);yaw+=Math.atan2(Math.sin(desired-yaw),Math.cos(desired-yaw))*Math.min(1,dt*2);pitch=THREE.MathUtils.lerp(pitch,-.03,dt*2);moving=true;}else{auto=false;encounter();}}
if(!writing){const f=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0),s=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);if(f||s){const norm=Math.hypot(f,s);camera.position.x+=(-Math.sin(yaw)*f+Math.cos(yaw)*s)/norm*dt*3.8;camera.position.z+=(-Math.cos(yaw)*f-Math.sin(yaw)*s)/norm*dt*3.8;moving=true;}}
// Keep the player outside solid walls and tree trunks.
if((Math.abs(camera.position.x)<3.7&&camera.position.z<2.6&&camera.position.z>-3.9)||trees.some(([x,z])=>Math.hypot(camera.position.x-x,camera.position.z-z)<.7))camera.position.copy(previous);
const boardLocal=board.group.worldToLocal(camera.position.clone());if(Math.abs(boardLocal.x)<2.85&&Math.abs(boardLocal.z)<.45)camera.position.copy(previous);
camera.position.x=THREE.MathUtils.clamp(camera.position.x,-65,65);camera.position.z=THREE.MathUtils.clamp(camera.position.z,-55,70);camera.position.y=height(camera.position.x,camera.position.z)+1.75+(moving?Math.sin(elapsed*9)*.028:0);aim();
const distance=Math.hypot(camera.position.x-woman.position.x,camera.position.z-woman.position.z);const wasNear=near;near=distance<7.0;if(near&&!wasNear)encounter();if(!near){$('bubble').hidden=true;$('walk').textContent=auto?'לעצור ולהסתכל מסביב':'ללכת אל הבקתה';}$('arrival').hidden=!near||writing||complete;
woman.rotation.y=Math.atan2(camera.position.x-woman.position.x,camera.position.z-woman.position.z);figure.position.y=1.5+Math.sin(elapsed*1.4)*.007;
if(desk.visible)desk.position.y=THREE.MathUtils.lerp(desk.position.y,5.42,dt*3);
if(near&&!writing){projected.set(woman.position.x,woman.position.y+3.35,woman.position.z).project(camera);const visible=projected.z<1&&Math.abs(projected.x)<1.1;$('bubble').hidden=!visible;if(visible){const px=THREE.MathUtils.clamp((projected.x*.5+.5)*innerWidth,155,innerWidth-155);const py=THREE.MathUtils.clamp((-projected.y*.5+.5)*innerHeight,260,innerHeight-200);$('bubble').style.left=px+'px';$('bubble').style.top=py+'px';}}
if(board.flight){board.tick(dt,camera);const flightAngles=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ');yaw=flightAngles.y;pitch=flightAngles.x;}
birds.forEach((b,i)=>{const a=elapsed*.07+i*.7;b.position.set(Math.sin(a)*60,23+i*1.4,-55+Math.cos(a)*20);b.rotation.y=-a;b.scale.y=.7+Math.sin(elapsed*4+i)*.4;});renderer.render(scene,camera);
}
manager.onLoad=()=>{if(assetFailed){$('loading').innerHTML='<p>הדמות לא נטענה. רעננו את העמוד כדי לנסות שוב.</p>';return;}$('loading').style.opacity='0';setTimeout(()=>$('loading').hidden=true,650);};
animate(performance.now());
