// Regression checks for the cost/security boundary and scheduler; isolated emulators only.
require('./redesign-environment.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = path.resolve(__dirname, '../functions/lib/functions/src');
const { db } = require(path.join(base, 'db.js'));
const { getAuth } = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'))('firebase-admin/auth');
const { POLICY, reserveGeneration, retryState } = require(path.join(base, 'deliberation/policy.js'));
const { act } = require(path.join(base, 'deliberation/service.js'));
const { HttpsError } = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'))('firebase-functions/v2/https');
const generation = require(path.join(base, 'deliberation/generation.js'));
const { updateDeliberations, queueDeliberation } = require(path.join(base, 'deliberation/functions.js'));
(async () => {
 const prefix = `policy-${Date.now()}`;
 const uid = `${prefix}-owner`;
 await getAuth().createUser({ uid, email: `${prefix}@example.test`, password: 'LocalPreview123!' });
 const anonymous = `${prefix}-anonymous`;
 await getAuth().createUser({ uid: anonymous });
 const question = (id, owner = uid) => ({ statementId: id, statement: 'A shared question', statementType: 'question',
  parentId: 'top', topParentId: id, creatorId: owner, creator: {uid: owner}, parents: [], membership: {access:'openToAll'} });
 const qid = `${prefix}-q`;
 await db.doc(`statements/${qid}`).set(question(qid));
 await queueDeliberation.run({params:{id:qid},data:{after:{data:()=>({...question(qid),deliberationEnabled:true})},before:{data:()=>undefined}}});
 assert.equal((await db.doc(`questionDeliberations/${qid}`).get()).exists, false, 'Client flag must never enroll a question');
 const aq = `${prefix}-anon-q`;
 await db.doc(`statements/${aq}`).set(question(aq, anonymous));
 await assert.rejects(()=>act(anonymous,{questionId:aq,action:'enable',enabled:true}), /registered/);
 await assert.rejects(()=>act(anonymous,{questionId:aq,action:'agreement'}), /registered/);
 await assert.rejects(()=>act(anonymous,{questionId:qid,action:'enable',enabled:true}));
 await act(uid,{questionId:qid,action:'enable',enabled:true});
 assert.equal((await db.doc(`questionDeliberations/${qid}`).get()).data().enabledBy,uid);
 await act(uid,{questionId:qid,action:'enable',enabled:false});
 const reservations = await Promise.allSettled(Array.from({length:8},()=>reserveGeneration(uid,qid)));
 assert.equal(reservations.filter(x=>x.status==='fulfilled').length,POLICY.dailyQuestionCalls,'Concurrent reservations must obey the question cap');
 for(let i=POLICY.dailyQuestionCalls;i<POLICY.dailyFacilitatorCalls;i++) await reserveGeneration(uid,`${prefix}-budget-${i}`);
 await assert.rejects(()=>reserveGeneration(uid,`${prefix}-budget-over`), /daily/);
 const day=Math.floor(Date.now()/POLICY.dayMs), globalRef=db.doc(`deliberationBudgets/project-${day}`);
 const saved=(await globalRef.get()).data();
 try {
  await globalRef.set({day,calls:POLICY.dailyProjectCalls});
  await assert.rejects(()=>reserveGeneration('redesign-reviewer',`${prefix}-global-over`), /daily/);
 } finally { await globalRef.set(saved); }
 assert.equal(retryState(new HttpsError('failed-precondition','Closed'),1,0).dirty,false);
 assert.equal(retryState(new HttpsError('unavailable','Retry'),1,0).lastCheckedAt,POLICY.retryMs);
 assert.equal(retryState(new HttpsError('unavailable','Retry'),POLICY.maxAttempts,0).dirty,false);
 let calls=0;
 generation.generate=async(q,mode)=>{ calls++; if(q.statementId.endsWith('transient')) throw new HttpsError('unavailable','Temporary test failure');
  if(q.statementId.endsWith('deadline')) throw new HttpsError('failed-precondition','Deadline passed');
  if(mode==='summary') await db.doc(`questionDeliberations/${q.statementId}`).set({summaryAt:Date.now()},{merge:true});return ''; };
 const enqueue=async(id,extra={})=>{await db.doc(`statements/${id}`).set({...question(id),...extra});await db.doc(`questionDeliberations/${id}`).set({enabled:true,enabledBy:uid,dirty:true,queuedAt:1,lastCheckedAt:0});};
 // More terminal jobs than one batch cannot permanently crowd out a live job.
 for(let i=0;i<POLICY.batchSize;i++) await enqueue(`${prefix}-closed-${String(i).padStart(2,'0')}`,{questionSettings:{isHalted:true}});
 const live=`${prefix}-live`;
 await enqueue(live);
 await updateDeliberations.run({});await updateDeliberations.run({});
 assert.equal((await db.doc(`questionDeliberations/${live}`).get()).data().dirty,false);
 assert.equal(calls,2,'Only the live job should generate agreement and summary');
 const deadline=`${prefix}-deadline`;await enqueue(deadline);await updateDeliberations.run({});
 assert.equal((await db.doc(`questionDeliberations/${deadline}`).get()).data().dirty,false);
 const transient=`${prefix}-transient`;await enqueue(transient);
 for(let i=1;i<=POLICY.maxAttempts;i++){
  await db.doc(`questionDeliberations/${transient}`).update({lastCheckedAt:0});await updateDeliberations.run({});
  const state=(await db.doc(`questionDeliberations/${transient}`).get()).data();assert.equal(state.attempts,i);assert.equal(state.dirty,i<POLICY.maxAttempts);
 }
 // Deferring the daily summary must defer the job, not run it every fifteen minutes.
 const deferred=`${prefix}-deferred`;await enqueue(deferred);await db.doc(`questionDeliberations/${deferred}`).update({summaryAt:Date.now()});await updateDeliberations.run({});
 const state=(await db.doc(`questionDeliberations/${deferred}`).get()).data();assert.ok(state.lastCheckedAt>Date.now());const before=calls;await updateDeliberations.run({});assert.equal(calls,before);
 console.log('PASS: server opt-in, anonymous denial, atomic question/user/project caps, terminal eviction, finite retries, live-job progress, deferred summaries.');
})().catch(error=>{console.error(error);process.exitCode=1;});
