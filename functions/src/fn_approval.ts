import { Change, logger } from 'firebase-functions/v1';
import { db } from '.';
import { Collections, Statement, DocumentApproval, ApprovalSchema } from '@freedi/shared-types';
import { number, parse } from 'valibot';
import { DocumentSnapshot } from 'firebase-admin/firestore';
import { FirestoreEvent } from 'firebase-functions/firestore';
import { logError } from './utils/errorHandling';

export async function updateApprovalResults(
	event: FirestoreEvent<
		Change<DocumentSnapshot> | undefined,
		{
			approvalId: string;
		}
	>,
) {
	if (!event.data) return;

	try {
		const action: Action | undefined = getAction(event);

		if (!action) throw new Error('No action found');

		// Only parse data that exists for the given action
		const afterData = event.data.after.data();
		const beforeData = event.data.before.data();

		const approveAfterData = afterData ? parse(ApprovalSchema, afterData) : undefined;
		const approveBeforeData = beforeData ? parse(ApprovalSchema, beforeData) : undefined;

		const eventData = approveAfterData || approveBeforeData;

		if (!eventData) throw new Error('No event data found');

		const { statementId, documentId, userId } = eventData;

		let approvedDiff = 0;
		let approvingUserDiff = 0;

		if (action === Action.create && approveAfterData) {
			const { approval } = approveAfterData;
			approvingUserDiff = 1;
			approvedDiff = approval ? 1 : 0;
		} else if (action === Action.delete && approveBeforeData) {
			const { approval } = approveBeforeData;
			approvingUserDiff = -1;
			approvedDiff = approval ? -1 : 0;
		} else if (action === Action.update && approveAfterData && approveBeforeData) {
			const { approval: approvalAfter } = approveAfterData;
			const { approval: approvalBefore } = approveBeforeData;

			approvedDiff = (() => {
				if (!approvalBefore && approvalAfter) {
					return 1;
				} else if (approvalBefore && !approvalAfter) {
					return -1;
				}

				return 0;
			})();
		}

		//update paragraph
		db.runTransaction(async (transaction) => {
			try {
				const statementRef = db.collection(Collections.statements).doc(statementId);
				const statementDB = await transaction.get(statementRef);
				const { documentApproval } = statementDB.data() as Statement;

				if (!documentApproval) {
					const averageApproval = getAverageApproval(
						approvingUserDiff !== 0 ? approvedDiff / approvingUserDiff : 0,
					);
					const newApprovalResults = {
						approved: approvedDiff,
						totalVoters: approvingUserDiff,
						averageApproval,
					};

					transaction.set(statementRef, { documentApproval: newApprovalResults }, { merge: true });

					return;
				}

				const newApproved = documentApproval.approved + approvedDiff;
				const totalVoters = documentApproval.totalVoters + approvingUserDiff;

				const averageApproval = getAverageApproval(
					totalVoters !== 0 ? newApproved / totalVoters : 0,
				);
				const newApprovalResults = {
					approved: newApproved,
					totalVoters,
					averageApproval,
				};

				transaction.set(statementRef, { documentApproval: newApprovalResults }, { merge: true });

				return;
			} catch (error) {
				logger.error(error);

				return;
			}
		});

		function getAverageApproval(averageApproval: number): number {
			try {
				return parse(number(), averageApproval);
			} catch (error) {
				logError(error, { operation: 'approval.getAverageApproval' });

				return 0;
			}
		}

		//update document
		db.runTransaction(async (transaction) => {
			try {
				const statementRef = db.collection(Collections.statements).doc(documentId);
				const statementDB = await transaction.get(statementRef);
				const { documentApproval } = statementDB.data() as Statement;

				const userApprovalsDB = await db
					.collection(Collections.approval)
					.where('documentId', '==', documentId)
					.where('userId', '==', userId)
					.get();
				const numberOfUserApprovals = userApprovalsDB.size;
				const addUser = numberOfUserApprovals === 1 && action === 'create' ? 1 : 0;

				/**
				 * Represents the results of a document approval.
				 */
				let newApprovalResults: DocumentApproval = {
					approved: approvedDiff,
					totalVoters: addUser,
					averageApproval: approvedDiff,
				};

				if (documentApproval) {
					const newApproved = documentApproval.approved + approvedDiff;
					const newTotalVoters = documentApproval.totalVoters + addUser;

					const averageApproval = getAverageApproval(
						newTotalVoters !== 0 ? newApproved / newTotalVoters : 0,
					);
					newApprovalResults = {
						approved: newApproved,
						totalVoters: newTotalVoters,
						averageApproval,
					};
				}

				transaction.update(statementRef, {
					documentApproval: newApprovalResults,
				});

				return;
			} catch (error) {
				logger.error(error);
			}
		});
	} catch (error) {
		logger.error(error);
	}
}

export enum Action {
	create = 'create',
	delete = 'delete',
	update = 'update',
}

export function getAction(
	event: FirestoreEvent<
		Change<DocumentSnapshot> | undefined,
		{
			approvalId: string;
		}
	>,
): Action | undefined {
	if (!event.data) return;

	try {
		if (!event.data.after && !event.data.before) throw new Error('No data before or after');

		if (event.data.after.data() && event.data.before.data()) {
			return Action.update;
		} else if (event.data.after.data() && event.data.before.data() === undefined) {
			return Action.create;
		} else if (event.data.after.data() === undefined && event.data.before.data()) {
			return Action.delete;
		}

		return Action.update;
	} catch (error) {
		logger.error(error);

		return undefined;
	}
}
