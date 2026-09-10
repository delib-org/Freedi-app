import * as THREE from './vendor/three.module.js';
import { buildCharacters } from './characters-2d.js';

export const stations=[
 {id:'challenge',name:'בית המדרש',short:'האתגר',guide:'החכמה · שואלת ומקשיבה',question:'מה אנחנו יודעים, ומה עוד חשוב לברר?',x:-13,z:6,ax:-10,az:12,icon:'⌂'},
 {id:'story',name:'גינת הסיפורים',short:'הסיפור שלי',guide:'חברים לדרך',question:'איך האתגר הזה פוגש את החיים שלך?',x:-13,z:23,ax:-9,az:22,icon:'❧'},
 {id:'needs',name:'חצר הצרכים',short:'מה חשוב לי',guide:'מקשיבים למה שחשוב',question:'מה חשוב לך, ועל מה היית רוצה לשמור?',x:10,z:24,ax:7,az:20,icon:'✧'},
 {id:'solution',name:'בית המלאכה לרעיונות',short:'הפתרון שלי',guide:'מרים · חכמה של מעשה',question:'איזה פתרון נותן מקום לצרכים שעלו?',x:1.8,z:3.55,ax:2.2,az:8,icon:'✎'},
 {id:'council',name:'מועצת הכפר',short:'מחליטים יחד',guide:'חכמי הכפר',question:'מה נבחר לנסות, ואיך נדע שהצלחנו?',x:14,z:5,ax:10.5,az:11,icon:'◒'},
];

export function buildVillage({scene,height,manager}){
 const material=color=>new THREE.MeshStandardMaterial({color,roughness:.93});const limestone=material('#d8c7a5'),wood=material('#70543b'),olive=material('#657653'),paper=material('#f5edda');
 const solids=[];const make=(geo,mat,parent,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
 const box=(w,h,d,mat,p,x,y,z)=>make(new THREE.BoxGeometry(w,h,d),mat,p,x,y,z);
 function floor(x,z,r){const g=new THREE.Group();g.position.set(x,height(x,z)+.045,z);scene.add(g);make(new THREE.CylinderGeometry(r,r,.14,48),limestone,g,0,0,0);return g;}
 function table(g,x,z){box(1.7,.12,.85,wood,g,x,.92,z);for(const dx of [-.7,.7])for(const dz of [-.3,.3])box(.1,.92,.1,wood,g,x+dx,.42,z+dz);box(.65,.012,.43,paper,g,x,.991,z);}
 function bench(g,x,z,angle=0){const b=new THREE.Group();b.position.set(x,.1,z);b.rotation.y=angle;g.add(b);box(1.5,.18,.55,limestone,b,0,.5,0);for(const dx of [-.55,.55])box(.2,.5,.4,limestone,b,dx,.2,0);}
 function label(g,text,y=3.7){const c=document.createElement('canvas');c.width=768;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#f8edce';ctx.fillRect(0,0,768,128);ctx.strokeStyle='#686e49';ctx.lineWidth=6;ctx.strokeRect(5,5,758,118);ctx.fillStyle='#384f36';ctx.textAlign='center';ctx.direction='rtl';ctx.font='bold 55px Arial';ctx.fillText(text,384,84);const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;const sign=make(new THREE.PlaneGeometry(3.5,.58),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}),g,0,y,2.7);return sign;}
 const study=floor(-13,6,4.4);box(7,2.9,.45,limestone,study,0,1.5,-2.4);box(.4,2.9,4.8,limestone,study,-3.3,1.5,0);box(7.4,.3,5.3,limestone,study,0,3.12,0);
 for(const x of [-3.05,-1.1,1.1,3.05]){make(new THREE.CylinderGeometry(.17,.23,2.85,12),limestone,study,x,1.55,2.25);box(.55,.18,.55,limestone,study,x,2.98,2.25);}for(const x of [-1.8,1.8])table(study,x,.7);label(study,'בית המדרש');solids.push({x:-13,z:3.6,w:3.7,d:.5});
 const garden=floor(-13,23,4.0);bench(garden,-2,0,.35);bench(garden,1.5,-1,-.5);bench(garden,.5,2.2,.2);label(garden,'גינת הסיפורים',2.8);for(const x of [-2.5,2.5])box(.12,2.7,.12,wood,garden,x,1.3,2.7);
 const needs=floor(10,24,4);for(const x of [-2.8,2.8])box(.14,3.5,.14,wood,needs,x,1.7,1);box(5.8,.15,.15,wood,needs,0,3.4,1);label(needs,'חצר הצרכים',3.6);
 for(let i=0;i<6;i++){const note=box(.67,.86,.025,material(['#ebd7b6','#d6e0bc','#e8d2c3'][i%3]),needs,-2.25+i*.9,2.65,1);note.rotation.z=(i%2?1:-1)*.06;}bench(needs,-2,-1,.2);bench(needs,2,-1,-.2);
 const council=floor(14,5,5.3);for(let row=0;row<2;row++)for(let i=0;i<9;i++){const a=Math.PI*.12+i/8*Math.PI*.76,r=3.3+row*1.25;bench(council,Math.cos(a)*r,-Math.sin(a)*r,-a+Math.PI/2);}make(new THREE.CylinderGeometry(1.0,1.1,.55,24),limestone,council,0,.28,0);label(council,'מועצת הכפר',3.8);for(const x of [-2.6,2.6])box(.16,3.7,.16,wood,council,x,1.8,2.7);
 const square=floor(0,15,5.2);make(new THREE.TorusGeometry(1.05,.18,8,32).rotateX(Math.PI/2),limestone,square,0,.55,0);make(new THREE.CylinderGeometry(1,1,.48,32),limestone,square,0,.25,0);make(new THREE.CircleGeometry(.87,32).rotateX(-Math.PI/2),material('#80a7a0'),square,0,.51,0);
 // Short paths join each station to a common courtyard.
 for(const s of stations){const verts=[],indices=[];for(let i=0;i<=24;i++){const t=i/24,x=THREE.MathUtils.lerp(0,s.ax,t),z=THREE.MathUtils.lerp(15,s.az,t);const dx=s.ax,dz=s.az-15,l=Math.hypot(dx,dz)||1;for(const side of [-1,1]){const px=x+dz/l*.75*side,pz=z-dx/l*.75*side;verts.push(px,height(px,pz)+.035,pz);}if(i<24){const k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.setIndex(indices);geo.computeVertexNormals();make(geo,material('#c4b391'),scene,0,0,0);}
 const characters=buildCharacters({scene,height,manager});
 return {figures:characters.figures,solids,ready:characters.ready,tick:characters.tick};
}
