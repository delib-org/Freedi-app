/**
 * Seed a PUBLIC question with ~20 sub-statements (a deep, realistic debate) into
 * the local Firestore emulator. Run: `npm run seed:chat:large`.
 *
 * Options, strengthen/critique evidence (some nested), comments, and a
 * sub-question with its own option — with denormalized C / evidence fields so
 * the UI shows bars + badges immediately.
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

if (!process.env.FIRESTORE_EMULATOR_HOST) {
	console.error('Refusing to seed: FIRESTORE_EMULATOR_HOST is not set.');
	process.exit(1);
}
if (!getApps().length) initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'freedi-test' });
const db = getFirestore();

const people = [
	{ uid: 'seed-maya', displayName: 'Maya' },
	{ uid: 'seed-jonah', displayName: 'Jonah' },
	{ uid: 'seed-priya', displayName: 'Priya' },
	{ uid: 'seed-leo', displayName: 'Leo' },
	{ uid: 'seed-sara', displayName: 'Sara' },
	{ uid: 'seed-tom', displayName: 'Tom' },
].map((p) => ({ ...p, email: null, photoURL: null, isAnonymous: false }));
const who = (i) => people[i % people.length];

const now = Date.now();
const docs = [];
let order = 0;

function add(text, statementType, parentId, topParentId, creator, extra = {}) {
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
	// stagger createdAt so ordering looks natural
	const doc = { ...base, createdAt: now + order * 1000, lastUpdate: now + order * 1000, lastActivityAt: now + order * 1000, ...rest };
	order++;
	docs.push(doc);

	return doc;
}

const strengthen = (cls, c, conf = 0.8, w = 0.85) => ({
	visibility: Visibility.public,
	dialecticType: DialogicType.strengthen,
	relation: EvidenceRelation.corroborate,
	evidenceClass: cls,
	evidenceConfidence: conf,
	effectiveWeight: w,
	evidenceStatus: EvidenceStatus.scored,
	activeScorerVersion: 'seed',
	corroborationScore: c,
});
const critique = (cls, c, conf = 0.7, w = 0.75) => ({
	visibility: Visibility.public,
	dialecticType: DialogicType.critique,
	relation: EvidenceRelation.falsify,
	evidenceClass: cls,
	evidenceConfidence: conf,
	effectiveWeight: w,
	evidenceStatus: EvidenceStatus.scored,
	activeScorerVersion: 'seed',
	corroborationScore: c,
});
const opt = (c) => ({ visibility: Visibility.public, corroborationScore: c });
const chat = () => ({ visibility: Visibility.public, dialecticType: DialogicType.standard });

async function main() {
	const E = StatementType.evidence;
	const O = StatementType.option;
	const Q = StatementType.question;
	const C = StatementType.statement;

	// Root question
	const rootId = getRandomUID();
	const root = add(
		'Should our company make remote work the default for engineers?',
		Q,
		'top',
		rootId,
		who(0),
		{ statementId: rootId, isRoot: true, visibility: Visibility.public, optionCount: 4, convergenceIndex: 0.18 },
	);

	// 4 options
	const a = add('Yes — fully remote by default, office optional.', O, rootId, rootId, who(1), opt(0.68));
	const b = add('No — keep a hybrid 3-day in-office baseline.', O, rootId, rootId, who(2), opt(0.47));
	const c = add('Remote-first, but with quarterly in-person weeks.', O, rootId, rootId, who(3), opt(0.74));
	const d = add('Decide per-team based on how each team works.', O, rootId, rootId, who(4), opt(0.55));
	root.leadingOptionId = c.statementId;

	// Under A (fully remote)
	const aS1 = add('A 2022 meta-analysis of 40 studies found remote workers were ~13% more productive.', E, a.statementId, rootId, who(0), strengthen('systematic-review', 0.86, 0.9, 0.9));
	add('That meta-analysis mixed call-center and engineering roles; the effect for engineers alone was much smaller.', E, aS1.statementId, rootId, who(2), critique('observational', 0.5));
	add('Remote saved each engineer ~45 minutes/day of commuting, reclaimed for deep work.', E, a.statementId, rootId, who(5), strengthen('observational', 0.6));
	add('Onboarding juniors remotely measurably slows their ramp-up in our internal data.', E, a.statementId, rootId, who(2), critique('observational', 0.58));
	add('Spontaneous cross-team design discussions dropped noticeably after we went remote.', E, a.statementId, rootId, who(3), critique('anecdote', 0.4));
	add('We could pair every junior with a mentor on a daily video call to offset that.', C, a.statementId, rootId, who(4), chat());

	// Sub-question under A + its option
	const aSubQ = add('What about engineers who relocated far away during the pandemic?', Q, a.statementId, rootId, who(1), { visibility: Visibility.public, optionCount: 1, convergenceIndex: 0.3 });
	add('Grandfather relocated staff as permanently fully-remote regardless of the final policy.', O, aSubQ.statementId, rootId, who(5), opt(0.6));

	// Under B (hybrid)
	add('Teams that meet face-to-face several days a week report higher trust in engagement surveys.', E, b.statementId, rootId, who(2), strengthen('observational', 0.62));
	add('New hires in our hybrid pods reached full productivity about two weeks faster.', E, b.statementId, rootId, who(0), strengthen('observational', 0.64, 0.75, 0.8));
	add('Mandatory office days mostly add commute time without real collaboration gains.', E, b.statementId, rootId, who(5), critique('anecdote', 0.45));
	add('Could we at least make the in-office days team-synchronized so people actually overlap?', C, b.statementId, rootId, who(3), chat());

	// Under C (remote-first + quarterly weeks)
	add('Our quarterly in-person weeks produced the best planning offsites we have ever had.', E, c.statementId, rootId, who(3), strengthen('experiment', 0.7, 0.7, 0.8));
	add('Quarterly weeks are expensive — travel + lodging for 200 people adds up fast.', E, c.statementId, rootId, who(4), critique('observational', 0.5));
	add('Make the in-person weeks opt-in but heavily encouraged, with budget for those who come.', C, c.statementId, rootId, who(1), chat());

	// Under D (per-team)
	add('Design needs constant whiteboarding; backend teams rarely do. One policy fits neither well.', E, d.statementId, rootId, who(3), strengthen('formal-argument', 0.66));
	add('Per-team rules get messy fast for anyone who works across teams.', E, d.statementId, rootId, who(0), critique('anecdote', 0.42));

	const batch = db.batch();
	for (const doc of docs) batch.set(db.collection(Collections.statements).doc(doc.statementId), doc);
	await batch.commit();

	const messages = docs.length - 1; // exclude the root question
	console.info(`✓ Seeded ${docs.length} statements (${messages} messages under the question).`);
	console.info(`Open: http://localhost:3005/q/${rootId}`);
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error('Seed failed:', e);
		process.exit(1);
	});
