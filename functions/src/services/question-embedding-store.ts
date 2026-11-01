import { getFirestore, FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, StatementType } from '@freedi/shared-types';
import { embeddingService } from './embedding-service';
import { isNotFoundError } from './statement-embedding-store';
import { computeTextHash } from '../synthesis/textHash';
import { logError } from '../utils/errorHandling';

/**
 * Question vectors for admin "search by meaning": `questionEmbeddings/{id}`.
 *
 * Why a collection of their own (not `statementEmbeddings`): option search
 * there runs `findNearest` filtered by `parentId` / `topParentId` and would
 * start returning questions as "similar options". Option vectors also follow
 * a per-question model pin; question search must compare ANY two questions,
 * so every question vector — and every query vector — uses one fixed model.
 *
 * `creatorId`, `parentId`, `topParentId`, `parents` and `hide` are mirrored
 * from the statement so the search can pre-filter by access scope. They are
 * NOT trusted on their own: the search re-checks each hit against the live
 * statement before returning it.
 */

/**
 * The one model for question vectors and question queries. text-embedding-3-large
 * at 1536 dims: on the EN/HE benchmark (see embedding-service.ts) it finds the
 * true Hebrew paraphrase 88/100 vs 56/100 for -small; English is 100/100 for both.
 */
export const QUESTION_EMBEDDING_MODEL = 'text-embedding-3-large';

/** Shorter question text is not worth a vector (and matches everything). */
export const MIN_QUESTION_TEXT_LENGTH = 3;

/** Title + description are embedded together, capped to keep the input focused. */
export const QUESTION_EMBED_MAX_CHARS = 1000;

/** Retries for the OpenAI call from triggers and the backfill. */
const EMBED_RETRIES = 3;

/** The statement fields the question vector depends on or mirrors. */
export interface QuestionSource {
	statementId: string;
	statement: string;
	description?: string;
	creatorId: string;
	parentId: string;
	topParentId: string;
	parents: string[];
	hide: boolean;
}

export type QuestionEmbedOutcome = 'embedded' | 'synced' | 'unchanged' | 'skipped';

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

export function questionEmbeddingRef(statementId: string): DocumentReference {
	return getFirestore().collection(Collections.questionEmbeddings).doc(statementId);
}

export function questionEmbeddingsCollection() {
	return getFirestore().collection(Collections.questionEmbeddings);
}

/** A top-level question is its own tree. */
export function resolveTopParentId(
	statementId: string,
	parentId: string,
	topParentId: unknown,
): string {
	if (parentId === 'top') return statementId;
	// Legacy data sometimes stores 'top' as the top parent: not a real tree id.
	if (isNonEmptyString(topParentId) && topParentId !== 'top') return topParentId;

	return parentId;
}

/**
 * The question fields from raw statement data, or null when it is not an
 * embeddable question (wrong type, missing ids, text too short).
 */
export function toQuestionSource(data: unknown): QuestionSource | null {
	if (!data || typeof data !== 'object') return null;
	const raw = data as Record<string, unknown>;
	if (raw.statementType !== StatementType.question) return null;

	const { statementId, statement, parentId } = raw;
	const creatorId = isNonEmptyString(raw.creatorId)
		? raw.creatorId
		: (raw.creator as { uid?: unknown } | undefined)?.uid;
	if (!isNonEmptyString(statementId) || !isNonEmptyString(parentId)) return null;
	if (!isNonEmptyString(creatorId) || typeof statement !== 'string') return null;
	if (statement.trim().length < MIN_QUESTION_TEXT_LENGTH) return null;

	return {
		statementId,
		statement,
		description: typeof raw.description === 'string' ? raw.description : undefined,
		creatorId,
		parentId,
		topParentId: resolveTopParentId(statementId, parentId, raw.topParentId),
		parents: Array.isArray(raw.parents) ? raw.parents.filter(isNonEmptyString) : [],
		hide: raw.hide === true,
	};
}

/** What gets embedded: the title, then the description, capped. */
export function buildQuestionEmbeddingText(question: QuestionSource): string {
	const description = question.description?.trim();
	const text = description ? `${question.statement.trim()}\n${description}` : question.statement;

	return text.trim().slice(0, QUESTION_EMBED_MAX_CHARS);
}

/** The mirrored fields written next to the vector. */
function mirroredFields(question: QuestionSource) {
	return {
		statementId: question.statementId,
		statementType: StatementType.question,
		creatorId: question.creatorId,
		parentId: question.parentId,
		topParentId: question.topParentId,
		parents: question.parents,
		hide: question.hide,
	};
}

function sameList(a: unknown, b: readonly string[]): boolean {
	return Array.isArray(a) && a.length === b.length && a.every((value, i) => value === b[i]);
}

function mirrorIsCurrent(stored: Record<string, unknown>, question: QuestionSource): boolean {
	return (
		stored.creatorId === question.creatorId &&
		stored.parentId === question.parentId &&
		stored.topParentId === question.topParentId &&
		stored.hide === question.hide &&
		sameList(stored.parents, question.parents)
	);
}

/**
 * Make `questionEmbeddings/{id}` match the question. Idempotent: an unchanged
 * text with the same model is never re-embedded (only the mirrored fields are
 * refreshed when they drifted). `dryRun` reports the outcome without writing
 * or calling OpenAI.
 */
export async function upsertQuestionEmbedding(
	question: QuestionSource,
	options: { dryRun?: boolean } = {},
): Promise<QuestionEmbedOutcome> {
	const text = buildQuestionEmbeddingText(question);
	if (text.length < MIN_QUESTION_TEXT_LENGTH) return 'skipped';

	const textHash = computeTextHash(text);
	const ref = questionEmbeddingRef(question.statementId);
	const stored = (await ref.get()).data();
	const vectorCurrent =
		stored?.textHash === textHash &&
		stored?.embeddingModel === QUESTION_EMBEDDING_MODEL &&
		stored?.embedding !== undefined;

	if (vectorCurrent && stored && mirrorIsCurrent(stored, question)) return 'unchanged';
	if (vectorCurrent) {
		if (!options.dryRun) {
			await ref.update({ ...mirroredFields(question), lastUpdate: Date.now() });
		}

		return 'synced';
	}
	if (options.dryRun) return 'embedded';

	// Questions are embedded as written: no parent context and no LLM brief
	// (the brief prompt distils answers). The query side does the same.
	const result = await embeddingService.generateEmbeddingWithRetry(text, undefined, EMBED_RETRIES, {
		model: QUESTION_EMBEDDING_MODEL,
		skipBrief: true,
	});
	await ref.set({
		...mirroredFields(question),
		embedding: FieldValue.vector(result.embedding),
		embeddingModel: result.model,
		textHash,
		lastUpdate: Date.now(),
	});

	return 'embedded';
}

/** Creation trigger branch: never throws (embedding is not critical to creation). */
export async function embedNewQuestion(data: unknown): Promise<void> {
	const question = toQuestionSource(data);
	if (!question) return;

	try {
		const outcome = await upsertQuestionEmbedding(question);
		logger.info('questionEmbeddings: new question', {
			statementId: question.statementId,
			outcome,
		});
	} catch (error) {
		logError(error, {
			operation: 'questionEmbeddingStore.embedNewQuestion',
			statementId: question.statementId,
		});
	}
}

const WATCHED_FIELDS = [
	'statementType',
	'statement',
	'description',
	'creatorId',
	'parentId',
	'topParentId',
	'hide',
] as const;

function relevantChange(
	before: Record<string, unknown> | undefined,
	after: Record<string, unknown>,
): boolean {
	if (WATCHED_FIELDS.some((field) => before?.[field] !== after[field])) return true;
	const parentsBefore = Array.isArray(before?.parents) ? before.parents : [];
	const parentsAfter = Array.isArray(after.parents) ? after.parents.filter(isNonEmptyString) : [];

	return !sameList(parentsBefore, parentsAfter);
}

/**
 * Update trigger: keep the question vector fresh on a text edit, and its
 * mirrored scope fields in step with a move or hide. A no-op (no reads) for
 * the common updates — votes, consensus, counters — and for non-questions.
 */
export async function syncQuestionEmbedding(before: unknown, after: unknown): Promise<void> {
	const previous = before as Record<string, unknown> | undefined;
	const current = after as Record<string, unknown> | undefined;
	if (!current) return;

	const wasQuestion = previous?.statementType === StatementType.question;
	const isQuestion = current.statementType === StatementType.question;
	if (!wasQuestion && !isQuestion) return;
	if (!relevantChange(previous, current)) return;

	const statementId = current.statementId;
	if (!isNonEmptyString(statementId)) return;

	try {
		const question = toQuestionSource(current);
		if (question) {
			await upsertQuestionEmbedding(question);

			return;
		}
		// No longer an embeddable question (type changed or text emptied).
		await questionEmbeddingRef(statementId).delete();
	} catch (error) {
		if (isNotFoundError(error)) return;
		logError(error, {
			operation: 'questionEmbeddingStore.syncQuestionEmbedding',
			statementId,
		});
	}
}

/** Drop the vector of a deleted question (a no-op for other statements). */
export async function deleteQuestionEmbedding(statementId: string): Promise<void> {
	try {
		await questionEmbeddingRef(statementId).delete();
	} catch (error) {
		logError(error, {
			operation: 'questionEmbeddingStore.deleteQuestionEmbedding',
			statementId,
		});
	}
}
