// Uses only demo-freedi-redesign on local Firestore 8081.
const assert = require('node:assert/strict');
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8081';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const base = require('node:path').resolve(__dirname, '../functions');
const localRequire = require('node:module').createRequire(base + '/package.json');
const { initializeApp } = localRequire('firebase-admin/app');
initializeApp({ projectId: 'demo-freedi-redesign' });
const { getFirestore } = localRequire('firebase-admin/firestore');
const db = getFirestore();
const { covenantService } = require(base + '/lib-covenant/functions/src/covenant/service.js');
(async () => {
	const id = 'covenant-integration-' + Date.now();
	const source = id + '-solution';
	await db
		.doc('statements/' + id)
		.set({
			statementId: id,
			statementType: 'question',
			statement: 'How shall we share the courtyard?',
			creatorId: 'host',
			membership: { access: 'private' },
		});
	for (const uid of ['host', 'alice', 'bob'])
		await db
			.doc(`statementsSubscribe/${uid}--${id}`)
			.set({ userId: uid, statementId: id, role: uid === 'host' ? 'admin' : 'member' });
	await db
		.doc('statements/' + source)
		.set({
			statementId: source,
			statementType: 'option',
			parentId: id,
			statement: 'A one-month accessible garden trial.',
		});
	await assert.rejects(() => covenantService('outsider', { questionId: id }), /membership/);
	let current = await covenantService('host', { questionId: id });
	const act = async (uid, action) => {
		current = await covenantService(uid, {
			questionId: id,
			expectedRevision: current.record.revision,
			action,
		});
		return current;
	};
	await assert.rejects(() => act('alice', { type: 'add-clause', sourceId: source }), /facilitator/);
	await act('host', { type: 'add-clause', sourceId: source });
	const clause = current.record.clauses[0].id;
	await act('alice', {
		type: 'note',
		clauseId: clause,
		text: 'Add a care rota.',
		proposedText: 'A one-month accessible garden trial with a care rota.',
	});
	const note = current.record.notes[0].id;
	await assert.rejects(() => act('bob', { type: 'withdraw-note', noteId: note }), /author/);
	await act('host', { type: 'accept-note', noteId: note });
	await act('host', { type: 'open-review', reviewerIds: ['host', 'alice', 'bob'], threshold: 60 });
	await assert.rejects(
		() => act('host', { type: 'amend', clauseId: clause, text: 'Changed', reason: 'test' }),
		/Reopen/,
	);
	await act('host', { type: 'position', version: 1, position: 'endorse', reason: '' });
	await act('alice', { type: 'position', version: 1, position: 'endorse', reason: '' });
	await assert.rejects(() => act('host', { type: 'adopt', version: 1 }), /every reviewer/);
	await act('bob', {
		type: 'position',
		version: 1,
		position: 'object',
		reason: 'Need a backup volunteer.',
	});
	await assert.rejects(() => act('host', { type: 'adopt', version: 1 }), /no objections/);
	await act('bob', {
		type: 'position',
		version: 1,
		position: 'no-objection',
		reason: 'A backup is available.',
	});
	await act('host', { type: 'adopt', version: 1 });
	assert.equal(current.record.phase, 'adopted');
	await assert.rejects(
		() => act('bob', { type: 'position', version: 1, position: 'object', reason: 'late' }),
		/no longer open/,
	);
	await act('host', { type: 'reopen' });
	await act('host', {
		type: 'amend',
		clauseId: clause,
		text: 'A two-month accessible garden trial.',
		reason: 'Extend learning time.',
	});
	await act('host', { type: 'open-review', reviewerIds: ['host', 'alice', 'bob'], threshold: 60 });
	assert.deepEqual(current.record.reviews[1].positions, {});
	assert.equal(
		current.record.reviews[0].clauses[0].text,
		'A one-month accessible garden trial with a care rota.',
	);
	assert.ok(current.record.reviews[0].adoptedAt);
	await assert.rejects(
		() => act('bob', { type: 'position', version: 1, position: 'endorse', reason: '' }),
		/no longer open/,
	);
	const revision = current.record.revision;
	const races = await Promise.allSettled(
		['alice', 'bob'].map((uid) =>
			covenantService(uid, {
				questionId: id,
				expectedRevision: revision,
				action: { type: 'position', version: 2, position: 'endorse', reason: '' },
			}),
		),
	);
	assert.equal(races.filter((r) => r.status === 'fulfilled').length, 1);
	assert.equal(races.filter((r) => r.status === 'rejected').length, 1);
	console.log(
		'PASS: real Firestore transactions; membership, facilitator gates, amendment ownership, immutable review, missing responses, objections, adoption, new version and concurrent stale revision rejection.',
	);
	console.log('Fixture:', id);
	await db.terminate();
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
