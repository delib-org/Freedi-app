/**
 * StatementFactory.ts - Pure factory for creating statement objects.
 *
 * Builds well-formed Statement objects from validated input without any
 * side effects. No Firebase, Redux, or React imports -- all dependencies
 * are injected through the input parameters.
 */

import {
	Statement,
	StatementType,
	Creator,
	QuestionType,
	Access,
	Membership,
	ResultsBy,
	StageSelectionType,
	getRandomUID,
	CutoffBy,
	Paragraph,
	StatementSchema,
} from '@freedi/shared-types';
import { parse } from 'valibot';

import { isChildTypeAllowed, getEvaluationUIForStage } from './StatementRules';

// ============================================================================
// TYPES
// ============================================================================

/** Input required to build a new statement object. */
export interface BuildStatementInput {
	/** The text content of the statement. */
	text: string;
	/** Optional paragraphs for document-style statements. */
	paragraphs?: Paragraph[];
	/** The parent statement object, or the literal 'top' for root-level statements. */
	parentStatement: Statement | 'top';
	/** The type of statement to create. */
	statementType: StatementType;
	/** The creator of the statement. */
	creator: Creator;
	/** Colors already used by sibling options (for unique color assignment). */
	existingSiblingColors?: string[];
	/** Optional question type for question statements. */
	questionType?: QuestionType;
	/** Whether users can add evaluation options. Defaults to true. */
	enableAddEvaluationOption?: boolean;
	/** Whether users can add voting options. Defaults to true. */
	enableAddVotingOption?: boolean;
	/** Whether navigational elements are enabled. */
	enableNavigationalElements?: boolean;
	/** Whether enhanced evaluation is enabled. Defaults to true. */
	enhancedEvaluation?: boolean;
	/** Whether to show evaluation UI. Defaults to true. */
	showEvaluation?: boolean;
	/** How results are determined. Defaults to ResultsBy.consensus. */
	resultsBy?: ResultsBy;
	/** Number of results to show. Defaults to 1. */
	numberOfResults?: number;
	/** Whether the statement has children. */
	hasChildren?: boolean;
	/** Default language for the statement. */
	defaultLanguage?: string;
	/** Membership/access configuration. */
	membership?: Membership;
	/** Stage selection type that determines evaluation UI. */
	stageSelectionType?: StageSelectionType;
	/** A function that selects a random color avoiding the existing ones. */
	colorPicker?: (existingColors: string[]) => string;
	/** Default question type to use when none is specified. */
	defaultQuestionType?: QuestionType;
	/** Whether the creator is an advanced user (affects default settings). */
	isAdvancedUser?: boolean;
}

/** Result of a statement build attempt. */
export interface BuildStatementResult {
	success: true;
	statement: Statement;
}

/** Error result of a statement build attempt. */
export interface BuildStatementError {
	success: false;
	error: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Resolve a boolean setting to a definite value.
 * If the value is explicitly provided, use it. Otherwise, fall back
 * to `true` for advanced users and `false` for regular users.
 */
function resolveDefault(value: boolean | undefined, isAdvancedUser: boolean): boolean {
	if (value !== undefined) return value;

	return isAdvancedUser;
}

/**
 * Build the parents array from the parent statement.
 * The parents set is a deduped list of all ancestor IDs plus the immediate parent.
 */
function buildParentsArray(parentStatement: Statement | 'top'): string[] {
	if (parentStatement === 'top') {
		const parentsSet = new Set<string>();
		parentsSet.add('top');

		return Array.from(parentsSet);
	}

	const parentsSet = new Set<string>(parentStatement.parents);
	parentsSet.add(parentStatement.statementId);

	return Array.from(parentsSet);
}

/** Fallback color picker that returns a fixed default when no picker is provided. */
function defaultColorPicker(_existingColors: string[]): string {
	return 'var(--voting-palette-pair-1-light)';
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Build a new Statement object from the given input.
 *
 * This is a **pure function**: it produces a fully-formed Statement object
 * without reading from any global state (Redux store), database, or
 * environment. All data the statement needs must be passed in through
 * `BuildStatementInput`.
 *
 * The function validates type hierarchy rules, generates a unique ID,
 * builds the parents chain, assigns a color, and validates the result
 * against the Valibot StatementSchema.
 *
 * @param input - All data required to build the statement.
 * @returns A result object containing either the statement or an error message.
 */
export function buildStatement(input: BuildStatementInput): BuildStatementResult | BuildStatementError {
	const {
		text,
		paragraphs,
		parentStatement,
		statementType,
		creator,
		existingSiblingColors = [],
		questionType,
		enableAddEvaluationOption = true,
		enableAddVotingOption = true,
		enhancedEvaluation = true,
		showEvaluation = true,
		resultsBy = ResultsBy.consensus,
		numberOfResults = 1,
		defaultLanguage,
		membership,
		stageSelectionType,
		colorPicker = defaultColorPicker,
		defaultQuestionType = QuestionType.simple,
		isAdvancedUser = false,
	} = input;

	let { enableNavigationalElements, hasChildren } = input;

	// --- Validation -----------------------------------------------------------

	if (!text || text.trim() === '') {
		return { success: false, error: 'Statement text cannot be empty' };
	}

	if (!creator) {
		return { success: false, error: 'Creator is required' };
	}

	if (!statementType) {
		return { success: false, error: 'Statement type is required' };
	}

	if (!isChildTypeAllowed(parentStatement, statementType)) {
		return {
			success: false,
			error: `Cannot create ${statementType} under this parent`,
		};
	}

	// --- Resolve defaults based on user level ---------------------------------

	enableNavigationalElements = resolveDefault(enableNavigationalElements, isAdvancedUser);
	hasChildren = resolveDefault(hasChildren, isAdvancedUser);

	// Mass consensus overrides
	if (questionType === QuestionType.massConsensus) {
		hasChildren = false;
	}

	// --- Derive parent-chain data ---------------------------------------------

	const statementId = getRandomUID();
	const parentId = parentStatement !== 'top' ? parentStatement.statementId : 'top';
	const parents = buildParentsArray(parentStatement);
	const topParentId = parentStatement !== 'top' ? parentStatement.topParentId : statementId;
	const now = Date.now();

	// --- Build the statement object -------------------------------------------

	const newStatement: Statement = {
		statement: text,
		paragraphs: paragraphs ?? [],
		statementType,
		statementId,
		parentId,
		parents,
		topParentId,
		creator,
		...(defaultLanguage ? { defaultLanguage } : {}),
		creatorId: creator.uid,
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
		createdAt: now,
		lastUpdate: now,
		color: colorPicker(existingSiblingColors),
		resultsSettings: {
			resultsBy: resultsBy || ResultsBy.consensus,
			numberOfResults: Number(numberOfResults) || 1,
			cutoffNumber: 0,
			cutoffBy: CutoffBy.topOptions,
		},
		questionSettings: {
			...(questionType ? { questionType } : {}),
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

	// --- Question-specific settings -------------------------------------------

	if (newStatement.statementType === StatementType.question) {
		newStatement.questionSettings = {
			questionType: questionType ?? defaultQuestionType,
		};

		newStatement.evaluationSettings = {
			evaluationUI: getEvaluationUIForStage(stageSelectionType),
		};
	}

	// --- Schema validation ----------------------------------------------------

	parse(StatementSchema, newStatement);

	return { success: true, statement: newStatement };
}
