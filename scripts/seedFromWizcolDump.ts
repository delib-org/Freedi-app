/**
 * Seed N option statements under a target question by sampling text from a
 * wizcol-style export JSON (the same shape `exportProdQuestion.ts` writes).
 *
 * Wipes any existing options/paragraphs/evaluations under the question first,
 * preserves the question doc + admin subscription, then inserts new options
 * with synthetic per-option evaluations so every option carries valid
 * augmented-evaluation data downstream (paper §6.2).
 *
 * USAGE
 *   npm run seed:wizcol -- --count=50 --admin=<uid>
 *
 *   # All flags
 *   npm run seed:wizcol -- \
 *     --count=100 \
 *     --admin=MGYBYaAomfPPxcApBB0H0WO0nTj2 \
 *     --question=seed-test-question \
 *     --input=test-data/wizcol-e4Rvr.json
 *
 *   # Direct invocation (env vars also work as a fallback for CI / older
 *   # call sites). CLI flags take precedence over env vars.
 *   FIRESTORE_EMULATOR_HOST=localhost:8081 GCLOUD_PROJECT=freedi-test \
 *     npx tsx scripts/seedFromWizcolDump.ts --count=50 --admin=<uid>
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, WriteBatch } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
	console.error('Refusing to run without FIRESTORE_EMULATOR_HOST set.');
	process.exit(1);
}
if (getApps().length === 0)
	initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'freedi-test' });
const db = getFirestore();

interface CliArgs {
	count?: number;
	admin?: string;
	question?: string;
	input?: string;
}

function parseArgs(): CliArgs {
	const out: CliArgs = {};
	for (const raw of process.argv.slice(2)) {
		if (!raw.startsWith('--')) continue;
		const [keyRaw, ...rest] = raw.slice(2).split('=');
		const value = rest.join('=');
		if (keyRaw === 'count') out.count = Number(value);
		else if (keyRaw === 'admin') out.admin = value;
		else if (keyRaw === 'question') out.question = value;
		else if (keyRaw === 'input') out.input = value;
		else if (keyRaw === 'help' || keyRaw === 'h') {
			console.info(
				'Usage: npm run seed:wizcol -- --count=N --admin=<uid> [--question=<id>] [--input=<path>]',
			);
			process.exit(0);
		}
	}

	return out;
}

const args = parseArgs();

const QUESTION_ID =
	args.question ?? process.env.SEED_QUESTION_ID ?? 'seed-test-question';
const INPUT_PATH =
	args.input ?? process.env.SEED_INPUT ?? 'test-data/wizcol-e4Rvr.json';
const COUNT = Number.isFinite(args.count)
	? (args.count as number)
	: Number(process.env.SEED_COUNT ?? '100');
const MIN_TEXT_CHARS = 30; // matches functions/src/services/topic-cluster/constants.ts
// Per-option synthetic evaluations. The topic-cluster pipeline quarantines
// zero-evaluator options as noise when more than NOISE_POOL_MIN_COUNT (=50)
// of them exist. Seeding >=1 evaluation each keeps every option in the core
// pool. A small spread of values gives downstream consensus signals something
// to chew on.
const EVALS_PER_OPTION = Number(process.env.SEED_EVALS_PER_OPTION ?? '5');
const SYNTHETIC_EVALUATOR_COUNT = Number(process.env.SEED_EVALUATORS ?? '20');

interface SourceParagraph {
	paragraphId?: string;
	type?: string;
	content?: string;
	order?: number;
}

interface SourceStatement {
	statementId: string;
	statement?: string;
	statementType?: string;
	parentId?: string;
	hide?: boolean;
	isCluster?: boolean;
	derivedByPipeline?: string;
	paragraphs?: SourceParagraph[];
}

interface DumpFile {
	statements: SourceStatement[];
	question?: { statementId?: string };
}

interface AdminUser {
	uid: string;
	displayName: string;
	email: string;
	photoURL: string | null;
	isAnonymous: boolean;
	defaultLanguage: string;
}

function sleep(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

function loadOptionTexts(path: string, count: number): string[] {
	const abs = resolve(path);
	const raw = readFileSync(abs, 'utf-8');
	const data = JSON.parse(raw) as DumpFile;
	if (!Array.isArray(data.statements)) {
		throw new Error(`Invalid dump file: ${abs} (no statements[])`);
	}

	const texts: string[] = [];
	const seen = new Set<string>();
	for (const s of data.statements) {
		if (s.statementType !== 'option') continue;
		if (s.hide === true) continue;
		if (s.isCluster === true) continue;
		if (s.derivedByPipeline === 'topic-cluster') continue;

		// Prefer the joined paragraph body if it's longer + cleaner; fall back to title.
		let text = (s.statement ?? '').trim();
		if (s.paragraphs && s.paragraphs.length > 0) {
			const joined = s.paragraphs
				.map((p) => p.content?.trim() ?? '')
				.filter(Boolean)
				.join(' ')
				.trim();
			if (joined.length > text.length) text = joined;
		}
		if (text.length < MIN_TEXT_CHARS) continue;
		if (seen.has(text)) continue;
		seen.add(text);
		texts.push(text);
		if (texts.length >= count) break;
	}

	if (texts.length < count) {
		console.warn(
			`Warning: only ${texts.length} valid options in ${path} (asked for ${count}).`,
		);
	}

	return texts;
}

/**
 * Resolve the admin user. Order of precedence:
 *   1. --admin CLI flag, with auth-emulator lookup to fill name/email.
 *   2. SEED_USER_UID env var, same lookup.
 *   3. Default seed admin (seed_admin_uid / Seed Admin).
 *
 * If the auth emulator has the user, we adopt their displayName/email so the
 * seeded question reads as belonging to them. If not, we fall back to a
 * synthetic name/email and create the auth user later.
 */
async function resolveAdminUser(): Promise<AdminUser> {
	const uid = args.admin ?? process.env.SEED_USER_UID ?? 'seed_admin_uid';
	const fallbackName = process.env.SEED_USER_NAME ?? (uid === 'seed_admin_uid' ? 'Seed Admin' : 'Admin');
	const fallbackEmail =
		process.env.SEED_USER_EMAIL ??
		(uid === 'seed_admin_uid' ? 'seed.admin@example.com' : `${uid}@example.com`);

	const looked = await lookupAuthUser(uid);

	return {
		uid,
		displayName: looked?.displayName ?? fallbackName,
		email: looked?.email ?? fallbackEmail,
		photoURL: looked?.photoURL ?? null,
		isAnonymous: false,
		defaultLanguage: 'en',
	};
}

interface AuthLookupResult {
	displayName?: string;
	email?: string;
	photoURL?: string;
	providers: string[];
}

async function lookupAuthUser(uid: string): Promise<AuthLookupResult | null> {
	const projectId = process.env.GCLOUD_PROJECT ?? 'freedi-test';
	const host = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? 'localhost:9099';
	const url = `http://${host}/identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`;
	try {
		const res = await fetch(url, {
			method: 'POST',
			headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
			body: JSON.stringify({ localId: [uid] }),
		});
		if (!res.ok) return null;
		const body = (await res.json()) as {
			users?: Array<{
				localId: string;
				displayName?: string;
				email?: string;
				photoUrl?: string;
				providerUserInfo?: Array<{ providerId?: string }>;
			}>;
		};
		const user = body.users?.find((u) => u.localId === uid);
		if (!user) return null;

		return {
			displayName: user.displayName,
			email: user.email,
			photoURL: user.photoUrl,
			providers: (user.providerUserInfo ?? [])
				.map((p) => p.providerId)
				.filter((id): id is string => Boolean(id)),
		};
	} catch {
		return null;
	}
}

const SEED_PASSWORD = 'password';

async function ensureAuthUser(user: AdminUser) {
	const projectId = process.env.GCLOUD_PROJECT ?? 'freedi-test';
	const host = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? 'localhost:9099';
	const base = `http://${host}/identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts`;
	const existing = await lookupAuthUser(user.uid);
	try {
		if (!existing) {
			await fetch(base, {
				method: 'POST',
				headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
				body: JSON.stringify({
					localId: user.uid,
					displayName: user.displayName,
					email: user.email,
					emailVerified: true,
					password: SEED_PASSWORD,
				}),
			});
			console.info(
				`✓ Created auth user ${user.displayName} (${user.uid}) in emulator [email/${SEED_PASSWORD}]`,
			);

			return;
		}

		// User exists. If they only have federated providers (e.g., google.com)
		// but no password provider, augment with a password so the UI's
		// email/password sign-in works for them in the emulator.
		const hasPassword = existing.providers.includes('password');
		if (!hasPassword) {
			await fetch(`${base}:update`, {
				method: 'POST',
				headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
				body: JSON.stringify({
					localId: user.uid,
					password: SEED_PASSWORD,
					emailVerified: true,
				}),
			});
			console.info(
				`✓ Added password provider to existing user ${user.displayName} (${user.uid}) [email/${SEED_PASSWORD}]`,
			);
		}
	} catch (error) {
		// Auth emulator not running is non-fatal — Firestore-only seed still
		// produces a usable question for clustering/synthesis testing. The
		// admin role lives in statementsSubscribe; auth is only needed to
		// log in as that user from the UI.
		console.warn(
			`⚠  Auth emulator unreachable at ${host}; skipping user creation. ` +
				`(Run \`npm run deve\` to start full emulator suite.)`,
		);
	}
}

async function ensureAdminSub(
	questionId: string,
	user: AdminUser,
	question: Record<string, unknown>,
) {
	const subId = `${user.uid}--${questionId}`;
	const existing = await db.collection('statementsSubscribe').doc(subId).get();
	const now = Date.now();
	const payload = {
		statementsSubscribeId: subId,
		userId: user.uid,
		statementId: questionId,
		role: 'admin',
		lastUpdate: now,
		user: { uid: user.uid, displayName: user.displayName, email: user.email },
		statement: question,
	};
	// Always (re)write so reseeding with a different admin updates ownership.
	await db.collection('statementsSubscribe').doc(subId).set(payload);
	if (!existing.exists) {
		console.info(`✓ Admin sub created: ${user.displayName} on ${questionId}`);
	}
	await db
		.collection('usersV2')
		.doc(user.uid)
		.set(
			{
				uid: user.uid,
				displayName: user.displayName,
				email: user.email,
				isAnonymous: false,
				defaultLanguage: 'en',
				createdAt: now,
			},
			{ merge: true },
		);
}

async function loadQuestion(adminUser: AdminUser) {
	const doc = await db.collection('statements').doc(QUESTION_ID).get();
	const now = Date.now();

	// Always (re)write the question doc with the configured user as creator so
	// reseeding with different --admin flags updates ownership cleanly.
	const existing = doc.exists ? (doc.data() as Record<string, unknown>) : {};

	// statementSettings drives which evaluation UI renders for child options.
	// Default the seed to the 5-face Enhanced ("range") UI — the values it
	// emits (1, 0.5, 0, -0.5, -1) match `pickEvaluation` exactly. Merged with
	// any pre-existing settings so a manually-edited question keeps overrides.
	const existingSettings =
		(existing.statementSettings as Record<string, unknown> | undefined) ?? {};
	const statementSettings: Record<string, unknown> = {
		...existingSettings,
		evaluationType: existingSettings.evaluationType ?? 'range',
		// Legacy boolean still consulted by Evaluation.tsx when evaluationType
		// is missing on older docs; safe to set alongside the new field.
		enhancedEvaluation: existingSettings.enhancedEvaluation ?? true,
		// Surface the consensus/score bar and let users click to evaluate.
		showEvaluation: existingSettings.showEvaluation ?? true,
		enableEvaluation: existingSettings.enableEvaluation ?? true,
		enableAddVotingOption: existingSettings.enableAddVotingOption ?? true,
		hasChat: existingSettings.hasChat ?? true,
	};

	const questionData: Record<string, unknown> = {
		...existing,
		statementId: QUESTION_ID,
		statement:
			(existing.statement as string | undefined) ??
			'Regional ideas — what should we do? (seed)',
		paragraphs: existing.paragraphs ?? [],
		statementType: 'question',
		parentId: (existing.parentId as string | undefined) ?? 'top',
		parents: existing.parents ?? [],
		topParentId: QUESTION_ID,
		creatorId: adminUser.uid,
		creator: { ...adminUser },
		createdAt: (existing.createdAt as number | undefined) ?? now,
		lastUpdate: now,
		lastChildUpdate: now,
		consensus: existing.consensus ?? 0,
		totalEvaluators: existing.totalEvaluators ?? 0,
		hide: existing.hide ?? false,
		randomSeed: existing.randomSeed ?? Math.random(),
		statementSettings,
	};
	await db.collection('statements').doc(QUESTION_ID).set(questionData);
	await ensureAdminSub(QUESTION_ID, adminUser, questionData);
	await ensureAuthUser(adminUser);
	console.info(
		`✓ Question ${QUESTION_ID} owned by ${adminUser.displayName} (${adminUser.uid}).`,
	);

	return { creatorId: adminUser.uid, creator: { ...adminUser } };
}

async function clearExisting() {
	console.info(`Wiping existing options/paragraphs/evaluations under ${QUESTION_ID}…`);
	let deleted = 0;
	for (const t of ['option', 'paragraph']) {
		const snap = await db
			.collection('statements')
			.where('topParentId', '==', QUESTION_ID)
			.where('statementType', '==', t)
			.get();
		console.info(`  found ${snap.size} ${t}s`);
		for (let i = 0; i < snap.docs.length; i += 400) {
			const slice = snap.docs.slice(i, i + 400);
			const batch: WriteBatch = db.batch();
			slice.forEach((d) => batch.delete(d.ref));
			await batch.commit();
			deleted += slice.length;
			await sleep(120);
		}
	}
	const evalSnap = await db
		.collection('evaluations')
		.where('parentId', '==', QUESTION_ID)
		.get();
	console.info(`  found ${evalSnap.size} evaluations`);
	for (let i = 0; i < evalSnap.docs.length; i += 400) {
		const slice = evalSnap.docs.slice(i, i + 400);
		const batch = db.batch();
		slice.forEach((d) => batch.delete(d.ref));
		await batch.commit();
		await sleep(120);
	}
	console.info(`✓ Deleted ${deleted} statements + ${evalSnap.size} evaluations`);
}

interface CreatedOption {
	id: string;
	text: string;
}

async function createOptions(
	texts: string[],
	creatorId: string,
	creator: Record<string, unknown>,
): Promise<CreatedOption[]> {
	console.info(`\nCreating ${texts.length} options under ${QUESTION_ID}…`);
	const start = Date.now();
	const BATCH_SIZE = 5;
	const BATCH_DELAY_MS = 350;
	const created: CreatedOption[] = [];

	for (let i = 0; i < texts.length; i += BATCH_SIZE) {
		const slice = texts.slice(i, i + BATCH_SIZE);
		const batch: WriteBatch = db.batch();
		const now = Date.now();
		slice.forEach((text, j) => {
			const id = db.collection('statements').doc().id;
			const createdAt = start + (i + j) * 5;
			batch.set(db.collection('statements').doc(id), {
				statementId: id,
				statement: text,
				paragraphs: [],
				statementType: 'option',
				parentId: QUESTION_ID,
				parents: [QUESTION_ID],
				topParentId: QUESTION_ID,
				creatorId,
				creator,
				createdAt,
				lastUpdate: now,
				consensus: 0,
				totalEvaluators: 0,
				hide: false,
				randomSeed: Math.random(),
			});
			created.push({ id, text });
		});
		await batch.commit();
		process.stdout.write(
			`  options: ${Math.min(i + BATCH_SIZE, texts.length)}/${texts.length}\r`,
		);
		if (i + BATCH_SIZE < texts.length) await sleep(BATCH_DELAY_MS);
	}
	process.stdout.write(`  options: ${texts.length}/${texts.length}\n`);

	return created;
}

function pickEvaluation(rng: () => number): number {
	// Skewed-positive draw — most synthetic users are mildly supportive, a few
	// neutrals/disagrees, so the consensus signal isn't degenerate.
	const r = rng();
	if (r < 0.45) return 1;
	if (r < 0.7) return 0.5;
	if (r < 0.82) return 0;
	if (r < 0.94) return -0.5;
	return -1;
}

function rngFromSeed(seed: number): () => number {
	let s = seed >>> 0;

	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;

		return s / 0xffffffff;
	};
}

async function createEvaluations(options: CreatedOption[]) {
	if (EVALS_PER_OPTION <= 0) return;
	const evaluatorIds = Array.from(
		{ length: SYNTHETIC_EVALUATOR_COUNT },
		(_, i) => `seed_evaluator_${String(i).padStart(3, '0')}`,
	);
	console.info(
		`\nSeeding ${EVALS_PER_OPTION} evaluations per option from ${evaluatorIds.length} synthetic evaluators…`,
	);

	const BATCH_SIZE = 100;
	const BATCH_DELAY_MS = 200;
	let totalEvals = 0;

	const optionStatsUpdates = new Map<
		string,
		{
			sumEvaluations: number;
			sumSquaredEvaluations: number;
			numberOfEvaluators: number;
			sumPro: number;
			sumCon: number;
			numberOfProEvaluators: number;
			numberOfConEvaluators: number;
		}
	>();

	const evalDocs: Array<{
		id: string;
		data: Record<string, unknown>;
		statementId: string;
		value: number;
	}> = [];

	for (let oi = 0; oi < options.length; oi++) {
		const opt = options[oi];
		const rng = rngFromSeed(0x9e3779b9 ^ oi);
		// Choose evaluators without replacement up to EVALS_PER_OPTION
		const shuffled = [...evaluatorIds].sort(() => rng() - 0.5);
		const chosen = shuffled.slice(0, Math.min(EVALS_PER_OPTION, evaluatorIds.length));
		const stats = {
			sumEvaluations: 0,
			sumSquaredEvaluations: 0,
			numberOfEvaluators: 0,
			sumPro: 0,
			sumCon: 0,
			numberOfProEvaluators: 0,
			numberOfConEvaluators: 0,
		};
		for (const evaluatorId of chosen) {
			const value = pickEvaluation(rng);
			const evalId = `${opt.id}--${evaluatorId}`;
			evalDocs.push({
				id: evalId,
				data: {
					evaluationId: evalId,
					statementId: opt.id,
					parentId: QUESTION_ID,
					evaluatorId,
					evaluation: value,
					createdAt: Date.now(),
					lastUpdate: Date.now(),
				},
				statementId: opt.id,
				value,
			});
			stats.sumEvaluations += value;
			stats.sumSquaredEvaluations += value * value;
			stats.numberOfEvaluators += 1;
			if (value > 0) {
				stats.sumPro += value;
				stats.numberOfProEvaluators += 1;
			} else if (value < 0) {
				stats.sumCon += -value;
				stats.numberOfConEvaluators += 1;
			}
		}
		optionStatsUpdates.set(opt.id, stats);
	}

	for (let i = 0; i < evalDocs.length; i += BATCH_SIZE) {
		const slice = evalDocs.slice(i, i + BATCH_SIZE);
		const batch: WriteBatch = db.batch();
		for (const ev of slice) {
			batch.set(db.collection('evaluations').doc(ev.id), ev.data);
		}
		await batch.commit();
		totalEvals += slice.length;
		process.stdout.write(`  evaluations: ${totalEvals}/${evalDocs.length}\r`);
		if (i + BATCH_SIZE < evalDocs.length) await sleep(BATCH_DELAY_MS);
	}
	process.stdout.write(`  evaluations: ${totalEvals}/${evalDocs.length}\n`);

	console.info('Updating per-option aggregate fields…');
	const ids = [...optionStatsUpdates.keys()];
	for (let i = 0; i < ids.length; i += 200) {
		const slice = ids.slice(i, i + 200);
		const batch: WriteBatch = db.batch();
		for (const id of slice) {
			const s = optionStatsUpdates.get(id)!;
			const avg = s.numberOfEvaluators > 0 ? s.sumEvaluations / s.numberOfEvaluators : 0;
			batch.update(db.collection('statements').doc(id), {
				totalEvaluators: s.numberOfEvaluators,
				numberOfMembers: s.numberOfEvaluators,
				consensus: avg,
				evaluation: {
					sumEvaluations: s.sumEvaluations,
					sumSquaredEvaluations: s.sumSquaredEvaluations,
					numberOfEvaluators: s.numberOfEvaluators,
					sumPro: s.sumPro,
					sumCon: s.sumCon,
					numberOfProEvaluators: s.numberOfProEvaluators,
					numberOfConEvaluators: s.numberOfConEvaluators,
					averageEvaluation: avg,
					agreement: avg,
					evaluationRandomNumber: Math.random(),
					viewed: 0,
				},
				lastUpdate: Date.now(),
			});
		}
		await batch.commit();
		await sleep(80);
	}
}

(async () => {
	const adminUser = await resolveAdminUser();
	const { creatorId, creator } = await loadQuestion(adminUser);
	const texts = loadOptionTexts(INPUT_PATH, COUNT);
	console.info(
		`Loaded ${texts.length} option texts from ${INPUT_PATH} (min ${MIN_TEXT_CHARS} chars, no clusters/paragraphs).`,
	);
	await clearExisting();
	const created = await createOptions(texts, creatorId, creator);
	await createEvaluations(created);
	console.info(
		`\n✓ Done. ${created.length} options under ${QUESTION_ID} attributed to creator ${creatorId} (${adminUser.displayName}).`,
	);
	console.info(`Open http://localhost:5173/statement/${QUESTION_ID}`);
})().catch((e) => {
	console.error('Failed:', e);
	process.exit(1);
});
