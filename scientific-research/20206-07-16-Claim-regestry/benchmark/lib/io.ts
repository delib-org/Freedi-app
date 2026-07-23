/** Append-only JSONL result logs, keyed for resumability. */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RESULTS_DIR } from './env';

export function resultsPath(name: string): string {
	mkdirSync(RESULTS_DIR, { recursive: true });

	return resolve(RESULTS_DIR, name);
}

export function readJsonl<T>(name: string): T[] {
	const path = resultsPath(name);
	if (!existsSync(path)) return [];

	return readFileSync(path, 'utf8')
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line) as T);
}

export function appendJsonl(name: string, row: unknown): void {
	appendFileSync(resultsPath(name), JSON.stringify(row) + '\n');
}

/** Ids already present in a result log (field `id`) — skip on resume. */
export function doneIds(name: string): Set<string> {
	return new Set(readJsonl<{ id: string }>(name).map((r) => r.id));
}
