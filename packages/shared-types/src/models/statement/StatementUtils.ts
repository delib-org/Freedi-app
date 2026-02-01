import { Statement, StatementSchema } from './StatementTypes';
import { StatementType } from '../TypeEnums';
import { getRandomUID } from '../TypeUtils';
import { StageSelectionType } from '../stage/stageTypes';
import { parse, safeParse } from 'valibot';
import { User } from '../user/User';
import { Paragraph } from '../paragraph/paragraphModel';
import { StatementSettings } from './StatementSettings';

/**
 * Default statement settings used when creating new statements
 */
export const defaultStatementSettings: StatementSettings = {
	showEvaluation: true,
	enableAddEvaluationOption: true,
	enableAddVotingOption: true,
	enableSimilaritiesSearch: true,
	enableNavigationalElements: true,
};

/**
 * Parameters for creating a statement object
 * Flexible interface that works for both main app and MC
 */
export interface CreateStatementParams {
	/** The title/text of the statement */
	statement: string;
	/** Rich text paragraphs (optional) */
	paragraphs?: Paragraph[];
	/** Type of statement: option, question, group, etc. */
	statementType: StatementType;
	/** Parent statement ID */
	parentId: string;
	/** Top-level parent ID (for hierarchy). If not provided, uses parentId */
	topParentId?: string;
	/** Creator's user ID */
	creatorId: string;
	/** Full creator object */
	creator: User;
	/** Optional custom statement ID. Auto-generated if not provided */
	statementId?: string;
	/** Optional list of all parent IDs in hierarchy */
	parents?: string[];
	/** Optional statement settings. Defaults provided if not specified */
	statementSettings?: StatementSettings;
	/** Optional stage selection type */
	stageSelectionType?: StageSelectionType;
	/** Optional consensus value. Defaults to 0 */
	consensus?: number;
	/** Optional random seed for ordering */
	randomSeed?: number;
	/** Optional hide flag */
	hide?: boolean;
	/** Optional color */
	color?: string;
}

/**
 * Creates a properly structured Statement object with all required fields.
 * Use this function in both main app and MC to ensure consistency.
 *
 * @param params - Statement creation parameters
 * @returns A valid Statement object or undefined if validation fails
 *
 * @example
 * // Basic usage (MC style - minimal params)
 * const solution = createStatementObject({
 *   statement: 'My solution',
 *   paragraphs: textToParagraphs('Description'),
 *   statementType: StatementType.option,
 *   parentId: questionId,
 *   topParentId: questionData.topParentId || questionId,
 *   creatorId: userId,
 *   creator: { uid: userId, displayName, email: '', photoURL: '', isAnonymous: true },
 * });
 *
 * @example
 * // Full usage (main app style)
 * const statement = createStatementObject({
 *   statement: 'My question',
 *   statementType: StatementType.question,
 *   parentId: parentStatement.statementId,
 *   topParentId: parentStatement.topParentId || parentStatement.statementId,
 *   parents: [...(parentStatement.parents || []), parentStatement.statementId],
 *   creatorId: user.uid,
 *   creator: user,
 *   statementSettings: customSettings,
 * });
 */
export function createStatementObject(params: CreateStatementParams): Statement | undefined {
	try {
		const now = Date.now();

		const newStatement: Statement = {
			// Required fields
			statementId: params.statementId || getRandomUID(),
			statement: params.statement,
			statementType: params.statementType,
			parentId: params.parentId,
			topParentId: params.topParentId || params.parentId,
			creatorId: params.creatorId,
			creator: params.creator,
			createdAt: now,
			lastUpdate: now,
			consensus: params.consensus ?? 0,

			// Optional fields with defaults
			paragraphs: params.paragraphs ?? [],
			parents: params.parents ?? [],
			statementSettings: params.statementSettings ?? defaultStatementSettings,
			stageSelectionType: params.stageSelectionType ?? StageSelectionType.consensus,
			randomSeed: params.randomSeed ?? Math.random(),
			hide: params.hide ?? false,

			// Optional fields without defaults (only include if provided)
			...(params.color && { color: params.color }),
		};

		// Validate against schema
		const result = safeParse(StatementSchema, newStatement);
		if (!result.success) {
			console.error('Statement validation failed:', result.issues);
			return undefined;
		}

		return result.output;
	} catch (error) {
		console.error('Error creating statement object:', error);
		return undefined;
	}
}

// Legacy interface - kept for backward compatibility
interface CreateBasicStatementProps {
	parentStatement: Statement;
	user: User;
	stageSelectionType?: StageSelectionType;
	statementType?: StatementType;
	statement: string;
	paragraphs?: Paragraph[];
}

/**
 * @deprecated Use createStatementObject instead for new code
 * Creates a basic statement from a parent statement
 */
export function createBasicStatement({
	parentStatement,
	user,
	stageSelectionType,
	statementType,
	statement,
	paragraphs,
}: CreateBasicStatementProps): Statement | undefined {
	return createStatementObject({
		statement,
		paragraphs,
		statementType: statementType ?? StatementType.statement,
		parentId: parentStatement.statementId,
		topParentId: parentStatement.topParentId || parentStatement.statementId,
		parents: parentStatement.parents ? [...parentStatement.parents] : [],
		creatorId: user.uid,
		creator: user,
		stageSelectionType,
	});
}

/**
 * Creates an official "standing" paragraph statement for Sign app
 * This represents the current official text at a specific document position
 *
 * @param paragraph - The paragraph data to convert to a statement
 * @param documentId - The parent document ID
 * @param creator - The user creating this paragraph (typically document creator or system)
 * @returns A Statement object marked as an official paragraph
 *
 * @example
 * const officialParagraph = createParagraphStatement(
 *   { paragraphId: 'p_123', type: ParagraphType.paragraph, content: 'Official text', order: 0 },
 *   'doc_456',
 *   systemUser
 * );
 */
export function createParagraphStatement(
	paragraph: Paragraph,
	documentId: string,
	creator: User
): Statement | undefined {
	const statement = createStatementObject({
		statement: paragraph.content,
		statementType: StatementType.option,
		parentId: documentId,
		topParentId: documentId,
		creatorId: creator.uid,
		creator,
		statementId: paragraph.paragraphId,
		consensus: 1.0, // Official paragraphs start with full consensus
	});

	if (!statement) return undefined;

	// Add doc field to mark as official paragraph
	// Only include optional fields if they have values (Firestore rejects undefined)
	statement.doc = {
		isDoc: true,
		order: paragraph.order,
		isOfficialParagraph: true,
		paragraphType: paragraph.type,
		...(paragraph.listType !== undefined && { listType: paragraph.listType }),
		...(paragraph.imageUrl !== undefined && { imageUrl: paragraph.imageUrl }),
		...(paragraph.imageAlt !== undefined && { imageAlt: paragraph.imageAlt }),
		...(paragraph.imageCaption !== undefined && { imageCaption: paragraph.imageCaption }),
	};

	// Preserve paragraph color if it's a header
	if (paragraph.type.startsWith('h') && 'color' in paragraph) {
		statement.color = (paragraph as { color?: string }).color;
	}

	return statement;
}

/**
 * Creates a suggestion statement as a child of an official paragraph
 * Users create these to suggest alternative text for a paragraph
 *
 * @param suggestedText - The alternative text being suggested
 * @param officialParagraphId - The ID of the official paragraph being suggested for
 * @param documentId - The top-level document ID
 * @param creator - The user creating this suggestion
 * @returns A Statement object representing the suggestion
 *
 * @example
 * const suggestion = createSuggestionStatement(
 *   'Alternative wording here',
 *   'p_123',
 *   'doc_456',
 *   user
 * );
 */
export function createSuggestionStatement(
	suggestedText: string,
	officialParagraphId: string,
	documentId: string,
	creator: User
): Statement | undefined {
	return createStatementObject({
		statement: suggestedText,
		statementType: StatementType.option,
		parentId: officialParagraphId, // Child of the official paragraph
		topParentId: documentId,
		creatorId: creator.uid,
		creator,
		consensus: 0, // Suggestions start with zero consensus
	});
}
