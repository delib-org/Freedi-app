import * as THREE from './vendor/three.module.js';

/** A personal paper on real timber geometry. Only confirmed session text is painted. */
export function buildWritingDesk({ scene, station, height }) {
 const group = new THREE.Group();
 const x = (station.ax + station.x) / 2, z = (station.az + station.z) / 2;
 group.position.set(x, height(x, z) + .08, z);
 group.rotation.y = Math.atan2(station.ax - x, station.az - z);
 group.name = `writing-desk-${station.id}`;
 scene.add(group);
 const wood = new THREE.MeshStandardMaterial({ color: '#795638', roughness: .9 });
 const addBox = (w, h, d, material, x, y, z) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
  group.add(mesh); return mesh;
 };
 addBox(1.9, .14, 1.12, wood, 0, .94, 0);
 for (const x of [-.77, .77]) for (const z of [-.4, .4]) addBox(.12, .9, .12, wood, x, .45, z);
 addBox(1.65, .13, .09, wood, 0, .42, -.4);
 const paperCanvas = document.createElement('canvas');
 paperCanvas.width = 768; paperCanvas.height = 640;
 const context = paperCanvas.getContext('2d');
 const texture = new THREE.CanvasTexture(paperCanvas); texture.colorSpace = THREE.SRGBColorSpace;
 const paper = new THREE.Mesh(new THREE.PlaneGeometry(1.02, .85), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
 paper.rotation.x = -Math.PI / 2; paper.position.set(-.14, 1.018, .04); group.add(paper);
 const pen = addBox(.035, .028, .48, new THREE.MeshStandardMaterial({ color: '#304c43' }), .59, 1.035, .12);
 pen.rotation.y = -.3;
 let previous = '';
 function paint(text = '', label = 'הפתק שלי', active = false) {
  const key = JSON.stringify([text, label, active]); if (key === previous) return; previous = key;
  context.fillStyle = active ? '#fffef4' : '#eee5d0'; context.fillRect(0, 0, 768, 640);
  context.strokeStyle = '#c8cfc2'; context.lineWidth = 2;
  for (let y = 195; y < 640; y += 64) { context.beginPath(); context.moveTo(42, y); context.lineTo(726, y); context.stroke(); }
  context.direction = 'rtl'; context.textAlign = 'right'; context.fillStyle = '#304c3b';
  context.font = 'bold 48px Arial'; context.fillText(label, 710, 83, 660);
  context.font = '35px Arial';
  const words = (text || (active ? 'לחצו כאן כדי לכתוב…' : 'הפתק מחכה לתחנה שלך')).split(/\s+/);
  let line = '', y = 175;
  for (const word of words) {
   if (context.measureText(line + word).width > 650) {
    context.fillText(line, 710, y); y += 64; line = '';
    if (y > 540) { line = '…'; break; }
   }
   line += word + ' ';
  }
  context.fillText(line, 710, y); texture.needsUpdate = true;
 }
 paint();
 return { station, group, paper, paint, solid: { x, z, w: .85, d: .7 } };
}
