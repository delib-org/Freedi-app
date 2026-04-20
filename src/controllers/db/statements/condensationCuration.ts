import {
	Collections,
	createStatementObject,
	Statement,
	StatementType,
	User,
} from '@freedi/shared-types';
import {
	collection,
	deleteDoc,
	getDocs,
	query,
	setDoc,
	updateDoc,
	where,
	writeBatch,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { createStatementRef } from '@/utils/firebaseUtils';
import { FireStore, functions } from '@/controllers/db/config';
import { logError } from '@/utils/errorHandling';
import { getCurrentTimestamp } from '@/utils/firebaseUtils';

/**
 * Curation controller — Firestore writes for the grouped suggestions
 * curation page. These actions mutate cluster statements and the parent
 * question's `creatorOverrides` map; they never modify originals.
 *
 * The pipeline honors `creatorOverrides.assignments` on re-run:
 *   originalId → clusterId   : forces this original into that cluster
 *   originalId → '__standalone__' : excludes it from grouping entirely
 */

const STANDALONE = '__standalone__' as const;
export const STANDALONE_OVERRIDE = STANDALONE;

/**
 * Batch-delete all cluster-evaluation provenance links for a given cluster.
 * Called on ungroup (and should be called anywhere else a cluster statement
 * is deleted from the client).
 */
async function deleteClusterEvaluationLinks(clusterId: string): Promise<void> {
	try {
		const linksRef = collection(FireStore, Collections.clusterEvaluationLinks);
		const q = query(linksRef, where('clusterId', '==', clusterId));
		const snap = await getDocs(q);
		if (snap.empty) return;
		const BATCH_CAP = 400;
		for (let i = 0; i < snap.docs.length; i += BATCH_CAP) {
			const chunk = snap.docs.slice(i, i + BATCH_CAP);
			const batch = writeBatch(FireStore);
			chunk.forEach((d) => batch.delete(d.ref));
			await batch.commit();
		}
	} catch (error) {
		logError(error, {
			operation: 'condensationCuration.deleteClusterEvaluationLinks',
			statementId: clusterId,
		});
	}
}

interface SetGroupOverrideArgs {
	parentStatementId: string;
	originalId: string;
	/** clusterId to force, '__standalone__' to exclude, or null to remove override */
	targetClusterId: string | typeof STANDALONE | null;
	currentAssignments: Record<string, string>;
}

export async function setGroupOverride({
	parentStatementId,
	originalId,
	targetClusterId,
	currentAssignments,
}: SetGroupOverrideArgs): Promise<void> {
	try {
		const next: Record<string, string> = { ...currentAssignments };
		if (targetClusterId === null) {
			delete next[originalId];
		} else {
			next[originalId] = targetClusterId;
		}

		await setDoc(
			createStatementRef(parentStatementId),
			{
				creatorOverrides: {
					assignments: next,
					updatedAt: getCurrentTimestamp(),
				},
				lastUpdate: getCurrentTimestamp(),
			},
			{ merge: true },
		);
	} catch (error) {
		logError(error, {
			operation: 'condensationCuration.setGroupOverride',
			statementId: parentStatementId,
			metadata: { originalId, targetClusterId: targetClusterId ?? 'null' },
		});
		throw error;
	}
}

/**
 * Move an original from one cluster to another. Convenience wrapper over
 * `setGroupOverride` that mirrors the drag-and-drop action.
 */
export async function moveOriginalToCluster(args: {
	parentStatementId: string;
	originalId: string;
	targetClusterId: string | typeof STANDALONE;
	currentAssignments: Record<string, string>;
}): Promise<void> {
	await setGroupOverride({ ...args, targetClusterId: args.targetClusterId });
}

interface UpdateClusterTitleArgs {
	clusterId: string;
	statement: string;
	description?: string;
	/** If true, future pipeline runs will NOT regenerate the AI title. */
	lockTitle?: boolean;
}

export async function updateClusterTitle({
	clusterId,
	statement,
	description,
	lockTitle,
}: UpdateClusterTitleArgs): Promise<void> {
	try {
		const patch: Record<string, unknown> = {
			statement,
			lastUpdate: getCurrentTimestamp(),
		};
		if (description !== undefined) patch.description = description;
		if (lockTitle !== undefined) patch.titleLockedByCreator = lockTitle;

		await updateDoc(createStatementRef(clusterId), patch);
	} catch (error) {
		logError(error, {
			operation: 'condensationCuration.updateClusterTitle',
			statementId: clusterId,
		});
		throw error;
	}
}

export async function toggleTitleLock(clusterId: string, locked: boolean): Promise<void> {
	try {
		await updateDoc(createStatementRef(clusterId), {
			titleLockedByCreator: locked,
			lastUpdate: getCurrentTimestamp(),
		});
	} catch (error) {
		logError(error, {
			operation: 'condensationCuration.toggleTitleLock',
			statementId: clusterId,
		});
		throw error;
	}
}

/**
 * Clear the title lock so the next pipeline run regenerates the AI title
 * for this cluster. Does not trigger a run by itself.
 */
export async function resetTitleToAI(clusterId: string): Promise<void> {
	await toggleTitleLock(clusterId, false);
}

/**
 * Delete a cluster statement. Originals are left untouched — they will
 * simply reappear as ungrouped peer options in the main list. If the
 * creator had forced overrides pointing at this cluster, they should also
 * be cleared (caller's responsibility via `clearOverridesForCluster`).
 */
export async function ungroupCluster(args: {
	parentStatementId: string;
	clusterId: string;
	currentAssignments: Record<string, string>;
}): Promise<void> {
	try {
		// Cascade: delete all provenance link docs for this cluster BEFORE
		// the cluster statement is deleted (so the server-side trigger can't
		// fire an aggregator against a phantom state).
		await deleteClusterEvaluationLinks(args.clusterId);

		await deleteDoc(createStatementRef(args.clusterId));

		// Drop any overrides that pointed at the now-deleted cluster.
		const next: Record<string, string> = {};
		for (const [originalId, clusterId] of Object.entries(args.currentAssignments)) {
			if (clusterId !== args.clusterId) next[originalId] = clusterId;
		}

		await setDoc(
			createStatementRef(args.parentStatementId),
			{
				creatorOverrides: {
					assignments: next,
					updatedAt: getCurrentTimestamp(),
				},
				lastUpdate: getCurrentTimestamp(),
			},
			{ merge: true },
		);
	} catch (error) {
		logError(error, {
			operation: 'condensationCuration.ungroupCluster',
			statementId: args.clusterId,
			metadata: { parentStatementId: args.parentStatementId },
		});
		throw error;
	}
}

/**
 * Client-side throttle: one suggestion call per cluster per 3s. Prevents
 * accidental spam (cost + latency) if the admin repeatedly clicks the
 * "Suggest better title" button. Server-side rate limits are separate.
 */
const THROTTLE_WINDOW_MS = 3000;
const lastCallPerCluster = new Map<string, number>();

interface TitleSuggestion {
	title: string;
	description: string;
}

/**
 * Ask the Cloud Function to produce a fresh AI title suggestion for the
 * given cluster based on its current members. Returns the suggestion; does
 * NOT mutate Firestore — the admin must explicitly accept via
 * `updateClusterTitle` with `lockTitle: true`.
 *
 * Supports cancellation: pass an AbortSignal; the in-flight call is ignored
 * on the caller's side if the signal fires (the Cloud Function still runs
 * to completion, but its result is discarded).
 */
export async function suggestClusterTitle(
	clusterId: string,
	signal?: AbortSignal,
): Promise<TitleSuggestion> {
	const now = Date.now();
	const last = lastCallPerCluster.get(clusterId) ?? 0;
	if (now - last < THROTTLE_WINDOW_MS) {
		throw new Error('throttled');
	}
	lastCallPerCluster.set(clusterId, now);

	try {
		const callable = httpsCallable<
			{ clusterId: string },
			{ ok: boolean; title: string; description: string }
		>(functions, 'suggestClusterTitle');
		const result = await callable({ clusterId });
		if (signal?.aborted) {
			throw new DOMException('Aborted', 'AbortError');
		}

		return {
			title: result.data.title ?? '',
			description: result.data.description ?? '',
		};
	} catch (error) {
		if (signal?.aborted) throw error;
		logError(error, {
			operation: 'condensationCuration.suggestClusterTitle',
			statementId: clusterId,
		});
		throw error;
	}
}

/**
 * Create a new empty cluster statement under the parent question. The
 * creator can then drag originals into it from the curation page. Title is
 * locked by default since the admin authored it — the AI pipeline won't
 * regenerate it on the next run.
 *
 * Returns the new cluster's statementId so the caller can select it.
 */
export async function createEmptyCluster(args: {
	parentStatement: Statement;
	title: string;
	creator: User;
}): Promise<string> {
	const trimmed = args.title.trim();
	if (!trimmed) throw new Error('Title is required');
	if (trimmed.length > 120) {
		throw new Error('Title exceeds 120 characters');
	}

	try {
		const created = createStatementObject({
			statement: trimmed,
			statementType: StatementType.option,
			parentId: args.parentStatement.statementId,
			topParentId: args.parentStatement.topParentId ?? args.parentStatement.statementId,
			parents: [...(args.parentStatement.parents ?? []), args.parentStatement.statementId].filter(
				Boolean,
			),
			creatorId: args.creator.uid,
			creator: args.creator,
		});

		if (!created) throw new Error('Failed to build cluster statement');

		const clusterStatement: Statement = {
			...created,
			isCluster: true,
			integratedOptions: [],
			titleLockedByCreator: true,
		};

		await setDoc(createStatementRef(clusterStatement.statementId), clusterStatement);

		// Nudge the parent's lastChildUpdate so listeners notice.
		await updateDoc(createStatementRef(args.parentStatement.statementId), {
			lastChildUpdate: getCurrentTimestamp(),
			lastUpdate: getCurrentTimestamp(),
		}).catch(() => {
			// best-effort
		});

		return clusterStatement.statementId;
	} catch (error) {
		logError(error, {
			operation: 'condensationCuration.createEmptyCluster',
			statementId: args.parentStatement.statementId,
		});
		throw error;
	}
}

/**
 * Split members out of an existing cluster into a fresh new cluster. The
 * new cluster starts empty (no AI title yet); the next pipeline run will
 * materialize it. Until then, the creator sees it labeled with a placeholder
 * title derived from the first member.
 *
 * Implementation: updates the source cluster's `integratedOptions` (removing
 * the moved members) and sets creatorOverrides entries routing the moved
 * members to a new placeholder cluster ID. A pipeline run will then
 * honor those overrides, creating a proper cluster statement for them.
 */
export async function splitGroupMembers(args: {
	parentStatement: Statement;
	sourceClusterId: string;
	memberIdsToSplit: string[];
	sourceIntegratedOptions: string[];
	currentAssignments: Record<string, string>;
}): Promise<{ newClusterPlaceholder: string }> {
	const {
		parentStatement,
		sourceClusterId,
		memberIdsToSplit,
		sourceIntegratedOptions,
		currentAssignments,
	} = args;

	if (memberIdsToSplit.length < 2) {
		throw new Error('Split requires at least two members');
	}

	const placeholder = `split-${sourceClusterId.slice(0, 8)}-${Date.now()}`;

	try {
		// Shrink the source cluster.
		const remaining = sourceIntegratedOptions.filter((id) => !memberIdsToSplit.includes(id));
		await updateDoc(createStatementRef(sourceClusterId), {
			integratedOptions: remaining,
			lastUpdate: getCurrentTimestamp(),
		});

		// Force the split members into a new placeholder cluster on the next run.
		const nextAssignments = { ...currentAssignments };
		for (const id of memberIdsToSplit) {
			nextAssignments[id] = placeholder;
		}

		await setDoc(
			createStatementRef(parentStatement.statementId),
			{
				creatorOverrides: {
					assignments: nextAssignments,
					updatedAt: getCurrentTimestamp(),
				},
				lastUpdate: getCurrentTimestamp(),
			},
			{ merge: true },
		);

		return { newClusterPlaceholder: placeholder };
	} catch (error) {
		logError(error, {
			operation: 'condensationCuration.splitGroupMembers',
			statementId: sourceClusterId,
			metadata: { memberIdsToSplit },
		});
		throw error;
	}
}
