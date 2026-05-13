/**
 * One-shot Join sheet reconciliation. Walks every option under a question,
 * appends any missing rows to the configured Google Sheet. Idempotent — safe
 * to re-run (rows already present are detected and skipped).
 *
 * SAFETY:
 *   - Refuses to run if FIRESTORE_EMULATOR_HOST is set.
 *   - Read-only against Firestore. Only writes to the Google Sheet.
 *
 * USAGE:
 *   gcloud auth application-default login
 *   GCLOUD_PROJECT=wizcol-app \
 *     GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL=...@wizcol-app.iam.gserviceaccount.com \
 *     GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..." \
 *     npx tsx scripts/reconcileJoinSheet.ts --question-id w03LYthJ9swR
 *
 *   Loads sheet credentials from functions/.env if not in process.env.
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { google, sheets_v4 } from 'googleapis';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import process from 'process';

if (process.env.FIRESTORE_EMULATOR_HOST) {
	console.error('Refusing to run with FIRESTORE_EMULATOR_HOST set.');
	process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
if (!args.questionId) {
	console.error('Usage: npx tsx scripts/reconcileJoinSheet.ts --question-id <id>');
	process.exit(1);
}

loadSheetEnvFromFunctionsDotEnv();

const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) {
	console.error('Set GCLOUD_PROJECT (e.g. GCLOUD_PROJECT=wizcol-app)');
	process.exit(1);
}

if (!getApps().length) initializeApp({ projectId });
const db = getFirestore();

main().catch((err) => {
	console.error('FATAL', err);
	process.exit(1);
});

async function main(): Promise<void> {
	const questionRef = db.collection('statements').doc(args.questionId!);
	const qSnap = await questionRef.get();
	if (!qSnap.exists) {
		console.error(`Question not found: ${args.questionId}`);
		process.exit(1);
	}
	const question = qSnap.data() as Record<string, unknown>;
	const settings = (question.statementSettings ?? {}) as Record<string, unknown>;
	const joinForm = (settings.joinForm ?? null) as JoinFormConfigLike | null;
	if (!joinForm || joinForm.destination !== 'sheets' || !joinForm.sheetUrl) {
		console.error('Question is not configured with a Google Sheets destination');
		process.exit(1);
	}
	const sheetId = extractSheetId(joinForm.sheetUrl);
	if (!sheetId) {
		console.error(`Malformed sheet URL: ${joinForm.sheetUrl}`);
		process.exit(1);
	}

	const sheets = getSheetsClient();
	if (!sheets) {
		console.error(
			'Sheets client unavailable — set GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL and GOOGLE_SHEETS_PRIVATE_KEY.',
		);
		process.exit(1);
	}

	console.info(`[reconcile] question=${args.questionId} sheet=${sheetId}`);

	await ensureHeaderRow(sheets, sheetId, joinForm);

	// Hot cache. We read the sheet metadata + all values ONCE up front, then
	// match against the in-memory copy and append new rows by mutating it.
	// Without this, each membership triggered ~3 Sheets reads, blowing past
	// the per-user-per-minute read quota at ~38 memberships.
	const cache = await loadSheetCache(sheets, sheetId);
	console.info(
		`[reconcile] sheet cache: ${cache.rows.length - 1} rows, header has ${cache.header.length} cols`,
	);

	const optionsSnap = await db
		.collection('statements')
		.where('parentId', '==', args.questionId)
		.where('statementType', '==', 'option')
		.get();

	let optionsScanned = 0;
	let totalMembers = 0;
	let appended = 0;
	let skippedAlreadyPresent = 0;
	let skippedNoSubmission = 0;
	let errors = 0;

	for (const optDoc of optionsSnap.docs) {
		const option = optDoc.data() as Record<string, unknown>;
		if (option.isCluster === true) continue;
		if (typeof option.integratedInto === 'string' && option.integratedInto) continue;
		optionsScanned++;
		const optionId = String(option.statementId ?? optDoc.id);
		const optionTitle = String(option.statement ?? '');

		const memberships: Array<{ uid: string; role: 'activist' | 'organizer' }> = [];
		for (const c of (option.joined as Array<{ uid?: string }>) ?? []) {
			if (c?.uid) memberships.push({ uid: c.uid, role: 'activist' });
		}
		for (const c of (option.organizers as Array<{ uid?: string }>) ?? []) {
			if (c?.uid) memberships.push({ uid: c.uid, role: 'organizer' });
		}

		for (const { uid, role } of memberships) {
			totalMembers++;
			try {
				const result = await appendUserRow({
					sheets,
					sheetId,
					questionId: args.questionId!,
					optionId,
					optionTitle,
					userId: uid,
					role,
					joinForm,
					cache,
				});
				if (result === 'appended') appended++;
				else if (result === 'skipped-already-present') skippedAlreadyPresent++;
				else if (result === 'skipped-no-submission') skippedNoSubmission++;
				console.info(
					`[reconcile] uid=${uid.slice(0, 8)}.. opt=${optionId} role=${role} → ${result}`,
				);
			} catch (err) {
				errors++;
				console.error(
					`[reconcile] FAIL uid=${uid} opt=${optionId} role=${role}`,
					err instanceof Error ? err.message : String(err),
				);
			}
		}
	}

	console.info('---');
	console.info(`Options scanned        : ${optionsScanned}`);
	console.info(`Total memberships      : ${totalMembers}`);
	console.info(`Rows appended (new)    : ${appended}`);
	console.info(`Already present (skip) : ${skippedAlreadyPresent}`);
	console.info(`No submission (skip)   : ${skippedNoSubmission}`);
	console.info(`Errors                 : ${errors}`);
}

interface JoinFormFieldLike {
	id: string;
	label: string;
}
interface JoinFormConfigLike {
	enabled?: boolean;
	destination: 'sheets' | string;
	sheetUrl?: string;
	fields: JoinFormFieldLike[];
}

interface AppendArgs {
	sheets: sheets_v4.Sheets;
	sheetId: string;
	questionId: string;
	optionId: string;
	optionTitle: string;
	userId: string;
	role: 'activist' | 'organizer';
	joinForm: JoinFormConfigLike;
	cache: SheetCache;
}

interface SheetCache {
	rows: string[][]; // header at index 0
	header: string[];
	userIdCol: number;
	roleCol: number;
	optionIdCol: number;
	optionTitleCol: number;
}

async function loadSheetCache(
	sheets: sheets_v4.Sheets,
	sheetId: string,
): Promise<SheetCache> {
	const meta = await sheets.spreadsheets.get({
		spreadsheetId: sheetId,
		fields: 'sheets(properties(sheetId,title))',
	});
	const firstSheet = meta.data.sheets?.[0]?.properties;
	const sheetTitle = firstSheet?.title ?? 'Sheet1';

	const valuesResp = await sheets.spreadsheets.values.get({
		spreadsheetId: sheetId,
		range: `${sheetTitle}!A:ZZ`,
	});
	const rawRows = valuesResp.data.values ?? [];
	// Normalize cells to strings so downstream code can rely on string types.
	const rows: string[][] = rawRows.map((r) =>
		(r ?? []).map((c) => (typeof c === 'string' ? c : String(c ?? ''))),
	);
	const header = rows[0] ?? [];
	const findCol = (name: string) =>
		header.findIndex((h) => typeof h === 'string' && h.trim() === name);
	return {
		rows,
		header,
		userIdCol: findCol('userId'),
		roleCol: findCol('role'),
		optionIdCol: findCol('optionId'),
		optionTitleCol: findCol('optionTitle'),
	};
}

const METADATA_HEADERS = [
	'userId',
	'displayName',
	'role',
	'optionId',
	'optionTitle',
	'submittedAt',
	'questionId',
] as const;

async function appendUserRow(
	args: AppendArgs,
): Promise<'appended' | 'skipped-already-present' | 'skipped-no-submission'> {
	const submissionSnap = await db
		.collection('statements')
		.doc(args.questionId)
		.collection('joinFormSubmissions')
		.doc(args.userId)
		.get();
	if (!submissionSnap.exists) {
		return 'skipped-no-submission';
	}
	const submission = submissionSnap.data() as
		| { displayName?: string; values?: Record<string, string> }
		| undefined;

	if (rowExistsInCache(args.cache, {
		userId: args.userId,
		role: args.role,
		optionId: args.optionId,
		optionTitle: args.optionTitle,
	})) {
		return 'skipped-already-present';
	}

	const formValues: Record<string, string> = {};
	for (const f of args.joinForm.fields ?? []) {
		formValues[f.label] = submission?.values?.[f.id] ?? '';
	}
	const row = args.cache.header.map((h) => {
		const trimmed = h.trim();
		switch (trimmed) {
			case 'userId':
				return args.userId;
			case 'displayName':
				return submission?.displayName ?? '';
			case 'role':
				return args.role;
			case 'optionId':
				return args.optionId;
			case 'optionTitle':
				return args.optionTitle;
			case 'submittedAt':
				return new Date().toISOString();
			case 'questionId':
				return args.questionId;
			default:
				return formValues[trimmed] ?? '';
		}
	});

	await args.sheets.spreadsheets.values.append({
		spreadsheetId: args.sheetId,
		range: 'A1',
		valueInputOption: 'RAW',
		requestBody: { values: [row] },
	});

	// Mirror the new row into the cache so subsequent loop iterations see it
	// and a same-user repeat append is correctly detected as already present.
	args.cache.rows.push(row);

	return 'appended';
}

function rowExistsInCache(
	cache: SheetCache,
	args: { userId: string; role: 'activist' | 'organizer'; optionId: string; optionTitle: string },
): boolean {
	if (cache.userIdCol === -1) return false;
	if (cache.optionIdCol === -1 && cache.optionTitleCol === -1) return false;
	for (let i = cache.rows.length - 1; i >= 1; i--) {
		const row = cache.rows[i];
		if (!row) continue;
		const cell = row[cache.userIdCol];
		if (typeof cell !== 'string' || cell !== args.userId) continue;
		if (cache.roleCol !== -1) {
			const cellRole = row[cache.roleCol];
			if (typeof cellRole !== 'string' || cellRole !== args.role) continue;
		}
		const cellOptionId = cache.optionIdCol !== -1 ? row[cache.optionIdCol] : undefined;
		const cellOptionTitle =
			cache.optionTitleCol !== -1 ? row[cache.optionTitleCol] : undefined;
		const optionIdMatches =
			cache.optionIdCol !== -1 &&
			typeof cellOptionId === 'string' &&
			cellOptionId !== '' &&
			cellOptionId === args.optionId;
		const optionTitleMatches =
			cache.optionTitleCol !== -1 &&
			args.optionTitle !== '' &&
			typeof cellOptionTitle === 'string' &&
			cellOptionTitle !== '' &&
			cellOptionTitle === args.optionTitle;
		if (!optionIdMatches && !optionTitleMatches) continue;
		return true;
	}
	return false;
}

async function readHeader(sheets: sheets_v4.Sheets, sheetId: string): Promise<string[]> {
	const resp = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: 'A1:ZZ1' });
	const row = resp.data.values?.[0] ?? [];
	return row.map((c) => (typeof c === 'string' ? c : ''));
}

async function ensureHeaderRow(
	sheets: sheets_v4.Sheets,
	sheetId: string,
	joinForm: JoinFormConfigLike,
): Promise<void> {
	const existing = await readHeader(sheets, sheetId);
	if (existing.length > 0) return;
	const fieldLabels = (joinForm.fields ?? []).map((f) => f.label);
	await sheets.spreadsheets.values.append({
		spreadsheetId: sheetId,
		range: 'A1',
		valueInputOption: 'USER_ENTERED',
		requestBody: { values: [[...fieldLabels, ...METADATA_HEADERS]] },
	});
}

function extractSheetId(url: string): string | null {
	const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
	return m ? m[1] : null;
}

function getSheetsClient(): sheets_v4.Sheets | null {
	const email = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
	const rawKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
	if (!email || !rawKey) return null;
	const key = rawKey.replace(/\\n/g, '\n');
	const auth = new google.auth.JWT({
		email,
		key,
		scopes: ['https://www.googleapis.com/auth/spreadsheets'],
	});
	return google.sheets({ version: 'v4', auth });
}

function loadSheetEnvFromFunctionsDotEnv(): void {
	if (process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SHEETS_PRIVATE_KEY) {
		return;
	}
	const candidates = [
		resolve(process.cwd(), '.env'),
		resolve(process.cwd(), 'functions/.env'),
	];
	const envPath = candidates.find((p) => existsSync(p));
	if (!envPath) return;
	const lines = readFileSync(envPath, 'utf-8').split('\n');
	for (const line of lines) {
		const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
		if (!m) continue;
		const [, k, v] = m;
		if (process.env[k]) continue;
		// Strip surrounding quotes if any.
		const stripped = v.replace(/^"|"$/g, '');
		process.env[k] = stripped;
	}
}

function parseArgs(argv: string[]): { questionId?: string } {
	const out: { questionId?: string } = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--question-id') out.questionId = argv[++i];
	}
	return out;
}
