import { doc, runTransaction, collection, query, where, getDocs } from "firebase/firestore";
import { DB } from "../config";
import { Collections, Creator } from '@freedi/shared-types';
import { Statement, StatementType } from "@freedi/shared-types";
import { store } from "@/redux/store";
import { logError } from "@/utils/errorHandling";

export interface ToggleJoiningParams {
	statementId: string;
	parentStatementId?: string;
}

export interface ToggleJoiningResult {
	success: boolean;
	leftStatementId?: string;
	leftStatementTitle?: string;
	error?: string;
}

/**
 * Toggle user joining status for a statement (option).
 * If singleJoinOnly is enabled on parent, removes user from other sibling options first.
 */
export async function toggleJoining(params: ToggleJoiningParams): Promise<ToggleJoiningResult> {
	const { statementId, parentStatementId } = params;

	try {
		const creator = store.getState().creator.creator;
		if (!creator) {
			throw new Error("Creator not found in user state");
		}
		if (!statementId) {
			throw new Error("Statement ID is required");
		}

		const statementRef = doc(DB, Collections.statements, statementId);
		let leftStatementId: string | undefined;
		let leftStatementTitle: string | undefined;

		// Check if singleJoinOnly is enabled on parent
		let singleJoinOnly = false;
		if (parentStatementId) {
			const parentDocs = await getDocs(query(collection(DB, Collections.statements), where("statementId", "==", parentStatementId)));
			if (!parentDocs.empty) {
				const parentStatement = parentDocs.docs[0].data() as Statement;
				singleJoinOnly = parentStatement?.statementSettings?.singleJoinOnly ?? false;
			}
		}

		await runTransaction(DB, async (transaction) => {
			// Read the target statement
			const statementDB = await transaction.get(statementRef);
			if (!statementDB.exists()) {
				throw new Error("Statement does not exist");
			}
			const statement = statementDB.data() as Statement;

			const isUserJoined = statement.joined?.find((user: Creator) => user.uid === creator.uid) ? true : false;

			// If user is already joined, they want to leave
			if (isUserJoined) {
				const updatedJoined = statement.joined?.filter((user: Creator) => user.uid !== creator.uid) ?? [];
				transaction.update(statementRef, { joined: updatedJoined });

				return;
			}

			// User wants to join
			// If singleJoinOnly is enabled, find and remove user from other sibling options
			if (singleJoinOnly && parentStatementId) {
				// Query sibling options (same parent, type option, excluding current)
				const siblingsQuery = query(
					collection(DB, Collections.statements),
					where("parentId", "==", parentStatementId),
					where("statementType", "==", StatementType.option)
				);
				const siblingsSnapshot = await getDocs(siblingsQuery);

				for (const siblingDoc of siblingsSnapshot.docs) {
					const sibling = siblingDoc.data() as Statement;
					if (sibling.statementId === statementId) continue;

					// Check if user is joined to this sibling
					const isJoinedToSibling = sibling.joined?.find((user: Creator) => user.uid === creator.uid);
					if (isJoinedToSibling) {
						// Remove user from this sibling
						const siblingRef = doc(DB, Collections.statements, sibling.statementId);
						const updatedSiblingJoined = sibling.joined?.filter((user: Creator) => user.uid !== creator.uid) ?? [];
						transaction.update(siblingRef, { joined: updatedSiblingJoined });

						// Track which statement user left
						leftStatementId = sibling.statementId;
						leftStatementTitle = sibling.statement;
					}
				}
			}

			// Add user to the target statement
			const updatedJoined = [...(statement.joined ?? []), creator];
			transaction.update(statementRef, { joined: updatedJoined });
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
			metadata: { parentStatementId },
		});

		return {
			success: false,
			error: error instanceof Error ? error.message : 'Failed to toggle joining',
		};
	}
}
