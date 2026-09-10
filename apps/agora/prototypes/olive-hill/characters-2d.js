import * as THREE from './vendor/three.module.js';

// Add approved portraits here as they arrive. Each has a permanent place and
// facing direction; the artwork never spins to follow the player.
export const characters = [
 {id:'boy',station:'needs',name:'אמיר · שואל ומקשיב',
  image:new URL('./assets/village-boy.png',import.meta.url).href,
  x:10,z:25,facing:-2.6,height:1.8},
 {id:'elder',station:'challenge',name:'החכמה בבית המדרש',
  image:new URL('./assets/elder-woman-front.png',import.meta.url).href,
  x:-12.6,z:9.1,facing:.48,height:2.05},
 {id:'miriam',station:'solution',name:'מרים · חכמה של מעשה',
  image:new URL('./assets/wise-greek-elder.png',import.meta.url).href,
  x:1.8,z:3.55,facing:.09,height:2.2},
 {id:'woman',station:'story',name:'נעמה · מקשיבה לסיפורים',image:new URL('./assets/village-woman-cutout.png',import.meta.url).href,x:-12.5,z:24,facing:1.9,height:1.9},
 {id:'sage',station:'council',name:'עזרא · שואל בחוכמה',image:new URL('./assets/village-sage-cutout.png',import.meta.url).href,x:13,z:7,facing:-.5,height:2.05},
 {id:'ethiopian',station:'needs',name:'רות · מקשיבה למה שחשוב',image:new URL('./assets/village-ethiopian-cutout.png',import.meta.url).href,x:11.6,z:24.5,facing:-2.5,height:1.9},
 {id:'girl',station:'story',name:'תמר · סקרנית לגלות',image:new URL('./assets/village-girl-cutout.png',import.meta.url).href,x:-10.8,z:24.4,facing:2.5,height:1.75},
 {id:'man',station:'council',name:'נועם · חושבים יחד',image:new URL('./assets/village-man-cutout.png',import.meta.url).href,x:15,z:7,facing:-.85,height:2.05},
];

export function buildCharacters({scene,height,manager}) {
 const figures=[];
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
  scene.add(person);figures.push(person);
 })).then(results=>({loaded:figures.length,failed:results.filter(r=>r.status==='rejected').length}));
 return {figures,ready,tick(camera){
  for(const person of figures){
   const c=person.userData.character;
   const dx=camera.position.x-c.x,dz=camera.position.z-c.z;
   const front=(dx*Math.sin(c.facing)+dz*Math.cos(c.facing))/(Math.hypot(dx,dz)||1);
   // Hide the reverse/edge view instead of showing a mirrored paper person.
   person.material.opacity=THREE.MathUtils.smoothstep(front,.15,.6);
   person.visible=front>.15;
  }
 }};
}
