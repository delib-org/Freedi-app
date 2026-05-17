/**
 * One-off: reconcile the Google Sheet for a join-form question.
 *
 * Same semantics as the `fn_reconcileJoinSheet` callable, but invoked
 * directly from a local script so we don't need a Firebase Auth ID token
 * for an admin user. Uses:
 *   - Application Default Credentials (gcloud ADC) for Firestore reads.
 *   - GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL / _PRIVATE_KEY (from functions/.env)
 *     for the Sheets API — same credentials the deployed function uses.
 *
 * IDEMPOTENT: appends rows only when `(userId, optionId, role)` is missing.
 * Never deletes orphan rows. Skips members who have no joinFormSubmission.
 *
 * Usage:
 *   node scripts/reconcile-join-sheet.mjs <questionId>
 */

import admin from 'firebase-admin';
import { google } from 'googleapis';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Args + env
// ---------------------------------------------------------------------------

const questionId = process.argv[2];
if (!questionId) {
	console.error('Usage: node scripts/reconcile-join-sheet.mjs <questionId>');
	process.exit(1);
}

const PROJECT_ID = 'wizcol-app';

function loadFunctionsEnv() {
	const envPath = path.resolve(__dirname, '..', '.env');
	const text = fs.readFileSync(envPath, 'utf-8');
	for (const rawLine of text.split('\n')) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) continue;
		const eq = line.indexOf('=');
		if (eq === -1) continue;
		const key = line.slice(0, eq);
		let value = line.slice(eq + 1);
		if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
		if (!(key in process.env)) process.env[key] = value;
	}
}
loadFunctionsEnv();

// ---------------------------------------------------------------------------
// Init Firestore (ADC) and Sheets (service account)
// ---------------------------------------------------------------------------

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();

function getSheetsClient() {
	const clientEmail = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
	const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n');
	if (!clientEmail || !privateKey) {
		throw new Error('Missing GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL / PRIVATE_KEY');
	}
	const auth = new google.auth.GoogleAuth({
		credentials: { client_email: clientEmail, private_key: privateKey },
		scopes: ['https://www.googleapis.com/auth/spreadsheets'],
	});

	return google.sheets({ version: 'v4', auth });
}

function extractSheetId(url) {
	const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);

	return match?.[1];
}

// ---------------------------------------------------------------------------
// Pure helpers (mirrored from functions/src/engagement/joinForm/joinSheetMath.ts)
// ---------------------------------------------------------------------------

const METADATA_HEADERS = [
	'userId',
	'displayName',
	'role',
	'optionId',
	'optionTitle',
	'submittedAt',
	'questionId',
];

function buildRowFromHeader(header, ctx) {
	return header.map((h) => {
		const trimmed = (h ?? '').trim();
		switch (trimmed) {
			case 'userId':
				return ctx.userId;
			case 'displayName':
				return ctx.displayName;
			case 'role':
				return ctx.role;
			case 'optionId':
				return ctx.optionId;
			case 'optionTitle':
				return ctx.optionTitle;
			case 'submittedAt':
				return ctx.submittedAt;
			case 'questionId':
				return ctx.questionId;
			default:
				return ctx.formValues[trimmed] ?? '';
		}
	});
}

function findRowIndex(rows, args) {
	if (rows.length < 2) return -1;
	const header = rows[0] ?? [];
	const userIdCol = header.findIndex((h) => typeof h === 'string' && h.trim() === 'userId');
	if (userIdCol === -1) return -1;

	const roleCol = header.findIndex((h) => typeof h === 'string' && h.trim() === 'role');
	const optionIdCol = header.findIndex((h) => typeof h === 'string' && h.trim() === 'optionId');
	const optionTitleCol = header.findIndex(
		(h) => typeof h === 'string' && h.trim() === 'optionTitle',
	);
	if (optionIdCol === -1 && optionTitleCol === -1) return -1;

	for (let i = rows.length - 1; i >= 1; i--) {
		const row = rows[i] ?? [];
		const cell = row[userIdCol];
		if (typeof cell !== 'string' || cell !== args.userId) continue;
		if (roleCol !== -1) {
			const cellRole = row[roleCol];
			if (typeof cellRole !== 'string' || cellRole !== args.role) continue;
		}
		const cellOptionId = optionIdCol !== -1 ? row[optionIdCol] : undefined;
		const cellOptionTitle = optionTitleCol !== -1 ? row[optionTitleCol] : undefined;
		const optionIdMatches =
			optionIdCol !== -1 &&
			typeof cellOptionId === 'string' &&
			cellOptionId !== '' &&
			cellOptionId === args.optionId;
		const optionTitleMatches =
			optionTitleCol !== -1 &&
			args.optionTitle !== '' &&
			typeof cellOptionTitle === 'string' &&
			cellOptionTitle !== '' &&
			cellOptionTitle === args.optionTitle;
		if (!optionIdMatches && !optionTitleMatches) continue;

		return i;
	}

	return -1;
}

// ---------------------------------------------------------------------------
// Sheet I/O
// ---------------------------------------------------------------------------

async function readHeader(sheets, sheetId) {
	const resp = await sheets.spreadsheets.values.get({
		spreadsheetId: sheetId,
		range: 'A1:ZZ1',
	});
	const row = resp.data.values?.[0] ?? [];

	return row.map((c) => (typeof c === 'string' ? c : ''));
}

async function readAllRows(sheets, sheetId) {
	const meta = await sheets.spreadsheets.get({
		spreadsheetId: sheetId,
		fields: 'sheets(properties(sheetId,title))',
	});
	const firstSheet = meta.data.sheets?.[0]?.properties;
	const sheetTitle = firstSheet?.title ?? 'Sheet1';
	const resp = await sheets.spreadsheets.values.get({
		spreadsheetId: sheetId,
		range: `${sheetTitle}!A:ZZ`,
	});
	const rawRows = resp.data.values ?? [];

	return rawRows.map((r) => (r ?? []).map((c) => (typeof c === 'string' ? c : String(c ?? ''))));
}

async function ensureHeader(sheets, sheetId, joinForm) {
	const existing = await readHeader(sheets, sheetId);
	if (existing.length > 0) return existing;
	const fieldLabels = (joinForm.fields ?? []).map((f) => f.label);
	const header = [...fieldLabels, ...METADATA_HEADERS];
	await sheets.spreadsheets.values.append({
		spreadsheetId: sheetId,
		range: 'A1',
		valueInputOption: 'USER_ENTERED',
		requestBody: { values: [header] },
	});

	return header;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	console.info('[reconcile] project=%s questionId=%s', PROJECT_ID, questionId);

	// 1. Read the question + verify it's a sheets join form.
	const questionSnap = await db.collection('statements').doc(questionId).get();
	if (!questionSnap.exists) {
		console.error('[reconcile] Question not found:', questionId);
		process.exit(2);
	}
	const question = questionSnap.data();
	const joinForm = question?.statementSettings?.joinForm;
	if (!joinForm) {
		console.error('[reconcile] Question has no joinForm:', questionId);
		process.exit(2);
	}
	if (joinForm.destination !== 'sheets' || !joinForm.sheetUrl) {
		console.error('[reconcile] Question destination is not sheets or sheetUrl missing:', {
			destination: joinForm.destination,
			sheetUrl: joinForm.sheetUrl,
		});
		process.exit(2);
	}
	const sheetId = extractSheetId(joinForm.sheetUrl);
	if (!sheetId) {
		console.error('[reconcile] Malformed sheetUrl:', joinForm.sheetUrl);
		process.exit(2);
	}
	console.info('[reconcile] question="%s" sheetUrl=%s', question.statement ?? '', joinForm.sheetUrl);

	const sheets = getSheetsClient();

	// 2. Ensure header row.
	const header = await ensureHeader(sheets, sheetId, joinForm);
	console.info('[reconcile] header columns=%d', header.length);

	// 3. Read all option docs for this question.
	const optionsSnap = await db
		.collection('statements')
		.where('parentId', '==', questionId)
		.where('statementType', '==', 'option')
		.get();

	let optionsScanned = 0;
	let totalMembers = 0;
	let appended = 0;
	let skippedAlreadyPresent = 0;
	let skippedNoSubmission = 0;
	let errors = 0;

	// Cache submissions doc lookups to avoid re-reads when same user is on
	// multiple options.
	const submissionCache = new Map();
	async function getSubmission(userId) {
		if (submissionCache.has(userId)) return submissionCache.get(userId);
		const snap = await db
			.collection('statements')
			.doc(questionId)
			.collection('joinFormSubmissions')
			.doc(userId)
			.get();
		const data = snap.exists ? snap.data() : null;
		submissionCache.set(userId, data);

		return data;
	}

	// Read the sheet once, then keep the latest row-list in memory and refresh
	// it lazily by re-reading after appends (so we don't re-fetch on every
	// member). We track an `appendedSinceRead` flag — if true, refetch before
	// the next membership scan to avoid double-appends.
	let allRows = await readAllRows(sheets, sheetId);
	console.info('[reconcile] sheet rows (incl header): %d', allRows.length);

	const sheetMembers = new Set();
	{
		const userIdCol = (allRows[0] ?? []).findIndex(
			(h) => typeof h === 'string' && h.trim() === 'userId',
		);
		const roleCol = (allRows[0] ?? []).findIndex(
			(h) => typeof h === 'string' && h.trim() === 'role',
		);
		const optionIdCol = (allRows[0] ?? []).findIndex(
			(h) => typeof h === 'string' && h.trim() === 'optionId',
		);
		const optionTitleCol = (allRows[0] ?? []).findIndex(
			(h) => typeof h === 'string' && h.trim() === 'optionTitle',
		);
		for (let i = 1; i < allRows.length; i++) {
			const r = allRows[i] ?? [];
			const uid = r[userIdCol] ?? '';
			const role = roleCol !== -1 ? r[roleCol] ?? '' : '';
			const oid = optionIdCol !== -1 ? r[optionIdCol] ?? '' : '';
			const otitle = optionTitleCol !== -1 ? r[optionTitleCol] ?? '' : '';
			sheetMembers.add(`${uid}|${role}|${oid}|${otitle}`);
		}
	}
	console.info('[reconcile] distinct sheet (uid|role|optionId|optionTitle) keys: %d', sheetMembers.size);

	const missing = [];

	for (const optDoc of optionsSnap.docs) {
		const option = optDoc.data();
		if (option.isCluster === true || option.integratedInto) continue;
		optionsScanned++;

		const memberships = [
			...((option.joined ?? []).map((c) => ({ creator: c, role: 'activist' }))),
			...((option.organizers ?? []).map((c) => ({ creator: c, role: 'organizer' }))),
		].filter((m) => m.creator?.uid);

		for (const { creator, role } of memberships) {
			totalMembers++;

			const submission = await getSubmission(creator.uid);
			if (!submission) {
				skippedNoSubmission++;
				missing.push({
					optionId: option.statementId,
					optionTitle: option.statement ?? '',
					userId: creator.uid,
					displayName: creator.displayName ?? '',
					role,
					reason: 'no-submission',
				});
				continue;
			}

			const rowIndex = findRowIndex(allRows, {
				userId: creator.uid,
				role,
				optionId: option.statementId,
				optionTitle: option.statement ?? '',
			});
			if (rowIndex !== -1) {
				skippedAlreadyPresent++;
				continue;
			}

			// Build and append.
			const formValues = {};
			for (const field of joinForm.fields ?? []) {
				formValues[field.label] = submission.values?.[field.id] ?? '';
			}
			const row = buildRowFromHeader(header, {
				userId: creator.uid,
				displayName: submission.displayName ?? creator.displayName ?? '',
				role,
				optionId: option.statementId,
				optionTitle: option.statement ?? '',
				submittedAt: new Date().toISOString(),
				questionId,
				formValues,
			});

			try {
				await sheets.spreadsheets.values.append({
					spreadsheetId: sheetId,
					range: 'A1',
					valueInputOption: 'RAW',
					requestBody: { values: [row] },
				});
				appended++;
				allRows.push(row);
				missing.push({
					optionId: option.statementId,
					optionTitle: option.statement ?? '',
					userId: creator.uid,
					displayName: submission.displayName ?? creator.displayName ?? '',
					role,
					reason: 'appended',
				});
				console.info('[reconcile] APPENDED uid=%s role=%s option="%s"', creator.uid, role, option.statement);
			} catch (err) {
				errors++;
				console.error('[reconcile] append failed', {
					uid: creator.uid,
					role,
					optionId: option.statementId,
					err: err?.message ?? String(err),
				});
			}
		}
	}

	console.info('\n[reconcile] SUMMARY');
	console.info('  question:               %s', questionId);
	console.info('  options scanned:        %d', optionsScanned);
	console.info('  total memberships:      %d', totalMembers);
	console.info('  already in sheet:       %d', skippedAlreadyPresent);
	console.info('  appended to sheet:      %d', appended);
	console.info('  members w/o submission: %d', skippedNoSubmission);
	console.info('  errors:                 %d', errors);

	if (missing.length > 0) {
		console.info('\n[reconcile] DIFFERENCES (appended + no-submission):');
		for (const m of missing) {
			console.info(
				'  [%s] %s (%s) — %s in "%s"',
				m.reason,
				m.displayName || m.userId,
				m.userId,
				m.role,
				m.optionTitle,
			);
		}
	}
}

main().catch((err) => {
	console.error('[reconcile] FATAL', err);
	process.exit(99);
});
