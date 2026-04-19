import { deleteDoc, setDoc, updateDoc } from 'firebase/firestore';
import { Statement } from '@freedi/shared-types';
import { createStatementRef } from '@/utils/firebaseUtils';
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
	const { parentStatement, sourceClusterId, memberIdsToSplit, sourceIntegratedOptions, currentAssignments } = args;

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
