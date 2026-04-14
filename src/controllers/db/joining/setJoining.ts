import { doc, runTransaction, collection, query, where, getDocs } from 'firebase/firestore';
import { DB } from '../config';
import { Collections, Creator } from '@freedi/shared-types';
import { Statement, StatementType } from '@freedi/shared-types';
import { store } from '@/redux/store';
import { logError } from '@/utils/errorHandling';

export type JoinRole = 'activist' | 'organizer';

export interface ToggleJoiningParams {
	statementId: string;
	parentStatementId?: string;
	/** 'activist' writes to `joined[]` (default, legacy behavior).
	 *  'organizer' writes to `organizers[]` and skips sibling cleanup. */
	role?: JoinRole;
}

export interface ToggleJoiningResult {
	success: boolean;
	leftStatementId?: string;
	leftStatementTitle?: string;
	error?: string;
}

/**
 * Toggle user joining status for a statement (option).
 * - Activists are stored on `statement.joined[]`. When `singleJoinOnly` is
 *   enabled on the parent, the user is removed from other sibling options
 *   before being added.
 * - Organizers are stored on `statement.organizers[]`. They are unbounded
 *   and NOT subject to `singleJoinOnly` / `min`/`maxJoinMembers`.
 */
export async function toggleJoining(params: ToggleJoiningParams): Promise<ToggleJoiningResult> {
	const { statementId, parentStatementId, role = 'activist' } = params;
	const field: 'joined' | 'organizers' = role === 'organizer' ? 'organizers' : 'joined';

	try {
		const creator = store.getState().creator.creator;
		if (!creator) {
			throw new Error('Creator not found in user state');
		}
		if (!statementId) {
			throw new Error('Statement ID is required');
		}

		const statementRef = doc(DB, Collections.statements, statementId);
		let leftStatementId: string | undefined;
		let leftStatementTitle: string | undefined;

		// Sibling-exclusive join logic applies to activists only.
		let singleJoinOnly = false;
		if (role === 'activist' && parentStatementId) {
			const parentDocs = await getDocs(
				query(
					collection(DB, Collections.statements),
					where('statementId', '==', parentStatementId),
				),
			);
			if (!parentDocs.empty) {
				const parentStatement = parentDocs.docs[0].data() as Statement;
				singleJoinOnly = parentStatement?.statementSettings?.singleJoinOnly ?? false;
			}
		}

		await runTransaction(DB, async (transaction) => {
			const statementDB = await transaction.get(statementRef);
			if (!statementDB.exists()) {
				throw new Error('Statement does not exist');
			}
			const statement = statementDB.data() as Statement;
			const otherField: 'joined' | 'organizers' = field === 'joined' ? 'organizers' : 'joined';
			const currentMembers: Creator[] =
				(field === 'organizers' ? statement.organizers : statement.joined) ?? [];
			const currentOthers: Creator[] =
				(otherField === 'organizers' ? statement.organizers : statement.joined) ?? [];

			const isUserMember = currentMembers.some((user) => user.uid === creator.uid);

			if (isUserMember) {
				const updated = currentMembers.filter((user) => user.uid !== creator.uid);
				transaction.update(statementRef, { [field]: updated });

				return;
			}

			// Mutual exclusivity: a user is either activist OR organizer on an
			// option, never both. If they're joining one role while being in the
			// other, remove them from the other atomically in the same write.
			const updatePayload: Record<string, Creator[]> = {};
			const isUserInOther = currentOthers.some((user) => user.uid === creator.uid);
			if (isUserInOther) {
				updatePayload[otherField] = currentOthers.filter((user) => user.uid !== creator.uid);
			}

			// Activist single-join cleanup — organizers skip this branch.
			if (role === 'activist' && singleJoinOnly && parentStatementId) {
				const siblingsQuery = query(
					collection(DB, Collections.statements),
					where('parentId', '==', parentStatementId),
					where('statementType', '==', StatementType.option),
				);
				const siblingsSnapshot = await getDocs(siblingsQuery);

				for (const siblingDoc of siblingsSnapshot.docs) {
					const sibling = siblingDoc.data() as Statement;
					if (sibling.statementId === statementId) continue;

					const isJoinedToSibling = sibling.joined?.find(
						(user: Creator) => user.uid === creator.uid,
					);
					if (isJoinedToSibling) {
						const siblingRef = doc(DB, Collections.statements, sibling.statementId);
						const updatedSiblingJoined =
							sibling.joined?.filter((user: Creator) => user.uid !== creator.uid) ?? [];
						transaction.update(siblingRef, { joined: updatedSiblingJoined });

						leftStatementId = sibling.statementId;
						leftStatementTitle = sibling.statement;
					}
				}
			}

			updatePayload[field] = [...currentMembers, creator];
			transaction.update(statementRef, updatePayload);
		});

		return {
			success: true,
			leftStatementId,
			leftStatementTitle,
		};
	} catch (error) {
		logError(error, {
			operation: 'joining.toggleJoining',
			statementId,
			metadata: { parentStatementId, role },
		});

		return {
			success: false,
			error: error instanceof Error ? error.message : 'Failed to toggle joining',
		};
	}
}
