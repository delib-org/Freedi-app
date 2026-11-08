const {initializeApp}=require('/Users/talyaron/Documents/Freedi-app/functions/node_modules/firebase-admin/lib/app');
const {getFirestore}=require('/Users/talyaron/Documents/Freedi-app/functions/node_modules/firebase-admin/lib/firestore');
initializeApp({projectId:'wizcol-app'});
(async()=>{
 const db=getFirestore(); const q='Bq-VQPMPiG7b';
 const prog=await db.collection('synthesisQueue').doc(q).get();
 console.log('queue',JSON.stringify(prog.data()));
 const top=await db.collection('statements').doc(q).get();
 const kids=await db.collection('statements').where('parentId','==',q).get();
 const byTop=await db.collection('statements').where('parents','array-contains',q).get();
 const out={question:top.data(),children:kids.docs.map(d=>d.data()),desc:byTop.docs.map(d=>d.data())};
 require('fs').writeFileSync(process.argv[2],JSON.stringify(out));
 const c={};for(const d of out.children){const k=[d.statementType,d.isCluster,d.derivedByPipeline,d.hide].join('|');c[k]=(c[k]||0)+1}
 console.log(out.children.length,'desc',out.desc.length,c);
})();
