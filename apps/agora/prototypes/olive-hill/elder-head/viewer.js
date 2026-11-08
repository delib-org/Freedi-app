import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
const $=id=>document.getElementById(id),canvas=$('portrait');
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas,antialias:true});}catch(error){$('status').textContent='תלת־מימד אינו זמין בדפדפן הזה.';throw error;}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
const scene=new THREE.Scene();scene.background=new THREE.Color('#202a2d');
const camera=new THREE.PerspectiveCamera(32,1,.01,10);
scene.add(new THREE.HemisphereLight(0xfff2df,0x72878b,2.1));
const key=new THREE.DirectionalLight(0xfff2df,1.2);key.position.set(-1,1,2);scene.add(key);const fill=new THREE.DirectionalLight(0xd1e2ef,.6);fill.position.set(1,.4,1);scene.add(fill);
const root=new THREE.Group();scene.add(root);let yaw=0,pitch=0,distance=.72,target=.16,face=null,smile=0,sequence=null,blinkAt=-10;
function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}addEventListener('resize',resize);resize();
let drag=null;
canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!drag)return;yaw+=(e.clientX-drag.x)*.008;pitch=THREE.MathUtils.clamp(pitch+(e.clientY-drag.y)*.004,-.35,.35);drag={x:e.clientX,y:e.clientY};});
canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
canvas.addEventListener('wheel',e=>{e.preventDefault();distance=THREE.MathUtils.clamp(distance+e.deltaY*.0005,.44,1.1);},{passive:false});
$('smile').oninput=e=>{sequence=null;smile=Number(e.target.value)/100;};
$('play').onclick=()=>{sequence=performance.now();};$('blink').onclick=()=>blinkAt=performance.now()/1000;
$('reset').onclick=()=>{yaw=0;pitch=0;distance=.72;};
new GLTFLoader().load(new URL('./elder-head.glb',import.meta.url).href,gltf=>{
 root.add(gltf.scene);gltf.scene.traverse(o=>{if(o.morphTargetDictionary?.Smile!==undefined)face=o;});
 if(!face){$('status').textContent='מצבי ההבעה לא נטענו. נסו לרענן.';return;}
 $('status').hidden=true;
},undefined,()=>{$('status').textContent='לא ניתן לטעון את הראש. רעננו כדי לנסות שוב.';});
function frame(now){requestAnimationFrame(frame);const t=now/1000;
 if(sequence!==null){const u=(now-sequence)/2400;smile=.5-.5*Math.cos(Math.min(u,2)*Math.PI);if(u>=2)sequence=null;$('smile').value=String(Math.round(smile*100));}
 $('value').value=Math.round(smile*100)+'%';
 if(face){face.morphTargetInfluences[face.morphTargetDictionary.Smile]=smile;const b=t-blinkAt;face.morphTargetInfluences[face.morphTargetDictionary.Blink]=b>=0&&b<.3?Math.sin(b/.3*Math.PI):0;}
 root.rotation.y=yaw;root.rotation.x=pitch;
 camera.position.set(0,target+.025,distance*Math.max(1,.8/camera.aspect));camera.lookAt(0,target-.03,0);renderer.render(scene,camera);
}requestAnimationFrame(frame);
