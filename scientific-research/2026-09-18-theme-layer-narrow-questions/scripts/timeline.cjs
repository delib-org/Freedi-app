const {initializeApp}=require('/Users/talyaron/Documents/Freedi-app/functions/node_modules/firebase-admin/lib/app');
const {getFirestore}=require('/Users/talyaron/Documents/Freedi-app/functions/node_modules/firebase-admin/lib/firestore');
initializeApp({projectId:'wizcol-app'});
const Q='Bq-VQPMPiG7b'; const t=ms=>new Date(ms+3*3600e3).toISOString().slice(11,23);
(async()=>{
 const db=getFirestore(); const ev=[];
 const tomb=await db.collection('statementDeletions').where('parentId','==',Q).get();
 tomb.docs.forEach(d=>ev.push([d.data().deletedAtMs,'DELETED',d.id]));
 const kids=await db.collection('statements').where('parentId','==',Q).where('isCluster','==',true).get();
 kids.docs.forEach(d=>{const x=d.data();ev.push([x.createdAt,'CREATED '+x.derivedByPipeline+(x.hide?' (hidden)':''),d.id+' '+(x.integratedOptions||[]).length+' '+x.statement.slice(0,35)])});
 const audit=await db.collection('_synthAuditLog').where('questionId','==',Q).get().catch(e=>({docs:[],err:e.message}));
 console.log('audit rows',audit.docs.length, audit.err||'', audit.docs[0]?Object.keys(audit.docs[0].data()).join(','):'');
 ev.sort((a,b)=>a[0]-b[0]); ev.forEach(e=>console.log(t(e[0]),e[1],e[2]));
 const qd=await db.collection('synthesisQueue').doc(Q).get(); console.log(JSON.stringify(qd.data()));
 const sub=await db.collection('synthesisQueue').doc(Q).listCollections(); console.log('queue subcols',sub.map(c=>c.id));
})();
