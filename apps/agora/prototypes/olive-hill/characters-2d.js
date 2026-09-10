import * as THREE from './vendor/three.module.js';

// Add approved portraits here as they arrive. Each has a permanent place and
// facing direction; the artwork never spins to follow the player.
export const characters = [
 {id:'boy',station:'needs',name:'אמיר · שואל ומקשיב',
  image:new URL('./assets/village-boy.png',import.meta.url).href,
  x:10,z:25,facing:-2.6,height:1.8},
 {id:'elder',station:'challenge',name:'החכמה בבית המדרש',
  image:new URL('./assets/elder-woman-cutout.png',import.meta.url).href,
  x:-12.6,z:9.1,facing:.48,height:2.05},
 {id:'miriam',station:'solution',name:'מרים · חכמה של מעשה',
  image:new URL('./assets/wise-greek-elder.png',import.meta.url).href,
  x:1.8,z:3.55,facing:.09,height:2.2},
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
