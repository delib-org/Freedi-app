/**
 * Unified ancestor recompute (§4.4) — O(depth), the single routine shared by
 * new evidence verdicts and new evaluations (votes + verdicts share one pass).
 *
 * Walk the parent chain from the nearest enclosing `option` upward. For each
 * ancestor:
 *   - option / evidence → recompute C (`corroboration.ts` over its subtree +
 *     votes), write `corroborationScore`.
 *   - question          → recompute aggregates (`optionCount`, `leadingOptionId`,
 *     `convergenceIndex`).
 *   - always            → bump `lastActivityAt`.
 * Writes are idempotent.
 */
import { getFirestore } from 'firebase-admin/firestore';
import { Collections, StatementType } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';
import {
	scoreNode,
	computeQuestionAggregates,
	createTaxonomy,
	DEFAULT_CORROBORATION_CONFIG,
	type ScorableStatement,
	type NodeKind,
	type DialecticPolarity,
} from '@freedi/evidence';

const taxonomy = createTaxonomy();

function nodeKind(type: StatementType): NodeKind {
	switch (type) {
		case StatementType.question:
			return 'question';
		case StatementType.option:
			return 'option';
		case StatementType.evidence:
			return 'evidence';
		default:
			return 'statement';
	}
}

/** Sum of ±1 evaluations mapped to [0,1], plus the count, for one node. */
async function voteTally(statementId: string): Promise<{ sum: number; N: number }> {
	const db = getFirestore();
	const snap = await db
		.collection(Collections.evaluations)
		.where('statementId', '==', statementId)
		.get();
	let sum = 0;
	let N = 0;
	for (const doc of snap.docs) {
		const e = doc.data().evaluation;
		if (typeof e === 'number') {
			sum += (e + 1) / 2; // map [-1,1] → [0,1]
			N += 1;
		}
	}

	return { sum, N };
}

/** Build a ScorableStatement tree for an option/evidence root from its subtree. */
async function buildScorable(rootId: string): Promise<ScorableStatement | null> {
	const db = getFirestore();
	const rootSnap = await db.collection(Collections.statements).doc(rootId).get();
	if (!rootSnap.exists) return null;
	const root = rootSnap.data() as Statement;

	// All descendants carry rootId in their `parents` array.
	const descSnap = await db
		.collection(Collections.statements)
		.where('parents', 'array-contains', rootId)
		.get();
	const all: Statement[] = [root, ...descSnap.docs.map((d) => d.data() as Statement)];

	// Vote tallies for every scored node (option/evidence) in one fan-out.
	const scored = all.filter(
		(s) => s.statementType === StatementType.option || s.statementType === StatementType.evidence,
	);
	const tallies = new Map<string, { sum: number; N: number }>();
	await Promise.all(
		scored.map(async (s) => tallies.set(s.statementId, await voteTally(s.statementId))),
	);

	const byParent = new Map<string, Statement[]>();
	for (const s of all) {
		if (s.dialecticSnapshot) continue; // skip archived snapshots
		if (s.statementId === rootId) continue;
		const list = byParent.get(s.parentId);
		if (list) list.push(s);
		else byParent.set(s.parentId, [s]);
	}

	const toScorable = (s: Statement): ScorableStatement => {
		const t = tallies.get(s.statementId);
		const prior = s.evidenceClass ? taxonomy.lookup(s.evidenceClass) : undefined;

		return {
			id: s.statementId,
			parentId: s.parentId,
			statementType: nodeKind(s.statementType),
			dialecticType: (s.dialecticType as DialecticPolarity) ?? 'standard',
			sum: t?.sum,
			N: t?.N,
			prior,
			confidence: typeof s.evidenceConfidence === 'number' ? s.evidenceConfidence : undefined,
			effectiveWeight: typeof s.effectiveWeight === 'number' ? s.effectiveWeight : undefined,
			children: (byParent.get(s.statementId) ?? []).map(toScorable),
		};
	};

	return toScorable(root);
}

async function recomputeScored(statement: Statement): Promise<number> {
	const scorable = await buildScorable(statement.statementId);
	const c = scorable ? scoreNode(scorable, DEFAULT_CORROBORATION_CONFIG) : 0;
	await getFirestore()
		.collection(Collections.statements)
		.doc(statement.statementId)
		.update({ corroborationScore: c, lastActivityAt: Date.now(), lastUpdate: Date.now() });

	return c;
}

async function recomputeQuestion(question: Statement): Promise<void> {
	const db = getFirestore();
	const optionsSnap = await db
		.collection(Collections.statements)
		.where('parentId', '==', question.statementId)
		.where('statementType', '==', StatementType.option)
		.get();
	const options = optionsSnap.docs.map((d) => d.data() as Statement);
	const aggregates = computeQuestionAggregates(
		options.map((o) => ({
			statementId: o.statementId,
			corroborationScore: o.corroborationScore ?? 0,
		})),
	);
	await db
		.collection(Collections.statements)
		.doc(question.statementId)
		.update({
			optionCount: aggregates.optionCount,
			leadingOptionId: aggregates.leadingOptionId ?? '',
			convergenceIndex: aggregates.convergenceIndex,
			lastActivityAt: Date.now(),
			lastUpdate: Date.now(),
		});
}

/** Fetch the ancestor chain [node, parent, …, root] following parentId. */
async function ancestorChain(statementId: string): Promise<Statement[]> {
	const db = getFirestore();
	const chain: Statement[] = [];
	let currentId: string | undefined = statementId;
	const guard = new Set<string>();
	while (currentId && !guard.has(currentId)) {
		guard.add(currentId);
		const snap = await db.collection(Collections.statements).doc(currentId).get();
		if (!snap.exists) break;
		const s = snap.data() as Statement;
		chain.push(s);
		if (s.isRoot || !s.parentId || s.parentId === 'top' || s.parentId === s.statementId) break;
		currentId = s.parentId;
	}

	return chain;
}

export async function recomputeAncestors(statementId: string): Promise<void> {
	const chain = await ancestorChain(statementId);
	if (chain.length === 0) return;

	// Start at the nearest enclosing option (or the node itself if it is one).
	let startIdx = chain.findIndex(
		(s) => s.statementType === StatementType.option || s.statementType === StatementType.evidence,
	);
	if (startIdx === -1) startIdx = 0;

	for (let i = startIdx; i < chain.length; i++) {
		const node = chain[i];
		if (node.statementType === StatementType.option || node.statementType === StatementType.evidence) {
			await recomputeScored(node);
		} else if (node.statementType === StatementType.question) {
			await recomputeQuestion(node);
		} else {
			await getFirestore()
				.collection(Collections.statements)
				.doc(node.statementId)
				.update({ lastActivityAt: Date.now(), lastUpdate: Date.now() })
				.catch(() => {
					/* best-effort */
				});
		}
	}
}
