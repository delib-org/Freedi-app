#!/usr/bin/env node
/**
 * Rescue the full pipeline evidence for a benchmark run from a still-running
 * Firestore emulator, before it is wiped.
 *
 * The exporter in runAccuracyBenchmark.ts keeps audit events but drops their
 * `prevState`/`newState` — which turn out to be exactly what a mid-run
 * reconstruction needs: every attach/nest/merge records the cluster's full
 * `integratedOptions` before and after. With those, the theme set a
 * consolidation sweep actually faced can be rebuilt exactly, not approximately.
 *
 * Writes into the run folder (they are run evidence, not scratch):
 *   audit-full.json       — every _synthAuditLog doc, verbatim
 *   statements-full.json  — every statement under the benchmark question,
 *                           including hidden/merged clusters with their
 *                           descriptions (titles of merged survivors are the
 *                           POST-merge titles; originals come from audit/log)
 *
 *   usage: node dumpEmulatorEvidence.mjs <runDir> [parentId]
 *   env:   EMULATOR_HOST (default 127.0.0.1:8181), PROJECT (default freedi-test)
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HOST = process.env.EMULATOR_HOST ?? '127.0.0.1:8181';
const PROJECT = process.env.PROJECT ?? 'freedi-test';
const runDir = process.argv[2];
const parentId = process.argv[3] ?? 'accuracy100en';
if (!runDir) {
	console.error('usage: node dumpEmulatorEvidence.mjs <runDir> [parentId]');
	process.exit(1);
}

const BASE = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
const AUTH = { Authorization: 'Bearer owner' };

/** Firestore REST value → plain JS. */
function fromValue(v) {
	if ('stringValue' in v) return v.stringValue;
	if ('integerValue' in v) return Number(v.integerValue);
	if ('doubleValue' in v) return v.doubleValue;
	if ('booleanValue' in v) return v.booleanValue;
	if ('nullValue' in v) return null;
	if ('timestampValue' in v) return v.timestampValue;
	if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(fromValue);
	if ('mapValue' in v) return fromFields(v.mapValue.fields ?? {});

	return v; // vectors etc. — keep raw, reconstruction does not read them
}
function fromFields(fields) {
	return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fromValue(v)]));
}

async function listAll(collection) {
	const docs = [];
	let pageToken = '';
	do {
		const url = `${BASE}/${collection}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
		const res = await fetch(url, { headers: AUTH });
		if (!res.ok) throw new Error(`${collection}: ${res.status} ${await res.text()}`);
		const body = await res.json();
		for (const d of body.documents ?? []) docs.push(fromFields(d.fields ?? {}));
		pageToken = body.nextPageToken ?? '';
	} while (pageToken);

	return docs;
}

const audit = await listAll('_synthAuditLog');
audit.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

const statements = (await listAll('statements'))
	.filter((s) => s.parentId === parentId)
	// Embedding vectors are ~9KB per doc and nothing downstream reads them from
	// this file — the geometry work reads the preflight cache instead.
	.map(({ embedding, embeddingBrief, ...rest }) => rest);

const sweepState = await listAll('_liveSynthThemeSweep').catch(() => []);

writeFileSync(resolve(runDir, 'audit-full.json'), JSON.stringify(audit, null, 1));
writeFileSync(resolve(runDir, 'statements-full.json'), JSON.stringify(statements, null, 1));
writeFileSync(resolve(runDir, 'sweep-state.json'), JSON.stringify(sweepState, null, 1));
console.log(
	`audit ${audit.length} events, statements ${statements.length}, sweep-state ${sweepState.length} → ${runDir}`,
);
