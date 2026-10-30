import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, type Statement } from '@freedi/shared-types';
import { fileUnthemedAtoms, type FileUnthemedResult } from '../pipeline/fileUnthemed';
import {
	computeParentFingerprint,
	FORCE_FULL_SWEEP_MS,
	isDormant,
	loadSweepState,
	saveSweepState,
} from './reJudgeSweepState';

/**
 * File-only visit for questions the full reJudge pass never reaches.
 *
 * The sweep discovers parents from their synthesis docs and skips any with
 * fewer than two, because its main job is merging duplicate syntheses. That
 * also skipped the file-unthemed step, so on a question with zero or one
 * synthesis but a live theme, a plain statement whose filing said NONE at
 * arrival stayed unthemed forever. Such parents are visited here and get ONLY
 * `fileUnthemedAtoms`, under the same fingerprint / dormancy gates.
 */

/** Bound on the theme discovery read, same order as the synth query. */
export const THEME_QUERY_LIMIT = 2_000;

function db() {
	return getFirestore();
}

/**
 * Live themes across all questions: the discovery source for file-only parents.
 *
 * Not filtered on `hide` in the query: legacy theme docs have no `hide` field
 * at all, and `hide == false` would never match them. Hidden themes are
 * dropped in memory instead.
 */
export async function loadLiveThemes(): Promise<Statement[]> {
	const snap = await db()
		.collection(Collections.statements)
		.where('derivedByPipeline', '==', 'topic-cluster')
		.where('isCluster', '==', true)
		.limit(THEME_QUERY_LIMIT)
		.get();

	return snap.docs
		.map((d) => d.data() as Statement)
		.filter((s) => s.isCluster === true && s.hide !== true);
}

/**
 * Parents that have at least one live theme and fewer than two syntheses
 * (those with two or more get the full pass). Value: the parent's syntheses,
 * for the fingerprint.
 */
export function selectFileOnlyParents(
	synthsByParent: Map<string, Statement[]>,
	liveThemes: Statement[],
): Map<string, Statement[]> {
	const selected = new Map<string, Statement[]>();
	for (const theme of liveThemes) {
		if (!theme.parentId || selected.has(theme.parentId)) continue;
		const synths = synthsByParent.get(theme.parentId) ?? [];
		if (synths.length >= 2) continue;
		selected.set(theme.parentId, synths);
	}

	return selected;
}

async function loadParent(parentId: string): Promise<Statement | null> {
	try {
		const snap = await db().collection(Collections.statements).doc(parentId).get();

		return snap.exists ? (snap.data() as Statement) : null;
	} catch (error) {
		logger.warn('synthesis.reJudge.fileOnly: parent fetch failed, using id as context', {
			parentId,
			error: error instanceof Error ? error.message : String(error),
		});

		return null;
	}
}

export interface FileOnlyParentResult {
	skipped: boolean;
	skipReason?: 'unchanged' | 'dormant';
	filing?: FileUnthemedResult;
}

export async function fileOnlyProcessParent(
	parentId: string,
	synthDocs: Statement[],
	now: number,
): Promise<FileOnlyParentResult> {
	const parentDoc = await loadParent(parentId);
	const fingerprint = computeParentFingerprint(synthDocs, parentDoc);
	const state = await loadSweepState(parentId);
	const unchanged = state !== null && state.fingerprint === fingerprint;
	const overdue = now - (state?.lastSweptAt ?? 0) >= FORCE_FULL_SWEEP_MS;
	const dormant = isDormant(parentDoc, now);
	if (unchanged && (!overdue || dormant)) {
		return { skipped: true, skipReason: dormant ? 'dormant' : 'unchanged' };
	}

	const filing = await fileUnthemedAtoms(
		parentId,
		parentDoc?.statement ?? parentId,
		'reJudge:fileOnly',
	);
	if (filing.filed > 0 || filing.errors > 0) {
		logger.info('synthesis.reJudge.fileOnly.unthemedFiled', { parentId, ...filing });
	}
	// Fewer than two syntheses: there are no pairs to remember.
	await saveSweepState(parentId, fingerprint, [], now);

	return { skipped: false, filing };
}

export interface FileOnlySweepSummary {
	processed: number;
	skipped: number;
	dormant: number;
}

/**
 * Visit file-only parents until `budget` of them did real work. Skips cost one
 * state read and do not use up the budget, as in the main sweep.
 */
export async function sweepFileOnlyParents(
	parents: Map<string, Statement[]>,
	budget: number,
	now: number,
): Promise<FileOnlySweepSummary> {
	const summary: FileOnlySweepSummary = { processed: 0, skipped: 0, dormant: 0 };
	for (const [parentId, synths] of parents) {
		if (summary.processed >= budget) break;
		try {
			const result = await fileOnlyProcessParent(parentId, synths, now);
			if (result.skipped) summary.skipped++;
			else summary.processed++;
			if (result.skipReason === 'dormant') summary.dormant++;
		} catch (error) {
			summary.processed++;
			logger.warn('synthesis.reJudge.fileOnly: parent processing failed', {
				parentId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return summary;
}
