import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { Collections, type Statement } from '@freedi/shared-types';
import {
	clusterVoteSourceIds,
	computeClusterEvaluationFromRawEvals,
	fetchEvaluationsForIds,
	recomputeClusterEvaluation,
} from '../condensation/aggregation';

/**
 * Backfill for v2 "joins carry the absorbed cluster's direct votes".
 *
 * Before v2, every join (pipeline merge, reJudge merge, claim consolidation,
 * theme consolidation) hid the loser cluster and left its direct votes on the
 * hidden doc, where nothing counted them. This finds every hidden loser, works
 * out its final visible winner (following chains), and adds the loser to the
 * winner's `absorbedClusterIds`, so the winner's score counts those votes.
 *
 * Losers are found by `mergedInto`. Claim-consolidation losers never had
 * `mergedInto`; for them the winner is the ONE visible cluster of the same
 * kind (synth / theme / claim) under the same question whose members include
 * all of the loser's members (ambiguous or missing matches are reported).
 *
 * Inferred links (no `mergedInto`) are only listed unless `includeInferred`:
 * an admin-hidden cluster looks exactly like an old claim loser.
 *
 * Dry run by default: it only reads and reports. `execute` writes the field
 * (and, for applied inferred links, `mergedInto`) and recomputes each winner.
 */

export const BACKFILL_PAGE_SIZE = 300;
/** Guard against cyclic `mergedInto` chains. */
const MAX_CHAIN_DEPTH = 20;

export interface BackfillRow {
	questionId: string;
	winnerId: string;
	addedAbsorbedIds: string[];
	/** Direct evaluations on the newly absorbed clusters (were not counted). */
	orphanedDirectVotes: number;
	evaluatorsBefore: number;
	evaluatorsAfter: number;
	consensusBefore: number;
	consensusAfter: number;
}

export interface BackfillReport {
	rows: BackfillRow[];
	skipped: Array<{ loserId: string; reason: string }>;
	/** Links guessed from membership (no `mergedInto`): applied only with includeInferred. */
	inferred: Array<{ loserId: string; winnerId: string; applied: boolean }>;
	executed: boolean;
}

export interface BackfillOptions {
	execute: boolean;
	/**
	 * Also apply links guessed from membership (hidden cluster without
	 * `mergedInto`, e.g. old claim-consolidation losers). Off by default:
	 * an admin-hidden cluster looks the same, and the guess could hand its
	 * votes to the wrong cluster.
	 */
	includeInferred?: boolean;
}

interface LoserLink {
	loser: Statement;
	winnerId: string;
	inferred: boolean;
}

type ClaimMarked = Statement & { canonicalClaim?: string };

/** Synth vs theme vs claim cluster: a loser only merges into its own kind. */
export function clusterKind(cluster: Statement): string {
	const claim = (cluster as ClaimMarked).canonicalClaim ? 'claim' : 'plain';

	return `${cluster.derivedByPipeline ?? 'none'}:${claim}`;
}

async function listHiddenClusters(db: Firestore): Promise<Statement[]> {
	const out: Statement[] = [];
	let cursor: string | undefined;
	for (;;) {
		let query = db
			.collection(Collections.statements)
			.where('isCluster', '==', true)
			.where('hide', '==', true)
			.orderBy('__name__')
			.limit(BACKFILL_PAGE_SIZE);
		if (cursor) query = query.startAfter(cursor);
		const snap = await query.get();
		snap.docs.forEach((d) => out.push(d.data() as Statement));
		if (snap.docs.length < BACKFILL_PAGE_SIZE) return out;
		cursor = snap.docs[snap.docs.length - 1].id;
	}
}

async function visibleClustersOf(
	db: Firestore,
	questionId: string,
	cache: Map<string, Statement[]>,
): Promise<Statement[]> {
	const cached = cache.get(questionId);
	if (cached) return cached;
	const snap = await db
		.collection(Collections.statements)
		.where('parentId', '==', questionId)
		.where('isCluster', '==', true)
		.get();
	const visible = snap.docs.map((d) => d.data() as Statement).filter((s) => s.hide !== true);
	cache.set(questionId, visible);

	return visible;
}

/** Winner of a claim-consolidation loser: the one visible superset cluster. */
function findSupersetWinner(loser: Statement, visible: Statement[]): string | 'ambiguous' | null {
	const members = loser.integratedOptions ?? [];
	if (members.length === 0) return null;
	const kind = clusterKind(loser);
	const matches = visible.filter(
		(c) =>
			c.statementId !== loser.statementId &&
			clusterKind(c) === kind &&
			members.every((m) => (c.integratedOptions ?? []).includes(m)),
	);
	if (matches.length > 1) return 'ambiguous';

	return matches[0]?.statementId ?? null;
}

async function resolveFinalWinner(db: Firestore, firstWinnerId: string): Promise<Statement | null> {
	let id = firstWinnerId;
	for (let depth = 0; depth < MAX_CHAIN_DEPTH; depth++) {
		const snap = await db.collection(Collections.statements).doc(id).get();
		if (!snap.exists) return null;
		const doc = snap.data() as Statement;
		if (doc.hide !== true) return doc;
		if (!doc.mergedInto) return null;
		id = doc.mergedInto;
	}

	return null;
}

async function linkLosers(
	db: Firestore,
	skipped: BackfillReport['skipped'],
): Promise<{ links: LoserLink[]; winners: Map<string, Statement> }> {
	const links: LoserLink[] = [];
	const winners = new Map<string, Statement>();
	const visibleCache = new Map<string, Statement[]>();

	for (const loser of await listHiddenClusters(db)) {
		let firstWinnerId = loser.mergedInto;
		if (!firstWinnerId) {
			const match = findSupersetWinner(
				loser,
				await visibleClustersOf(db, loser.parentId, visibleCache),
			);
			if (match === 'ambiguous') {
				skipped.push({ loserId: loser.statementId, reason: 'several possible winners' });
				continue;
			}
			if (!match) {
				skipped.push({
					loserId: loser.statementId,
					reason: 'no mergedInto and no visible winner of the same kind',
				});
				continue;
			}
			firstWinnerId = match;
		}
		const winner = await resolveFinalWinner(db, firstWinnerId);
		if (!winner || winner.isCluster !== true) {
			skipped.push({ loserId: loser.statementId, reason: 'no visible winner cluster' });
			continue;
		}
		winners.set(winner.statementId, winner);
		links.push({
			loser,
			winnerId: winner.statementId,
			inferred: !loser.mergedInto,
		});
	}

	return { links, winners };
}

async function buildRow(winner: Statement, added: string[]): Promise<BackfillRow> {
	const after: Statement = {
		...winner,
		absorbedClusterIds: [...(winner.absorbedClusterIds ?? []), ...added],
	};
	const evals = await fetchEvaluationsForIds(clusterVoteSourceIds(winner.statementId, after));
	const addedSet = new Set(added);
	const { evaluation } = computeClusterEvaluationFromRawEvals(evals, {
		clusterStatementId: winner.statementId,
		absorbedClusterIds: after.absorbedClusterIds,
	});

	return {
		questionId: winner.parentId,
		winnerId: winner.statementId,
		addedAbsorbedIds: added,
		orphanedDirectVotes: evals.filter((e) => addedSet.has(e.statementId)).length,
		evaluatorsBefore: winner.evaluation?.numberOfEvaluators ?? 0,
		evaluatorsAfter: evaluation.numberOfEvaluators,
		consensusBefore: winner.consensus ?? 0,
		consensusAfter: evaluation.agreement,
	};
}

export async function backfillAbsorbedClusterVotes(
	db: Firestore,
	options: BackfillOptions,
): Promise<BackfillReport> {
	const skipped: BackfillReport['skipped'] = [];
	const { links: allLinks, winners } = await linkLosers(db, skipped);
	const includeInferred = options.includeInferred === true;
	const inferred = allLinks
		.filter((l) => l.inferred)
		.map((l) => ({ loserId: l.loser.statementId, winnerId: l.winnerId, applied: includeInferred }));
	const links = allLinks.filter((l) => !l.inferred || includeInferred);

	const addedByWinner = new Map<string, Set<string>>();
	for (const { loser, winnerId } of links) {
		const known = new Set(winners.get(winnerId)?.absorbedClusterIds ?? []);
		const ids = [loser.statementId, ...(loser.absorbedClusterIds ?? [])].filter(
			(id) => id !== winnerId && !known.has(id),
		);
		if (ids.length === 0) continue;
		const bucket = addedByWinner.get(winnerId) ?? new Set<string>();
		ids.forEach((id) => bucket.add(id));
		addedByWinner.set(winnerId, bucket);
	}

	const rows: BackfillRow[] = [];
	for (const [winnerId, added] of addedByWinner) {
		const winner = winners.get(winnerId);
		if (winner) rows.push(await buildRow(winner, [...added]));
	}
	rows.sort((a, b) => a.questionId.localeCompare(b.questionId));

	if (options.execute) {
		for (const link of links.filter((l) => l.inferred)) {
			await db
				.collection(Collections.statements)
				.doc(link.loser.statementId)
				.update({ mergedInto: link.winnerId });
		}
		for (const row of rows) {
			await db
				.collection(Collections.statements)
				.doc(row.winnerId)
				.update({ absorbedClusterIds: FieldValue.arrayUnion(...row.addedAbsorbedIds) });
			await recomputeClusterEvaluation(row.winnerId);
		}
	}

	return { rows, skipped, inferred, executed: options.execute };
}

/** Plain-text table, one block per question. */
export function formatBackfillReport(report: BackfillReport): string {
	const lines: string[] = [];
	let question = '';
	for (const row of report.rows) {
		if (row.questionId !== question) {
			question = row.questionId;
			lines.push('', `question ${question}`);
			lines.push('  winner | absorbed added | orphaned direct votes | voters | consensus');
		}
		lines.push(
			`  ${row.winnerId} | ${row.addedAbsorbedIds.join(',')} | ${row.orphanedDirectVotes} | ` +
				`${row.evaluatorsBefore} -> ${row.evaluatorsAfter} | ` +
				`${row.consensusBefore.toFixed(3)} -> ${row.consensusAfter.toFixed(3)}`,
		);
	}
	const restored = report.rows.reduce((sum, r) => sum + r.orphanedDirectVotes, 0);
	lines.push(
		'',
		`winners: ${report.rows.length}, orphaned direct votes: ${restored}, ` +
			`skipped losers: ${report.skipped.length}, ${report.executed ? 'WRITTEN' : 'DRY RUN (no writes)'}`,
	);
	report.skipped.forEach((s) => lines.push(`  skipped ${s.loserId}: ${s.reason}`));
	report.inferred.forEach((l) =>
		lines.push(
			`  inferred ${l.loserId} -> ${l.winnerId}: ` +
				(l.applied ? 'applied' : 'NOT applied (check it, then pass --include-inferred)'),
		),
	);

	return lines.join('\n');
}
