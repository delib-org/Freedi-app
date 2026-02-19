import { store } from '@/redux/store';
import { getDefaultQuestionType } from '@/models/questionTypeDefaults';
import {
	getExistingOptionColors,
	getSiblingOptionsByParentId,
	getRandomColor,
} from '@/controllers/utils/colorUtils';
import {
	Statement,
	StatementSchema,
	StatementType,
	Access,
	QuestionType,
	Membership,
	ResultsBy,
	StageSelectionType,
	getRandomUID,
	EvaluationUI,
	CutoffBy,
	Paragraph,
} from '@freedi/shared-types';

import { parse } from 'valibot';
import { isStatementTypeAllowedAsChildren } from '@/controllers/general/helpers';
import { LanguagesEnum } from '@/context/UserConfigContext';
import { createTimestamps } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';

export interface CreateStatementProps {
	text: string;
	paragraphs?: Paragraph[];
	parentStatement: Statement | 'top';
	statementType: StatementType;
	questionType?: QuestionType;
	enableAddEvaluationOption?: boolean;
	enableAddVotingOption?: boolean;
	enableNavigationalElements?: boolean;
	enhancedEvaluation?: boolean;
	showEvaluation?: boolean;
	resultsBy?: ResultsBy;
	numberOfResults?: number;
	hasChildren?: boolean;
	defaultLanguage?: string;
	membership?: Membership;
	stageSelectionType?: StageSelectionType;
}

export function createStatement({
	text,
	paragraphs,
	parentStatement,
	statementType,
	questionType,
	enableAddEvaluationOption = true,
	enableNavigationalElements,
	enableAddVotingOption = true,
	enhancedEvaluation = true,
	showEvaluation = true,
	resultsBy = ResultsBy.consensus,
	numberOfResults = 1,
	hasChildren,
	defaultLanguage,
	membership,
	stageSelectionType,
}: CreateStatementProps): Statement | undefined {
	try {
		if (questionType === QuestionType.massConsensus) {
			hasChildren = false;
			defaultLanguage = defaultLanguage ?? LanguagesEnum.he;
		}
		const storeState = store.getState();
		const creator = storeState.creator?.creator;
		if (!isStatementTypeAllowedAsChildren(parentStatement, statementType)) {
			return;
		}
		if (!creator) throw new Error('Creator is undefined');
		if (!statementType) throw new Error('Statement type is undefined');
		if (!text || text.trim() === '') return undefined;
		const statementId = getRandomUID();

		//get default values for simple or advanced users
		enableNavigationalElements = defaultValue(enableNavigationalElements, creator?.advanceUser);
		hasChildren = defaultValue(hasChildren, creator?.advanceUser);

		const parentId = parentStatement !== 'top' ? parentStatement?.statementId : 'top';
		const parentsSet: Set<string> =
			parentStatement !== 'top' ? new Set(parentStatement?.parents) : new Set();
		parentsSet.add(parentId);
		const parents: string[] = [...parentsSet];

		const topParentId = parentStatement !== 'top' ? parentStatement?.topParentId : statementId;

		const siblingOptions = getSiblingOptionsByParentId(parentId, storeState.statements.statements);
		const existingColors = getExistingOptionColors(siblingOptions);

		const newStatement: Statement = {
			statement: text,
			paragraphs: paragraphs ?? [],
			statementType,
			statementId,
			parentId,
			parents,
			topParentId,
			creator,
			...(defaultLanguage && { defaultLanguage: defaultLanguage }),
			creatorId: creator.uid,
			// Always set membership - either provided, or default to openToAll
			membership: membership || { access: Access.openToAll },
			statementSettings: {
				enhancedEvaluation,
				hasChat: true,
				showEvaluation,
				enableAddEvaluationOption,
				enableAddVotingOption,
				hasChildren,
				enableNavigationalElements,
			},
			...createTimestamps(),
			color: getRandomColor(existingColors),
			resultsSettings: {
				resultsBy: resultsBy || ResultsBy.consensus,
				numberOfResults: Number(numberOfResults) || 1,
				cutoffNumber: 0,
				cutoffBy: CutoffBy.topOptions,
			},
			questionSettings: {
				...(questionType && { questionType }),
			},
			hasChildren,
			consensus: 0,
			evaluation: {
				numberOfEvaluators: 0,
				sumEvaluations: 0,
				agreement: 0,
				averageEvaluation: 0,
				evaluationRandomNumber: Math.random(),
				viewed: 0,
			},
			randomSeed: Math.random(),
			results: [],
		};

		if (newStatement.statementType === StatementType.question) {
			newStatement.questionSettings = {
				questionType: questionType ?? getDefaultQuestionType(),
			};

			newStatement.evaluationSettings = {
				evaluationUI: getEvaluationUI(stageSelectionType),
			};
		}

		function getEvaluationUI(stageSelectionType?: StageSelectionType): EvaluationUI {
			switch (stageSelectionType) {
				case StageSelectionType.consensus:
					return EvaluationUI.suggestions;
				case StageSelectionType.voting:
					return EvaluationUI.voting;
				case StageSelectionType.checkbox:
					return EvaluationUI.checkbox;
				default:
					return EvaluationUI.suggestions;
			}
		}

		parse(StatementSchema, newStatement);

		return newStatement;

		function defaultValue(value: boolean | undefined, isAdvanceUser: boolean | undefined): boolean {
			if (value !== undefined) return value;

			return isAdvanceUser ? true : false;
		}
	} catch (error) {
		logError(error, { operation: 'statements.createStatement.createStatement' });

		return undefined;
	}
}
