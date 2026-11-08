const { projectId } = require('./redesign-environment.cjs');
// Fictional data, isolated demo project only; preserves existing question edits.
const admin = require(
	require('node:module')
		.createRequire(require('node:path').resolve(__dirname, '../functions/package.json'))
		.resolve('firebase-admin'),
);
admin.initializeApp({ projectId });
(async () => {
	const uid = 'redesign-reviewer';
	const user = {
		uid,
		displayName: 'Alex Morgan',
		email: 'redesign@example.test',
		isAnonymous: false,
	};
	try {
		await admin.auth().createUser({ ...user, password: 'LocalPreview123!' });
	} catch (e) {
		if (e.code !== 'auth/uid-already-exists' && e.code !== 'auth/email-already-exists') throw e;
	}
	const db = admin.firestore();
	if ((await db.doc('statements/redesign-courtyard').get()).exists) {
		console.log('Demo question already exists; preserving your edits.');
		process.exit(0);
	}
	const now = Date.now();
	const batch = db.batch();
	batch.set(db.doc('usersV2/' + uid), { ...user, advanceUser: true });
	batch.set(db.doc('termsOfUseAcceptance/redesign-reviewer'), {
		userId: uid,
		date: now,
		version: 'local-demo',
		text: 'Local example fixture',
		accepted: true,
	});
	const base = {
		creator: user,
		creatorId: uid,
		lastUpdate: now,
		createdAt: now,
		consensus: 0,
		hasChildren: true,
		membership: { access: 'openToAll', typeOfMembersAllowed: 'all', adminApproveMembers: false },
		statementSettings: {
			hasChat: true,
			showEvaluation: true,
			enableEvaluation: true,
			enhancedEvaluation: true,
			evaluationType: 'range',
			enableAddEvaluationOption: true,
			enableAddVotingOption: true,
			enableTreeView: false,
		},
		questionSettings: { questionType: 'simple' },
		evaluationSettings: { evaluationUI: 'suggestions' },
		resultsSettings: { resultsBy: 'consensus' },
	};
	const parent = {
		...base,
		statementId: 'redesign-courtyard',
		statement: 'What could our shared courtyard become?',
		brief: 'A little more green, a place to meet, a space for everyone.',
		statementType: 'question',
		parentId: 'top',
		topParentId: 'redesign-courtyard',
	};
	const texts = [
		'I’d love a few raised planters and a shared table.',
		'Could we keep the first version small and easy to care for?',
		'What if we tried one corner for a month?',
	];
	const children = texts.map((text, i) => ({
		...base,
		statementId: 'redesign-message-' + i,
		parentId: parent.statementId,
		topParentId: parent.statementId,
		statementType: 'statement',
		statement: text,
		createdAt: now - 60000 * (3 - i),
		creator:
			i === 0
				? { ...user, displayName: 'Maya' }
				: i === 1
					? { ...user, displayName: 'Amir' }
					: user,
	}));
	const ideas = [
		'A shared garden, with a place to sit',
		'A monthly bring-a-dish evening',
		'Try a small garden corner for a month',
	].map((title, i) => ({
		...base,
		statementId: 'redesign-option-' + i,
		parentId: parent.statementId,
		topParentId: parent.statementId,
		statementType: 'option',
		statement: title,
		createdAt: now - i * 1000,
		evaluation: {
			agreement: 0.5,
			numberOfEvaluators: i === 2 ? 2 : 18,
			sumEvaluations: i === 2 ? 1.6 : 12,
			sumPro: i === 2 ? 1.6 : 14,
			sumCon: i === 2 ? 0 : 2,
		},
		consensus: 0.5,
	}));
	parent.lastSubStatements = children;
	for (const statement of [parent, ...children, ...ideas])
		batch.set(db.doc('statements/' + statement.statementId), statement);
	for (const statement of [parent, ...ideas]) {
		const id = uid + '--' + statement.statementId;
		batch.set(db.doc('statementsSubscribe/' + id), {
			userId: uid,
			user,
			statement,
			statementId: statement.statementId,
			statementsSubscribeId: id,
			parentId: statement.parentId,
			topParentId: parent.statementId,
			statementType: statement.statementType,
			role: 'statement-creator',
			lastUpdate: now,
			createdAt: now,
		});
	}
	await batch.commit();
	console.log('Seeded isolated demo-freedi-redesign emulator project.');
	process.exit(0);
})().catch((e) => {
	console.error(e.message);
	process.exit(1);
});
