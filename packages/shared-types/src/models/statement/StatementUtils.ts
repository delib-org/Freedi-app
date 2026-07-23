import { Statement, StatementSchema } from './StatementTypes';
import { StatementType } from '../TypeEnums';
import { getRandomUID } from '../TypeUtils';
import { StageSelectionType } from '../stage/stageTypes';
import { parse, safeParse } from 'valibot';
import { User } from '../user/User';
import { Role } from '../user/UserSettings';
import { Paragraph, ParagraphType, ListType } from '../paragraph/paragraphModel';
import { StatementSettings } from './StatementSettings';
import { SourceApp } from '../engagement/SourceApp';

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
	/**
	 * @deprecated The embedded paragraphs array is the legacy rich-body model.
	 * The canonical body is a set of child Statements with
	 * `statementType === paragraph` (see `createParagraphChildStatement` and the
	 * shared CRUD layer in `@freedi/shared-utils`). New code must not populate
	 * this field; it is retained only for backward-compatible reads.
	 */
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
	/** Optional force-show flag — promotes this option into the Join app
	 *  visible set even when resultsSettings cutoff would exclude it. */
	forceShow?: boolean;
	/** Role of the creator — set to Role.admin for organizer-added suggestions. */
	creatorRole?: Role;
	/** Optional color */
	color?: string;
	/** Optional reasoning/explanation for the statement */
	reasoning?: string;
	/** Which app created this statement */
	sourceApp?: SourceApp;
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

		// Build parents array automatically if not provided.
		// This ensures all ancestors are discoverable via 'array-contains' queries
		// even when callers don't pass it explicitly.
		const topParentId = params.topParentId || params.parentId;
		let parents: string[];
		if (params.parents && params.parents.length > 0) {
			parents = params.parents;
		} else if (params.parentId === 'top' || !params.parentId) {
			parents = [];
		} else {
			// At minimum, include parentId so the direct parent can find this statement.
			// Also include topParentId if different, so the root can find all descendants.
			const set = new Set<string>();
			if (topParentId && topParentId !== 'top') set.add(topParentId);
			set.add(params.parentId);
			parents = [...set];
		}

		const newStatement: Statement = {
			// Required fields
			statementId: params.statementId || getRandomUID(),
			statement: params.statement,
			statementType: params.statementType,
			parentId: params.parentId,
			topParentId,
			creatorId: params.creatorId,
			creator: params.creator,
			createdAt: now,
			lastUpdate: now,
			consensus: params.consensus ?? 0,

			// Optional fields with defaults
			paragraphs: params.paragraphs ?? [],
			parents,
			statementSettings: params.statementSettings ?? defaultStatementSettings,
			stageSelectionType: params.stageSelectionType ?? StageSelectionType.consensus,
			randomSeed: params.randomSeed ?? Math.random(),
			hide: params.hide ?? false,

			// Optional fields without defaults (only include if provided)
			...(params.color && { color: params.color }),
			...(params.reasoning && { reasoning: params.reasoning }),
			...(params.sourceApp && { sourceApp: params.sourceApp }),
			...(params.forceShow !== undefined && { forceShow: params.forceShow }),
			...(params.creatorRole && { creatorRole: params.creatorRole }),
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
		parents: [...(parentStatement.parents || []), parentStatement.statementId],
		creatorId: user.uid,
		creator: user,
		stageSelectionType,
	});
}

/**
 * Creates an official "standing" paragraph statement for Sign app
 * This represents the current official text at a specific document position
 *
 * @deprecated Produces the legacy Sign shape (`statementType === option` +
 * `doc.isOfficialParagraph`). Use {@link createParagraphChildStatement} for the
 * canonical model (`statementType === paragraph`). Sign migrates its call sites
 * in the paragraph-unification work; kept temporarily so existing callers
 * compile until then.
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
	creator: User,
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
 * @param reasoning - Optional explanation for why this suggestion is better
 * @returns A Statement object representing the suggestion
 *
 * @example
 * const suggestion = createSuggestionStatement(
 *   'Alternative wording here',
 *   'p_123',
 *   'doc_456',
 *   user,
 *   'This version is clearer and more concise'
 * );
 */
export function createSuggestionStatement(
	suggestedText: string,
	officialParagraphId: string,
	documentId: string,
	creator: User,
	reasoning?: string,
): Statement | undefined {
	return createStatementObject({
		statement: suggestedText,
		statementType: StatementType.option,
		parentId: officialParagraphId, // Child of the official paragraph
		topParentId: documentId,
		creatorId: creator.uid,
		creator,
		consensus: 0, // Suggestions start with zero consensus
		...(reasoning && { reasoning }), // Include reasoning if provided
	});
}

// ──────────────────────────────────────────────────────────────────────────
// Canonical paragraph model (statementType === paragraph)
//
// A statement's rich body is a set of CHILD statements, each with
// `statementType === paragraph`, ordered by `order`. This is the single model
// shared by all apps (Main, Sign, MC, Join). The embedded `Statement.paragraphs`
// array is the deprecated legacy model.
//
// Use `createParagraphChildStatement` to create a paragraph child, and the
// `statementToParagraph` / `paragraphToFactoryParams` mappers to convert
// between the `Paragraph` DTO and paragraph child statements.
// ──────────────────────────────────────────────────────────────────────────

/** Parameters for {@link createParagraphChildStatement}. */
export interface CreateParagraphChildParams {
	/** The paragraph text (empty for image-only paragraphs). */
	content: string;
	/** The host statement whose body this paragraph belongs to. */
	host: Pick<Statement, 'statementId' | 'topParentId'>;
	/** Full creator object. */
	creator: User;
	/** Creator id; defaults to `creator.uid`. */
	creatorId?: string;
	/** Position among sibling paragraphs (0-based). */
	order: number;
	/** Visual block type; defaults to `ParagraphType.paragraph`. */
	blockType?: ParagraphType;
	/** List style for list-item blocks. */
	listType?: ListType;
	/** Inline-formatted content (<strong>/<em> only); `content` stays plain text. */
	contentHtml?: string;
	/** Image fields (for `ParagraphType.image`). */
	imageUrl?: string;
	imageAlt?: string;
	imageCaption?: string;
	/** Origin statement id when this paragraph was derived/merged. */
	sourceStatementId?: string;
	/** Stable id to assign (Sign relies on stable paragraph ids). Auto if omitted. */
	statementId?: string;
	/** Which app created this paragraph. */
	sourceApp?: SourceApp;
	/**
	 * Transition flag (Sign): also write `doc.isOfficialParagraph`/`doc.isDoc`
	 * so legacy dual-read queries keep working until the data migration completes.
	 */
	isOfficial?: boolean;
}

/**
 * Creates a canonical paragraph child statement (`statementType === paragraph`).
 * Replaces both the main app's inline `createStatementObject + {blockType, order}`
 * and the deprecated Sign-specific {@link createParagraphStatement}.
 *
 * Top-level `order`/`blockType` are the canonical fields; rich metadata
 * (list/image, and — when `isOfficial` — `order`/`paragraphType` mirrors) is
 * written into `doc` only when present, so plain text paragraphs stay minimal.
 *
 * @returns A valid paragraph Statement, or undefined if validation fails.
 */
export function createParagraphChildStatement(
	params: CreateParagraphChildParams,
): Statement | undefined {
	const blockType = params.blockType ?? ParagraphType.paragraph;

	const base = createStatementObject({
		statement: params.content,
		statementType: StatementType.paragraph,
		parentId: params.host.statementId,
		topParentId: params.host.topParentId || params.host.statementId,
		creatorId: params.creatorId ?? params.creator.uid,
		creator: params.creator,
		...(params.statementId && { statementId: params.statementId }),
		...(params.sourceApp && { sourceApp: params.sourceApp }),
	});
	if (!base) return undefined;

	base.order = params.order;
	base.blockType = blockType;
	if (params.sourceStatementId) base.derivedFromStatementId = params.sourceStatementId;

	// Only attach `doc` when there is metadata to store, so plain text paragraphs
	// (Main/Join/MC) keep the same minimal shape they have today.
	const hasMeta =
		params.isOfficial === true ||
		params.listType !== undefined ||
		params.contentHtml !== undefined ||
		params.imageUrl !== undefined ||
		params.imageAlt !== undefined ||
		params.imageCaption !== undefined;

	if (hasMeta) {
		base.doc = {
			order: params.order,
			paragraphType: blockType,
			...(params.isOfficial && { isOfficialParagraph: true, isDoc: true }),
			...(params.listType !== undefined && { listType: params.listType }),
			...(params.contentHtml !== undefined && { contentHtml: params.contentHtml }),
			...(params.imageUrl !== undefined && { imageUrl: params.imageUrl }),
			...(params.imageAlt !== undefined && { imageAlt: params.imageAlt }),
			...(params.imageCaption !== undefined && { imageCaption: params.imageCaption }),
		};
	}

	return base;
}

/**
 * Maps a paragraph child statement to the `Paragraph` DTO, tolerating legacy
 * fields (`blockType ?? doc.paragraphType`, `order ?? doc.order ?? createdAt`).
 */
export function statementToParagraph(statement: Statement): Paragraph {
	const doc = statement.doc;

	return {
		paragraphId: statement.statementId,
		type: statement.blockType ?? doc?.paragraphType ?? ParagraphType.paragraph,
		content: statement.statement,
		order: statement.order ?? doc?.order ?? statement.createdAt ?? 0,
		...(doc?.listType !== undefined && { listType: doc.listType }),
		...(doc?.contentHtml !== undefined && { contentHtml: doc.contentHtml }),
		...(statement.derivedFromStatementId !== undefined && {
			sourceStatementId: statement.derivedFromStatementId,
		}),
		...(doc?.imageUrl !== undefined && { imageUrl: doc.imageUrl }),
		...(doc?.imageAlt !== undefined && { imageAlt: doc.imageAlt }),
		...(doc?.imageCaption !== undefined && { imageCaption: doc.imageCaption }),
	};
}

/**
 * Maps a `Paragraph` DTO to {@link CreateParagraphChildParams}, so callers can
 * convert a DTO into a canonical paragraph child statement via
 * {@link createParagraphChildStatement}.
 */
export function paragraphToFactoryParams(
	paragraph: Paragraph,
	host: Pick<Statement, 'statementId' | 'topParentId'>,
	creator: User,
	opts?: { isOfficial?: boolean; sourceApp?: SourceApp },
): CreateParagraphChildParams {
	return {
		content: paragraph.content,
		host,
		creator,
		order: paragraph.order,
		blockType: paragraph.type,
		statementId: paragraph.paragraphId,
		...(paragraph.listType !== undefined && { listType: paragraph.listType }),
		...(paragraph.contentHtml !== undefined && { contentHtml: paragraph.contentHtml }),
		...(paragraph.imageUrl !== undefined && { imageUrl: paragraph.imageUrl }),
		...(paragraph.imageAlt !== undefined && { imageAlt: paragraph.imageAlt }),
		...(paragraph.imageCaption !== undefined && { imageCaption: paragraph.imageCaption }),
		...(paragraph.sourceStatementId !== undefined && {
			sourceStatementId: paragraph.sourceStatementId,
		}),
		...(opts?.isOfficial && { isOfficial: true }),
		...(opts?.sourceApp && { sourceApp: opts.sourceApp }),
	};
}
