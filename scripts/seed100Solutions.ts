/**
 * Seed a fresh emulator with:
 *   - Question FcHcx95CnkN2 + Olive Panda admin sub (idempotent)
 *   - 100 option statements grouped into 10 themes (10 paraphrases each)
 *   - A handful of evaluations (with migratedAt so onCreate triggers skip)
 *   - 3 synthesis clusters (derivedByPipeline=synthesis) built from themes
 *     1–3, each integrating its 10 source ideas. The synthesis title +
 *     description are intentionally placeholder-y so the user can click
 *     "Regenerate proposal" and see the new prompt produce a real proposal.
 *
 * Designed for UI-only testing: no OpenAI embeddings are pre-populated;
 * the onStatementCreated trigger generates them in the background. Synthesis
 * clusters are created via direct Firestore writes (NOT via performIntegration)
 * so we don't need the user to drive the full preview/execute flow.
 *
 * USAGE
 *   FIRESTORE_EMULATOR_HOST=localhost:8081 GCLOUD_PROJECT=freedi-test \
 *     npx tsx scripts/seed100Solutions.ts
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, WriteBatch } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
	console.error('Refusing to run without FIRESTORE_EMULATOR_HOST set. This script is emulator-only.');
	process.exit(1);
}

if (getApps().length === 0) {
	initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'freedi-test' });
}
const db = getFirestore();

const QUESTION_ID = process.env.SEED_QUESTION_ID ?? 'FcHcx95CnkN2';
// Olive Panda's auth-emulator uid. The Auth emulator assigns a fresh uid on
// every signUp, so accept it via env var. Defaults to the most recent value
// from the current emulator session.
const USER_UID = process.env.SEED_USER_UID ?? 'dDKeLPe8IC6EOttQ5Ih6Y9ZXcXfY';
const USER_NAME = 'Olive Panda';
const USER_EMAIL = 'olive.panda.27@example.com';

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

interface Theme {
	slug: string;
	bigIdea: string;
	paraphrases: string[];
}

// Ten distinct directions, ten paraphrases each. Used to seed 100 options
// where the synthesis pipeline could plausibly group themes 1-3 into single
// proposals (we pre-build those clusters; the rest stay as flat options).
const THEMES: Theme[] = [
	{
		slug: 'cultural-center',
		bigIdea: 'Establish a regional cultural center',
		paraphrases: [
			'Build a regional cultural center that hosts theater, music, and visual arts.',
			'Open a community arts hub serving residents from neighboring towns.',
			'Set up a multi-purpose cultural venue with rotating exhibits and performances.',
			'Create a regional center for the performing arts open to all residents.',
			'Fund a cultural campus combining a theater, gallery, and rehearsal spaces.',
			'Establish an arts and culture house run jointly by the surrounding municipalities.',
			'Develop a regional arts center that attracts visitors and residents alike.',
			'Open a public theater and exhibition space in the regional hub town.',
			'Build a shared cultural center that pools resources of nearby villages.',
			'Launch a cultural campus with rotating residencies and a permanent collection.',
		],
	},
	{
		slug: 'education-quality',
		bigIdea: 'Improve regional education quality',
		paraphrases: [
			'Raise teaching quality across regional schools through coordinated training.',
			'Invest in teacher development programs across all schools in the area.',
			'Roll out a regional teacher-mentoring initiative to lift academic outcomes.',
			'Strengthen the schools with a regional curriculum task force.',
			'Build a regional center of excellence for STEM teaching.',
			'Expand vocational and academic offerings across the regional school network.',
			'Coordinate regional schools to share specialist teachers and labs.',
			'Increase funding for after-school enrichment in regional schools.',
			'Modernize school facilities and instructional methods across the region.',
			'Set common high academic standards for all regional schools.',
		],
	},
	{
		slug: 'affordable-housing',
		bigIdea: 'Develop affordable regional housing',
		paraphrases: [
			'Build affordable housing units near transit corridors in the regional center.',
			'Increase the supply of below-market rental units across the region.',
			'Develop a regional affordable-housing program targeted at young families.',
			'Subsidize land allocation for affordable housing in walkable neighborhoods.',
			'Launch a regional cooperative-housing initiative for first-time buyers.',
			'Convert under-used public buildings into affordable housing.',
			'Set targets for affordable units in every new regional development.',
			'Create a regional housing fund for low- and middle-income residents.',
			'Build mixed-income neighborhoods around the regional commercial core.',
			'Streamline approvals to accelerate affordable housing construction.',
		],
	},
	{
		slug: 'public-transit',
		bigIdea: 'Expand public transportation',
		paraphrases: [
			'Expand the regional bus network to connect outlying towns hourly.',
			'Add frequent bus and minibus service connecting villages to the regional hub.',
			'Build a regional rail link between the major towns.',
			'Increase off-peak transit frequency to support shift workers and students.',
			'Subsidize regional transit fares for students and seniors.',
			'Launch on-demand microtransit for low-density villages.',
			'Add late-night service so residents can reach jobs and entertainment.',
			'Convert main regional roads into multi-modal transit corridors.',
			'Build park-and-ride hubs to feed regional bus rapid transit.',
			'Coordinate regional transit timetables to enable seamless transfers.',
		],
	},
	{
		slug: 'youth-employment',
		bigIdea: 'Create regional youth-employment programs',
		paraphrases: [
			'Launch apprenticeships pairing local employers with regional youth.',
			'Fund a youth employment center that places young people in jobs.',
			'Subsidize first-job hiring of regional youth by small businesses.',
			'Create vocational tracks in regional high schools tied to local jobs.',
			'Set up a paid summer-jobs program for regional youth.',
			'Build co-working spaces with mentorship for young entrepreneurs.',
			'Pair students with local employers for paid internships.',
			'Run a regional career fair connecting youth to employers.',
			'Fund startup grants for youth-led regional ventures.',
			'Create a regional youth employment one-stop-shop with placement services.',
		],
	},
	{
		slug: 'eco-tourism',
		bigIdea: 'Promote regional ecological tourism',
		paraphrases: [
			'Develop hiking trails and ecological lodging in the regional nature reserves.',
			'Brand the region as an ecotourism destination with curated routes.',
			'Build sustainable cabins and signage in the regional park system.',
			'Train local guides for ecological tours of the regional landscape.',
			'Open visitor centers for regional ecological tourism.',
			'Promote agritourism on regional farms with sustainability standards.',
			'Develop bicycle-touring infrastructure across the regional countryside.',
			'Coordinate regional birdwatching, hiking, and nature-photography routes.',
			'Run a regional ecotourism marketing campaign with shared branding.',
			'Build a regional ecotourism website with bookable experiences.',
		],
	},
	{
		slug: 'senior-care',
		bigIdea: 'Strengthen senior care services',
		paraphrases: [
			'Build a regional day-care center for seniors with social activities.',
			'Expand in-home care services for regional seniors.',
			'Add geriatric specialists to the regional health center.',
			'Subsidize transportation for regional seniors to medical appointments.',
			'Build assisted-living facilities in walkable parts of the region.',
			'Create a regional volunteer program supporting seniors at home.',
			'Open community kitchens delivering meals to regional seniors.',
			'Train community health workers focused on senior wellbeing.',
			'Coordinate regional senior services through a single navigator.',
			'Build intergenerational community spaces for regional residents.',
		],
	},
	{
		slug: 'agriculture',
		bigIdea: 'Strengthen agricultural infrastructure',
		paraphrases: [
			'Invest in regional irrigation infrastructure to support farms.',
			'Build cold-storage and processing facilities for regional produce.',
			'Subsidize regenerative-agriculture transitions for regional farms.',
			'Create a regional farmers cooperative to pool equipment and marketing.',
			'Build a regional farm-to-table distribution network.',
			'Launch a regional agricultural-extension service.',
			'Subsidize regional water-recycling infrastructure for agriculture.',
			'Build a regional research farm for climate-resilient crops.',
			'Coordinate regional pest-management and soil-monitoring services.',
			'Open a regional agricultural training center for new farmers.',
		],
	},
	{
		slug: 'small-business',
		bigIdea: 'Support small business growth',
		paraphrases: [
			'Open a regional small-business support center.',
			'Subsidize storefront leases in the regional commercial core.',
			'Create a regional small-business loan fund.',
			'Run a regional buy-local marketing campaign.',
			'Streamline regional licensing for new small businesses.',
			'Launch mentorship programs for regional small-business owners.',
			'Build a regional procurement program favoring local suppliers.',
			'Subsidize regional small-business digital marketing.',
			'Develop a regional small-business export initiative.',
			'Create a regional small-business innovation grant program.',
		],
	},
	{
		slug: 'community-spaces',
		bigIdea: 'Create community gathering spaces',
		paraphrases: [
			'Build accessible community plazas in each regional town.',
			'Create indoor community centers open year-round.',
			'Open shared community kitchens for celebrations and classes.',
			'Build outdoor amphitheaters for regional cultural events.',
			'Develop community gardens in every regional neighborhood.',
			'Convert under-used parking lots into community plazas.',
			'Build inter-village playgrounds and community parks.',
			'Open shared maker-spaces for regional residents.',
			'Create regional youth centers in every cluster of villages.',
			'Build a regional system of free public meeting rooms.',
		],
	},
];

interface CreatedOption {
	statementId: string;
	statement: string;
	parentId: string;
	themeIdx: number;
}

function createBlankEvaluation() {
	return {
		sumEvaluations: 0,
		numberOfEvaluators: 0,
		sumPro: 0,
		sumCon: 0,
		numberOfProEvaluators: 0,
		numberOfConEvaluators: 0,
		sumSquaredEvaluations: 0,
		averageEvaluation: 0,
		agreement: 0,
		evaluationRandomNumber: Math.random(),
		viewed: 0,
	};
}

async function ensureQuestion(): Promise<void> {
	const existing = await db.collection('statements').doc(QUESTION_ID).get();
	if (existing.exists) {
		console.info(`✓ Question ${QUESTION_ID} already exists`);
		return;
	}
	const now = Date.now();
	await db.collection('statements').doc(QUESTION_ID).set({
		statementId: QUESTION_ID,
		statement: 'Regional Synthesis Test',
		paragraphs: [],
		statementType: 'question',
		parentId: 'top',
		parents: [],
		topParentId: QUESTION_ID,
		creatorId: USER_UID,
		creator: {
			uid: USER_UID,
			displayName: USER_NAME,
			email: USER_EMAIL,
			photoURL: null,
			isAnonymous: false,
			defaultLanguage: 'en',
		},
		createdAt: now,
		lastUpdate: now,
		lastChildUpdate: now,
		consensus: 0,
		totalEvaluators: 0,
		hide: false,
		randomSeed: Math.random(),
		evaluation: createBlankEvaluation(),
		statementSettings: {
			enableAddVotingOption: true,
			enableAddEvaluationOption: true,
			enableNotifications: false,
		},
	});
	console.info(`✓ Created question ${QUESTION_ID}`);
}

async function ensureAdminSub(): Promise<void> {
	const subId = `${USER_UID}--${QUESTION_ID}`;
	const existing = await db.collection('statementsSubscribe').doc(subId).get();
	if (existing.exists) {
		console.info(`✓ Admin sub ${subId} already exists`);
		return;
	}
	const now = Date.now();
	const questionDoc = await db.collection('statements').doc(QUESTION_ID).get();
	await db.collection('statementsSubscribe').doc(subId).set({
		statementsSubscribeId: subId,
		userId: USER_UID,
		statementId: QUESTION_ID,
		role: 'admin',
		lastUpdate: now,
		user: { uid: USER_UID, displayName: USER_NAME, email: USER_EMAIL },
		statement: questionDoc.data(),
	});
	console.info(`✓ Admin sub ready for ${USER_UID}`);

	// Make sure usersV2 doc exists too
	await db.collection('usersV2').doc(USER_UID).set(
		{
			uid: USER_UID,
			displayName: USER_NAME,
			email: USER_EMAIL,
			isAnonymous: false,
			defaultLanguage: 'en',
			createdAt: now,
		},
		{ merge: true },
	);
}

async function createOptions(): Promise<CreatedOption[]> {
	const created: CreatedOption[] = [];
	const startTime = Date.now();

	const allItems: Array<{ themeIdx: number; text: string }> = [];
	THEMES.forEach((theme, themeIdx) => {
		theme.paraphrases.forEach((text) => {
			allItems.push({ themeIdx, text });
		});
	});

	console.info(`\nCreating ${allItems.length} option statements in batches of ${BATCH_SIZE}…`);

	for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
		const slice = allItems.slice(i, i + BATCH_SIZE);
		const batch: WriteBatch = db.batch();
		const itemsInBatch: CreatedOption[] = [];
		const now = Date.now();

		for (const { themeIdx, text } of slice) {
			const statementId = db.collection('statements').doc().id;
			const created = startTime + i * 10 + Math.random();
			const doc = {
				statementId,
				statement: text,
				paragraphs: [],
				statementType: 'option',
				parentId: QUESTION_ID,
				parents: [QUESTION_ID],
				topParentId: QUESTION_ID,
				creatorId: USER_UID,
				creator: {
					uid: USER_UID,
					displayName: USER_NAME,
					email: USER_EMAIL,
					photoURL: null,
					isAnonymous: false,
					defaultLanguage: 'en',
				},
				createdAt: created,
				lastUpdate: now,
				consensus: 0,
				totalEvaluators: 0,
				hide: false,
				randomSeed: Math.random(),
				evaluation: createBlankEvaluation(),
			};
			batch.set(db.collection('statements').doc(statementId), doc);
			itemsInBatch.push({ statementId, statement: text, parentId: QUESTION_ID, themeIdx });
		}

		await batch.commit();
		created.push(...itemsInBatch);
		process.stdout.write(`  options: ${created.length}/${allItems.length}\r`);
		if (i + BATCH_SIZE < allItems.length) await sleep(BATCH_DELAY_MS);
	}
	process.stdout.write(`  options: ${created.length}/${allItems.length}\n`);

	return created;
}

async function createEvaluations(options: CreatedOption[]): Promise<void> {
	// Sparse evaluations: 5 synthetic users each evaluate ~10 random options.
	// `migratedAt` flag makes the onCreateEvaluation trigger skip, so we don't
	// stampede the function emulator.
	const SYNTHETIC_USERS = Array.from({ length: 5 }, (_, i) => ({
		uid: `seed-evaluator-${i + 1}`,
		displayName: `Test Evaluator ${i + 1}`,
		email: `eval${i + 1}@test.invalid`,
	}));

	const now = Date.now();
	const batch = db.batch();
	let count = 0;

	for (const evaluator of SYNTHETIC_USERS) {
		const sample = [...options].sort(() => Math.random() - 0.5).slice(0, 10);
		for (const opt of sample) {
			const evaluation = Math.random() > 0.3 ? 1 : -1;
			const evaluationId = `${evaluator.uid}--${opt.statementId}`;
			batch.set(db.collection('evaluations').doc(evaluationId), {
				evaluationId,
				statementId: opt.statementId,
				parentId: opt.parentId,
				evaluatorId: evaluator.uid,
				evaluator: { ...evaluator, isAnonymous: false, defaultLanguage: 'en' },
				evaluation,
				updatedAt: now,
				migratedAt: now, // skip onCreate trigger so we don't stampede the emulator
			});
			count++;
		}
	}
	await batch.commit();
	console.info(`✓ Wrote ${count} evaluations (triggers skipped via migratedAt)`);
}

async function createSynthesisClusters(options: CreatedOption[]): Promise<void> {
	// Pick the first 3 themes — pre-build a synthesis cluster per theme so the
	// user has immediate targets for the "Regenerate proposal" button. The
	// titles are intentionally placeholder so the regenerate flow can show
	// off the new proposal-style prompt.
	const themesToCluster = [0, 1, 2];
	const now = Date.now();

	for (const themeIdx of themesToCluster) {
		const sources = options.filter((o) => o.themeIdx === themeIdx);
		const theme = THEMES[themeIdx];
		const clusterId = db.collection('statements').doc().id;

		const cluster = {
			statementId: clusterId,
			statement: `[Auto-synthesized placeholder] ${theme.bigIdea}`,
			paragraphs: [],
			description: `Pre-built synthesis from ${sources.length} similar suggestions about ${theme.slug}. Click "Regenerate proposal" to draft a real plan.`,
			statementType: 'option',
			parentId: QUESTION_ID,
			parents: [QUESTION_ID],
			topParentId: QUESTION_ID,
			creatorId: USER_UID,
			creator: {
				uid: USER_UID,
				displayName: USER_NAME,
				email: USER_EMAIL,
				photoURL: null,
				isAnonymous: false,
				defaultLanguage: 'en',
			},
			createdAt: now + themeIdx,
			lastUpdate: now,
			consensus: 0,
			totalEvaluators: 0,
			hide: false,
			randomSeed: Math.random(),
			evaluation: createBlankEvaluation(),
			isCluster: true,
			derivedByPipeline: 'synthesis',
			integratedOptions: sources.map((s) => s.statementId),
		};

		await db.collection('statements').doc(clusterId).set(cluster);

		// Hide the source originals so the cluster represents them.
		const hideBatch = db.batch();
		for (const s of sources) {
			hideBatch.update(db.collection('statements').doc(s.statementId), {
				hide: true,
				integratedInto: clusterId,
			});
		}
		await hideBatch.commit();

		console.info(`✓ Synthesis cluster for "${theme.slug}" — ${sources.length} sources, id=${clusterId}`);
	}
}

(async () => {
	const t0 = Date.now();
	await ensureQuestion();
	await ensureAdminSub();
	const options = await createOptions();
	await createEvaluations(options);
	await createSynthesisClusters(options);

	console.info(`\n=== Done in ${((Date.now() - t0) / 1000).toFixed(1)}s ===`);
	console.info(`Total options:           ${options.length}`);
	console.info(`Synthesis clusters:      3 (themes 0–2)`);
	console.info(`Visible options remaining: ${options.length - 30} (themes 3–9, 10 each)`);
	console.info('\nOpen http://localhost:5173/statement/' + QUESTION_ID);
	console.info(`Sign in via console snippet as ${USER_EMAIL} / TestPassword123!`);
	console.info('Then click "Regenerate proposal" on any synthesis cluster.');
})().catch((e) => {
	console.error('Seeder failed:', e);
	process.exit(1);
});
