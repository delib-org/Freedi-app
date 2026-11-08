#!/usr/bin/env node
// READ-ONLY. Statements of the other questions that ever had a split, plus all split events.
// usage: GCLOUD_PROJECT=wizcol-app node pull_split_cases.cjs <outDir>
const fs=require('node:fs'),path=require('node:path');
const req=require('node:module').createRequire(path.resolve(__dirname,'../../../functions/package.json'));
const admin=req('firebase-admin');admin.initializeApp({projectId:process.env.GCLOUD_PROJECT});const db=admin.firestore();
(async()=>{const ev=(await db.collection('_synthAuditLog').where('action','==','split').get()).docs.map(d=>d.data());
fs.writeFileSync(path.join(process.argv[2],'split-events.json'),JSON.stringify(ev));
for(const q of new Set(ev.map(e=>e.parentStatementId))){
 const q0=await db.collection('statements').doc(q).get();
 const s=(await db.collection('statements').where('parentId','==',q).get()).docs.map(d=>d.data());
 fs.writeFileSync(path.join(process.argv[2],`q-${q}.json`),JSON.stringify({question:q0.data()?.statement,statements:s}));
 console.info(q,s.length);}
process.exit(0)})().catch(e=>{console.error(e);process.exit(1)});
