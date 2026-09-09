// Integration checks use only local demo Firestore. AI responses are explicitly stubbed.
const assert = require('node:assert/strict');
const path = require('node:path');
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8081';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9399';
process.env.GCLOUD_PROJECT = 'demo-freedi-redesign';
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-freedi-redesign' });
const root = path.resolve(__dirname, '../functions/lib/functions/src');
const { db } = require(path.join(root, 'db.js'));
let draftCalls = 0;
require(path.join(root, 'organizations/studio/draftWriter.js')).generateDraft = async () => {
	draftCalls++;
	return {
		title: 'Shared civic covenant',
		sections: [
			{
				heading: 'Shared purpose',
				paragraphs: [{ text: 'We will deliberate together.', sourceIds: ['source'] }],
			},
		],
		openGaps: [],
	};
};
require(path.join(root, 'config/openai-chat.js')).callLLM = async () => 'Agreed proposals summary';
const { act, generate, automaticReady, sourcesHash } = require(
	path.join(root, 'deliberation/service.js'),
);
(async () => {
	const id = 'process-' + Date.now();
	const creator = { uid: 'redesign-reviewer', displayName: 'Alex Morgan', isAnonymous: false };
	const question = {
		statementId: id,
		statement: 'How shall we make decisions together?',
		statementType: 'question',
		parentId: 'top',
		topParentId: id,
		parents: [],
		creatorId: creator.uid,
		creator,
		consensus: 0,
		membership: { access: 'openToAll' },
		createdAt: Date.now(),
		lastUpdate: Date.now(),
	};
	await db.doc('statements/' + id).set(question);
	const source = {
		statementId: id + '-option',
		parentId: id,
		topParentId: id,
		statementType: 'option',
		statement: 'We will deliberate together.',
		isChosen: true,
		consensus: 0.8,
		evaluation: { numberOfEvaluators: 50 },
	};
	await db.doc('statements/' + source.statementId).set(source);
	assert.equal(automaticReady([]), false);
	assert.equal(automaticReady([{ ...source, consensus: 0.69 }]), false);
	assert.equal(automaticReady([source]), true);
	assert.equal(sourcesHash([source]), sourcesHash([{ ...source, consensus: 0.9 }]));
	await assert.rejects(() => act('outsider', { questionId: id }), /Join/);
	delete process.env.OPENAI_API_KEY;
	await assert.rejects(() => generate(question, 'agreement'), /OPENAI_API_KEY/);
	process.env.OPENAI_API_KEY = 'explicit-test-stub';
	await generate(question, 'agreement');
	await generate(question, 'agreement');
	assert.equal(draftCalls, 1);
	let state = await act(creator.uid, { questionId: id });
	let doc = state.agreements[0];
	assert.equal(doc.evaluators, 0);
	assert.equal(doc.agreed, false);
	for (let n = 0; n < 40; n++) {
		await db
			.doc(`statementsSubscribe/p${n}--${id}`)
			.set({ statementId: id, userId: 'p' + n, role: 'member' });
		await act('p' + n, {
			questionId: id,
			documentId: doc.id,
			hash: doc.hash,
			action: 'rate',
			value: 1,
		});
	}
	state = await act(creator.uid, { questionId: id });
	doc = state.agreements[0];
	assert.equal(doc.agreed, true);
	const oldHash = doc.hash;
	await db
		.doc('statements/' + doc.paragraphs[1].id)
		.update({ statement: 'Updated shared purpose.' });
	state = await act(creator.uid, { questionId: id });
	doc = state.agreements[0];
	assert.equal(doc.agreed, false);
	assert.equal(doc.evaluators, 0);
	await assert.rejects(
		() =>
			act('p0', { questionId: id, action: 'rate', documentId: doc.id, hash: oldHash, value: 1 }),
		/changed/,
	);
	await act('p0', { questionId: id, action: 'rate', documentId: doc.id, hash: doc.hash, value: 0 });
	assert.equal(
		(await db.doc(`questionDeliberations/${id}/ratings/${doc.id}--${oldHash}--p0`).get()).exists,
		true,
	);
	await act('p0', {
		questionId: id,
		action: 'propose',
		documentId: doc.id,
		hash: doc.hash,
		issue: 'Who makes the final decision?',
		changes: [
			{ paragraphId: doc.paragraphs[1].id, text: 'Citizens make the final decision directly.' },
		],
	});
	state = await act(creator.uid, { questionId: id });
	const requestId = state.changes[0].id;
	await assert.rejects(
		() =>
			act('p0', {
				questionId: id,
				action: 'fork',
				documentId: doc.id,
				hash: doc.hash,
				requestId,
				kind: 'alternative',
				title: 'Direct democracy',
			}),
		/facilitator/,
	);
	state = await act(creator.uid, {
		questionId: id,
		action: 'fork',
		documentId: doc.id,
		hash: doc.hash,
		requestId,
		kind: 'alternative',
		title: 'Direct democracy',
	});
	assert.equal(state.agreements.length, 2);
	const alternative = state.agreements.find((a) => a.id !== doc.id);
	assert.equal(alternative.previousId, doc.id);
	assert.equal(alternative.evaluators, 0);
	assert.equal(alternative.paragraphs[0].text, doc.paragraphs[0].text);
	state = await act(creator.uid, {
		questionId: id,
		action: 'vote',
		documentIds: state.agreements.map((a) => a.id),
		title: 'Choose our covenant',
	});
	assert.equal(state.ballots.length, 1);
	const ballot = (await db.doc('statements/' + state.ballots[0].id).get()).data();
	assert.equal(ballot.evaluationSettings.evaluationUI, 'voting');
	assert.equal(ballot.agreementBallot.hashes.length, 2);
	await assert.rejects(
		() =>
			act(creator.uid, { questionId: id, action: 'finalizeVote', ballotId: ballot.statementId }),
		/unique winner/,
	);
	const options = (
		await db.collection('statements').where('parentId', '==', ballot.statementId).get()
	).docs;
	await db
		.doc(`votes/p0--${ballot.statementId}`)
		.set({ userId: 'p0', parentId: ballot.statementId, statementId: options[0].id });
	state = await act(creator.uid, {
		questionId: id,
		action: 'finalizeVote',
		ballotId: ballot.statementId,
	});
	assert.equal(
		state.ballots[0].result.documentId,
		options[0].data().agreementBallot.documentIds[0],
	);
	await generate(question, 'summary');
	state = await act(creator.uid, { questionId: id });
	assert.equal(state.summaryStale, false);
	await db
		.doc('statements/' + source.statementId)
		.update({ statement: 'A different agreed proposal' });
	state = await act(creator.uid, { questionId: id });
	assert.equal(state.summaryStale, true);
	await generate(question, 'agreement');
	state = await act(creator.uid, { questionId: id });
	assert.equal(state.agreements.filter((a) => a.kind === 'version').length, 1);
	await db.doc('statements/' + id).update({ 'questionSettings.pausedAt': Date.now() });
	await assert.rejects(() => act(creator.uid, { questionId: id, action: 'summary' }), /paused/);
	await db.doc('statements/' + id).update({ 'questionSettings.pausedAt': 0 });
	const { createAgreementHandoff, redeemAgreementHandoff } = require(
		path.join(root, 'deliberation/handoff.js'),
	);
	await assert.rejects(
		() => createAgreementHandoff.run({ data: { documentId: doc.id } }),
		/Sign in/,
	);
	const link = await createAgreementHandoff.run({
		auth: { uid: creator.uid },
		data: { documentId: doc.id },
	});
	await assert.rejects(
		() => redeemAgreementHandoff.run({ data: { code: link.code, documentId: 'wrong' } }),
		/expired/,
	);
	assert.ok(
		(await redeemAgreementHandoff.run({ data: { code: link.code, documentId: doc.id } })).token,
	);
	await assert.rejects(
		() => redeemAgreementHandoff.run({ data: { code: link.code, documentId: doc.id } }),
		/expired/,
	);
	console.log(
		'PASS: cutoff trigger, no fake AI, deduplication, independent Cp, stale text, member changes, facilitator alternatives, preserved shared text, frozen Vote ballots and summary invalidation.',
	);
	console.log('Demo fixture:', id, 'Sign document:', alternative.id);
	await db.terminate();
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
