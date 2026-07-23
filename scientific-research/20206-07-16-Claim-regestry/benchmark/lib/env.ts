/**
 * Loads OPENAI_API_KEY (and optional OPENAI_* overrides) from functions/.env
 * so the harness can call the same production code paths without any deploy
 * environment. Minimal KEY=VALUE parser — no dotenv dependency.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = resolve(__dir, '../../../..');
export const BENCHMARK_DIR = resolve(__dir, '..');
export const RESULTS_DIR = resolve(BENCHMARK_DIR, 'results');
export const DATASET_DIR = resolve(BENCHMARK_DIR, '../Proccacia-dataset');

export function loadEnv(): void {
	const envPath = resolve(REPO_ROOT, 'functions/.env');
	const content = readFileSync(envPath, 'utf8');
	for (const line of content.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eq = trimmed.indexOf('=');
		if (eq === -1) continue;
		const key = trimmed.slice(0, eq).trim();
		let value = trimmed.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		if (!(key in process.env)) process.env[key] = value;
	}
	if (!process.env.OPENAI_API_KEY) {
		throw new Error(`OPENAI_API_KEY not found in ${envPath}`);
	}
}
