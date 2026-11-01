import * as v from 'valibot';
import pLimit from 'p-limit';
import { logger } from 'firebase-functions';
import { callLLM, extractJson, WORKER_MODEL } from '../../config/openai-chat';
import {
	ASSIGN_BATCH_SIZE,
	ASSIGN_CONCURRENCY,
	ASSIGN_MAX_TOKENS,
	ASSIGN_RETRY_ROUNDS,
	NONE_KEY,
	retryBatchSize,
} from './constants';
import { ASSIGN_SYSTEM, assignUserPrompt } from './prompts';
import type { DiscoveredTheme, RebuildAtom } from './types';

/**
 * Sort every atom into the fixed theme list, in small batches on the worker
 * model. Ids and keys the model invents are dropped; atoms a batch did not
 * validly answer are re-asked in halving batches (up to ASSIGN_RETRY_ROUNDS);
 * atoms still unanswered go to NONE ("Other ideas"), never to a guessed theme,
 * and are counted as `unanswered`.
 */

const AssignResponseSchema = v.object({
	assignments: v.record(v.string(), v.string()),
});

/** Dropped answers quoted in the warning, for diagnosis. */
const DROPPED_SAMPLE_SIZE = 3;

/**
 * The prompt shows ids and keys in [brackets]; a model that echoes "[a3]" or
 * "[t2]" back means a3 / t2, not an invented id.
 */
export function unbracket(value: string): string {
	return value
		.trim()
		.replace(/^\[(.*)\]$/, '$1')
		.trim();
}

/** atomId → theme key or NONE_KEY. */
export type AtomAssignments = Map<string, string>;

export interface AssignResult {
	assignments: AtomAssignments;
	/** Atoms unanswered after the retry, sent to NONE. */
	unanswered: number;
}

/**
 * Valid answers only: an id that was not offered in this batch, or a key that
 * is neither an offered theme nor NONE, is dropped (the atom counts as
 * unanswered and is retried).
 */
export function parseAssignments(
	raw: string,
	localToAtomId: Map<string, string>,
	themeKeys: Set<string>,
): AtomAssignments {
	const parsed = v.parse(AssignResponseSchema, JSON.parse(extractJson(raw)));
	const result: AtomAssignments = new Map();
	const dropped: Array<[string, string]> = [];
	for (const [rawId, rawKey] of Object.entries(parsed.assignments)) {
		const atomId = localToAtomId.get(unbracket(rawId));
		const key = unbracket(rawKey);
		if (atomId && key.toUpperCase() === NONE_KEY) result.set(atomId, NONE_KEY);
		else if (atomId && themeKeys.has(key)) result.set(atomId, key);
		else dropped.push([rawId, rawKey]);
	}
	if (dropped.length > 0) {
		logger.warn('themeRebuild.assign: answers dropped (unknown id or key)', {
			dropped: dropped.length,
			answered: Object.keys(parsed.assignments).length,
			sample: dropped.slice(0, DROPPED_SAMPLE_SIZE),
		});
	}

	return result;
}

function chunk<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));

	return chunks;
}

/** One call. A failed call answers nothing; its atoms are retried. */
async function assignBatch(
	question: string,
	themes: DiscoveredTheme[],
	batch: RebuildAtom[],
): Promise<AtomAssignments> {
	// Short local ids: a 20-character Firestore id is easy to garble.
	const offered = batch.map((atom, i) => ({ localId: `a${i + 1}`, atom }));
	const localToAtomId = new Map(offered.map((o) => [o.localId, o.atom.id]));
	try {
		const raw = await callLLM({
			model: WORKER_MODEL,
			system: ASSIGN_SYSTEM,
			user: assignUserPrompt(
				question,
				themes,
				offered.map((o) => ({ localId: o.localId, text: o.atom.text })),
				NONE_KEY,
			),
			maxTokens: ASSIGN_MAX_TOKENS,
			temperature: 0,
			jsonMode: true,
		});

		return parseAssignments(raw, localToAtomId, new Set(themes.map((t) => t.key)));
	} catch (error) {
		logger.warn('themeRebuild.assign: batch failed', {
			batchSize: batch.length,
			error: error instanceof Error ? error.message : String(error),
		});

		return new Map();
	}
}

async function assignInBatches(
	question: string,
	themes: DiscoveredTheme[],
	atoms: RebuildAtom[],
	batchSize: number,
): Promise<AtomAssignments> {
	const limit = pLimit(ASSIGN_CONCURRENCY);
	const answers = await Promise.all(
		chunk(atoms, batchSize).map((batch) => limit(() => assignBatch(question, themes, batch))),
	);

	return new Map(answers.flatMap((m) => [...m]));
}

export async function assignAtoms(
	question: string,
	themes: DiscoveredTheme[],
	atoms: RebuildAtom[],
): Promise<AssignResult> {
	const assignments = await assignInBatches(question, themes, atoms, ASSIGN_BATCH_SIZE);

	// An atom without a valid answer is never dropped silently: it is re-sent
	// in ever smaller batches before it may land in "Other ideas".
	for (let round = 1; round <= ASSIGN_RETRY_ROUNDS; round++) {
		const missing = atoms.filter((a) => !assignments.has(a.id));
		if (missing.length === 0) break;
		const size = retryBatchSize(round);
		logger.info('themeRebuild.assign: retrying atoms without a valid answer', {
			round,
			missing: missing.length,
			batchSize: size,
		});
		const retried = await assignInBatches(question, themes, missing, size);
		for (const [atomId, key] of retried) assignments.set(atomId, key);
	}

	let unanswered = 0;
	for (const atom of atoms) {
		if (assignments.has(atom.id)) continue;
		assignments.set(atom.id, NONE_KEY);
		unanswered++;
	}
	if (unanswered > 0) {
		logger.warn('themeRebuild.assign: atoms unanswered after all retries, sent to Other', {
			unanswered,
			atoms: atoms.length,
			rounds: ASSIGN_RETRY_ROUNDS,
		});
	}

	return { assignments, unanswered };
}
