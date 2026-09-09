import {after,before,describe,it} from 'node:test';
import {assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc,updateDoc,deleteDoc} from 'firebase/firestore';
import {makeEnv,seed,statementDoc} from './helpers.mjs';
describe('agreement ballots and workflow records',()=>{
 let env;before(async()=>{env=await makeEnv('redesign-deliberation');await seed(env,async db=>{
  await setDoc(doc(db,'statements','ballot'),statementDoc({statementId:'ballot',uid:'owner',overrides:{statementType:'question',agreementBallot:{questionId:'q',documentIds:['agreement'],hashes:['hash']},questionSettings:{isHalted:false}}}));
  await setDoc(doc(db,'statements','choice'),statementDoc({statementId:'choice',uid:'owner',overrides:{parentId:'ballot',agreementBallot:{questionId:'q',documentIds:['agreement'],hashes:['hash']}}}));
 });});after(async()=>env?.cleanup());
 it('keeps frozen wording and provenance immutable even for its owner',async()=>{
  const db=env.authenticatedContext('owner').firestore();await assertFails(updateDoc(doc(db,'statements','choice'),{statement:'Changed after opening'}));await assertFails(deleteDoc(doc(db,'statements','choice')));await assertFails(setDoc(doc(db,'statements','forged'),statementDoc({statementId:'forged',uid:'owner',overrides:{agreementMeta:{questionId:'q'}}})));
 });
 it('allows the existing Vote write while open and rejects later changes once closed',async()=>{
  const db=env.authenticatedContext('voter').firestore(),ref=doc(db,'votes','voter--ballot');await assertSucceeds(setDoc(ref,{userId:'voter',parentId:'ballot',statementId:'choice'}));
  await seed(env,db=>updateDoc(doc(db,'statements','ballot'),{'questionSettings.isHalted':true}));await assertFails(updateDoc(ref,{statementId:'none'}));
 });
 it('rejects direct writes to Cp, generation and handoff records',async()=>{
  const db=env.authenticatedContext('owner').firestore();await assertFails(setDoc(doc(db,'questionDeliberations','q','ratings','fake'),{value:1}));await assertFails(setDoc(doc(db,'agreementHandoffs','fake'),{uid:'owner'}));
 });
});
