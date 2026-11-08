import * as THREE from './vendor/three.module.js';
import { PLACES } from './village-layout.js';

/** A spot beside one of the fixed sites, so a guide moves when its site does. */
const beside = (place, dx, dz) => ({ x: PLACES[place].x + dx, z: PLACES[place].z + dz });

/**
 * Characters remain upright and turn around the vertical axis to face the
 * viewer. Some are fixed to a building (the study house, the council); the
 * rest form a pool that the booths draw from in plan order — `assign` moves
 * a guide to a booth, `release` sends the pool home until the plan arrives.
 */
export const characters = [
 {id:'man',station:'challenge',name:'נועם · חושבים יחד',image:new URL('./assets/village-man-cutout.png',import.meta.url).href,...beside('study',.4,3.1),facing:.48,height:2.05,fixed:true},
 {id:'elder',station:'council',name:'החכמה במועצת הכפר',
  image:new URL('./assets/elder-woman-front.png',import.meta.url).href,
  ...beside('council',4.2,1.2),facing:-.85,height:2.05,fixed:true},
 {id:'sage',station:'council',name:'עזרא · שואל בחוכמה',image:new URL('./assets/village-sage-cutout.png',import.meta.url).href,...beside('council',-3.6,.4),facing:-.5,height:2.05,fixed:true},
 {id:'woman',station:'',name:'נעמה · מקשיבה לסיפורים',image:new URL('./assets/village-woman-cutout.png',import.meta.url).href,x:-14.5,z:26,facing:1.9,height:1.9},
 {id:'boy',station:'',name:'אמיר · שואל ומקשיב',
  image:new URL('./assets/village-boy.png',import.meta.url).href,
  x:12,z:27,facing:-2.6,height:1.8},
 {id:'miriam',station:'',name:'מרים · חכמה של מעשה',
  image:new URL('./assets/wise-greek-elder.png',import.meta.url).href,
  x:1.8,z:3.55,facing:.09,height:2.2},
 {id:'ethiopian',station:'',name:'רות · מקשיבה למה שחשוב',image:new URL('./assets/village-ethiopian-cutout.png',import.meta.url).href,x:14.6,z:23.5,facing:-2.5,height:1.9},
 {id:'girl',station:'',name:'תמר · סקרנית לגלות',image:new URL('./assets/village-girl-cutout.png',import.meta.url).href,x:-12.8,z:22.4,facing:2.5,height:1.75},
];

const pool = characters.filter((c) => !c.fixed);

export function buildCharacters({scene,height,manager}) {
 const figures=[];
 const byId=new Map();
 /** Stations taken off the hill — their guides step away with them. */
 const hiddenStations=new Set();
 const standing=character=>(character.fixed===true||character.station!=='')&&!hiddenStations.has(character.station)&&character.hidden!==true;
 const loader=new THREE.TextureLoader(manager);
 const ready=Promise.allSettled(characters.map(async character=>{
  const texture=await loader.loadAsync(character.image);
  texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,
   alphaTest:.65,side:THREE.DoubleSide,toneMapped:false});
  const ratio=texture.image.width/texture.image.height;
  const person=new THREE.Mesh(new THREE.PlaneGeometry(character.height*ratio,character.height),material);
  person.name=character.id;
  person.position.set(character.x,height(character.x,character.z)+character.height/2+.1,character.z);
  person.rotation.y=character.facing;
  person.userData.character=character;
  person.visible=standing(character);
  scene.add(person);figures.push(person);byId.set(character.id,person);
 })).then(results=>({loaded:figures.length,failed:results.filter(r=>r.status==='rejected').length}));
 function place(character){
  const person=byId.get(character.id);
  if(!person)return;
  person.position.set(character.x,groundY(character),character.z);
  person.visible=standing(character);
 }
 /** A flat guide hangs on its centre; a framed portrait stands on its own feet. */
 function groundY(character){return height(character.x,character.z)+(character.cast?.02:character.height/2+.1);}
 // ---- The scenario's characters -------------------------------------------------
 // Without a cut-out picture they stand as framed portraits on a little easel.
 // They are the same two people everywhere they stand (the study house, the
 // story and needs booths), so each place gets its own instance of the figure.
 let castDefs=[];
 const castTextures=new Map();
 const castInstances=new Map();
 const WOOD='#70543b';
 function castTexture(def){
  const key=def.portraitUrl||`initial:${def.name}`;
  if(!castTextures.has(key)){
   castTextures.set(key,(def.portraitUrl?loader.loadAsync(def.portraitUrl):Promise.reject(new Error('no portrait'))).catch(()=>silhouetteTexture(def.name)).then(texture=>{texture.colorSpace=THREE.SRGBColorSpace;return texture;}));
  }
  return castTextures.get(key);
 }
 function silhouetteTexture(name){
  const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');
  x.fillStyle='#d9cdb0';x.fillRect(0,0,256,256);x.fillStyle='#8c7a58';x.beginPath();x.arc(128,100,46,0,Math.PI*2);x.fill();
  x.beginPath();x.ellipse(128,226,84,70,0,Math.PI,0);x.fill();
  x.fillStyle='#fff';x.font='bold 64px Arial';x.textAlign='center';x.fillText([...name.trim()][0]??'',128,118);
  return new THREE.CanvasTexture(c);
 }
 function nameplate(name){
  const c=document.createElement('canvas');c.width=512;c.height=112;const x=c.getContext('2d');
  x.fillStyle='#f8edce';x.fillRect(0,0,512,112);x.strokeStyle='#686e49';x.lineWidth=6;x.strokeRect(5,5,502,102);
  x.fillStyle='#384f36';x.textAlign='center';x.direction='rtl';let size=44;x.font=`bold ${size}px Arial`;
  while(x.measureText(name).width>470&&size>20){size-=2;x.font=`bold ${size}px Arial`;}
  x.fillText(name,256,70);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
 }
 const woodMaterial=new THREE.MeshStandardMaterial({color:WOOD,roughness:.93});
 function portraitFigure(def,texture,h){
  const group=new THREE.Group();group.name=`cast-${def.id}`;
  const p=h*.66,frameSize=p+.16,top=h-.02,centerY=top-frameSize/2;
  const add=(geometry,material,x,y,z)=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.castShadow=true;group.add(mesh);return mesh;};
  add(new THREE.BoxGeometry(frameSize,frameSize,.09),woodMaterial,0,centerY,0);
  add(new THREE.PlaneGeometry(p,p),new THREE.MeshBasicMaterial({map:texture,toneMapped:false}),0,centerY,.052);
  for(const side of [-1,1]){const leg=add(new THREE.BoxGeometry(.08,centerY-frameSize/2+.1,.08),woodMaterial,side*(frameSize/2-.06),(centerY-frameSize/2+.1)/2,-.02);leg.rotation.z=-side*.05;}
  add(new THREE.PlaneGeometry(.95,.21),new THREE.MeshBasicMaterial({map:nameplate(def.name),toneMapped:false}),0,.36,.045);
  return group;
 }
 /** Stand the scenario's characters at a place: one spot each, in cast order. Idempotent. */
 function seatCast(station,spots){
  unseatCast(station);
  if(!castDefs.length)return [];
  const seated=[];
  // Last first, so the first of the cast ends up first in the roster: the one whose head the bubble hangs on
  for(let i=castDefs.length-1;i>=0;i--){
   const def=castDefs[i];const spot=spots[i];if(!spot)continue;
   const character={id:`cast:${def.id}@${station}`,station,name:def.name,fixed:true,cast:true,x:spot.x,z:spot.z,facing:spot.facing??0,height:spot.height??1.9};
   const instance={character,person:null};castInstances.set(character.id,instance);characters.unshift(character);
   castTexture(def).then(texture=>{
    if(!castInstances.has(character.id))return;
    const person=portraitFigure(def,texture,character.height);person.userData.character=character;
    person.position.set(character.x,groundY(character),character.z);person.rotation.y=character.facing;
    person.visible=standing(character);scene.add(person);figures.push(person);byId.set(character.id,person);instance.person=person;
   });
   seated.push(character);
  }
  return seated;
 }
 function unseatCast(station){
  for(const [id,instance] of [...castInstances]){
   if(instance.character.station!==station)continue;
   castInstances.delete(id);
   const at=characters.indexOf(instance.character);if(at>=0)characters.splice(at,1);
   if(instance.person){scene.remove(instance.person);byId.delete(id);const k=figures.indexOf(instance.person);if(k>=0)figures.splice(k,1);}
  }
 }
 return {figures,ready,
  /** The scenario's characters, as {id,name,portraitUrl}; an empty list sends them home. */
  setCast(list){castDefs=Array.isArray(list)?list:[];},
  castKey(){return castDefs.map(d=>`${d.id}|${d.portraitUrl??''}`).join(';');},
  hasCast(){return castDefs.length>0;},
  seatCast,unseatCast,
  /** Send a flat guide home while a scenario character takes their place, or call them back. */
  hide(character,hidden){if(!character)return;character.hidden=hidden;place(character);},
  /** Send a pool character to a booth. Booths past the pool size share the last guide's twin: none. */
  assign(index,{x,z,station}){
   const character=pool[index%pool.length];
   if(index>=pool.length)return null;
   character.x=x;character.z=z;character.station=station;place(character);

   return character;
  },
  release(){for(const character of pool){character.station='';place(character);}},
  showStation(station,shown){
   if(shown)hiddenStations.delete(station);else hiddenStations.add(station);
   for(const character of characters)if(character.station===station)place(character);
  },
  tick(camera){
  for(const person of figures){
   if(!person.visible)continue;
   const c=person.userData.character;
   const dx=camera.position.x-c.x,dz=camera.position.z-c.z;
   // Cylindrical billboard: face the camera horizontally without tilting
   // the character or changing its proportions as the viewer walks around.
   if(dx*dx+dz*dz>1e-8)person.rotation.y=Math.atan2(dx,dz);
  }
 }};
}
