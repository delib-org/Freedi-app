/**
 * Run the topic-cluster pipeline against the local Firestore emulator without
 * needing a production service-account key. Equivalent to clicking
 * "Run Topic Clustering" in the admin UI, but bypasses HTTP + auth.
 *
 * USAGE
 *   FIRESTORE_EMULATOR_HOST=localhost:8081 GCLOUD_PROJECT=freedi-test \
 *     OPENAI_API_KEY=sk-... \
 *     npx tsx scripts/runTopicClusterEmulator.ts <parentStatementId>
 *
 * Reads OPENAI_API_KEY from the environment, falling back to functions/.env.
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

if (!process.env.FIRESTORE_EMULATOR_HOST) {
	console.error('Refusing to run without FIRESTORE_EMULATOR_HOST set.');
	process.exit(1);
}

// Pull OPENAI_API_KEY (and friends) from functions/.env if not already in env.
loadDotenv({ path: resolve(SCRIPT_DIR, '..', 'functions', '.env') });

if (!process.env.OPENAI_API_KEY) {
	console.error(
		'Missing OPENAI_API_KEY. Set it via env or in functions/.env (the topic-cluster pipeline calls OpenAI for taxonomy + naming).',
	);
	process.exit(1);
}

if (getApps().length === 0) {
	initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'freedi-test' });
}

const parentId = process.argv[2];
if (!parentId) {
	console.error('Usage: npx tsx scripts/runTopicClusterEmulator.ts <parentStatementId>');
	process.exit(1);
}

(async () => {
	const { runTopicClusterPipeline } = await import(
		'../functions/src/services/topic-cluster/index'
	);
	const summary = await runTopicClusterPipeline(parentId, {});
	console.info('\n=== Run summary ===');
	console.info(JSON.stringify(summary, null, 2));
})().catch((err) => {
	console.error('Pipeline failed:', err);
	process.exit(2);
});
