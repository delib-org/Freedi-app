/**
 * Seed a sample dialectical conversation into the LOCAL Firestore emulator so
 * the chat app has something to show. Run from repo root: `npm run seed:chat`
 * (sets FIRESTORE_EMULATOR_HOST=localhost:8081). Assumes the emulators are up.
 *
 * CommonJS (require) so it loads `@freedi/shared-types` from its `dist/cjs`
 * build — the `dist/esm` build uses extensionless imports that Node ESM rejects.
 *
 * Writes one public root question → 2 options → strengthen/critique evidence +
 * chatter, with the denormalized C / evidence fields pre-filled so the UI shows
 * corroboration bars and badges WITHOUT the Cloud Functions running.
 */
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const {
	createStatementObject,
	getRandomUID,
	Collections,
	StatementType,
	DialogicType,
	EvidenceRelation,
	EvidenceStatus,
	Visibility,
	SourceApp,
} = require('@freedi/shared-types');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'freedi-test';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
	console.error('Refusing to seed: FIRESTORE_EMULATOR_HOST is not set (run via `npm run seed:chat`).');
	process.exit(1);
}

if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

const creator = {
	uid: 'seed-user',
	displayName: 'Seed Bot',
	email: null,
	photoURL: null,
	isAnonymous: false,
};

const now = Date.now();
const docs = [];

function build(text, statementType, parentId, topParentId, extra = {}) {
	const id = extra.statementId ?? getRandomUID();
	const base = createStatementObject({
		statement: text,
		statementType,
		statementId: id,
		parentId,
		topParentId,
		creatorId: creator.uid,
		creator,
		sourceApp: SourceApp.CHAT,
	});
	if (!base) throw new Error(`Failed to build: ${text}`);
	const rest = { ...extra };
	delete rest.statementId;
	const statement = { ...base, lastActivityAt: now, ...rest };
	docs.push(statement);

	return statement;
}

async function main() {
	const rootId = getRandomUID();
	const root = build(
		'Should our city ban cars from the old town?',
		StatementType.question,
		'top',
		rootId,
		{
			statementId: rootId,
			isRoot: true,
			visibility: Visibility.public,
			optionCount: 2,
			convergenceIndex: 0.22,
			leadingOptionId: '',
		},
	);

	const optA = build('Yes — fully pedestrianize the old town.', StatementType.option, rootId, rootId, {
		visibility: Visibility.public,
		corroborationScore: 0.72,
	});
	const optB = build(
		'No — keep limited access for residents and deliveries.',
		StatementType.option,
		rootId,
		rootId,
		{ visibility: Visibility.public, corroborationScore: 0.41 },
	);
	root.leadingOptionId = optA.statementId;

	build(
		'A 2019 systematic review of 12 European pedestrianized centers found local shop foot-traffic rose ~17%.',
		StatementType.evidence,
		optA.statementId,
		rootId,
		{
			visibility: Visibility.public,
			dialecticType: DialogicType.strengthen,
			relation: EvidenceRelation.corroborate,
			evidenceClass: 'systematic-review',
			evidenceConfidence: 0.88,
			effectiveWeight: 0.9,
			evidenceStatus: EvidenceStatus.scored,
			activeScorerVersion: 'seed',
			corroborationScore: 0.85,
		},
	);
	build(
		'Deliveries and disabled access become materially harder without a permit scheme.',
		StatementType.evidence,
		optA.statementId,
		rootId,
		{
			visibility: Visibility.public,
			dialecticType: DialogicType.critique,
			relation: EvidenceRelation.falsify,
			evidenceClass: 'observational',
			evidenceConfidence: 0.6,
			effectiveWeight: 0.7,
			evidenceStatus: EvidenceStatus.scored,
			activeScorerVersion: 'seed',
			corroborationScore: 0.55,
		},
	);
	build('Has any city tried a trial weekend first?', StatementType.statement, optA.statementId, rootId, {
		visibility: Visibility.public,
		dialecticType: DialogicType.standard,
	});

	build(
		'In a 2021 resident survey, limited-access was preferred over a full ban roughly 3:1.',
		StatementType.evidence,
		optB.statementId,
		rootId,
		{
			visibility: Visibility.public,
			dialecticType: DialogicType.strengthen,
			relation: EvidenceRelation.corroborate,
			evidenceClass: 'observational',
			evidenceConfidence: 0.7,
			effectiveWeight: 0.8,
			evidenceStatus: EvidenceStatus.scored,
			activeScorerVersion: 'seed',
			corroborationScore: 0.62,
		},
	);

	const batch = db.batch();
	for (const d of docs) {
		batch.set(db.collection(Collections.statements).doc(d.statementId), d);
	}
	await batch.commit();

	console.info(`✓ Seeded ${docs.length} statements. Open: http://localhost:3005/q/${rootId}`);
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error('Seed failed:', e);
		process.exit(1);
	});
