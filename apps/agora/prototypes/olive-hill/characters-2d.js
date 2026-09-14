import * as THREE from './vendor/three.module.js';

/**
 * Characters remain upright and turn around the vertical axis to face the
 * viewer. Some are fixed to a building (the study house, the council); the
 * rest form a pool that the booths draw from in plan order — `assign` moves
 * a guide to a booth, `release` sends the pool home until the plan arrives.
 */
export const characters = [
 {id:'man',station:'challenge',name:'נועם · חושבים יחד',image:new URL('./assets/village-man-cutout.png',import.meta.url).href,x:-12.6,z:9.1,facing:.48,height:2.05,fixed:true},
 {id:'elder',station:'council',name:'החכמה במועצת הכפר',
  image:new URL('./assets/elder-woman-front.png',import.meta.url).href,
  x:18.2,z:6.2,facing:-.85,height:2.05,fixed:true},
 {id:'sage',station:'council',name:'עזרא · שואל בחוכמה',image:new URL('./assets/village-sage-cutout.png',import.meta.url).href,x:10.4,z:5.4,facing:-.5,height:2.05,fixed:true},
 {id:'woman',station:'',name:'נעמה · מקשיבה לסיפורים',image:new URL('./assets/village-woman-cutout.png',import.meta.url).href,x:-12.5,z:24,facing:1.9,height:1.9},
 {id:'boy',station:'',name:'אמיר · שואל ומקשיב',
  image:new URL('./assets/village-boy.png',import.meta.url).href,
  x:10,z:25,facing:-2.6,height:1.8},
 {id:'miriam',station:'',name:'מרים · חכמה של מעשה',
  image:new URL('./assets/wise-greek-elder.png',import.meta.url).href,
  x:1.8,z:3.55,facing:.09,height:2.2},
 {id:'ethiopian',station:'',name:'רות · מקשיבה למה שחשוב',image:new URL('./assets/village-ethiopian-cutout.png',import.meta.url).href,x:11.6,z:24.5,facing:-2.5,height:1.9},
 {id:'girl',station:'',name:'תמר · סקרנית לגלות',image:new URL('./assets/village-girl-cutout.png',import.meta.url).href,x:-10.8,z:24.4,facing:2.5,height:1.75},
];

const pool = characters.filter((c) => !c.fixed);

export function buildCharacters({scene,height,manager}) {
 const figures=[];
 const byId=new Map();
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
  person.visible=character.fixed===true||character.station!=='';
  scene.add(person);figures.push(person);byId.set(character.id,person);
 })).then(results=>({loaded:figures.length,failed:results.filter(r=>r.status==='rejected').length}));
 function place(character){
  const person=byId.get(character.id);
  if(!person)return;
  person.position.set(character.x,height(character.x,character.z)+character.height/2+.1,character.z);
  person.visible=character.fixed===true||character.station!=='';
 }
 return {figures,ready,
  /** Send a pool character to a booth. Booths past the pool size share the last guide's twin: none. */
  assign(index,{x,z,station}){
   const character=pool[index%pool.length];
   if(index>=pool.length)return null;
   character.x=x;character.z=z;character.station=station;place(character);

   return character;
  },
  release(){for(const character of pool){character.station='';place(character);}},
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
