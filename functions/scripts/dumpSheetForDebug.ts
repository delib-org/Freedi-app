/**
 * Dump the sheet contents for debugging duplicate-row issues.
 *
 * Usage: GCLOUD_PROJECT=wizcol-app npx tsx scripts/dumpSheetForDebug.ts \
 *          --sheet-id <id>
 */

import { google, sheets_v4 } from 'googleapis';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import process from 'process';

loadSheetEnv();

const args = parseArgs(process.argv.slice(2));
if (!args.sheetId) {
	console.error('Usage: --sheet-id <id>');
	process.exit(1);
}

const sheets = getSheetsClient();
if (!sheets) {
	console.error('Sheets client unavailable');
	process.exit(1);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});

async function main(): Promise<void> {
	const meta = await sheets!.spreadsheets.get({
		spreadsheetId: args.sheetId!,
		fields: 'sheets(properties(sheetId,title))',
	});
	const sheetTitle = meta.data.sheets?.[0]?.properties?.title ?? 'Sheet1';
	const resp = await sheets!.spreadsheets.values.get({
		spreadsheetId: args.sheetId!,
		range: `${sheetTitle}!A:ZZ`,
	});
	const rows = resp.data.values ?? [];
	const header = rows[0] ?? [];
	console.info('HEADER:', header);
	console.info('TOTAL ROWS (incl header):', rows.length);
	console.info('---');
	const userIdCol = header.findIndex((h) => typeof h === 'string' && h.trim() === 'userId');
	const roleCol = header.findIndex((h) => typeof h === 'string' && h.trim() === 'role');
	const optionTitleCol = header.findIndex(
		(h) => typeof h === 'string' && h.trim() === 'optionTitle',
	);

	// Group by (userId, role, optionTitle)
	const counts = new Map<string, number>();
	for (let i = 1; i < rows.length; i++) {
		const r = rows[i];
		const uid = String(r?.[userIdCol] ?? '');
		const role = String(r?.[roleCol] ?? '');
		const title = String(r?.[optionTitleCol] ?? '');
		const k = `${uid}|${role}|${title}`;
		counts.set(k, (counts.get(k) ?? 0) + 1);
	}
	console.info('DUPLICATES (count > 1):');
	for (const [k, n] of counts) {
		if (n > 1) console.info(`  ${k} → ${n}`);
	}

	console.info('---');
	console.info('LAST 10 ROWS:');
	for (let i = Math.max(1, rows.length - 10); i < rows.length; i++) {
		const r = rows[i] ?? [];
		console.info(
			`  row ${i + 1} [${r.length} cols]: uid=${r[userIdCol] ?? ''} role=${r[roleCol] ?? ''} title=${r[optionTitleCol] ?? ''}`,
		);
	}
}

function getSheetsClient(): sheets_v4.Sheets | null {
	const email = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
	const rawKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
	if (!email || !rawKey) return null;
	const auth = new google.auth.JWT({
		email,
		key: rawKey.replace(/\\n/g, '\n'),
		scopes: ['https://www.googleapis.com/auth/spreadsheets'],
	});
	return google.sheets({ version: 'v4', auth });
}

function loadSheetEnv(): void {
	if (process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL) return;
	const candidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), 'functions/.env')];
	const envPath = candidates.find((p) => existsSync(p));
	if (!envPath) return;
	for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
		const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
		if (!m) continue;
		const [, k, v] = m;
		if (process.env[k]) continue;
		process.env[k] = v.replace(/^"|"$/g, '');
	}
}

function parseArgs(argv: string[]): { sheetId?: string } {
	const out: { sheetId?: string } = {};
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--sheet-id') out.sheetId = argv[++i];
	}
	return out;
}
