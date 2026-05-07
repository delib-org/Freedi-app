/**
 * Topic-cluster pipeline CLI.
 *
 * Run: npx tsx functions/scripts/recluster.ts <parentStatementId>
 *      [--from-file <path>] [--dry-run] [--rebuild-cache] [--rebuild-taxonomy]
 *
 * See functions/scripts/RECLUSTER.md for setup, env vars, and cost estimate.
 */

import { initializeApp, cert, getApps, ServiceAccount } from 'firebase-admin/app';
import * as fs from 'fs';
import * as path from 'path';
import { parseArgs } from 'node:util';
import * as dotenv from 'dotenv';

// Load .env from functions/.env (matches existing scripts).
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

function findServiceAccountKey(): ServiceAccount | null {
	const possiblePaths = [
		process.env.GOOGLE_APPLICATION_CREDENTIALS,
		path.join(__dirname, 'serviceAccountKey.json'),
		path.join(__dirname, '../serviceAccountKey.json'),
		path.join(__dirname, '../../serviceAccountKey.json'),
	].filter(Boolean) as string[];

	for (const keyPath of possiblePaths) {
		if (fs.existsSync(keyPath)) {
			console.info(`Service account key: ${keyPath}`);

			return JSON.parse(fs.readFileSync(keyPath, 'utf-8')) as ServiceAccount;
		}
	}

	return null;
}

if (!getApps().length) {
	const serviceAccount = findServiceAccountKey();
	if (serviceAccount) {
		initializeApp({ credential: cert(serviceAccount) });
		console.info('Initialized Firebase Admin');
	} else if (process.env.FIRESTORE_EMULATOR_HOST) {
		// Emulator mode — admin SDK auto-uses the emulator from FIRESTORE_EMULATOR_HOST,
		// no real credentials needed.
		const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? 'freedi-test';
		initializeApp({ projectId });
		console.info(`Initialized Firebase Admin against emulator (project: ${projectId}).`);
	} else {
		// Allow --from-file mode without service account (purely offline).
		const args = process.argv.join(' ');
		if (args.includes('--from-file')) {
			console.info('No service account key found; running in --from-file (offline) mode.');
			initializeApp({ projectId: 'offline-mode-no-firestore' });
		} else {
			console.error(
				'No service account key found. Set GOOGLE_APPLICATION_CREDENTIALS, place serviceAccountKey.json next to this script, or set FIRESTORE_EMULATOR_HOST for emulator mode.',
			);
			process.exit(1);
		}
	}
}

// Import AFTER admin init so module-level getFirestore() doesn't crash on offline use.
async function main(): Promise<void> {
	const { values, positionals } = parseArgs({
		args: process.argv.slice(2),
		options: {
			'from-file': { type: 'string' },
			'dry-run': { type: 'boolean', default: false },
			'rebuild-cache': { type: 'boolean', default: false },
			'rebuild-taxonomy': { type: 'boolean', default: false },
			help: { type: 'boolean', default: false, short: 'h' },
		},
		allowPositionals: true,
	});

	if (values.help || (!values['from-file'] && positionals.length === 0)) {
		console.info(
			[
				'Usage: npx tsx functions/scripts/recluster.ts <parentStatementId> [flags]',
				'',
				'Flags:',
				'  --from-file <path>       Run pipeline against an offline JSON export (no Firestore writes).',
				'  --dry-run                Run pipeline, print summary, skip persistence.',
				'  --rebuild-cache          Ignore normalization cache and re-call the LLM for every response.',
				'  --rebuild-taxonomy       Ignore taxonomy cache and re-derive categories.',
				'',
				'Examples:',
				'  npx tsx functions/scripts/recluster.ts abc123 --dry-run',
				'  npx tsx functions/scripts/recluster.ts --from-file fixtures/civic-hebrew.json --dry-run',
			].join('\n'),
		);
		process.exit(values.help ? 0 : 1);
	}

	const { runTopicClusterPipeline } = await import('../src/services/topic-cluster');
	const parentId = positionals[0] ?? '__from_file__';
	const summary = await runTopicClusterPipeline(parentId, {
		fromFile: values['from-file'],
		dryRun: values['dry-run'],
		rebuildCache: values['rebuild-cache'],
		rebuildTaxonomy: values['rebuild-taxonomy'],
	});

	console.info('\n=== Run summary ===');
	console.info(JSON.stringify(summary, null, 2));
	process.exit(0);
}

main().catch((error) => {
	console.error('Pipeline failed:', error);
	process.exit(2);
});
