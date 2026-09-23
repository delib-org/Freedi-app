const {initializeApp}=require('/Users/talyaron/Documents/Freedi-app/functions/node_modules/firebase-admin/lib/app');
const {getFirestore}=require('/Users/talyaron/Documents/Freedi-app/functions/node_modules/firebase-admin/lib/firestore');
initializeApp({projectId:'wizcol-app'});
const Q='Bq-VQPMPiG7b', t=ms=>ms?new Date(ms+3*3600e3).toISOString().slice(11,19):'-';
(async()=>{
 const db=getFirestore();
 const p=(await db.collection('synthesisQueue').doc(Q).get()).data();
 console.log(JSON.stringify({...p,startedAt:t(p.startedAt),lastTickAt:t(p.lastTickAt),workerLeaseUntil:t(p.workerLeaseUntil)}));
 const items=await db.collection('synthesisQueue').doc(Q).collection('items').get();
 console.log('items left',items.size);
 const errs={};
 items.docs.forEach(d=>{const x=d.data(); const k=(x.lastError||'(none)').slice(0,160); errs[k]=(errs[k]||0)+1;});
 Object.entries(errs).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(v,'×',k));
 items.docs.slice(0,6).forEach(d=>{const x=d.data();console.log(d.id,'att',x.attempts,'enq',t(x.enqueuedAt),'failed',t(x.failedAt))});
})();
