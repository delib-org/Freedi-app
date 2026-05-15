/**
 * Reads the join-form Google Sheet for a question and emits a compact diff
 * against the authoritative option `joined`/`organizers` arrays.
 *
 * Three buckets in the output:
 *   - `IN_SHEET_AND_IN_OPTIONS`     — correctly synced
 *   - `IN_OPTIONS_BUT_NOT_IN_SHEET` — sheet is missing rows (sync drift)
 *   - `IN_SHEET_BUT_NOT_IN_OPTIONS` — orphan rows (user left, sheet not cleaned)
 *
 * Usage: node functions/scripts/read-join-sheet.mjs <questionId>
 */

import admin from 'firebase-admin';
import { google } from 'googleapis';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
	const text = fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf-8');
	for (const raw of text.split('\n')) {
		const line = raw.trim();
		if (!line || line.startsWith('#')) continue;
		const eq = line.indexOf('=');
		if (eq === -1) continue;
		const key = line.slice(0, eq);
		let value = line.slice(eq + 1);
		if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
		if (!(key in process.env)) process.env[key] = value;
	}
}
loadEnv();

const questionId = process.argv[2];
if (!questionId) {
	console.error('Usage: node functions/scripts/read-join-sheet.mjs <questionId>');
	process.exit(1);
}

admin.initializeApp({ projectId: 'wizcol-app' });
const db = admin.firestore();

function getSheets() {
	const auth = new google.auth.GoogleAuth({
		credentials: {
			client_email: process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL,
			private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
		},
		scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
	});

	return google.sheets({ version: 'v4', auth });
}

function extractSheetId(url) {
	return url.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1];
}

const qSnap = await db.collection('statements').doc(questionId).get();
const q = qSnap.data();
const sheetUrl = q?.statementSettings?.joinForm?.sheetUrl;
if (!sheetUrl) {
	console.error('No sheet configured');
	process.exit(2);
}
const sheetId = extractSheetId(sheetUrl);
const sheets = getSheets();

const meta = await sheets.spreadsheets.get({
	spreadsheetId: sheetId,
	fields: 'sheets(properties(title))',
});
const sheetTitle = meta.data.sheets?.[0]?.properties?.title ?? 'Sheet1';

const resp = await sheets.spreadsheets.values.get({
	spreadsheetId: sheetId,
	range: `${sheetTitle}!A:ZZ`,
});
const rows = (resp.data.values ?? []).map((r) => (r ?? []).map((c) => (typeof c === 'string' ? c : String(c ?? ''))));
const header = rows[0] ?? [];
const dataRows = rows.slice(1);

console.info('=== Sheet contents for %s ===', questionId);
console.info('  url:   %s', sheetUrl);
console.info('  title: %s', sheetTitle);
console.info('  rows:  %d data rows', dataRows.length);
console.info('');

const userIdCol = header.findIndex((h) => h.trim() === 'userId');
const roleCol = header.findIndex((h) => h.trim() === 'role');
const optionIdCol = header.findIndex((h) => h.trim() === 'optionId');
const optionTitleCol = header.findIndex((h) => h.trim() === 'optionTitle');
const displayCol = header.findIndex((h) => h.trim() === 'displayName');

const sheetKeys = new Set();
const sheetByUser = new Map();
for (const r of dataRows) {
	const uid = r[userIdCol] ?? '';
	const role = roleCol !== -1 ? r[roleCol] ?? '' : '';
	const oid = optionIdCol !== -1 ? r[optionIdCol] ?? '' : '';
	const otitle = optionTitleCol !== -1 ? r[optionTitleCol] ?? '' : '';
	const display = displayCol !== -1 ? r[displayCol] ?? '' : '';
	const key = `${uid}|${role}|${oid || otitle}`;
	sheetKeys.add(key);
	if (!sheetByUser.has(uid)) sheetByUser.set(uid, []);
	sheetByUser.get(uid).push({ display, role, oid, otitle });
}

// Pull option memberships.
const optionsSnap = await db
	.collection('statements')
	.where('parentId', '==', questionId)
	.where('statementType', '==', 'option')
	.get();
const optionMemberKeys = new Set();
const optionMembers = []; // { uid, displayName, role, optionId, optionTitle }
for (const od of optionsSnap.docs) {
	const o = od.data();
	if (o.isCluster === true || o.integratedInto) continue;
	const title = o.statement ?? '';
	const addKeys = (uid, role) => {
		// Add both id-keyed and title-keyed lookup tuples so sheet rows from
		// legacy v1 schemas (no optionId column) still match.
		optionMemberKeys.add(`${uid}|${role}|${o.statementId}`);
		if (title) optionMemberKeys.add(`${uid}|${role}|${title}`);
	};
	for (const c of o.joined ?? []) {
		if (!c?.uid) continue;
		addKeys(c.uid, 'activist');
		optionMembers.push({
			uid: c.uid,
			displayName: c.displayName ?? '',
			role: 'activist',
			optionId: o.statementId,
			optionTitle: title,
		});
	}
	for (const c of o.organizers ?? []) {
		if (!c?.uid) continue;
		addKeys(c.uid, 'organizer');
		optionMembers.push({
			uid: c.uid,
			displayName: c.displayName ?? '',
			role: 'organizer',
			optionId: o.statementId,
			optionTitle: title,
		});
	}
}

// Buckets
const inSheetMatchedToOption = [];
const inOptionsButNotInSheet = [];
const inSheetButNotInOptions = [];

for (const m of optionMembers) {
	const keyById = `${m.uid}|${m.role}|${m.optionId}`;
	const keyByTitle = `${m.uid}|${m.role}|${m.optionTitle}`;
	if (sheetKeys.has(keyById) || sheetKeys.has(keyByTitle)) {
		inSheetMatchedToOption.push(m);
	} else {
		inOptionsButNotInSheet.push(m);
	}
}

for (const [uid, entries] of sheetByUser.entries()) {
	for (const e of entries) {
		const keyById = `${uid}|${e.role}|${e.oid}`;
		const keyByTitle = `${uid}|${e.role}|${e.otitle}`;
		if (!optionMemberKeys.has(keyById) && !optionMemberKeys.has(keyByTitle)) {
			inSheetButNotInOptions.push({ uid, ...e });
		}
	}
}

console.info('SUMMARY');
console.info('  In options array:         %d memberships (%d unique users)', optionMembers.length, new Set(optionMembers.map((m) => m.uid)).size);
console.info('  In sheet:                 %d rows (%d unique users)', dataRows.length, sheetByUser.size);
console.info('  Correctly synced:         %d', inSheetMatchedToOption.length);
console.info('  In options, NOT in sheet: %d', inOptionsButNotInSheet.length);
console.info('  In sheet, NOT in options: %d', inSheetButNotInOptions.length);
console.info('');

if (inOptionsButNotInSheet.length > 0) {
	console.info('▶ MEMBERS IN OPTIONS BUT NOT IN SHEET:');
	for (const m of inOptionsButNotInSheet) {
		console.info('  %s (%s) — %s in "%s"', m.displayName || '(anon)', m.uid, m.role, m.optionTitle);
	}
	console.info('');
}

if (inSheetButNotInOptions.length > 0) {
	console.info('▶ SHEET ROWS WITH NO MATCHING OPTION MEMBERSHIP (orphans):');
	for (const r of inSheetButNotInOptions) {
		console.info('  %s (%s) — %s in "%s"', r.display || '(anon)', r.uid, r.role, r.otitle || r.oid);
	}
	console.info('');
}
