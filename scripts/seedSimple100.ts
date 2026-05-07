/**
 * Wipe all options/clusters/evaluations under FcHcx95CnkN2 and create
 * exactly 100 simple flat option statements. No clusters, no synthesis,
 * no evaluations. Admin (Olive Panda) keeps her question + admin sub.
 *
 * USAGE
 *   FIRESTORE_EMULATOR_HOST=localhost:8081 GCLOUD_PROJECT=freedi-test \
 *     SEED_USER_UID=<olive-panda-uid> \
 *     npx tsx scripts/seedSimple100.ts
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, WriteBatch } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
	console.error('Refusing to run without FIRESTORE_EMULATOR_HOST set.');
	process.exit(1);
}
if (getApps().length === 0) initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'freedi-test' });
const db = getFirestore();

const QUESTION_ID = process.env.SEED_QUESTION_ID ?? 'FcHcx95CnkN2';
const USER_UID = process.env.SEED_USER_UID ?? 'dDKeLPe8IC6EOttQ5Ih6Y9ZXcXfY';
const USER_NAME = 'Olive Panda';
const USER_EMAIL = 'olive.panda.27@example.com';

function sleep(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

const SIMPLE_OPTIONS: string[] = [
	'Build a regional library with multi-language collections.',
	'Open a community swimming pool open year-round.',
	'Plant 5,000 native trees along the main road.',
	'Subsidize public Wi-Fi in every village square.',
	'Set up rooftop solar panels on schools and clinics.',
	'Create a regional bike-share network.',
	'Open a 24/7 emergency clinic in the regional hub.',
	'Build a youth basketball league across the region.',
	'Fund free music lessons for elementary-school children.',
	'Create a regional food bank serving low-income families.',
	'Subsidize installation of rainwater collection systems.',
	'Open a public makerspace with woodworking and 3D printers.',
	'Develop walking trails connecting all the villages.',
	'Build a regional senior citizen activity center.',
	'Provide free legal aid clinics in each town hall.',
	'Open a regional ceramics studio open to the public.',
	'Subsidize childcare for working parents.',
	'Create a regional jobs board for local employers.',
	'Develop a local farmers market open every weekend.',
	'Fund mental health counseling at all regional schools.',
	'Build community composting facilities in each village.',
	'Open a public observatory for stargazing nights.',
	'Develop a rabbinic and interfaith dialogue program.',
	'Subsidize home insulation upgrades for low-income residents.',
	'Build accessible playgrounds for children with disabilities.',
	'Provide free tax-filing help during tax season.',
	'Create scholarships for local first-generation college students.',
	'Develop a regional tourism map and signage program.',
	'Subsidize CSA (community-supported agriculture) memberships.',
	'Open a regional skateboard park.',
	'Fund a coding bootcamp for unemployed adults.',
	'Build EV charging stations at every public parking lot.',
	'Develop a regional radio station for community news.',
	'Open a thrift store benefiting local charities.',
	'Provide free flu and travel vaccinations.',
	'Create a regional youth volunteer corps.',
	'Build a regional welcome center for new residents.',
	'Subsidize hearing aids for low-income seniors.',
	'Open a community film series in the central town square.',
	'Provide free dental check-ups for school-age children.',
	'Build a regional dog park network.',
	'Develop a regional dyslexia support center.',
	'Subsidize regional summer camps for children.',
	'Open a public garden with native plant species.',
	'Provide free wedding facilities for local couples.',
	'Develop a regional storytelling and oral-history project.',
	'Build a public bouldering wall at the community center.',
	'Subsidize public-transit passes for job seekers.',
	'Open a maker-and-repair café for community fixing.',
	'Provide free swimming lessons to all 8-year-olds.',
	'Develop a regional refugee integration program.',
	'Build a youth orchestra and free instrument loan program.',
	'Subsidize bicycle helmets for school children.',
	'Open a regional vehicle maintenance training program.',
	'Provide free menstrual products in all public restrooms.',
	'Develop a regional climate adaptation plan.',
	'Build a regional emergency-preparedness training facility.',
	'Subsidize home renovations for accessibility upgrades.',
	'Open a community kitchen offering free cooking classes.',
	'Provide free pet vaccinations and spay/neuter clinics.',
	'Develop a regional indie-game development hub.',
	'Build a regional dance and movement studio.',
	'Subsidize translation services at hospitals and clinics.',
	'Open a regional sleep-disorder clinic.',
	'Provide free reading glasses for low-income seniors.',
	'Develop a regional disability-employment program.',
	'Build community greenhouses for year-round growing.',
	'Subsidize legal name changes for transgender residents.',
	'Open a regional documentary film fund.',
	'Provide free public Wi-Fi at all bus stops.',
	'Develop a regional birding and naturalist club.',
	'Build community drying yards for local laundromats.',
	'Subsidize professional development for caregivers.',
	'Open a regional stand-up comedy open mic.',
	'Provide free home-care visits for new mothers.',
	'Develop a regional climate-friendly transit plan.',
	'Build community hand-tools libraries.',
	'Subsidize energy-efficiency audits for small businesses.',
	'Open a public photography darkroom and digital lab.',
	'Provide free hospice respite care for caregivers.',
	'Develop a regional refugee language exchange program.',
	'Build community fish-cleaning stations near rivers.',
	'Subsidize bicycle repair workshops in each village.',
	'Open a regional plant clinic for gardeners.',
	'Provide free tutoring for students with learning differences.',
	'Develop a regional theater touring company.',
	'Build community paddling docks on local rivers.',
	'Subsidize professional translators for non-English speakers.',
	'Open a regional birding research station.',
	'Provide free funeral planning resources.',
	'Develop a regional pet adoption coordination network.',
	'Build community ice rinks open in winter.',
	'Subsidize foreign-language classes for adults.',
	'Open a regional mid-life career advisory center.',
	'Provide free annual health screenings for the uninsured.',
	'Develop a regional zero-waste shopping initiative.',
	'Build a community herb-and-spice exchange.',
	'Subsidize regional folk-dance performances.',
	'Open a regional disability-arts collective.',
	'Provide free youth life-skills coaching.',
	'Develop a regional invasive-species removal program.',
	'Build a community canoe and kayak storage shed.',
];

async function clearExisting() {
	console.info(`Wiping existing options/clusters/paragraphs under ${QUESTION_ID}…`);
	let deleted = 0;
	const types = ['option', 'paragraph'];
	for (const t of types) {
		const snap = await db
			.collection('statements')
			.where('topParentId', '==', QUESTION_ID)
			.where('statementType', '==', t)
			.get();
		console.info(`  found ${snap.size} ${t}s`);
		// Delete in batches of 400
		for (let i = 0; i < snap.docs.length; i += 400) {
			const slice = snap.docs.slice(i, i + 400);
			const batch: WriteBatch = db.batch();
			slice.forEach((d) => batch.delete(d.ref));
			await batch.commit();
			deleted += slice.length;
			await sleep(150);
		}
	}
	// Also evaluations
	const evalSnap = await db.collection('evaluations').where('parentId', '==', QUESTION_ID).get();
	console.info(`  found ${evalSnap.size} evaluations`);
	for (let i = 0; i < evalSnap.docs.length; i += 400) {
		const slice = evalSnap.docs.slice(i, i + 400);
		const batch = db.batch();
		slice.forEach((d) => batch.delete(d.ref));
		await batch.commit();
		await sleep(150);
	}
	console.info(`✓ Deleted ${deleted} statements + ${evalSnap.size} evaluations`);
}

async function ensureQuestion() {
	const doc = await db.collection('statements').doc(QUESTION_ID).get();
	if (doc.exists) {
		console.info(`✓ Question ${QUESTION_ID} exists`);

		return;
	}
	const now = Date.now();
	await db.collection('statements').doc(QUESTION_ID).set({
		statementId: QUESTION_ID,
		statement: 'Regional ideas — what should we do?',
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
	});
	console.info(`✓ Created question ${QUESTION_ID}`);
}

async function ensureAdminSub() {
	const subId = `${USER_UID}--${QUESTION_ID}`;
	const existing = await db.collection('statementsSubscribe').doc(subId).get();
	if (existing.exists) {
		console.info(`✓ Admin sub ${subId} exists`);

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
	console.info(`✓ Admin sub created for ${USER_UID}`);
}

async function createOptions() {
	const items = SIMPLE_OPTIONS.slice(0, 100);
	console.info(`\nCreating ${items.length} simple options…`);
	const start = Date.now();
	const BATCH_SIZE = 5;
	const BATCH_DELAY_MS = 400;

	for (let i = 0; i < items.length; i += BATCH_SIZE) {
		const slice = items.slice(i, i + BATCH_SIZE);
		const batch: WriteBatch = db.batch();
		const now = Date.now();
		slice.forEach((text, j) => {
			const id = db.collection('statements').doc().id;
			const created = start + (i + j) * 5;
			batch.set(db.collection('statements').doc(id), {
				statementId: id,
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
			});
		});
		await batch.commit();
		process.stdout.write(`  options: ${Math.min(i + BATCH_SIZE, items.length)}/${items.length}\r`);
		if (i + BATCH_SIZE < items.length) await sleep(BATCH_DELAY_MS);
	}
	process.stdout.write(`  options: ${items.length}/${items.length}\n`);
}

(async () => {
	await ensureQuestion();
	await ensureAdminSub();
	await clearExisting();
	await createOptions();
	console.info(`\n✓ Done. ${SIMPLE_OPTIONS.length} simple options under ${QUESTION_ID}.`);
	console.info(`Open http://localhost:5173/statement/${QUESTION_ID}`);
})().catch((e) => {
	console.error('Failed:', e);
	process.exit(1);
});
