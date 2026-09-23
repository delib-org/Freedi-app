import * as THREE from './vendor/three.module.js';

export const demoProposals = [
  {id:'listen',author:'נועה',color:'#f3d4d3',text:'לפני שבוחרים פתרון, נשמע מכל אחד מה הכי חשוב לו. נחפש רעיון שנותן מענה לצרכים של שני הצדדים.'},
  {id:'trial',author:'אורי',color:'#d4e6d8',text:'נתחיל בניסיון קטן לזמן מוגבל. אחר כך נבדוק יחד מה עבד ומה צריך לשנות, לפני שנחליט להמשיך.'},
  {id:'share',author:'מיה',color:'#dce2f4',text:'נקבע כללים ברורים והוגנים לחלוקת המשאבים, ונשאיר מקום לעזרה למי שזקוק לה יותר.'},
  {id:'together',author:'איתן',color:'#f3e5b9',text:'נקים קבוצה קטנה עם נציגים מכל צד. היא תחבר בין ההצעות ותביא לכולם פתרון משותף לדיון.'},
];
export const feelings=[{value:2,face:'😍',label:'אוהב מאוד'},{value:1,face:'🙂',label:'אוהב'},{value:0,face:'😐',label:'ניטרלי'},{value:-1,face:'🙁',label:'שונא'},{value:-2,face:'😠',label:'שונא מאוד'}];
const RATINGS_KEY='agora-olive-hill-ratings';
export function loadRatings(storage){try{const parsed=JSON.parse(storage.getItem(RATINGS_KEY)||'{}');if(!parsed||typeof parsed!=='object')return {};return Object.fromEntries(demoProposals.filter(p=>Number.isInteger(parsed[p.id])&&feelings.some(f=>f.value===parsed[p.id])).map(p=>[p.id,parsed[p.id]]));}catch{return {};}}

export class ProposalBoard {
  constructor({scene,height,onOpen,onClose,onWrite,onFlightEnd}){
    this.onOpen=onOpen;this.onClose=onClose;this.onWrite=onWrite;this.onFlightEnd=onFlightEnd;
    this.dialog=document.getElementById('proposal-board');this.notes=document.getElementById('proposal-notes');this.own='';this.flight=null;
    try{this.own=localStorage.getItem('agora-olive-hill-answer')||'';this.ratings=loadRatings(localStorage);}catch{this.ratings={};}
    this.group=new THREE.Group();this.group.position.set(-5.3,height(-5.3,7.2),7.2);this.group.rotation.y=.38;scene.add(this.group);
    const wood=new THREE.MeshStandardMaterial({color:'#71503b',roughness:.93});
    const addBox=(w,h,d,x,y,z)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),wood);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;this.group.add(m);return m;};
    addBox(5.3,3.05,.16,0,2.8,0);for(const x of [-2.2,2.2])addBox(.18,4.35,.2,x,2.15,-.12);
    for(const y of [1.28,4.32])addBox(5.55,.14,.24,0,y,.05);for(const x of [-2.69,2.69])addBox(.14,3.1,.24,x,2.8,.05);
    this.surface=document.createElement('canvas');this.surface.width=2048;this.surface.height=1152;this.ctx=this.surface.getContext('2d');this.texture=new THREE.CanvasTexture(this.surface);this.texture.colorSpace=THREE.SRGBColorSpace;
    this.panel=new THREE.Mesh(new THREE.PlaneGeometry(5.2,2.93),new THREE.MeshBasicMaterial({map:this.texture}));this.panel.position.set(0,2.8,.1);this.group.add(this.panel);
    this.letter=new THREE.Mesh(new THREE.PlaneGeometry(.65,.45),new THREE.MeshStandardMaterial({color:'#ffffff',side:THREE.DoubleSide,roughness:.8}));this.letter.visible=false;scene.add(this.letter);
    // A fold in the flying sheet catches the light as it turns.
    const fold=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(.65,.45)),new THREE.LineBasicMaterial({color:'#b3ae9e'}));this.letter.add(fold);
    document.getElementById('open-board').onclick=()=>this.open();document.getElementById('close-board').onclick=()=>this.dialog.close();
    document.getElementById('board-write').onclick=()=>{this.dialog.close();this.onWrite();};
    this.dialog.addEventListener('close',()=>this.onClose());this.render();
  }
  get busy(){return this.dialog.open||!!this.flight;}
  open(highlight=false){if(this.flight)return;this.onOpen();this.render();if(!this.dialog.open)this.dialog.showModal();if(highlight){const own=this.notes.querySelector('.own-note');own?.classList.add('just-landed');own?.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});document.getElementById('board-announcement').textContent='ההצעה שלך הגיעה ללוח, על פתק לבן.';}}
  render(){
    this.notes.replaceChildren();const proposals=[...demoProposals];if(this.own)proposals.push({id:'own',author:'ההצעה שלך',color:'#fffefb',text:this.own});
    for(const [index,p] of proposals.entries()){
      const article=document.createElement('article');article.className='proposal-note'+(p.id==='own'?' own-note':'');article.style.setProperty('--paper',p.color);article.style.setProperty('--tilt',`${[-1.4,.8,-.7,1.1,-.9][index]}deg`);
      const head=document.createElement('div');head.className='note-author';const name=document.createElement('strong');name.textContent=p.author;const meta=document.createElement('span');meta.textContent=p.id==='own'?'המילים שלך':'הצעה לדוגמה';head.append(name,meta);
      const text=document.createElement('p');text.className='note-text';text.textContent=p.text;article.append(head,text);
      if(p.id==='own'){const label=document.createElement('div');label.className='own-note-footer';label.textContent='✦ הרעיון שלך הצטרף לשיחה';article.append(label);}else{
        const field=document.createElement('fieldset');field.className='feeling-rating';const legend=document.createElement('legend');legend.textContent='מה דעתך על ההצעה?';field.append(legend);
        for(const feeling of feelings){const label=document.createElement('label');label.className='feeling';const input=document.createElement('input');input.type='radio';input.name=`rating-${p.id}`;input.value=String(feeling.value);input.checked=this.ratings[p.id]===feeling.value;input.setAttribute('aria-label',feeling.label);const face=document.createElement('span');face.className='face';face.textContent=feeling.face;face.setAttribute('aria-hidden','true');const caption=document.createElement('span');caption.className='feeling-caption';caption.textContent=feeling.label;input.onchange=()=>this.rate(p.id,feeling.value,field);label.append(input,face,caption);field.append(label);}article.append(field);
      }
      this.notes.append(article);
    }
    document.getElementById('board-write').textContent=this.own?'לערוך את ההצעה שלי ←':'לכתוב את ההצעה שלי ←';this.updateProgress();this.paint();
  }
  rate(id,value,field){const next={...this.ratings,[id]:value};try{localStorage.setItem(RATINGS_KEY,JSON.stringify(next));}catch{document.getElementById('board-error').hidden=false;for(const radio of field.querySelectorAll('input'))radio.checked=Number(radio.value)===this.ratings[id];return;}
    this.ratings=next;document.getElementById('board-error').hidden=true;document.getElementById('board-announcement').textContent=`הדירוג נשמר: ${feelings.find(f=>f.value===value).label}`;this.updateProgress();this.paint();
  }
  updateProgress(){const count=Object.keys(this.ratings).length;document.getElementById('rating-progress').textContent=count===4?'דירגתם את כל 4 ההצעות ✦':`${count} מתוך 4 הצעות דורגו`;}
  paint(){const c=this.ctx;c.fillStyle='#8a7155';c.fillRect(0,0,2048,1152);c.fillStyle='#fff1d4';c.direction='rtl';c.textAlign='center';c.font='bold 72px Arial';c.fillText('הרעיונות שלנו',1024,105);
    const all=[...demoProposals];if(this.own)all.push({id:'own',author:'ההצעה שלך',color:'#fffefb',text:this.own});
    for(const [i,p] of all.entries()){const x=90+(i%3)*645,y=170+Math.floor(i/3)*470;c.save();c.translate(x+280,y+205);c.rotate([-.018,.012,-.01,.016,-.015][i]);c.fillStyle='#322b2638';c.fillRect(-274,-194,570,425);c.fillStyle=p.color;c.fillRect(-280,-205,570,425);c.fillStyle='#eadcbdaa';c.fillRect(-90,-219,180,35);c.fillStyle='#3b5141';c.textAlign='right';c.font='bold 32px Arial';c.fillText(p.author,260,-145);c.font='32px Arial';let line='',row=-86;for(const word of p.text.split(/\s+/)){const next=line+word+' ';if(c.measureText(next).width>500&&line){c.fillText(line,260,row);row+=45;line=word+' ';if(row>90){line='…';break;}}else line=next;}c.fillText(line,260,row);if(p.id!=='own'){c.textAlign='center';c.font='40px Arial';feelings.forEach((f,j)=>{const fx=215-j*108;if(this.ratings[p.id]===f.value){c.fillStyle='#ffffff';c.beginPath();c.arc(fx,158,30,0,Math.PI*2);c.fill();}c.fillStyle='#2b4033';c.fillText(f.face,fx,174);});}c.restore();}this.texture.needsUpdate=true;
  }
  fly(answer,start){this.pending=answer;this.onOpen();if(matchMedia('(prefers-reduced-motion: reduce)').matches){this.land();return;}this.group.updateMatrixWorld(true);const end=this.group.localToWorld(new THREE.Vector3(0,2.1,.2));this.flight={t:0,start:start.clone(),end,control:start.clone().lerp(end,.5).add(new THREE.Vector3(0,2.8,1.8))};this.letter.position.copy(start);this.letter.visible=true;document.getElementById('letter-status').hidden=false;}
  tick(dt,camera){if(!this.flight)return;const f=this.flight;f.t=Math.min(1,f.t+dt/2.6);const t=f.t*tEase(f.t);this.letter.position.copy(f.start).multiplyScalar((1-t)**2).addScaledVector(f.control,2*(1-t)*t).addScaledVector(f.end,t*t);this.letter.rotation.set(-.5+Math.sin(t*Math.PI)*1.2,t*Math.PI*2,Math.sin(t*Math.PI*3)*.22);const look=this.letter.position.clone().lerp(this.group.position.clone().add(new THREE.Vector3(0,2.7,0)),.25);camera.lookAt(look);if(f.t===1)this.land();}
  land(){this.flight=null;this.letter.visible=false;this.own=this.pending;document.getElementById('letter-status').hidden=true;this.render();this.onFlightEnd();this.open(true);}
}
function tEase(t){return 3*t-2*t*t;}
