import * as THREE from './vendor/three.module.js';
import { Soundscape } from './sound.js';
import { buildVillage, stations } from './village.js';
import { characters } from './characters-2d.js';

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
function height(x,z){const r=Math.hypot(x,z);const raw=3.8+Math.sin(x*.045)*2.9+Math.cos(z*.062)*1.6-Math.max(0,r-24)*.035;const t=THREE.MathUtils.smoothstep(r,33,48);return THREE.MathUtils.lerp(5.4,raw,t);}
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
for(let i=0;i<85000&&gn<58000;i++){const x=(rand()-.5)*145,z=(rand()-.5)*145;if(Math.hypot(x+23,z-15)<5.5||Math.hypot(x,z-12)<23||(z>3&&Math.abs(x-pathX(z))<1.2))continue;dummy.position.set(x,height(x,z),z);dummy.rotation.set(0,rand()*6.28,0);const s=.5+rand()*1.1;dummy.scale.set(s,.55+rand()*.9,s);dummy.updateMatrix();grass.setMatrixAt(gn,dummy.matrix);grass.setColorAt(gn,new THREE.Color().setHSL(.19+rand()*.055,.23+rand()*.18,.27+rand()*.17));gn++;}grass.count=gn;grass.receiveShadow=true;grass.frustumCulled=false;scene.add(grass);

// Olive trees: twisting trunks, tapering branches and individual silver leaves.
const bark=mat('#6c6953');
function branch(a,b,r1,r2,parent){const len=a.distanceTo(b);const m=mesh(new THREE.CylinderGeometry(r2,r1,len,7),bark,0,0,0,parent);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());return m;}
const leafGeo=new THREE.SphereGeometry(1,5,3);const leafMat=new THREE.MeshStandardMaterial({color:'#9daa7d',roughness:.85});const leaves=new THREE.InstancedMesh(leafGeo,leafMat,90000);let ln=0;
const trees=[[-20,7],[24,18],[-16,25],[-21,29],[0,34],[21,-9],[-18,-10],[-29,4],[31,7],[-34,32],[32,40]];
for(let i=0;i<35;i++){const x=(rand()-.5)*170,z=(rand()-.5)*150;if(Math.hypot(x,z-12)>30)trees.push([x,z]);}
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


const village=buildVillage({scene,height});
// Each station has its own board and texture; data comes from confirmed session notes.
const stationBoards=stations.map(station=>{
 const boardGroup=new THREE.Group();boardGroup.position.set(station.ax+3.4,height(station.ax,station.az),station.az);boardGroup.rotation.y=Math.atan2(-boardGroup.position.x,15-boardGroup.position.z);scene.add(boardGroup);
 box(3.2,2.0,.15,wood,0,2.1,0,boardGroup);for(const x of [-1.3,1.3])box(.14,3,.14,wood,x,1.5,0,boardGroup);
 const boardCanvas=document.createElement('canvas');boardCanvas.width=1536;boardCanvas.height=900;const bc=boardCanvas.getContext('2d');const bt=new THREE.CanvasTexture(boardCanvas);bt.colorSpace=THREE.SRGBColorSpace;
 const face=mesh(new THREE.PlaneGeometry(3.1,1.9),new THREE.MeshBasicMaterial({map:bt,side:THREE.DoubleSide}),0,2.1,.09,boardGroup);let lastPapers='';
function paint(papers){const key=JSON.stringify(papers);if(key===lastPapers)return;lastPapers=key;bc.fillStyle='#9a805f';bc.fillRect(0,0,1536,900);bc.fillStyle='#fff5dc';bc.textAlign='center';bc.direction='rtl';bc.font='bold 55px Arial';bc.fillText('הרעיונות שלנו',768,80);if(!papers.length){bc.font='32px Arial';bc.fillText('ההצעות של המפגש יופיעו כאן',768,440);}papers.slice(0,6).forEach((paper,i)=>{const x=40+(i%3)*500,y=130+Math.floor(i/3)*370;bc.fillStyle=paper.own?'#ffffff':['#e5d4ce','#d9e4c7','#d7deea'][i%3];bc.fillRect(x,y,470,335);bc.fillStyle='#334635';bc.textAlign='right';bc.font='bold 29px Arial';bc.fillText(paper.own?'ההצעה שלך':'הצעה מהמפגש',x+445,y+44);bc.font='29px Arial';let line='',row=y+97;for(const word of paper.text.split(/\s+/)){if(bc.measureText(line+word).width>415){bc.fillText(line,x+445,row);row+=41;line='';if(row>y+295){line='…';break;}}line+=word+' ';}bc.fillText(line,x+445,row);});bt.needsUpdate=true;}
paint([]);return {station,face,paint};
});
function paintPapers(papers){stationBoards.find(b=>b.station.id===selected.id)?.paint(papers);}
canvas.addEventListener('click',event=>{
 if(uiPaused)return;const rect=canvas.getBoundingClientRect();const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
 const hit=ray.intersectObjects(stationBoards.map(b=>b.face))[0];const board=stationBoards.find(b=>b.face===hit?.object);
 if(board && embedded)parent.postMessage({type:'agora-village-board',place:board.station.id},location.origin);
});
const embedded=new URLSearchParams(location.search).get('embedded')==='1' && window.parent!==window;
const sound=new Soundscape();
let selected=stations[0],activeItem='',moving=false,uiPaused=false,yaw=0,pitch=-.04,last=performance.now(),elapsed=0;
let lastLibraryPresence=null;
const keys=new Set();camera.position.set(0,7.15,26);camera.lookAt(-5,7,12);let angles=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ');yaw=angles.y;pitch=angles.x;
function send(type){if(embedded)parent.postMessage({type,itemId:activeItem},location.origin);}
function destination(place,label){selected=stations.find(s=>s.id===place)||stations[0];$('station-name').textContent=label||selected.name;$('station-place').textContent=selected.name;$('guide-line').textContent=selected.question;moving=false;}
window.addEventListener('message',event=>{if(!embedded||event.source!==parent||event.origin!==location.origin||!event.data||typeof event.data!=='object')return;const data=event.data;if(data.type==='agora-village-state'&&typeof data.itemId==='string'&&typeof data.place==='string'){document.body.classList.toggle('has-community',data.community===true);if(activeItem!==data.itemId){activeItem=data.itemId;destination(data.place,typeof data.label==='string'?data.label:'');}if(Array.isArray(data.stationPapers)){for(const board of stationBoards){const entries=data.stationPapers.filter(p=>p && p.place===board.station.id && Array.isArray(p.papers));board.paint(entries.flatMap(e=>e.papers).filter(p=>p&&typeof p.text==='string'&&typeof p.own==='boolean'));}}else if(Array.isArray(data.papers))paintPapers(data.papers.filter(p=>p&&typeof p.text==='string'&&typeof p.own==='boolean'));uiPaused=data.paused===true;if(uiPaused){keys.clear();moving=false;}}});
$('travel').onclick=()=>{moving=!moving;canvas.focus();};
$('enter').onclick=()=>{
 if(embedded){send('agora-village-enter');return;}
 const guides=characters.filter(c=>c.station===selected.id);
 function showGuide(character){
 const portrait=$('guide-portrait');portrait.hidden=!character;
 if(character){portrait.src=character.image;portrait.alt=character.name;}
 else portrait.removeAttribute('src');
 $('encounter-name').textContent=character?.name||selected.name;
 }
 showGuide(guides[0]);
 const choices=$('guide-choices');choices.replaceChildren();choices.hidden=guides.length<2;
 for(const guide of guides){const b=document.createElement('button');b.textContent=guide.name;b.onclick=()=>showGuide(guide);choices.append(b);}
 $('encounter-question').textContent=selected.question;
 keys.clear();moving=false;$('preview-info').showModal();
};
$('close-info').onclick=()=>$('preview-info').close();
$('sound').onclick=async()=>{try{const enabled=await sound.toggle();$('sound').textContent=enabled?'♫ השתקה':'♫ צלילים';}catch{$('sound').textContent='צלילים אינם זמינים';}};
let lowQuality=false;
$('quality').onclick=()=>{const low=lowQuality=!lowQuality;renderer.setPixelRatio(low?1:Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=!low;grass.count=low?Math.floor(gn*.55):gn;$('quality').textContent=low?'איכות חסכונית':'איכות גבוהה';};
let drag=null;canvas.onpointerdown=e=>{if(uiPaused)return;drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);moving=false;};canvas.onpointermove=e=>{if(!drag)return;yaw-=(e.clientX-drag.x)*.004;pitch=THREE.MathUtils.clamp(pitch-(e.clientY-drag.y)*.003,-.7,.55);drag={x:e.clientX,y:e.clientY};};canvas.onpointerup=canvas.onpointercancel=()=>drag=null;
addEventListener('keydown',e=>{if(uiPaused||$('preview-info').open)return;if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyE'].includes(e.code)){e.preventDefault();keys.add(e.code);moving=false;if(e.code==='KeyE')$('enter').click();}});addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>{keys.clear();drag=null;});
for(const b of document.querySelectorAll('[data-key]')){b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(b.dataset.key);moving=false;};b.onpointerup=b.onpointercancel=()=>keys.delete(b.dataset.key);}
for(const s of stations){const b=document.createElement('button');b.textContent=s.name;b.onclick=()=>{destination(s.id);moving=true;};$('preview-stations').append(b);}
$('session-entry').hidden=embedded;$('preview-stations').hidden=embedded;$('preview-label').hidden=embedded;destination('challenge');
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});document.addEventListener('visibilitychange',()=>{keys.clear();sound.visibility(document.hidden);});
$('loading').textContent='מכינים את הכפר ומזמינים את החכמים…';
const characterStatus=document.createElement('div');characterStatus.setAttribute('role','status');
characterStatus.style.cssText='position:fixed;bottom:115px;right:25px;z-index:3;background:#304734;padding:10px;border-radius:4px;font:14px Arial';
characterStatus.textContent='הדמויות בדרך…';document.body.append(characterStatus);
// Let the world open even on a slow connection; report asset failures visibly.
$('loading').hidden=true;send('agora-village-ready');
village.ready.then(({failed})=>{
 if(failed){characterStatus.textContent='חלק מהדמויות לא נטענו. רעננו את הדף כדי לנסות שוב.';}
 else characterStatus.remove();
});
function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-last)/1000,.04);last=now;if(document.hidden||uiPaused||$('preview-info').open)return;elapsed+=dt;wind.value=elapsed;const old=camera.position.clone();
 if(moving){const dx=selected.ax-camera.position.x,dz=selected.az-camera.position.z,dist=Math.hypot(dx,dz);if(dist>.12){camera.position.x+=dx/dist*dt*4;camera.position.z+=dz/dist*dt*4;const guide=characters.find(c=>c.station===selected.id);const target=Math.atan2(camera.position.x-(guide?.x??selected.x),camera.position.z-(guide?.z??selected.z));yaw+=Math.atan2(Math.sin(target-yaw),Math.cos(target-yaw))*Math.min(1,dt*3);}else {moving=false;pitch=-.06;}}
 const f=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown')),s=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));if(f||s){const n=Math.hypot(f,s);camera.position.x+=(-Math.sin(yaw)*f+Math.cos(yaw)*s)/n*dt*4;camera.position.z+=(-Math.cos(yaw)*f-Math.sin(yaw)*s)/n*dt*4;}
 if(!moving&&((Math.abs(camera.position.x)<3.7&&camera.position.z<2.6&&camera.position.z>-3.9)||village.solids.some(o=>Math.abs(camera.position.x-o.x)<o.w&&Math.abs(camera.position.z-o.z)<o.d)))camera.position.copy(old);
 camera.position.x=THREE.MathUtils.clamp(camera.position.x,-45,45);camera.position.z=THREE.MathUtils.clamp(camera.position.z,-20,50);camera.position.y=height(camera.position.x,camera.position.z)+1.75;camera.quaternion.setFromEuler(new THREE.Euler(pitch,yaw,0,'YXZ'));village.tick(camera);
 const insideLibrary=Math.abs(camera.position.z-15)<3.5&&camera.position.x>-25.6&&camera.position.x<-19.6;
 if(embedded&&insideLibrary!==lastLibraryPresence){lastLibraryPresence=insideLibrary;parent.postMessage({type:'agora-village-library-presence',inside:insideLibrary},location.origin);}
 const near=Math.hypot(camera.position.x-selected.ax,camera.position.z-selected.az)<3;$('enter').textContent=near?'להיכנס לתחנה ←':'כניסה מהירה לתחנה ←';$('travel').textContent=moving?'לעצור':'ללכת לתחנה';renderer.render(scene,camera);
}
requestAnimationFrame(frame);
