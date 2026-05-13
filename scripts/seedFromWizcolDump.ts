/**
 * Seed N option statements under a target question by sampling text from a
 * wizcol-style export JSON (the same shape `exportProdQuestion.ts` writes).
 *
 * Wipes any existing options/paragraphs/evaluations under the question first,
 * preserves the question doc + admin subscription, then inserts new options.
 * Original option statementIds from the dump are preserved so the dump's
 * evaluations can be re-attached to the seeded question.
 *
 * Evaluation modes (--evaluations=...):
 *   - original   default. Replay the dump's real evaluations 1:1, rewriting
 *                their parentId to the seeded question. Falls back to
 *                synthetic if the dump has none.
 *   - synthetic  ignore the dump's evaluations and generate skewed-positive
 *                synthetic ones (the legacy behavior).
 *   - both       write originals AND layer synthetic evaluations on top.
 *   - none       skip evaluation seeding entirely.
 *
 * USAGE
 *   npm run seed:wizcol -- --count=50 --admin=<uid>
 *
 *   # All flags
 *   npm run seed:wizcol -- \
 *     --count=100 \
 *     --admin=MGYBYaAomfPPxcApBB0H0WO0nTj2 \
 *     --question=seed-test-question \
 *     --input=test-data/wizcol-e4Rvr.json \
 *     --evaluations=original
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

type EvalMode = 'original' | 'synthetic' | 'both' | 'none';

interface CliArgs {
	count?: number;
	admin?: string;
	question?: string;
	input?: string;
	evaluations?: EvalMode;
}

function parseEvalMode(value: string): EvalMode {
	const v = value.toLowerCase();
	if (v === 'original' || v === 'synthetic' || v === 'both' || v === 'none')
		return v;
	throw new Error(
		`Invalid --evaluations=${value}. Expected: original|synthetic|both|none`,
	);
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
		else if (keyRaw === 'evaluations') out.evaluations = parseEvalMode(value);
		else if (keyRaw === 'help' || keyRaw === 'h') {
			console.info(
				'Usage: npm run seed:wizcol -- --count=N --admin=<uid> [--question=<id>] [--input=<path>] [--evaluations=original|synthetic|both|none]',
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
const EVAL_MODE: EvalMode =
	args.evaluations ??
	(process.env.SEED_EVAL_MODE
		? parseEvalMode(process.env.SEED_EVAL_MODE)
		: 'original');
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

interface SourceEvaluation {
	evaluationId: string;
	statementId: string;
	parentId?: string;
	evaluatorId: string;
	evaluation: number;
	createdAt?: number;
	lastUpdate?: number;
}

interface DumpFile {
	statements: SourceStatement[];
	evaluations?: SourceEvaluation[];
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

let cachedDump: { path: string; data: DumpFile } | null = null;

function loadDump(path: string): DumpFile {
	const abs = resolve(path);
	if (cachedDump && cachedDump.path === abs) return cachedDump.data;
	const raw = readFileSync(abs, 'utf-8');
	const data = JSON.parse(raw) as DumpFile;
	if (!Array.isArray(data.statements)) {
		throw new Error(`Invalid dump file: ${abs} (no statements[])`);
	}
	cachedDump = { path: abs, data };

	return data;
}

interface SourceOption {
	id: string;
	text: string;
}

function loadOptions(path: string, count: number): SourceOption[] {
	const data = loadDump(path);
	const options: SourceOption[] = [];
	const seenText = new Set<string>();
	const seenId = new Set<string>();
	for (const s of data.statements) {
		if (s.statementType !== 'option') continue;
		if (s.hide === true) continue;
		if (s.isCluster === true) continue;
		if (s.derivedByPipeline === 'topic-cluster') continue;
		if (!s.statementId || seenId.has(s.statementId)) continue;

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
		if (seenText.has(text)) continue;
		seenText.add(text);
		seenId.add(s.statementId);
		options.push({ id: s.statementId, text });
		if (options.length >= count) break;
	}

	if (options.length < count) {
		console.warn(
			`Warning: only ${options.length} valid options in ${path} (asked for ${count}).`,
		);
	}

	return options;
}

function loadOriginalEvaluations(
	path: string,
	allowedOptionIds: Set<string>,
): SourceEvaluation[] {
	const data = loadDump(path);
	if (!Array.isArray(data.evaluations)) return [];

	return data.evaluations.filter(
		(e) =>
			e &&
			typeof e.evaluation === 'number' &&
			typeof e.evaluatorId === 'string' &&
			typeof e.statementId === 'string' &&
			allowedOptionIds.has(e.statementId),
	);
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
	// Promoted top-level fields are required for the home-page listener:
	// listenToStatementSubscriptions queries `where('parentId', '==', 'top')`
	// directly on the subscription doc (with `statement.parentId` only as a
	// fallback OR branch). Without these, the seeded question never shows on
	// the user's home page even though the subscription exists.
	const questionParentId = (question.parentId as string | undefined) ?? 'top';
	const questionTopParentId = (question.topParentId as string | undefined) ?? questionId;
	const questionType = (question.statementType as string | undefined) ?? 'question';
	const payload = {
		statementsSubscribeId: subId,
		userId: user.uid,
		statementId: questionId,
		role: 'admin',
		lastUpdate: now,
		createdAt: (existing.data()?.createdAt as number | undefined) ?? now,
		parentId: questionParentId,
		topParentId: questionTopParentId,
		statementType: questionType,
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

type CreatedOption = SourceOption;

async function createOptions(
	options: SourceOption[],
	creatorId: string,
	creator: Record<string, unknown>,
): Promise<CreatedOption[]> {
	console.info(`\nCreating ${options.length} options under ${QUESTION_ID}…`);
	const start = Date.now();
	const BATCH_SIZE = 5;
	const BATCH_DELAY_MS = 350;
	const created: CreatedOption[] = [];

	for (let i = 0; i < options.length; i += BATCH_SIZE) {
		const slice = options.slice(i, i + BATCH_SIZE);
		const batch: WriteBatch = db.batch();
		const now = Date.now();
		slice.forEach((opt, j) => {
			const createdAt = start + (i + j) * 5;
			batch.set(db.collection('statements').doc(opt.id), {
				statementId: opt.id,
				statement: opt.text,
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
			created.push(opt);
		});
		await batch.commit();
		process.stdout.write(
			`  options: ${Math.min(i + BATCH_SIZE, options.length)}/${options.length}\r`,
		);
		if (i + BATCH_SIZE < options.length) await sleep(BATCH_DELAY_MS);
	}
	process.stdout.write(`  options: ${options.length}/${options.length}\n`);

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

interface EvalRecord {
	id: string;
	data: Record<string, unknown>;
	statementId: string;
	evaluatorId: string;
	value: number;
}

interface OptionStats {
	sumEvaluations: number;
	sumSquaredEvaluations: number;
	numberOfEvaluators: number;
	sumPro: number;
	sumCon: number;
	numberOfProEvaluators: number;
	numberOfConEvaluators: number;
}

function emptyStats(): OptionStats {
	return {
		sumEvaluations: 0,
		sumSquaredEvaluations: 0,
		numberOfEvaluators: 0,
		sumPro: 0,
		sumCon: 0,
		numberOfProEvaluators: 0,
		numberOfConEvaluators: 0,
	};
}

function accumulate(stats: OptionStats, value: number): void {
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

function buildOriginalEvalRecords(
	originals: SourceEvaluation[],
): EvalRecord[] {
	const records: EvalRecord[] = [];
	const seenIds = new Set<string>();
	const seenPair = new Set<string>(); // statementId|evaluatorId — prevents synthetic-pass duplicates
	for (const e of originals) {
		const id = e.evaluationId || `${e.statementId}--${e.evaluatorId}`;
		if (seenIds.has(id)) continue;
		seenIds.add(id);
		seenPair.add(`${e.statementId}|${e.evaluatorId}`);
		records.push({
			id,
			data: {
				evaluationId: id,
				statementId: e.statementId,
				parentId: QUESTION_ID,
				evaluatorId: e.evaluatorId,
				evaluation: e.evaluation,
				createdAt: e.createdAt ?? Date.now(),
				lastUpdate: e.lastUpdate ?? e.createdAt ?? Date.now(),
			},
			statementId: e.statementId,
			evaluatorId: e.evaluatorId,
			value: e.evaluation,
		});
	}

	return records;
}

function buildSyntheticEvalRecords(
	options: CreatedOption[],
	skipPair: Set<string>,
): EvalRecord[] {
	if (EVALS_PER_OPTION <= 0) return [];
	const evaluatorIds = Array.from(
		{ length: SYNTHETIC_EVALUATOR_COUNT },
		(_, i) => `seed_evaluator_${String(i).padStart(3, '0')}`,
	);
	const records: EvalRecord[] = [];
	for (let oi = 0; oi < options.length; oi++) {
		const opt = options[oi];
		const rng = rngFromSeed(0x9e3779b9 ^ oi);
		const shuffled = [...evaluatorIds].sort(() => rng() - 0.5);
		const chosen = shuffled.slice(0, Math.min(EVALS_PER_OPTION, evaluatorIds.length));
		for (const evaluatorId of chosen) {
			const pairKey = `${opt.id}|${evaluatorId}`;
			if (skipPair.has(pairKey)) continue;
			skipPair.add(pairKey);
			const value = pickEvaluation(rng);
			const evalId = `${opt.id}--${evaluatorId}`;
			records.push({
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
				evaluatorId,
				value,
			});
		}
	}

	return records;
}

async function writeEvaluationDocs(records: EvalRecord[]): Promise<void> {
	const BATCH_SIZE = 100;
	const BATCH_DELAY_MS = 200;
	let total = 0;
	for (let i = 0; i < records.length; i += BATCH_SIZE) {
		const slice = records.slice(i, i + BATCH_SIZE);
		const batch: WriteBatch = db.batch();
		for (const ev of slice) {
			batch.set(db.collection('evaluations').doc(ev.id), ev.data);
		}
		await batch.commit();
		total += slice.length;
		process.stdout.write(`  evaluations: ${total}/${records.length}\r`);
		if (i + BATCH_SIZE < records.length) await sleep(BATCH_DELAY_MS);
	}
	process.stdout.write(`  evaluations: ${total}/${records.length}\n`);
}

async function writeOptionAggregates(
	options: CreatedOption[],
	stats: Map<string, OptionStats>,
): Promise<void> {
	console.info('Updating per-option aggregate fields…');
	const ids = options.map((o) => o.id);
	for (let i = 0; i < ids.length; i += 200) {
		const slice = ids.slice(i, i + 200);
		const batch: WriteBatch = db.batch();
		for (const id of slice) {
			const s = stats.get(id) ?? emptyStats();
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

async function seedEvaluations(
	options: CreatedOption[],
	mode: EvalMode,
): Promise<void> {
	if (mode === 'none') {
		console.info('\nSkipping evaluation seeding (--evaluations=none).');

		return;
	}

	const optionIds = new Set(options.map((o) => o.id));
	const originals =
		mode === 'original' || mode === 'both'
			? loadOriginalEvaluations(INPUT_PATH, optionIds)
			: [];

	let effectiveMode: EvalMode = mode;
	if (mode === 'original' && originals.length === 0) {
		console.warn(
			'⚠  --evaluations=original but dump has no matching evaluations; falling back to synthetic.',
		);
		effectiveMode = 'synthetic';
	}

	const records: EvalRecord[] = [];
	const pairSeen = new Set<string>();

	if (effectiveMode === 'original' || effectiveMode === 'both') {
		const originalRecords = buildOriginalEvalRecords(originals);
		for (const r of originalRecords) pairSeen.add(`${r.statementId}|${r.evaluatorId}`);
		records.push(...originalRecords);
		console.info(
			`\nReplaying ${originalRecords.length} original evaluations from dump (${optionIds.size} options in scope).`,
		);
	}

	if (effectiveMode === 'synthetic' || effectiveMode === 'both') {
		const synthetic = buildSyntheticEvalRecords(options, pairSeen);
		records.push(...synthetic);
		console.info(
			`\nSeeding ${synthetic.length} synthetic evaluations (${EVALS_PER_OPTION}/option × ${SYNTHETIC_EVALUATOR_COUNT} evaluators, dedup vs originals).`,
		);
	}

	if (records.length === 0) {
		console.info('No evaluations to write.');

		return;
	}

	await writeEvaluationDocs(records);

	const stats = new Map<string, OptionStats>();
	for (const r of records) {
		let s = stats.get(r.statementId);
		if (!s) {
			s = emptyStats();
			stats.set(r.statementId, s);
		}
		accumulate(s, r.value);
	}
	await writeOptionAggregates(options, stats);
}

(async () => {
	const adminUser = await resolveAdminUser();
	const { creatorId, creator } = await loadQuestion(adminUser);
	const sourceOptions = loadOptions(INPUT_PATH, COUNT);
	console.info(
		`Loaded ${sourceOptions.length} option statementIds from ${INPUT_PATH} (min ${MIN_TEXT_CHARS} chars, no clusters/paragraphs). Eval mode: ${EVAL_MODE}.`,
	);
	await clearExisting();
	const created = await createOptions(sourceOptions, creatorId, creator);
	await seedEvaluations(created, EVAL_MODE);
	console.info(
		`\n✓ Done. ${created.length} options under ${QUESTION_ID} attributed to creator ${creatorId} (${adminUser.displayName}).`,
	);
	console.info(`Open http://localhost:5173/statement/${QUESTION_ID}`);
})().catch((e) => {
	console.error('Failed:', e);
	process.exit(1);
});
