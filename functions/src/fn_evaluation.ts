import { Change, logger } from 'firebase-functions/v1';
import { db } from './index';
import {
	DocumentSnapshot,
	FieldValue,
	getFirestore,
} from 'firebase-admin/firestore';
import { FirestoreEvent } from 'firebase-functions/firestore';
import {
	Evaluation,
	Statement,
	StatementSchema,
	Collections,
	StatementType,
	statementToSimpleStatement,
	User,
	ResultsSettings,
	ResultsBy,
	CutoffBy,
} from 'delib-npm';

import { number, parse } from 'valibot';

enum ActionTypes {
	new = 'new',
	update = 'update',
	delete = 'delete',
}

//@ts-ignore
export async function newEvaluation(event) {
	try {
		//add evaluator to statement

		const statementEvaluation = event.data.data() as Evaluation;
		const { statementId } = statementEvaluation;
		if (!statementId) throw new Error('statementId is not defined');

		//add one evaluator to statement, and add evaluation to statement
		const statement = await updateStatementEvaluation({
			statementId,
			evaluationDiff: statementEvaluation.evaluation,
			addEvaluator: 1,
			action: ActionTypes.new,
			newEvaluation: statementEvaluation.evaluation,
			oldEvaluation: 0,
		});
		if (!statement) throw new Error('statement does not exist');
		updateParentStatementWithChosenOptions(statement.parentId);

		//update evaluators that the statement was evaluated
		const evaluator: User | undefined = statementEvaluation.evaluator;

		if (!evaluator) throw new Error('evaluator is not defined');

		return;
	} catch (error) {
		logger.error(error);

		return;
	}
}

//@ts-ignore
export async function deleteEvaluation(event) {
	try {
		//add evaluator to statement
		const statementEvaluation = event.data.data() as Evaluation;
		const { statementId, evaluation } = statementEvaluation;
		if (!statementId) throw new Error('statementId is not defined');

		//add one evaluator to statement
		const statement = await updateStatementEvaluation({
			statementId,
			evaluationDiff: -1 * evaluation,
			addEvaluator: -1,
			action: ActionTypes.delete,
			newEvaluation: 0,
			oldEvaluation: evaluation,
		});
		if (!statement) throw new Error('statement does not exist');
		updateParentStatementWithChosenOptions(statement.parentId);
	} catch (error) {
		logger.error(error);
	}
}

//update evaluation of a statement
//@ts-ignore
export async function updateEvaluation(event) {
	try {
		const statementEvaluationBefore =
			event.data.before.data() as Evaluation;
		const { evaluation: evaluationBefore } = statementEvaluationBefore;
		const statementEvaluationAfter = event.data.after.data() as Evaluation;
		const { evaluation: evaluationAfter, statementId } =
			statementEvaluationAfter;
		const evaluationDiff = evaluationAfter - evaluationBefore;

		if (!statementId) throw new Error('statementId is not defined');

		//get statement
		const statement = await updateStatementEvaluation({
			statementId,
			evaluationDiff,
			action: ActionTypes.update,
			newEvaluation: evaluationAfter,
			oldEvaluation: evaluationBefore,
		});
		if (!statement) throw new Error('statement does not exist');

		//update parent statement?
		updateParentStatementWithChosenOptions(statement.parentId);
	} catch (error) {
		console.info('error in updateEvaluation');
		logger.error(error);

		return;
	}
}

//inner functions

function calcAgreement(
	newSumEvaluations: number,
	numberOfEvaluators: number
): number {
	/**
	 * Consensus Calculation Formula
	 * ============================
	 * Formula: Agreement = (sumOption/nOption) * sqrt(nTotal)
	 *
	 * Purpose:
	 * This formula is designed to find the most agreed-upon option in a system where:
	 * - There are infinite possible options
	 * - Each option can be evaluated on a scale from -1 to +1
	 * - We need to balance between average rating and participation level
	 *
	 * Components:
	 * -----------
	 * 1. Average Rating: (sumOption/nOption)
	 *    - sumOption: Sum of all evaluations for this specific option
	 *    - nOption: Number of evaluators for this specific option
	 *    - Provides a score between -1 (complete disagreement) to +1 (complete agreement)
	 *
	 * 2. Participation Weight: sqrt(nTotal)
	 *    - nTotal: Total number of evaluators across ALL options
	 *    - Using square root provides balanced weighting:
	 *      - Gives more weight to options with broader participation
	 *      - Prevents overshadowing new options with few evaluations
	 *
	 * Why This Works:
	 * --------------
	 * - Balances quality (average rating) with quantity (participation)
	 * - Prevents small groups from dominating with extreme ratings
	 * - Gives new options a fair chance while still rewarding broad consensus
	 * - Allows fair comparison between:
	 *   - Popular options with many evaluations
	 *   - Niche options with few but positive evaluations
	 *   - New options that haven't been heavily evaluated yet
	 *
	 * Example Scenarios:
	 * -----------------
	 * Option A: 100 people rated +0.5 average
	 * Option B: 2 people rated +1 average
	 * Option C: 50 people rated +0.7 average
	 *
	 * The formula will balance these factors to find true consensus rather than
	 * just highest average or most votes.
	 */
	try {
		parse(number(), newSumEvaluations);
		parse(number(), numberOfEvaluators);

		if (numberOfEvaluators === 0) numberOfEvaluators = 1;

		const averageEvaluation = newSumEvaluations / numberOfEvaluators;
		const agreement = averageEvaluation * Math.sqrt(numberOfEvaluators);
		// divide by the number of question members to get a scale of 100% agreement

		return agreement;
	} catch (error) {
		logger.error(error);

		return 0;
	}
}

interface UpdateStatementEvaluationProps {
	statementId: string;
	evaluationDiff: number;
	addEvaluator?: number;
	action: ActionTypes;
	newEvaluation: number;
	oldEvaluation: number;
}
async function updateStatementEvaluation({
	statementId,
	evaluationDiff,
	addEvaluator = 0,
	action,
	newEvaluation,
	oldEvaluation,
}: UpdateStatementEvaluationProps): Promise<Statement | undefined> {
	try {
		if (!statementId) throw new Error('statementId is not defined');
		parse(number(), evaluationDiff);

		const proConDiff = calcDiffEvaluation({
			newEvaluation,
			oldEvaluation,
			action,
		});

		return await db.runTransaction(async (transaction) => {
			const statementRef = db
				.collection(Collections.statements)
				.doc(statementId);
			const statementDB = await transaction.get(statementRef);
			const statement = parse(StatementSchema, statementDB.data());

			const evaluation = statement.evaluation || {
				agreement: statement.consensus || 0,
				sumEvaluations: evaluationDiff,
				numberOfEvaluators: statement.totalEvaluators || 1,
				sumPro: proConDiff.proDiff,
				sumCon: proConDiff.conDiff,
			};

			if (statement.evaluation) {
				evaluation.sumEvaluations += evaluationDiff;
				evaluation.numberOfEvaluators += addEvaluator;
				evaluation.sumPro =
					(evaluation.sumPro || 0) + proConDiff.proDiff;
				evaluation.sumCon =
					(evaluation.sumCon || 0) + proConDiff.conDiff;
			}

			const agreement = calcAgreement(
				evaluation.sumEvaluations,
				evaluation.numberOfEvaluators
			);

			evaluation.agreement = agreement;

			transaction.update(statementRef, {
				totalEvaluators: FieldValue.increment(addEvaluator),
				consensus: agreement,
				evaluation,
				proSum: FieldValue.increment(proConDiff.proDiff),
				conSum: FieldValue.increment(proConDiff.conDiff),
			});

			return (await statementRef.get()).data() as Statement;
		});
	} catch (error) {
		logger.error(error);

		return undefined;
	}
}

interface CalcDiff {
	proDiff: number;
	conDiff: number;
}

function calcDiffEvaluation({
	action,
	newEvaluation,
	oldEvaluation,
}: {
	action: ActionTypes;
	newEvaluation: number;
	oldEvaluation: number;
}): CalcDiff {
	try {
		const positiveDiff =
			Math.max(newEvaluation, 0) - Math.max(oldEvaluation, 0);
		const negativeDiff =
			Math.min(newEvaluation, 0) - Math.min(oldEvaluation, 0);

		switch (action) {
			case ActionTypes.new:
				return {
					proDiff: Math.max(newEvaluation, 0),
					conDiff: Math.max(-newEvaluation, 0),
				};
			case ActionTypes.delete:
				return {
					proDiff: Math.min(-oldEvaluation, 0),
					conDiff: Math.max(oldEvaluation, 0),
				};
			case ActionTypes.update:
				return { proDiff: positiveDiff, conDiff: -negativeDiff };
			default:
				throw new Error('Action is not defined correctly');
		}
	} catch (error) {
		logger.error(error);

		return { proDiff: 0, conDiff: 0 };
	}
}
export async function updateChosenOptions(
	event: FirestoreEvent<
		Change<DocumentSnapshot> | DocumentSnapshot | undefined
	>
) {
	try {
		console.log("updateChosenOptions triggered");
		let snapshot: DocumentSnapshot | undefined;

		// Check if the event is a Change or a DocumentSnapshot
		if (event.data) {
			if ('after' in event.data) {
				// It's a Change<DocumentSnapshot>
				snapshot = event.data.after;
			} else {
				// It's a DocumentSnapshot (no change)
				snapshot = event.data;
			}
		}

		// If snapshot is undefined or does not exist, return early
		if (!snapshot?.exists) return;

		const statement = snapshot.data();
		if (!statement || statement.statementType !== StatementType.option)
			return;

		const parentId = statement.parentStatementId;
		if (!parentId) return;

		const db = getFirestore();
		const parentRef = db.collection(Collections.statements).doc(parentId);

		// Update the parent statement with the chosen option
		await parentRef.update({
			chosenOptions: FieldValue.arrayUnion(snapshot.id),
		});
	} catch (error) {
		logger.error('Error updating chosen options:', error);
	}
}

async function updateParentStatementWithChosenOptions(
	parentId: string | undefined
) {
	try {
		console.log("updateParentStatementWithChosenOptions triggered for ", parentId);
		if (!parentId) throw new Error('parentId is not defined');

		// get parent choseBy settings statement and parent statement

		const parentStatementDB = await db.collection(Collections.statements).doc(parentId).get();
		const parentStatement = parentStatementDB.data() as Statement;
		if (!parentStatement) throw new Error('parentStatement is not found');
		const { resultsSettings } = parentStatement;
		if (!resultsSettings) throw new Error('resultsSettings is not found');

		const chosenOptions = await choseTopOptions(parentId, resultsSettings);
		console.log(choseTopOptions.length, "chosenOptions length");

		if (!chosenOptions) throw new Error('chosenOptions is not found');

		await updateParentOfChildren({
			topOptionsStatements: chosenOptions,
		});

		//update child statement selected to be of type result
		await choseTopOptions(parentId, resultsSettings);
	} catch (error) {
		logger.error(error);
	}

	//inner functions

	interface UpdateParentChildrenProps {
		topOptionsStatements: Statement[];
	}
	async function updateParentOfChildren({
		topOptionsStatements,
	}: UpdateParentChildrenProps) {
		const childStatementsSimple = topOptionsStatements.map(
			(st: Statement) => statementToSimpleStatement(st)
		);

		if (!parentId) throw new Error('parentId is not defined');

		//update parent with results
		await db.collection(Collections.statements).doc(parentId).update({
			totalResults: childStatementsSimple.length,
			results: childStatementsSimple,
		});
	}
}

//chose top options by the choseBy settings
async function choseTopOptions(
	parentId: string,
	resultsSettings: ResultsSettings
): Promise<Statement[] | undefined> {
	try {
		console.log("...................choseTopOptions..................");
		const statementsRef = db.collection(Collections.statements);

		//first get previous top options and remove isChosen
		const previousTopOptionsDB = await statementsRef
			.where('isChosen', '==', true)
			.get();

		const batch = db.batch();
		previousTopOptionsDB.forEach((doc) => {
			const statementRef = statementsRef.doc(doc.id);
			batch.update(statementRef, { isChosen: false });
		});

		await batch.commit();
		console.log("ended saving the pervious top options....");
		//then get the new top options by the new settings
		const chosenOptions = await optionsChosenByMethod(parentId, resultsSettings);

		if (!chosenOptions || chosenOptions.length === 0) throw new Error("Couldn't find top options");

		const sortedOptions = getSortedOptions(chosenOptions, resultsSettings);

		const batch2 = db.batch();
		sortedOptions.forEach((doc) => {
			console.log("isChosen", doc.statement);
			const statementRef = statementsRef.doc(doc.statementId);
			batch2.update(statementRef, { isChosen: true });
		});

		await batch2.commit();

		return sortedOptions;
	} catch (error) {
		console.error(`At choseTopOptions ${error}`);

		return undefined;
	}
}

function getSortedOptions(
	statements: Statement[],
	resultsSettings: ResultsSettings
): Statement[] {
	const { resultsBy } = resultsSettings;
	if (resultsBy === ResultsBy.consensus) {
		return statements.sort((b, a) => a.consensus - b.consensus);
	} else if (resultsBy === ResultsBy.mostLiked) {
		return statements.sort(
			(b, a) => (a.evaluation?.sumPro ?? 0) - (b.evaluation?.sumPro ?? 0)
		);
	} else if (resultsBy === ResultsBy.averageLikesDislikes) {
		return statements.sort(
			(b, a) =>
				(a.evaluation?.sumEvaluations ?? 0) -
				(b.evaluation?.sumEvaluations ?? 0)
		);
	}

	return statements;
}

async function optionsChosenByMethod(
	parentId: string,
	resultsSettings: ResultsSettings
): Promise<Statement[] | undefined> {
	const {
		numberOfResults,
		resultsBy,
		cutoffBy,
		cutoffNumber
	} = resultsSettings;

	console.log("resultsSettings", resultsSettings);
	const number = Number(numberOfResults);
	const evaluationQuery = getEvaluationQuery(resultsBy);

	const statementsRef = db
		.collection(Collections.statements)
		.where('parentId', '==', parentId)
		.where('statementType', '==', StatementType.option);

	if (cutoffBy === CutoffBy.topOptions) {
		const statementsDB = await statementsRef
			.orderBy(evaluationQuery, 'desc')
			.limit(Math.ceil(number))
			.get();

		const statements = statementsDB.docs.map(
			(doc) => doc.data() as Statement
		);

		return statements;
	} else if (cutoffBy === CutoffBy.aboveThreshold) {
		const statementsDB = await statementsRef
			.where(evaluationQuery, '>', cutoffNumber)
			.get();

		const statements = statementsDB.docs.map(
			(doc) => doc.data() as Statement
		);

		return statements;
	}

	return undefined;
}

function getEvaluationQuery(choseByEvaluationType: ResultsBy) {
	if (choseByEvaluationType === ResultsBy.consensus) {
		return 'consensus';
	} else if (choseByEvaluationType === ResultsBy.mostLiked) {
		return 'evaluation.sumPro';
	} else if (choseByEvaluationType === ResultsBy.averageLikesDislikes) {
		return 'evaluation.sumEvaluations';
	}

	return 'consensus';
}
