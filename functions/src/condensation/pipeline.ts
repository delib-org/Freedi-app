import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import {
	Collections,
	CondensationConfig,
	CondensationLevel,
	createStatementObject,
	Evaluation,
	Statement,
	StatementEvaluation,
	StatementType,
	DeliberativeElement,
	User,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { generateGroupedTitle } from './titleGeneration';
import {
	hashIntegratedOptions,
	ProposedGroup,
	ReconciledGroup,
	reconcileGroups,
} from './reconciler';
import {
	computeClusterEvaluationFromRawEvals,
	fetchEvaluationsForIds,
	recomputeClusterEvaluation,
} from './aggregation';

const db = getFirestore();

// Cosine similarity thresholds for complete-linkage (min-link) clustering.
// A candidate joins a cluster only if its similarity to EVERY existing
// member is >= threshold. Calibrated empirically for `text-embedding-3-small`
// on thematically cohesive short text (Hebrew peace suggestions, English
// civic proposals); raw pair similarities there land in 0.70–0.93 with
// median ~0.85, so we need complete-linkage + threshold ~0.82–0.88 to
// separate themes without transitive collapse.
const THRESHOLDS: Record<CondensationLevel, number> = {
	loose: 0.82, // bigger groups, fewer singletons
	balanced: 0.85, // middle ground
	tight: 0.88, // tighter cohesion, more singletons
};

const DEFAULT_MIN_GROUP_SIZE = 2;
const DEFAULT_MAX_MERGES_PER_RUN = 25;
const RECONCILER_JACCARD = 0.5;

function cosine(a: number[], b: number[]): number {
	const len = Math.min(a.length, b.length);
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < len; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}
	if (na === 0 || nb === 0) return 0;

	return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Firestore stores vector embeddings as a `VectorValue` object (so
 * findNearest queries work), not as a plain array. Accept either shape.
 */
function extractEmbedding(raw: unknown): number[] | null {
	if (!raw) return null;
	if (Array.isArray(raw)) return raw as number[];
	if (typeof raw === 'object' && raw !== null && 'toArray' in raw) {
		const vectorValue = raw as { toArray: () => number[] };
		const arr = vectorValue.toArray();

		return Array.isArray(arr) ? arr : null;
	}

	return null;
}

interface Candidate {
	id: string;
	text: string;
	embedding: number[];
	createdAt: number;
	creatorId: string;
}

interface PipelineResult {
	produced: number;
	updated: number;
	created: number;
	affectedOriginals: Array<{ originalId: string; clusterId: string; authorId: string }>;
	orphanedClusters: string[];
	/** Only populated when the run was a dry-run. Describes what WOULD have
	 *  been written so the admin can preview before committing. */
	preview?: PreviewGroup[];
}

export interface PreviewGroup {
	/** 'create' = new cluster will be created; 'update' = existing cluster
	 *  would have its integratedOptions (and optionally title) updated. */
	kind: 'create' | 'update';
	existingClusterId?: string;
	existingTitle?: string;
	suggestedTitle: string;
	suggestedDescription: string;
	memberIds: string[];
	memberTexts: string[];
	/** Aggregated evaluation the cluster WOULD have once written — same math
	 *  as `recomputeClusterEvaluation` (per-user dedup + averaging across
	 *  member options). Included in dry-runs so the admin can see support
	 *  strength before approving. */
	evaluationSnapshot: StatementEvaluation;
}

export interface PipelineOptions {
	/** When true, no Firestore writes happen. Returns a `preview` array of
	 *  the groups that WOULD have been produced. Gemini is still called for
	 *  title generation so the preview is representative. */
	dryRun?: boolean;
}

/**
 * Complete-linkage (min-link) greedy clustering.
 *
 * We deliberately do NOT use union-find transitive closure or centroid
 * clustering. On thematic short text (e.g., Hebrew peace suggestions),
 * nearly-every pair scores 0.7–0.9 cosine:
 *  - Union-find bridges everything into one giant component.
 *  - Centroid-based lets the centroid drift toward an "average" vector
 *    that attracts everything as a cluster grows.
 *
 * Complete-linkage is strict: a candidate joins a cluster only if its
 * similarity to EVERY existing member is >= threshold. This prevents both
 * transitive bridging and centroid drift — the cluster can't silently
 * expand its semantic footprint over time.
 *
 * Order-dependent but deterministic: candidates are pre-sorted by createdAt.
 * O(n × k × m) per run where n=candidates, k=current clusters, m=avg members.
 * Fine for typical question sizes (<5000 options).
 */
function clusterByCompleteLinkage(
	candidates: Candidate[],
	threshold: number,
): Map<number, number[]> {
	const order = candidates
		.map((c, i) => ({ i, t: c.createdAt }))
		.sort((a, b) => a.t - b.t)
		.map((x) => x.i);

	interface Cluster {
		memberIndices: number[];
	}
	const clusters: Cluster[] = [];

	for (const idx of order) {
		const candEmb = candidates[idx].embedding;
		let bestCluster = -1;
		let bestMinSim = -Infinity;
		for (let c = 0; c < clusters.length; c++) {
			let minSim = Infinity;
			let dead = false;
			for (const memberIdx of clusters[c].memberIndices) {
				const s = cosine(candidates[memberIdx].embedding, candEmb);
				if (s < minSim) minSim = s;
				if (minSim < threshold) {
					// Cannot possibly join this cluster under complete linkage.
					dead = true;
					break;
				}
			}
			if (!dead && minSim > bestMinSim) {
				bestMinSim = minSim;
				bestCluster = c;
			}
		}
		if (bestCluster >= 0 && bestMinSim >= threshold) {
			clusters[bestCluster].memberIndices.push(idx);
		} else {
			clusters.push({ memberIndices: [idx] });
		}
	}

	const components = new Map<number, number[]>();
	for (let i = 0; i < clusters.length; i++) {
		components.set(i, clusters[i].memberIndices);
	}

	return components;
}

/**
 * Non-destructive condensation pipeline.
 *
 * Given a parent question, group semantically similar options (originals)
 * and produce NEW cluster statements (siblings of the originals, NOT their
 * parents). Originals are never reparented, hidden, or modified. Evaluations
 * on originals aggregate into the cluster's evaluation via aggregation.ts.
 */
export async function runCondensationPipeline(
	parentId: string,
	config: CondensationConfig,
	runBy: string,
	options: PipelineOptions = {},
): Promise<PipelineResult> {
	const { dryRun = false } = options;
	const threshold = THRESHOLDS[config.level];
	const minGroupSize = Math.max(2, config.minGroupSize ?? DEFAULT_MIN_GROUP_SIZE);

	// 1. Fetch candidate siblings (originals + existing clusters separately).
	const siblingsSnap = await db
		.collection(Collections.statements)
		.where('parentId', '==', parentId)
		.get();

	const siblings = siblingsSnap.docs.map((d) => d.data() as Statement);
	const originals = siblings.filter(
		(s) =>
			s.isCluster !== true &&
			s.hide !== true &&
			(s.statementType === StatementType.option || s.statementType === StatementType.statement),
	);
	const existingClusters = siblings.filter((s) => s.isCluster === true && s.hide !== true);

	// 1a. Creator overrides — pre-pass. Originals assigned to '__standalone__'
	// are excluded from grouping entirely. Originals assigned to a target
	// cluster ID are forced to end up in the same group, regardless of
	// similarity. Fetched from the parent statement document.
	const parentForOverrides = siblings.find((s) => s.statementId === parentId);
	const overridesRaw = (
		parentForOverrides as unknown as { creatorOverrides?: { assignments?: unknown } }
	)?.creatorOverrides?.assignments;
	const overrideAssignments: Record<string, string> =
		overridesRaw && typeof overridesRaw === 'object'
			? (overridesRaw as Record<string, string>)
			: {};

	const standaloneOverrides = new Set<string>();
	const forcedGroupsByTarget = new Map<string, string[]>();
	for (const [originalId, target] of Object.entries(overrideAssignments)) {
		if (target === '__standalone__') {
			standaloneOverrides.add(originalId);
			continue;
		}
		const bucket = forcedGroupsByTarget.get(target) ?? [];
		bucket.push(originalId);
		forcedGroupsByTarget.set(target, bucket);
	}

	// 2. Candidates = originals with a valid embedding, minus standalones,
	//    and passing the admin-configured eligibility filters (min avg
	//    evaluation + min evaluator count). Creator-forced overrides bypass
	//    the eligibility filters because drag-drop is explicit admin intent.
	//    Embeddings on statements are stored as Firestore VectorValue, not
	//    plain arrays — extractEmbedding() normalizes both shapes.
	const minAverage =
		typeof config.minAverageForClustering === 'number' && config.minAverageForClustering > -1
			? config.minAverageForClustering
			: null;
	const minEvaluators =
		typeof config.minEvaluatorsForClustering === 'number' && config.minEvaluatorsForClustering > 0
			? config.minEvaluatorsForClustering
			: null;
	const isForcedToCluster = new Set<string>();
	for (const [originalId, target] of Object.entries(overrideAssignments)) {
		if (target !== '__standalone__') isForcedToCluster.add(originalId);
	}

	function passesEligibility(s: Statement): boolean {
		if (isForcedToCluster.has(s.statementId)) return true; // admin intent wins
		if (minAverage !== null) {
			const avg = s.evaluation?.averageEvaluation ?? null;
			if (avg === null || avg < minAverage) return false;
		}
		if (minEvaluators !== null) {
			const evals = s.evaluation?.numberOfEvaluators ?? 0;
			if (evals < minEvaluators) return false;
		}

		return true;
	}

	let filteredOutByEligibility = 0;
	const candidates: Candidate[] = originals
		.filter((s) => !standaloneOverrides.has(s.statementId))
		.filter((s) => {
			if (passesEligibility(s)) return true;
			filteredOutByEligibility++;

			return false;
		})
		.map((s) => {
			const embedding = extractEmbedding((s as unknown as { embedding?: unknown }).embedding);

			return embedding
				? {
						id: s.statementId,
						text: s.statement,
						embedding,
						createdAt: s.createdAt,
						creatorId: s.creatorId,
					}
				: null;
		})
		.filter((c): c is Candidate => c !== null);

	if (filteredOutByEligibility > 0) {
		logger.info('condensation.pipeline — eligibility filter applied', {
			parentId,
			filteredOut: filteredOutByEligibility,
			minAverage,
			minEvaluators,
		});
	}

	if (candidates.length < minGroupSize) {
		logger.info('condensation.pipeline skipped — not enough embedded candidates', {
			parentId,
			count: candidates.length,
			minGroupSize,
		});

		return {
			produced: 0,
			updated: 0,
			created: 0,
			affectedOriginals: [],
			orphanedClusters: [],
		};
	}

	// 3. Complete-linkage clustering (see clusterByCompleteLinkage for why).
	let components = clusterByCompleteLinkage(candidates, threshold);

	// 3a. Apply creator-forced groupings. For each target cluster ID that has
	// multiple originals assigned to it, merge all their centroid-components
	// into a single component. For single-member forced assignments we note
	// the target so the reconciler can steer matching later.
	const indexById = new Map<string, number>();
	candidates.forEach((c, i) => indexById.set(c.id, i));
	const componentToForcedTarget = new Map<number, string>();

	for (const [target, ids] of forcedGroupsByTarget.entries()) {
		const memberIdxs = ids
			.map((id) => indexById.get(id))
			.filter((x): x is number => x !== undefined);
		if (memberIdxs.length === 0) continue;

		// Find all components that currently contain any of these members.
		const componentsContainingMembers = new Set<number>();
		for (const [compId, memberList] of components.entries()) {
			if (memberList.some((m) => memberIdxs.includes(m))) {
				componentsContainingMembers.add(compId);
			}
		}

		if (componentsContainingMembers.size <= 1) {
			// Already together (or single forced assignment we can't merge).
			const [firstCompId] = componentsContainingMembers;
			if (firstCompId !== undefined) componentToForcedTarget.set(firstCompId, target);
			continue;
		}

		// Merge all touched components into the first one.
		const compIds = Array.from(componentsContainingMembers);
		const mergeTargetId = compIds[0];
		const merged = components.get(mergeTargetId) ?? [];
		for (let i = 1; i < compIds.length; i++) {
			const toMerge = components.get(compIds[i]) ?? [];
			merged.push(...toMerge);
			components.delete(compIds[i]);
		}
		components.set(mergeTargetId, merged);
		componentToForcedTarget.set(mergeTargetId, target);
	}
	// Keep a reference so TypeScript knows `components` is still used downstream.
	void components;

	const proposed: ProposedGroup[] = [];
	const proposedForcedTarget: Array<string | undefined> = [];
	components.forEach((idxs, root) => {
		if (idxs.length < minGroupSize) return;
		proposed.push({
			sourceIds: idxs.map((i) => candidates[i].id),
		});
		proposedForcedTarget.push(componentToForcedTarget.get(root));
	});

	if (proposed.length === 0) {
		logger.info('condensation.pipeline — no groups met minimum size', {
			parentId,
			candidateCount: candidates.length,
		});

		return {
			produced: 0,
			updated: 0,
			created: 0,
			affectedOriginals: [],
			orphanedClusters: [],
			preview: dryRun ? [] : undefined,
		};
	}

	// 5. Reconcile with existing clusters (Jaccard).
	const reconciled = reconcileGroups(proposed, existingClusters, RECONCILER_JACCARD);

	// 5a. Creator-forced targets win over Jaccard. If a proposed group was
	// forced toward a specific existing cluster ID via creator overrides,
	// upgrade its reconciliation to an `update` against that cluster — even
	// if Jaccard wouldn't have matched on its own. This is how "drag a
	// singleton original into an existing cluster" works end-to-end.
	const existingClusterIds = new Set(existingClusters.map((c) => c.statementId));
	for (let i = 0; i < reconciled.groups.length; i++) {
		const forcedTarget = proposedForcedTarget[i];
		if (!forcedTarget) continue;
		if (!existingClusterIds.has(forcedTarget)) continue; // placeholder → let it create a new cluster
		reconciled.groups[i] = {
			...reconciled.groups[i],
			kind: 'update',
			existingClusterId: forcedTarget,
		};
	}

	// 6. Fetch parent for context (title generation).
	const parentDoc = await db.collection(Collections.statements).doc(parentId).get();
	const parent = parentDoc.exists ? (parentDoc.data() as Statement) : undefined;
	const questionContext = parent?.statement ?? '';

	// 7. Apply each reconciled group, cost-gating Gemini via input-set hash.
	let merges = 0;
	const affectedOriginals: Array<{ originalId: string; clusterId: string; authorId: string }> = [];
	let createdCount = 0;
	let updatedCount = 0;
	const candidatesById = new Map(candidates.map((c) => [c.id, c]));
	const existingClusterById = new Map(existingClusters.map((c) => [c.statementId, c]));
	const preview: PreviewGroup[] = [];

	// Pre-fetch all raw evaluations for candidate originals AND existing
	// clusters in one batch, so both the dry-run preview and the real create/
	// update paths can compute the aggregated cluster evaluation in-memory
	// (no per-group Firestore round-trip).
	const evalSourceIds = [
		...candidates.map((c) => c.id),
		...existingClusters.map((c) => c.statementId),
	];
	const allFetchedEvals = await fetchEvaluationsForIds(evalSourceIds);
	const preloadedEvals = new Map<string, Evaluation[]>();
	for (const e of allFetchedEvals) {
		if (!e.statementId) continue;
		const bucket = preloadedEvals.get(e.statementId);
		if (bucket) {
			bucket.push(e);
		} else {
			preloadedEvals.set(e.statementId, [e]);
		}
	}

	// 7a. Dry-run path: compute titles + preview WITHOUT any Firestore writes.
	// We still call Gemini so the admin sees the titles they'd actually get.
	if (dryRun) {
		for (const group of reconciled.groups) {
			const sourceTexts = group.sourceIds
				.map((id) => candidatesById.get(id)?.text)
				.filter((t): t is string => Boolean(t));
			if (sourceTexts.length === 0) continue;

			let suggestedTitle: string;
			let suggestedDescription: string;
			if (group.kind === 'update' && group.existingClusterId) {
				const existing = existingClusterById.get(group.existingClusterId);
				const prevHash = hashIntegratedOptions(existing?.integratedOptions ?? []);
				const nextHash = hashIntegratedOptions(group.sourceIds);
				const unchanged = prevHash === nextHash;
				if (!unchanged && !existing?.titleLockedByCreator && merges < DEFAULT_MAX_MERGES_PER_RUN) {
					const g = await generateGroupedTitle(sourceTexts, questionContext);
					suggestedTitle = g.title;
					suggestedDescription = g.description;
					merges++;
				} else {
					suggestedTitle = existing?.statement ?? sourceTexts[0];
					suggestedDescription = existing?.description ?? '';
				}
			} else if (merges < DEFAULT_MAX_MERGES_PER_RUN) {
				const g = await generateGroupedTitle(sourceTexts, questionContext);
				suggestedTitle = g.title;
				suggestedDescription = g.description;
				merges++;
			} else {
				suggestedTitle = sourceTexts[0];
				suggestedDescription = sourceTexts.slice(1, 4).join(' · ');
			}

			// Compute the aggregated evaluation this cluster WOULD have — include
			// direct evaluations on the existing cluster (for `update` kind) plus
			// every member's evaluations.
			const evalFetchIds =
				group.kind === 'update' && group.existingClusterId
					? [group.existingClusterId, ...group.sourceIds]
					: group.sourceIds;
			const memberEvals: Evaluation[] = evalFetchIds.flatMap((id) => preloadedEvals.get(id) ?? []);
			const existingClusterEval = group.existingClusterId
				? existingClusterById.get(group.existingClusterId)?.evaluation
				: undefined;
			const { evaluation: evaluationSnapshot } = computeClusterEvaluationFromRawEvals(
				memberEvals,
				{},
				existingClusterEval?.evaluationRandomNumber,
				existingClusterEval?.viewed,
			);

			preview.push({
				kind: group.kind,
				existingClusterId: group.existingClusterId,
				existingTitle:
					group.kind === 'update'
						? existingClusterById.get(group.existingClusterId ?? '')?.statement
						: undefined,
				suggestedTitle,
				suggestedDescription,
				memberIds: group.sourceIds,
				memberTexts: sourceTexts,
				evaluationSnapshot,
			});
		}

		logger.info('condensation.pipeline DRY RUN', {
			parentId,
			candidates: candidates.length,
			preview: preview.length,
		});

		return {
			produced: preview.length,
			created: preview.filter((g) => g.kind === 'create').length,
			updated: preview.filter((g) => g.kind === 'update').length,
			affectedOriginals: [],
			orphanedClusters: reconciled.orphanedClusterIds,
			preview,
		};
	}

	for (const group of reconciled.groups) {
		try {
			const clusterId = await applyGroup({
				parent: parent ?? ({ statementId: parentId } as Statement),
				parentId,
				group,
				candidatesById,
				preloadedEvals,
				questionContext,
				mergesRemaining: DEFAULT_MAX_MERGES_PER_RUN - merges,
				runBy,
			});
			if (clusterId === null) continue;

			if (group.kind === 'create') {
				createdCount++;
				merges++;
			} else {
				updatedCount++;
			}

			// Track affected originals for author notifications.
			for (const sourceId of group.sourceIds) {
				const source = candidates.find((c) => c.id === sourceId);
				if (source) {
					affectedOriginals.push({
						originalId: sourceId,
						clusterId,
						authorId: source.creatorId,
					});
				}
			}

			// Recompute aggregated evaluation for the cluster.
			await recomputeClusterEvaluation(clusterId);
		} catch (error) {
			logError(error, {
				operation: 'condensation.pipeline.applyGroup',
				statementId: parentId,
				metadata: { kind: group.kind },
			});
		}
	}

	logger.info('condensation.pipeline complete', {
		parentId,
		candidates: candidates.length,
		proposed: proposed.length,
		created: createdCount,
		updated: updatedCount,
		orphans: reconciled.orphanedClusterIds.length,
	});

	return {
		produced: createdCount + updatedCount,
		created: createdCount,
		updated: updatedCount,
		affectedOriginals,
		orphanedClusters: reconciled.orphanedClusterIds,
	};
}

interface ApplyGroupArgs {
	parent: Statement;
	parentId: string;
	group: ReconciledGroup;
	candidatesById: Map<string, Candidate>;
	preloadedEvals: Map<string, Evaluation[]>;
	questionContext: string;
	mergesRemaining: number;
	runBy: string;
}

async function applyGroup({
	parent,
	parentId,
	group,
	candidatesById,
	preloadedEvals,
	questionContext,
	mergesRemaining,
	runBy,
}: ApplyGroupArgs): Promise<string | null> {
	const sourceTexts = group.sourceIds
		.map((id) => candidatesById.get(id)?.text)
		.filter((t): t is string => Boolean(t));

	if (group.kind === 'update' && group.existingClusterId) {
		const existingRef = db.collection(Collections.statements).doc(group.existingClusterId);
		const existingDoc = await existingRef.get();
		if (!existingDoc.exists) return null;

		const existing = existingDoc.data() as Statement;
		const prevHash = hashIntegratedOptions(existing.integratedOptions ?? []);
		const nextHash = hashIntegratedOptions(group.sourceIds);
		const unchanged = prevHash === nextHash;

		let title = existing.statement;
		let description = existing.description ?? '';
		if (!unchanged && !existing.titleLockedByCreator && mergesRemaining > 0) {
			const generated = await generateGroupedTitle(sourceTexts, questionContext);
			title = generated.title;
			description = generated.description;
		}

		// Pre-compute aggregated evaluation from the new member set + any
		// direct evaluations on the existing cluster itself, so the cluster's
		// `evaluation` / `consensus` update atomically with its `integratedOptions`.
		const updateEvalIds = [existing.statementId, ...group.sourceIds];
		const updateMemberEvals: Evaluation[] = updateEvalIds.flatMap(
			(id) => preloadedEvals.get(id) ?? [],
		);
		const { evaluation: updatedEvaluation } = computeClusterEvaluationFromRawEvals(
			updateMemberEvals,
			{},
			existing.evaluation?.evaluationRandomNumber,
			existing.evaluation?.viewed,
		);

		await existingRef.update({
			statement: title,
			description,
			integratedOptions: group.sourceIds,
			evaluation: updatedEvaluation,
			consensus: updatedEvaluation.agreement,
			totalEvaluators: updatedEvaluation.numberOfEvaluators,
			lastUpdate: Date.now(),
		});

		return existing.statementId;
	}

	// Create new cluster.
	let title = sourceTexts[0] ?? 'Grouped suggestion';
	let description = sourceTexts.slice(1, 4).join(' · ');
	if (mergesRemaining > 0) {
		const generated = await generateGroupedTitle(sourceTexts, questionContext);
		title = generated.title;
		description = generated.description;
	}

	const creator: User = {
		uid: runBy,
		displayName: 'Condensation',
		email: '',
		photoURL: '',
		isAnonymous: false,
	} as User;

	const created = createStatementObject({
		statement: title,
		statementType: StatementType.option,
		parentId,
		topParentId: parent.topParentId ?? parentId,
		parents: [...(parent.parents ?? []), parentId].filter(Boolean),
		creatorId: runBy,
		creator,
	});

	if (!created) {
		logger.warn('condensation.applyGroup — createStatementObject returned undefined', {
			parentId,
			sourceIds: group.sourceIds,
		});

		return null;
	}

	// Pre-compute aggregated evaluation from member originals' evaluations so
	// the cluster is born with non-zero agreement/consensus/totalEvaluators
	// instead of a momentary zero state.
	const createMemberEvals: Evaluation[] = group.sourceIds.flatMap(
		(id) => preloadedEvals.get(id) ?? [],
	);
	const { evaluation: createdEvaluation } = computeClusterEvaluationFromRawEvals(createMemberEvals);

	const clusterData: Statement = {
		...created,
		description,
		isCluster: true,
		integratedOptions: group.sourceIds,
		evaluation: createdEvaluation,
		consensus: createdEvaluation.agreement,
		totalEvaluators: createdEvaluation.numberOfEvaluators,
	};

	const clusterId = clusterData.statementId;
	void DeliberativeElement; // keep import referenced (intentional for future use)
	await db.collection(Collections.statements).doc(clusterId).set(clusterData);

	// Mark parent's lastChildUpdate so listeners refresh.
	await db
		.collection(Collections.statements)
		.doc(parentId)
		.update({
			lastChildUpdate: Date.now(),
			lastUpdate: Date.now(),
		})
		.catch(() => {
			// best-effort
		});

	return clusterId;
}

/**
 * Mark a parent's condensationStatus. Called before + after a run.
 */
export async function setCondensationStatus(
	parentId: string,
	patch: Partial<{
		lastRunAt: number;
		lastRunBy: string;
		isStale: boolean;
		inputCount: number;
		producedGroupCount: number;
		level: CondensationLevel;
		error: string;
	}>,
): Promise<void> {
	await db
		.collection(Collections.statements)
		.doc(parentId)
		.update({
			condensationStatus: FieldValue ? { ...patch } : patch,
			lastUpdate: Date.now(),
		})
		.catch(() => {
			// best-effort
		});
}
