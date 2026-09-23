import * as THREE from './vendor/three.module.js';

// The original olive-hill demo's curved flight, with a station-specific destination.
export function createPaperFlight(scene, camera, landed) {
 const letter=new THREE.Mesh(new THREE.PlaneGeometry(.8,.56),new THREE.MeshStandardMaterial({color:'#fffef9',side:THREE.DoubleSide,roughness:.8}));
 letter.add(new THREE.LineSegments(new THREE.EdgesGeometry(letter.geometry),new THREE.LineBasicMaterial({color:'#b3ae9e'})));
 letter.visible=false;scene.add(letter);let flight=null;
 return {
  get active(){return !!flight;},
  start(desk,board,itemId){
   if(!board){landed(itemId);return;}
   board.face.updateWorldMatrix(true,false);
   const end=board.face.getWorldPosition(new THREE.Vector3());
   const start=desk?desk.paper.getWorldPosition(new THREE.Vector3()):end.clone().add(new THREE.Vector3(0,-1,3));
   const control=start.clone().lerp(end,.5).add(new THREE.Vector3(0,2.8,0));
   const normal=new THREE.Vector3(0,0,1).transformDirection(board.face.matrixWorld);
   camera.position.copy(start.clone().lerp(end,.5).addScaledVector(normal,6));camera.position.y=Math.max(start.y,end.y)+1.3;
   flight={start,end,control,t:0,itemId};letter.visible=true;
   if(matchMedia('(prefers-reduced-motion: reduce)').matches){letter.visible=false;flight=null;camera.lookAt(end);landed(itemId);}
  },
  tick(dt){
   if(!flight)return;const f=flight;f.t=Math.min(1,f.t+dt/2.6);const t=f.t*f.t*(3-2*f.t);
   letter.position.copy(f.start).multiplyScalar((1-t)**2).addScaledVector(f.control,2*(1-t)*t).addScaledVector(f.end,t*t);
   letter.rotation.set(-.5+Math.sin(t*Math.PI)*1.2,t*Math.PI*2,Math.sin(t*Math.PI*3)*.22);
   camera.lookAt(letter.position.clone().lerp(f.end,.25));
   if(f.t===1){letter.visible=false;flight=null;landed(f.itemId);}
  }
 };
}
