import { createPaperFlight } from './paper-flight.js';
import * as THREE from './vendor/three.module.js';
import { Soundscape } from './sound.js';
import { buildVillage, fixedStations, CENTER, villageRadius } from './village.js';
import { RING_MAX } from './village-layout.js';
import { characters } from './characters-2d.js';

const $ = id => document.getElementById(id);
// Preserve label nodes while the world animates; unchanged text needs no DOM
// mutation or accessibility-tree update.
function setText(id,value){const element=$(id);if(element.textContent!==value)element.textContent=value;}
/** A light build for weak machines and headless tests: no shadows, sparse grass, throttled frames. */
const lite=new URLSearchParams(location.search).get('lite')==='1';
const canvas = $('world');
let renderer;
try { renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'}); }
catch { $('loading').innerHTML='<p>הדפדפן לא הצליח להפעיל תלת־מימד. נסו דפדפן עם האצת חומרה.</p>'; throw new Error('WebGL unavailable'); }
renderer.setPixelRatio(lite?1:Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=!lite; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
const scene=new THREE.Scene();scene.background=new THREE.Color('#b9d1d2');scene.fog=new THREE.FogExp2('#b6cac3',.0052);
const camera=new THREE.PerspectiveCamera(53,innerWidth/innerHeight,.1,600);
scene.add(new THREE.HemisphereLight('#d7eef3','#797048',2.1));
const sun=new THREE.DirectionalLight('#ffe5b3',3.5);sun.position.set(-28,45,22);sun.castShadow=true;
// The shadow box covers the whole meadow, and the map grows with it so a bigger village keeps the same shadow detail per metre.
Object.assign(sun.shadow.camera,{left:-62,right:62,top:62,bottom:-62,near:1,far:200});sun.shadow.mapSize.setScalar(lite?2048:3072);sun.shadow.bias=-.00025;sun.shadow.normalBias=.035;scene.add(sun);scene.add(sun.target);
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
const GRASS_MAX=lite?9000:76000;const grass=new THREE.InstancedMesh(bladeGeo,grassMat,GRASS_MAX);const dummy=new THREE.Object3D();let gn=0;
// Where every blade stands, so the village can clear the ones it paves over.
const bladeX=new Float32Array(GRASS_MAX),bladeZ=new Float32Array(GRASS_MAX),bladeGone=new Uint8Array(GRASS_MAX);
// A meadow around the square rather than a square field: the village grew, and
// the grass grew with it. The core stays beaten earth — a village green is walked on.
for(let i=0;i<150000&&gn<GRASS_MAX;i++){const a=rand()*6.283,rr=13+Math.sqrt(rand())*67;const x=CENTER.x+Math.cos(a)*rr,z=CENTER.z+Math.sin(a)*rr;if(z>3&&Math.abs(x-pathX(z))<1.2)continue;bladeX[gn]=x;bladeZ[gn]=z;dummy.position.set(x,height(x,z),z);dummy.rotation.set(0,rand()*6.28,0);const s=.5+rand()*1.1;dummy.scale.set(s,.55+rand()*.9,s);dummy.updateMatrix();grass.setMatrixAt(gn,dummy.matrix);grass.setColorAt(gn,new THREE.Color().setHSL(.19+rand()*.055,.23+rand()*.18,.27+rand()*.17));gn++;}grass.count=gn;grass.receiveShadow=true;grass.frustumCulled=false;scene.add(grass);

// Olive trees: twisting trunks, tapering branches and individual silver leaves.
const bark=mat('#6c6953');
function branch(a,b,r1,r2,parent){const len=a.distanceTo(b);const m=mesh(new THREE.CylinderGeometry(r2,r1,len,7),bark,0,0,0,parent);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());return m;}
const leafGeo=new THREE.SphereGeometry(1,5,3);const leafMat=new THREE.MeshStandardMaterial({color:'#9daa7d',roughness:.85});const LEAF_MAX=lite?20000:110000;const leaves=new THREE.InstancedMesh(leafGeo,leafMat,LEAF_MAX);let ln=0;
/** Each tree's branches and its slice of the leaf cloud, so one can be cleared away whole. */
const treeParts=[];
function plantTree(tx,tz){const group=new THREE.Group();group.position.set(tx,height(tx,tz),tz);scene.add(group);const scale=.8+rand()*.5;const centers=[];const from=ln;
 branch(new THREE.Vector3(0,0,0),new THREE.Vector3(.18,2.4*scale,.1),.42*scale,.25*scale,group);
 for(let j=0;j<5;j++){const angle=j*1.256+rand()*.5;const tip=new THREE.Vector3(Math.cos(angle)*1.8*scale,(3.1+rand()*.9)*scale,Math.sin(angle)*1.8*scale);branch(new THREE.Vector3(.18,1.6*scale,0),tip,.19*scale,.055*scale,group);centers.push(tip);for(let k=0;k<3;k++){const t=tip.clone().add(new THREE.Vector3((rand()-.5)*2,.5+rand(),(rand()-.5)*2));branch(tip,t,.06,.018,group);centers.push(t);}}
 for(const center of centers){for(let j=0;j<(lite?20:70)&&ln<LEAF_MAX;j++){const angle=rand()*6.28,cos=rand()*2-1,rr=Math.cbrt(rand())*1.13*scale;dummy.position.set(tx+center.x+Math.cos(angle)*Math.sqrt(1-cos*cos)*rr,group.position.y+center.y+cos*rr*.55,tz+center.z+Math.sin(angle)*Math.sqrt(1-cos*cos)*rr);dummy.rotation.set(rand()*2,rand()*6.28,rand()*2);dummy.scale.set(.08+rand()*.065,.022,.20+rand()*.12);dummy.updateMatrix();leaves.setMatrixAt(ln,dummy.matrix);leaves.setColorAt(ln,new THREE.Color().setHSL(.20+rand()*.035,.12+rand()*.17,.32+rand()*.23));ln++;}}
 for(let j=0;j<4;j++){const a=j*1.57;branch(new THREE.Vector3(Math.cos(a)*.8,.03,Math.sin(a)*.8),new THREE.Vector3(0,.6,0),.06,.17,group);}
 treeParts.push({group,x:tx,z:tz,from,to:ln});}
// The wood stands OUTSIDE the village: it begins past the point the widest
// booth ring could ever reach, thickest at the treeline and thinning into the
// hills — so the village is open ground to walk, and the trees close the view.
const TREELINE=RING_MAX+8;
for(let i=0;i<70;i++){const a=rand()*6.283,rr=TREELINE+Math.pow(rand(),1.6)*62;plantTree(CENTER.x+Math.cos(a)*rr,CENTER.z+Math.sin(a)*rr);}
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
// The cottage's yard: nothing paves it, but the grass still keeps off the doorstep.
village.clearings.push({x:0,z:0,r:5.4});
const HIDDEN=new THREE.Matrix4().makeScale(0,0,0);
/**
 * Clear the planting off everything the village has paved: blades that would
 * grow through a stone floor, trees that would stand inside a pavilion. Run
 * once for the fixed sites and again whenever the plan's booths are laid out
 * — a plant is only ever cleared, never planted back, because a booth ring is
 * built once a lesson.
 */
function clearPlanting(){
 const spots=village.clearings;if(!spots.length)return;
 let blades=false;
 for(let i=0;i<gn;i++){
  if(bladeGone[i])continue;
  if(!spots.some(s=>Math.hypot(bladeX[i]-s.x,bladeZ[i]-s.z)<s.r+.4))continue;
  bladeGone[i]=1;grass.setMatrixAt(i,HIDDEN);blades=true;
 }
 if(blades)grass.instanceMatrix.needsUpdate=true;
 let canopy=false;
 for(const tree of treeParts){
  if(!tree.group.visible)continue;
  // A tree clears a wider circle than a blade — its canopy reaches some four
  // metres past its trunk — and a booth clears wider still, for the roof it
  // would hang over and the desk and guide standing in front of it.
  if(!spots.some(s=>Math.hypot(tree.x-s.x,tree.z-s.z)<s.r+(s.booth?7:3.6)))continue;
  tree.group.visible=false;
  for(let i=tree.from;i<tree.to;i++)leaves.setMatrixAt(i,HIDDEN);
  canopy=true;
 }
 if(canopy)leaves.instanceMatrix.needsUpdate=true;
}
clearPlanting();
/** How far the walker may roam: the booth ring, plus enough meadow to walk out and look. */
let bounds={x:46,zMax:52};
const embedded=new URLSearchParams(location.search).get('embedded')==='1' && window.parent!==window;
/** The fixed places plus one booth per question of the plan (see installBooths). */
let stations=[...fixedStations];
let boothKey='';
let pendingPlace=null,pendingLabel='';
/**
 * Build the booths for this plan. The plan is fixed for a lesson, so this
 * runs once in practice; a changed SET of questions rebuilds, a changed
 * state (opened / current / title) only repaints.
 */
function installBooths(specs){
 const key=specs.map(b=>b.itemId).join('|');
 if(key!==boothKey){
  boothKey=key;
  village.installBooths(specs.map(b=>({itemId:b.itemId,label:b.label,kind:b.kind})));
  // More questions, a wider ring — and with it a wider village to walk in.
  const radius=villageRadius(specs.length);
  bounds={x:Math.max(46,radius+14),zMax:Math.max(52,CENTER.z+radius+14)};
  clearPlanting();
  // The map reads in lesson order: the meeting point, the library, the booths, the council.
  stations=[fixedStations[1],fixedStations[0],...village.booths.map(b=>b.station),fixedStations[2]];
  renderStationNav();
  if(pendingPlace){const place=pendingPlace;pendingPlace=null;destination(place,pendingLabel);}
 }
 for(const booth of village.booths){const spec=specs.find(b=>b.itemId===booth.spec.itemId);if(spec)booth.setState(spec);}
}
/** Everything with a face the walker may click: booth boards and the council's scoreboard. */
function clickableBoards(){return [...village.booths.map(b=>({station:b.station,face:b.face,booth:b})),{station:fixedStations[2],face:village.scoreboard.face,council:true}];}
function boardFor(place){return village.booths.find(b=>b.station.id===place)??null;}
canvas.addEventListener('click',event=>{
 if(uiPaused||pointerMoved)return;const rect=canvas.getBoundingClientRect();const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
 for(const booth of village.booths){
  if(!ray.intersectObject(booth.desk.group,true).some(hit=>hit.distance<7))continue;
  if(!embedded){destination(booth.station.id);openPersonalDesk();return;}
  // The desk of the class's booth: stand at it — the guide's bubble opens the paper, the desk never does.
  if(booth.station.id===activePlace&&deskInfo){startView(activePlace,'table');return;}
  parent.postMessage({type:'agora-village-select',place:booth.station.id},location.origin);return;
 }
 const boards=clickableBoards();
 const hit=ray.intersectObjects(boards.map(b=>b.face))[0];const board=boards.find(b=>b.face===hit?.object);
 if(!board)return;
 if(embedded){parent.postMessage({type:'agora-village-board',place:board.station.id},location.origin);return;}
 if(board.council)$('enter').click();else{destination(board.station.id);$('enter').click();}
});
const sound=new Soundscape();
let selected=stations[0],activeItem='',activePlace='',moving=false,uiPaused=false,yaw=0,pitch=-.04,last=performance.now(),elapsed=0;
/** The desk in front of the walker is THEIR paper only at the item the shell has on screen. */
function deskHere(){return !!deskInfo&&selected.id===activePlace;}
let lastLibraryPresence=null,deskInfo=null,pointerMoved=false;
/** Who moves the class (the shell says), the room's item, the fixed places' state, a walk the shell waits on. */
let navigation='teacher',roomItem='',placeStatus={},arriveNotify='',newsTimer=0,navKey='';
function hideDeskBubble(){ $('desk-bubble').hidden=true;document.body.classList.remove('has-desk-bubble');$('enter').hidden=false; }
function openPersonalDesk(){
 if(uiPaused||!deskInfo||(embedded&&!deskHere()))return;
 if(embedded)send(deskInfo.writable?'agora-village-write':'agora-village-enter');
 else $('enter').click();
}
$('desk-write').onclick=openPersonalDesk;
function guideOf(stationId){return characters.find(c=>c.station===stationId)??null;}
/**
 * The guide's speech bubble at the class's booth: who speaks, the question,
 * the instruction, and the one button that opens the paper. It shows once the
 * walker stands in front of the station — at its approach point, or framed
 * at its table — and never while the camera is still turning.
 */
function updateDeskBubble(){
 const guide=guideOf(selected.id);
 const atTable=viewKind==='table'&&viewPlace===selected.id;
 // In a lesson the guide speaks only once the student stands framed at the
 // station — never on the way in, so the bubble does not appear, vanish while
 // the camera settles, and appear again. The standalone tour keeps "near".
 const standing=embedded?atTable:(atTable||Math.hypot(camera.position.x-selected.ax,camera.position.z-selected.az)<=3.5);
 if(!deskHere()||!guide||uiPaused||view||!standing){hideDeskBubble();return;}
 const anchor=new THREE.Vector3(guide.x,height(guide.x,guide.z)+guide.height+.45,guide.z).project(camera);
 if(anchor.z< -1||anchor.z>1||Math.abs(anchor.x)>.92){hideDeskBubble();return;}
 const written=!!deskInfo.text;
 setText('desk-speaker',guide.name);
 setText('desk-question',activeLabel||selected.name);
 setText('desk-invitation',!deskInfo.writable?'הפתק שלך נשמר. אפשר לפתוח אותו ולקרוא שוב.':written?'הפתק שלך כבר על הלוח. אפשר לחזור אליו ולשפר אותו.':deskInfo.prompt);
 setText('desk-write',!deskInfo.writable?'📖 לקרוא את הפתק שלי':written?'✍️ לערוך את הפתק שלי':'✍️ לכתוב את זה על הפתק שלי');
 const bubble=$('desk-bubble');bubble.hidden=false;document.body.classList.add('has-desk-bubble');$('enter').hidden=true;
 const half=bubble.offsetWidth/2+16;
 bubble.style.left=`${THREE.MathUtils.clamp((anchor.x*.5+.5)*innerWidth,half,innerWidth-half)}px`;
 // In a session the shell's coins, inbox and table/board switch cover the top of the world: stay below them.
 // The app's chrome above the world is the coin/post chips now, not a toolbar
 // and a switch as well, so the guide's bubble may sit much higher.
 const topRoom=document.body.classList.contains('has-community')?70:16;
 bubble.style.top=`${THREE.MathUtils.clamp((-anchor.y*.5+.5)*innerHeight,bubble.offsetHeight+topRoom,innerHeight-130)}px`;
}

// Spawn just north of the fountain, looking across the square at the booths.
const keys=new Set();camera.position.set(0,7.15,8.5);camera.lookAt(0,6.6,15);let angles=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ');yaw=angles.y;pitch=angles.x;
const paperFlight=createPaperFlight(scene,camera,itemId=>{const angles=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ');yaw=angles.y;pitch=angles.x;if(embedded)parent.postMessage({type:'agora-village-landed',itemId},location.origin);});
window.addEventListener('message',event=>{const d=event.data;if(event.origin!==location.origin||event.source!==parent||!embedded||d?.type!=='agora-village-fly'||d.itemId!==activeItem)return;keys.clear();moving=false;uiPaused=false;view=null;viewKind=null;const booth=boardFor(d.place);paperFlight.start(booth?.desk,booth?{face:booth.face}:null,d.itemId);});
/**
 * The booth's two sides, framed for the shell: 'table' shows the paper and
 * the booth's guide together (the paper is written in the guide's speech
 * bubble), 'board' stands in front of the class board. The camera eases there
 * even while an open paper or board pauses the world, and at the table the
 * world reports where the guide's head is so the shell can hang the bubble.
 */
let view=null,viewKind=null,viewPlace='';
function viewPose(place,kind){
 const booth=boardFor(place);if(!booth)return null;
 const eye=new THREE.Vector3(),look=new THREE.Vector3();
 if(kind==='board'){
  booth.face.updateWorldMatrix(true,false);booth.face.getWorldPosition(look);
  const normal=new THREE.Vector3(0,0,1).transformDirection(booth.face.matrixWorld);
  eye.copy(look).addScaledVector(normal,3.4);
 }else{
  booth.desk.paper.updateWorldMatrix(true,false);const paper=booth.desk.paper.getWorldPosition(new THREE.Vector3());
  const guide=guideOf(place);
  const head=guide?new THREE.Vector3(guide.x,height(guide.x,guide.z)+guide.height*.75,guide.z):paper.clone();
  // Aim past the middle, toward the guide: the desk sits on one side of the
  // picture, the guide near the centre, and the far side is left free for
  // the bubble — so writing never hides the table the note is on.
  // Looking a little above the table puts the guide low enough in the picture
  // for their bubble to fit over their head, under the shell's top controls.
  look.copy(paper).lerp(head,.85);look.y=paper.y+1.15;
  // Step back from the line between paper and guide, toward the square, far enough to see both.
  const across=new THREE.Vector3(head.x-paper.x,0,head.z-paper.z);const sep=across.length();
  const out=sep>.01?new THREE.Vector3(-across.z,0,across.x).normalize():new THREE.Vector3(CENTER.x-look.x,0,CENTER.z-look.z).normalize();
  if(out.dot(new THREE.Vector3(CENTER.x-look.x,0,CENTER.z-look.z))<0)out.negate();
  eye.copy(look).addScaledVector(out,sep*1.1+2.6);
 }
 // Eye height as the walker's, so closing the paper or the board does not drop the view.
 eye.y=height(eye.x,eye.z)+1.75;
 const quaternion=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(eye,look,new THREE.Vector3(0,1,0)));
 return {eye,quaternion};
}
function postAnchor(){
 if(!embedded||viewKind!=='table')return;const guide=guideOf(viewPlace);
 if(!guide){parent.postMessage({type:'agora-village-anchor',visible:false},location.origin);return;}
 const p=new THREE.Vector3(guide.x,height(guide.x,guide.z)+guide.height*.85,guide.z).project(camera);
 const visible=p.z>-1&&p.z<1&&Math.abs(p.x)<1&&Math.abs(p.y)<1;
 // Where the paper lies on screen: the bubble hangs on the guide's other side.
 const booth=boardFor(viewPlace);let avoidX=null;
 if(booth){const q=booth.desk.paper.getWorldPosition(new THREE.Vector3()).project(camera);if(q.z>-1&&q.z<1)avoidX=Math.round((q.x*.5+.5)*innerWidth);}
 parent.postMessage({type:'agora-village-anchor',visible,x:Math.round((p.x*.5+.5)*innerWidth),y:Math.round((-p.y*.5+.5)*innerHeight),avoidX,speaker:guide.name},location.origin);
}
function endView(){view=null;const a=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ');yaw=a.y;pitch=a.x;postAnchor();}
function startView(place,kind){
 const pose=viewPose(place,kind);if(!pose)return;
 const station=stations.find(s=>s.id===place);
 // Far from that station (a student roaming, then pressing "my note"): never
 // fly across the village. Walk there; arriving, the shell stands the student
 // at the station and asks for the table again. A board covers the world
 // anyway, so a far board simply keeps the camera where it is.
 if(embedded&&station&&Math.hypot(camera.position.x-station.ax,camera.position.z-station.az)>8){
  if(kind==='table'){selected=station;describe();hideDeskBubble();view=null;viewKind=null;keys.clear();arriveNotify=place;moving=true;}
  return;
 }
 // The walker now stands at this station: its desk and guide are the ones in front of them.
 if(station&&selected.id!==station.id){selected=station;describe();}
 keys.clear();moving=false;hideDeskBubble();viewKind=kind;viewPlace=place;
 // Already framed there (the guide's button pressed at the table): nothing to
 // turn, so answer at once — a 0.9 s "turn" to the same spot kept the paper waiting.
 if(camera.position.distanceTo(pose.eye)<.05&&camera.quaternion.angleTo(pose.quaternion)<.01){view=null;endView();return;}
 if(matchMedia('(prefers-reduced-motion: reduce)').matches){camera.position.copy(pose.eye);camera.quaternion.copy(pose.quaternion);endView();renderer.render(scene,camera);return;}
 view={fromEye:camera.position.clone(),fromQ:camera.quaternion.clone(),...pose,t:0};
}
function tickView(dt){const v=view;v.t=Math.min(1,v.t+dt/.9);const e=v.t*v.t*(3-2*v.t);camera.position.lerpVectors(v.fromEye,v.eye,e);camera.quaternion.slerpQuaternions(v.fromQ,v.quaternion,e);if(v.t===1)endView();}
window.addEventListener('message',event=>{const d=event.data;if(!embedded||event.source!==parent||event.origin!==location.origin||d?.type!=='agora-village-view'||typeof d.place!=='string'||(d.view!=='table'&&d.view!=='board'))return;startView(d.place,d.view);});
function send(type){if(embedded)parent.postMessage({type,itemId:activeItem},location.origin);}
function describe(){$('station-name').textContent=selected.id===activePlace&&activeLabel?activeLabel:selected.name;$('station-place').textContent=selected.short||selected.name;$('guide-line').textContent=selected.question;renderStationNav();}
let activeLabel='';
/** The shell put a new item on screen: its place becomes the walk target. */
function destination(place,label){
 const station=stations.find(s=>s.id===place);
 if(!station){pendingPlace=place;pendingLabel=label||'';selected=stations[0];return;}
 selected=station;activeLabel=label||'';if(!embedded)activePlace=place;describe();moving=false;hideDeskBubble();
 if(!embedded){deskInfo=selected.booth?{label:'הפתק שלי',prompt:'הפתק שלך מחכה על השולחן. איזו הצעה תרצה לכתוב?',writable:true}:null;for(const b of village.booths)b.desk.paint('', 'הפתק שלי',b.station.id===selected.id);}
}
/** The walker picked a place from the list: go there, without changing what the shell shows. */
function walkTo(place){const station=stations.find(s=>s.id===place);if(!station)return;selected=station;describe();hideDeskBubble();viewKind=null;moving=true;canvas.focus();}
window.addEventListener('message',event=>{
 if(!embedded||event.source!==parent||event.origin!==location.origin||!event.data||typeof event.data!=='object')return;const data=event.data;
 if(data.type!=='agora-village-state'||typeof data.itemId!=='string'||typeof data.place!=='string')return;
 document.body.classList.toggle('has-community',data.community===true);
 if(data.quality==='low'||data.quality==='high'){const low=data.quality==='low';if(low!==lowQuality)applyQuality(low);}
 if(typeof data.sound==='boolean')applySound(data.sound);
 deskInfo=data.desk&&typeof data.desk.label==='string'&&typeof data.desk.prompt==='string'?{label:data.desk.label,prompt:data.desk.prompt,text:typeof data.desk.text==='string'?data.desk.text:'',writable:data.desk.writable===true}:null;
 if(Array.isArray(data.booths))installBooths(data.booths.filter(b=>b&&typeof b.itemId==='string'&&typeof b.label==='string').map(b=>({itemId:b.itemId,label:b.label,kind:typeof b.kind==='string'?b.kind:'open',open:b.open!==false,current:b.current===true})));
 if(data.navigation==='teacher'||data.navigation==='free')navigation=data.navigation;
 if(data.places&&typeof data.places==='object')placeStatus=data.places;
 // The ROOM moved (the teacher advanced) — as opposed to this student opening another item.
 const roomChanged=typeof data.roomItemId==='string'&&roomItem!==''&&roomItem!==data.roomItemId;
 if(typeof data.roomItemId==='string')roomItem=data.roomItemId;
 activePlace=data.place;
 if(activeItem!==data.itemId){
  const first=activeItem==='';activeItem=data.itemId;const label=typeof data.label==='string'?data.label:'';
  // Led, the shell sends the walk itself (agora-village-go). Free, a new station is announced, never imposed.
  if(roomChanged){activeLabel=label;if(navigation==='free')announce(data.place,label,'opened');}
  else{destination(data.place,label);if(!first&&data.paused!==true)moving=true;}
 }
 const stationPapers=Array.isArray(data.stationPapers)?data.stationPapers:[];
 for(const booth of village.booths){
  const entries=stationPapers.filter(p=>p&&p.place===booth.station.id&&Array.isArray(p.papers));
  const spec=Array.isArray(data.booths)?data.booths.find(b=>b&&b.itemId===booth.spec.itemId):null;
  booth.paint(entries.flatMap(e=>e.papers).filter(p=>p&&typeof p.text==='string'&&typeof p.own==='boolean'),{open:spec?spec.open!==false:true});
  const current=booth.station.id===activePlace;
  const saved=entries.flatMap(e=>e.papers).find(p=>p&&p.own===true&&typeof p.text==='string')?.text??'';
  booth.desk.paint(current?deskInfo?.text??'':saved,current?deskInfo?.label??'הפתק שלי':'הפתק שלי',current&&!!deskInfo);
 }
 if(data.council&&typeof data.council==='object')village.scoreboard.paint(data.council);
 uiPaused=data.paused===true;document.body.classList.toggle('is-covered',uiPaused);if(uiPaused){keys.clear();moving=false;hideDeskBubble();}
 renderStationNav();
});
$('travel').onclick=()=>{moving=!moving;canvas.focus();};
$('enter').onclick=()=>{
 if(embedded){
  // At the class's booth this walks up to the station (the guide's bubble opens the paper), never the paper itself.
  if(selected.booth){if(selected.id===activePlace&&deskInfo){if(Math.hypot(camera.position.x-selected.ax,camera.position.z-selected.az)<6)startView(activePlace,'table');else{arriveNotify=selected.id;viewKind=null;moving=true;}}else parent.postMessage({type:'agora-village-select',place:selected.id},location.origin);return;}
  if(selected.id==='council'){parent.postMessage({type:'agora-village-board',place:'council'},location.origin);return;}
  if(selected.id===activePlace)send('agora-village-enter');else parent.postMessage({type:'agora-village-select',place:selected.id},location.origin);
  return;
 }
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
let lowQuality=lite;
// Embedded, the app owns both choices (it can label and remember them); the
// standalone tour keeps its own buttons. Idempotent: the state message that
// carries them is posted on every sync.
function applyQuality(low){lowQuality=low;renderer.setPixelRatio(low?1:Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=!low;grass.count=low?Math.floor(gn*.55):gn;$('quality').textContent=low?'איכות חסכונית':'איכות גבוהה';}
async function applySound(on){try{if(sound.active!==on){const now=await sound.toggle();$('sound').textContent=now?'♫ השתקה':'♫ צלילים';}}catch{/* no audio on this device */}}
$('quality').onclick=()=>applyQuality(!lowQuality);
let drag=null;canvas.onpointerdown=e=>{if(uiPaused)return;pointerMoved=false;drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY};canvas.setPointerCapture(e.pointerId);moving=false;};canvas.onpointermove=e=>{if(!drag)return;if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>6)pointerMoved=true;yaw-=(e.clientX-drag.x)*.004;pitch=THREE.MathUtils.clamp(pitch-(e.clientY-drag.y)*.003,-.7,.55);drag={...drag,x:e.clientX,y:e.clientY};};canvas.onpointerup=canvas.onpointercancel=()=>drag=null;
addEventListener('keydown',e=>{if(uiPaused||$('preview-info').open)return;if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyE'].includes(e.code)){e.preventDefault();keys.add(e.code);moving=false;if(e.code==='KeyE')$('enter').click();}});addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>{keys.clear();drag=null;});
for(const b of document.querySelectorAll('[data-key]')){b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(b.dataset.key);moving=false;};b.onpointerup=b.onpointercancel=()=>keys.delete(b.dataset.key);}
/** A station's state on the map: booths carry it on their own spec, the fixed places come from the shell. */
function statusOf(s){if(!embedded)return {open:true,current:false};if(s.booth){const st=village.booths.find(b=>b.station.id===s.id)?.state??{};return {open:st.open!==false,current:st.current===true};}const p=placeStatus[s.id];return p?{open:p.open!==false,current:p.current===true}:{open:true,current:false};}
/**
 * The village map. Free (and in the standalone tour): every station with its
 * state — now, open, locked — and a press walks there. Led by the teacher: no
 * list at all, only where the class is, so nobody wonders which button to press.
 */
function renderStationNav(){
 // A fixed place the lesson never uses (a library with no scenes) is not a station at all.
 const rows=stations.filter(s=>s.booth||!embedded||placeStatus[s.id]?.inPlan!==false).map(s=>({s,st:statusOf(s)}));
 const lead=embedded&&navigation==='teacher';
 const here=stations.find(s=>s.id===activePlace);
 const key=JSON.stringify([lead,selected.id,activePlace,activeLabel,rows.map(r=>[r.s.id,r.s.name,r.st.open,r.st.current])]);
 if(key===navKey)return;navKey=key;
 // The map is always there: students roam freely. Led only means an advance walks everyone.
 $('station-map').hidden=false;$('class-pill').hidden=true;
 $('class-pill-text').textContent=`הכיתה נמצאת ב: ${activeLabel||here?.name||''}`;
 $('map-mode').textContent=!embedded?'סיור חופשי · אפשר ללכת לכל מקום':lead?'מסתובבים בחופשיות. כשהמורה עובר לתחנה חדשה, כולם הולכים אליה יחד.':'בחרו לאן ללכת. תחנה נפתחת כשהמורה מגיע אליה.';
 const nav=$('preview-stations');nav.replaceChildren();
 for(const {s,st} of rows){
  const locked=!st.open;
  const b=document.createElement('button');b.type='button';b.className='station';b.dataset.place=s.id;b.disabled=locked;
  if(s.id===selected.id)b.setAttribute('aria-current','true');
  const icon=document.createElement('span');icon.className='station__icon';icon.setAttribute('aria-hidden','true');icon.textContent=s.icon||'•';
  const name=document.createElement('span');name.className='station__name';name.textContent=s.name;
  const badge=document.createElement('span');badge.className='station__badge';
  const text=locked?'🔒 בהמשך':st.current?'● הכיתה כאן':s.id==='council'?'לוח התוצאות':embedded?'✓ פתוח':'';
  badge.textContent=text;badge.hidden=!text;if(st.current)badge.classList.add('is-now');if(locked)badge.classList.add('is-locked');
  b.setAttribute('aria-label',text?`${s.name} · ${text}`:s.name);
  b.onclick=()=>{if(locked)return;if(s.booth||s.id==='council')arriveNotify=s.id;walkTo(s.id);if(matchMedia('(max-width:650px)').matches)setMapOpen(false);};
  b.append(icon,name,badge);nav.append(b);
 }
}
function setMapOpen(open){$('station-map').classList.toggle('is-open',open);$('map-toggle').setAttribute('aria-expanded',String(open));}
$('map-toggle').onclick=()=>setMapOpen(!$('station-map').classList.contains('is-open'));
setMapOpen(!matchMedia('(max-width:650px)').matches);
/** A line across the top of the world: where the teacher is taking the class, or a newly opened station to walk to. */
function announce(place,label,reason){
 const station=stations.find(s=>s.id===place);const name=label||station?.name||'';
 clearTimeout(newsTimer);
 $('news-text').textContent=reason==='call'?`המורה קורא לכולם אל: ${name}`:reason==='advance'?`המורה מוביל את הכיתה אל: ${name}`:`נפתחה תחנה חדשה: ${name}`;
 const goButton=$('news-go');goButton.hidden=reason!=='opened';
 goButton.onclick=()=>{$('news').hidden=true;arriveNotify=place;walkTo(place);};
 $('news').hidden=false;newsTimer=setTimeout(()=>{$('news').hidden=true;},reason==='opened'?20000:6000);
}
/** Tell the shell the walk it asked for is over, so it can open the paper or the council. */
function arrived(){if(!arriveNotify||!embedded)return;const place=arriveNotify;arriveNotify='';parent.postMessage({type:'agora-village-arrived',place},location.origin);}
window.addEventListener('message',event=>{
 if(!embedded||event.source!==parent||event.origin!==location.origin)return;const d=event.data;
 if(!d||d.type!=='agora-village-go'||typeof d.place!=='string')return;
 const station=stations.find(s=>s.id===d.place);if(!station){parent.postMessage({type:'agora-village-arrived',place:d.place},location.origin);return;}
 uiPaused=false;keys.clear();view=null;viewKind=null;arriveNotify=d.place;selected=station;describe();hideDeskBubble();
 if(d.reason==='advance'||d.reason==='call')announce(d.place,d.place===activePlace?activeLabel:'',d.reason);
 if(Math.hypot(camera.position.x-station.ax,camera.position.z-station.az)<=.3)arrived();else moving=true;
});
$('session-entry').hidden=embedded;$('preview-label').hidden=embedded;
// The whole header is the standalone tour's — a title, a join link and the two
// buttons above. Embedded it showed through the iframe over the app's own
// chrome, which is where "איכות גבוהה" and "♫ צלילים" came from.
document.querySelector('header').hidden=embedded;
if(!embedded){
 // The standalone tour shows a plan-shaped village: sample booths and a sample
 // scoreboard. `?booths=N` walks a village the size of an N-question lesson.
 const sample=[
  {itemId:'demo-story',label:'איך האתגר הזה פוגש את החיים שלך?',kind:'story'},
  {itemId:'demo-needs',label:'מה חשוב לך, ועל מה היית רוצה לשמור?',kind:'needs'},
  {itemId:'demo-vision',label:'איך היית רוצה שזה ייראה בעוד שנה?',kind:'vision'},
  {itemId:'demo-open',label:'מה עוד חשוב לברר לפני שמחליטים?',kind:'open'},
 ];
 const asked=THREE.MathUtils.clamp(Number(new URLSearchParams(location.search).get('booths'))||3,1,8);
 const specs=Array.from({length:asked-1},(_,i)=>({...sample[i%sample.length],itemId:`demo-${i}`,open:true,current:false}));
 specs.push({itemId:'demo-solution',label:'איזה פתרון נותן מקום לצרכים שעלו?',kind:'proposal',open:true,current:true});
 installBooths(specs);
 village.booths[specs.length-1].paint([{text:'נתחיל בניסיון קטן לזמן מוגבל ונבדוק יחד מה עבד.',own:false},{text:'נקבע כללים ברורים לחלוקה, עם מקום לעזרה למי שצריך.',own:false},{text:'קבוצה קטנה עם נציגים מכל צד תחבר בין ההצעות.',own:true}]);
 village.scoreboard.paint({mode:'pitch',goalOnly:false,leftLabel:'צד א',rightLabel:'צד ב',scoredAny:true,footer:'סיור · במפגש אמיתי הלוח מתעדכן חי',points:[{rank:1,percent:61,lean:.1,raters:6,mine:true,scored:true,lead:true,color:'#f4c95d'},{rank:2,percent:35,lean:-.6,raters:5,mine:false,scored:false,color:'#9fd3e6'},{rank:3,percent:-20,lean:.5,raters:4,mine:false,scored:false,color:'#e6a0a0'}]});
 destination('booth:demo-solution');
}else destination('challenge');
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);if(!view)postAnchor();});document.addEventListener('visibilitychange',()=>{keys.clear();sound.visibility(document.hidden);});
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
function frame(now){requestAnimationFrame(frame);if((lite||lowQuality)&&now-last<66)return;const dt=Math.min((now-last)/1000,.04);/* walking uses the real elapsed time (capped) so a slow renderer does not slow the walker */const dtWalk=Math.min((now-last)/1000,.25);last=now;if(paperFlight.active){paperFlight.tick(dt);village.tick(camera);renderer.render(scene,camera);return;}if(view){tickView(dt);village.tick(camera);renderer.render(scene,camera);return;}if(document.hidden||uiPaused||$('preview-info').open)return;elapsed+=dt;wind.value=elapsed;const old=camera.position.clone();
 if(moving){const dx=selected.ax-camera.position.x,dz=selected.az-camera.position.z,dist=Math.hypot(dx,dz);if(dist>.12){const stepLen=Math.min(dist,dtWalk*4);camera.position.x+=dx/dist*stepLen;camera.position.z+=dz/dist*stepLen;const look=selected.look??guideOf(selected.id)??selected;const target=Math.atan2(camera.position.x-look.x,camera.position.z-look.z);yaw+=Math.atan2(Math.sin(target-yaw),Math.cos(target-yaw))*Math.min(1,dtWalk*3);}else {moving=false;pitch=selected.pitch??-.06;arrived();}}
 const f=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown')),s=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));if(f||s){viewKind=null;const n=Math.hypot(f,s);camera.position.x+=(-Math.sin(yaw)*f+Math.cos(yaw)*s)/n*dt*4;camera.position.z+=(-Math.cos(yaw)*f-Math.sin(yaw)*s)/n*dt*4;}
 if(!moving&&((Math.abs(camera.position.x)<3.7&&camera.position.z<2.6&&camera.position.z>-3.9)||village.solids.some(o=>Math.abs(camera.position.x-o.x)<o.w&&Math.abs(camera.position.z-o.z)<o.d)))camera.position.copy(old);
 camera.position.x=THREE.MathUtils.clamp(camera.position.x,-bounds.x,bounds.x);camera.position.z=THREE.MathUtils.clamp(camera.position.z,-24,bounds.zMax);camera.position.y=height(camera.position.x,camera.position.z)+1.75;camera.quaternion.setFromEuler(new THREE.Euler(pitch,yaw,0,'YXZ'));village.tick(camera);
 const shelf=fixedStations[0];const insideLibrary=Math.abs(camera.position.z-shelf.z)<3.5&&camera.position.x>shelf.x-2.6&&camera.position.x<shelf.x+3.4;
 if(embedded&&insideLibrary!==lastLibraryPresence){lastLibraryPresence=insideLibrary;parent.postMessage({type:'agora-village-library-presence',inside:insideLibrary},location.origin);}
 const near=Math.hypot(camera.position.x-selected.ax,camera.position.z-selected.az)<3;setText('enter',deskHere()?'לגשת לשולחן ולפתק':selected.id==='council'?'לפתוח את לוח התוצאות':selected.booth?(embedded?'לגשת לביתן הזה':'להיכנס לביתן'):near?'להיכנס לתחנה ←':'כניסה מהירה לתחנה ←');updateDeskBubble();setText('travel',moving?'לעצור':`ללכת אל: ${selected.name}`);$('travel').hidden=(!moving&&near)||(viewKind==='table'&&viewPlace===selected.id);renderer.render(scene,camera);
}
/** Read-only probe for tests: how much of the planting the village cleared, and how close the nearest tree stands to each paved place */
window.__villagePlanting=()=>({trees:treeParts.length,standing:treeParts.filter(t=>t.group.visible).length,nearest:village.clearings.map(s=>({place:s.booth?'booth':'place',x:+s.x.toFixed(1),z:+s.z.toFixed(1),tree:Math.min(...treeParts.filter(t=>t.group.visible).map(t=>+Math.hypot(t.x-s.x,t.z-s.z).toFixed(1)))}))});
/** Read-only probe for tests: where the walker stands and what the world believes it is doing */
window.__villageDebug=()=>{const g=guideOf(selected.id);return {x:+camera.position.x.toFixed(2),z:+camera.position.z.toFixed(2),dGuide:g?+Math.hypot(camera.position.x-g.x,camera.position.z-g.z).toFixed(2):null,dApproach:+Math.hypot(camera.position.x-selected.ax,camera.position.z-selected.az).toFixed(2),moving,turning:!!view,viewKind,selected:selected.id,activePlace,uiPaused,flight:paperFlight.active,guideBubble:!$('desk-bubble').hidden};};
requestAnimationFrame(frame);
