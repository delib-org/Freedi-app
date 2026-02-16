import { db } from '.';
import { logger, Request, Response } from 'firebase-functions/v1';
import { Collections, MassConsensusMember, Statement, StatementType } from '@freedi/shared-types';
import { FieldValue, DocumentSnapshot } from 'firebase-admin/firestore';
import type { FirestoreEvent, Change } from 'firebase-functions/v2/firestore';

export const getInitialMCData = async (req: Request, res: Response) => {
	try {
		const statementId = req.query.statementId as string;

		if (!statementId?.trim()) {
			res.status(400).send({
				error: 'statementId is required',
				ok: false,
			});
			logger.error('statementId is required', { statementId });

			return;
		}

		const statementDB = await db.collection(Collections.statements).doc(statementId).get();

		const statement = statementDB.data();
		if (!statement) {
			res.status(400).send({ error: 'statement not found', ok: false });
			logger.error('Statement not found', { statementId });

			return;
		}

		res.send({ statement, ok: true });
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		res.status(500).send({ error: errorMessage, ok: false });
		logger.error(errorMessage, { statementId: req.query.statementId });

		return;
	}
};

export const addMassConsensusMember = async (req: Request, res: Response) => {
	try {
		const { statementId, lastUpdate, email, creator }: MassConsensusMember = req.body;

		if (!statementId?.trim() || !email?.trim() || !lastUpdate || !creator) {
			res.status(400).send({ error: 'Missing required fields', ok: false });

			return;
		}

		const newMember: MassConsensusMember = {
			statementId,
			lastUpdate,
			email,
			creator,
		};
		await db.collection(Collections.massConsensusMembers).doc(creator.uid).set(newMember);

		res.send({ message: 'Member added successfully', ok: true });
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		console.error(error);
		res.status(500).send({ error: errorMessage, ok: false });
	}
};

export async function addOptionToMassConsensus(ev: FirestoreEvent<DocumentSnapshot>) {
	try {
		const newStatement = (ev.data?.data() as Statement) || undefined;
		if (!newStatement) return;
		if (newStatement.statementType !== StatementType.option) return;

		const parentRef = db.collection(Collections.statements).doc(newStatement.parentId);

		await db.runTransaction(async (transaction) => {
			const parentDoc = await transaction.get(parentRef);
			if (!parentDoc.exists) {
				throw new Error('Parent statement does not exist');
			}

			const parentData = parentDoc.data();
			if (parentData && parentData.suggestions !== undefined) {
				transaction.update(parentRef, {
					suggestions: FieldValue.increment(1),
				});
			} else {
				transaction.update(parentRef, {
					suggestions: 1,
				});
			}
		});
	} catch (error) {
		console.error(error);

		return;
	}
}

export async function removeOptionFromMassConsensus(ev: FirestoreEvent<DocumentSnapshot>) {
	try {
		const deletedStatement = (ev.data?.data() as Statement) || undefined;
		if (!deletedStatement) return;
		if (deletedStatement.statementType !== StatementType.option) return;

		const parentRef = db.collection(Collections.statements).doc(deletedStatement.parentId);

		await db.runTransaction(async (transaction) => {
			const parentDoc = await transaction.get(parentRef);
			if (!parentDoc.exists) {
				throw new Error('Parent statement does not exist');
			}

			const parentData = parentDoc.data();
			if (parentData && parentData.suggestions !== undefined && parentData.suggestions > 0) {
				transaction.update(parentRef, {
					suggestions: FieldValue.increment(-1),
				});
			}
		});
	} catch (error) {
		console.error(error);

		return;
	}
}

export async function updateOptionInMassConsensus(event: FirestoreEvent<Change<DocumentSnapshot>>) {
	try {
		const beforeData = (event.data.before?.data() as Statement) || undefined;
		const afterData = (event.data.after?.data() as Statement) || undefined;

		if (!beforeData || !afterData) return;

		// Only process if this is an option
		if (afterData.statementType !== StatementType.option) {
			logger.info('Not an option statement, skipping mass consensus update');

			return;
		}

		// Skip if only metadata fields changed (not statementType)
		const relevantFieldsChanged = beforeData.statementType !== afterData.statementType;

		if (!relevantFieldsChanged) {
			// Check if this is just a metadata update from other functions
			const metadataOnlyUpdate =
				(beforeData.lastUpdate !== afterData.lastUpdate ||
					beforeData.lastChildUpdate !== afterData.lastChildUpdate ||
					JSON.stringify(beforeData.lastSubStatements) !==
						JSON.stringify(afterData.lastSubStatements)) &&
				beforeData.statement === afterData.statement;

			if (metadataOnlyUpdate) {
				logger.info('Only metadata changed for option, skipping mass consensus update');

				return;
			}

			logger.info('No relevant changes for mass consensus, skipping update');

			return;
		}

		const parentRef = db.collection(Collections.statements).doc(afterData.parentId);

		await db.runTransaction(async (transaction) => {
			const parentDoc = await transaction.get(parentRef);
			if (!parentDoc.exists) {
				throw new Error('Parent statement does not exist');
			}

			const parentData = parentDoc.data();

			if (
				beforeData.statementType !== StatementType.option &&
				afterData.statementType === StatementType.option
			) {
				// Increment suggestions count
				if (parentData && parentData.suggestions !== undefined) {
					transaction.update(parentRef, {
						suggestions: FieldValue.increment(1),
					});
				} else {
					transaction.update(parentRef, {
						suggestions: 1,
					});
				}
			} else if (
				beforeData.statementType === StatementType.option &&
				afterData.statementType !== StatementType.option
			) {
				// Decrement suggestions count
				if (parentData && parentData.suggestions !== undefined && parentData.suggestions > 0) {
					transaction.update(parentRef, {
						suggestions: FieldValue.increment(-1),
					});
				}
			}
		});
	} catch (error) {
		console.error(error);

		return;
	}
}

export async function addMemberToMassConsensus(ev: FirestoreEvent<DocumentSnapshot>) {
	try {
		if (!ev.data.data()) return;
		const newMember = ev.data.data() as MassConsensusMember;
		if (!newMember) return;
		const statementRef = db.collection(Collections.statements).doc(newMember.statementId);

		await db.runTransaction(async (transaction) => {
			const statementDoc = await transaction.get(statementRef);
			if (!statementDoc.exists) {
				throw new Error('Statement does not exist');
			}

			const statementData = statementDoc.data() as Statement;
			if (statementData?.massMembers !== undefined) {
				transaction.update(statementRef, {
					massMembers: FieldValue.increment(1),
				});
			} else {
				transaction.update(statementRef, {
					massMembers: 1,
				});
			}
		});
	} catch (error) {
		console.error(error);

		return;
	}
}
