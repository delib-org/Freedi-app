/**
 * Brings the progress counters of questions older than the counters up to date.
 * Run by scripts/backfillQuestionProgress.ts; not part of the deployed functions.
 *
 * Counts the same things as `fn_recomputeQuestionProgress`, through its
 * `collectParticipation`, but writes differently, because the recompute's plain
 * `set` can overwrite increments that land while it runs:
 *   - People are added through the `questionParticipation` markers, in the same
 *     once-per-person way as the live writer. Each transaction flips markers and
 *     increments the counter together, so a live trigger on the same person
 *     cannot be double counted and an interrupted run loses nothing.
 *   - `options` and `evaluations` have no markers, so they are only ever raised.
 * Counters are never lowered and a rerun writes nothing.
 */

import {
	FieldPath,
	FieldValue,
	type DocumentReference,
	type DocumentSnapshot,
	type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import {
	Collections,
	QuestionParticipation,
	QuestionProgress,
	Statement,
	StatementType,
	getQuestionParticipationId,
} from '@freedi/shared-types';
import { db } from '../db';
import { collectParticipation, ParticipationSets } from '../progress/fn_recomputeQuestionProgress';
import { ensureProgressDoc, type ProgressContext } from '../progress/questionProgressWriter';
import { logError } from '../utils/errorHandling';

/** The day the counters began (commit 86d7d27b3). */
export const COUNTERS_BEGAN_AT = Date.UTC(2026, 7, 25);

const QUESTION_PAGE_SIZE = 200;
const MARKER_CHUNK_SIZE = 200;
const KINDS = ['entered', 'suggested', 'evaluated'] as const;
const COUNTERS = [...KINDS, 'options', 'evaluations'] as const;

type Kind = (typeof KINDS)[number];
type KindCounts = Record<Kind, number>;
type UserKinds = [userId: string, kinds: Kind[]];

interface MarkerGap {
	userId: string;
	ref: DocumentReference;
	missing: Kind[];
}

export interface QuestionBackfillResult {
	statementId: string;
	/** People to add to each counter, or added when writing. */
	added: KindCounts;
	options: { from: number; to: number };
	evaluations: { from: number; to: number };
	changed: boolean;
}

export interface BackfillRun {
	before: number;
	execute: boolean;
	limit?: number;
	isDone: (statementId: string) => boolean;
	markDone: (statementId: string) => void;
	report: (result: QuestionBackfillResult) => void;
}

export interface BackfillTotals {
	scanned: number;
	processed: number;
	changed: number;
	skippedDone: number;
	failed: number;
}

/** The default state file; emulator and real runs must never share one. */
export function backfillStateFileName(project: string, onEmulator: boolean): string {
	return `backfillQuestionProgress.${onEmulator ? 'emulator.' : ''}${project}.json`;
}

function progressRefOf(statementId: string): DocumentReference {
	return db.collection(Collections.questionProgress).doc(statementId);
}

/** Old documents can still hold a Firestore Timestamp here. */
function millisOf(value: unknown): number | undefined {
	if (typeof value === 'number') return value;
	const asTimestamp = value as { toMillis?: () => number } | undefined;

	return asTimestamp?.toMillis?.();
}

function isOlderThan(statement: Statement, before: number): boolean {
	const createdAt = millisOf(statement.createdAt);

	return createdAt !== undefined && createdAt < before;
}

async function hasRatingsOrAnswers(statement: Statement): Promise<boolean> {
	const raters = Math.max(
		statement.evaluation?.asParentTotalEvaluators ?? 0,
		statement.totalEvaluators ?? 0,
	);
	if (raters > 0) return true;

	const firstAnswer = await db
		.collection(Collections.statements)
		.where('parentId', '==', statement.statementId)
		.where('statementType', '==', StatementType.option)
		.limit(1)
		.get();

	return !firstAnswer.empty;
}

function kindsByUser(sets: ParticipationSets): UserKinds[] {
	const users = new Map<string, Kind[]>();
	for (const kind of KINDS) {
		for (const userId of sets[kind]) users.set(userId, [...(users.get(userId) ?? []), kind]);
	}

	return [...users];
}

function findGaps(
	chunk: UserKinds[],
	refs: DocumentReference[],
	markers: Array<Partial<QuestionParticipation> | undefined>,
): MarkerGap[] {
	return chunk
		.map(([userId, kinds], index) => ({
			userId,
			ref: refs[index],
			missing: kinds.filter((kind) => !markers[index]?.[kind]),
		}))
		.filter((gap) => gap.missing.length > 0);
}

function countByKind(gaps: MarkerGap[]): KindCounts {
	const counts: KindCounts = { entered: 0, suggested: 0, evaluated: 0 };
	gaps.forEach((gap) => gap.missing.forEach((kind) => counts[kind]++));

	return counts;
}

async function addMissingPeople(
	statementId: string,
	chunk: UserKinds[],
	execute: boolean,
): Promise<KindCounts> {
	const refs = chunk.map(([userId]) =>
		db
			.collection(Collections.questionParticipation)
			.doc(getQuestionParticipationId(statementId, userId)),
	);
	const dataOf = (snap: DocumentSnapshot) =>
		snap.data() as Partial<QuestionParticipation> | undefined;

	if (!execute) {
		const snaps = await db.getAll(...refs);

		return countByKind(findGaps(chunk, refs, snaps.map(dataOf)));
	}

	return db.runTransaction(async (transaction) => {
		const snaps = await Promise.all(refs.map((ref) => transaction.get(ref)));
		const gaps = findGaps(chunk, refs, snaps.map(dataOf));
		const counts = countByKind(gaps);
		if (gaps.length === 0) return counts;

		for (const { userId, ref, missing } of gaps) {
			const flags = Object.fromEntries(missing.map((kind) => [kind, true]));
			transaction.set(ref, { statementId, userId, ...flags }, { merge: true });
		}
		const increments = Object.fromEntries(
			KINDS.filter((kind) => counts[kind] > 0).map((kind) => [
				kind,
				FieldValue.increment(counts[kind]),
			]),
		);
		transaction.set(
			progressRefOf(statementId),
			{ ...increments, lastUpdate: Date.now() },
			{ merge: true },
		);

		return counts;
	});
}

/**
 * What a document lacks to pass `QuestionProgressSchema`, or undefined when it
 * has everything. Live writers can leave one without counters (`touchActivity`,
 * the facilitator nudge), and the app refuses such a document. Counters are
 * filled with `increment(0)`, which leaves alone any value a trigger just wrote.
 */
function missingProgressFields(
	statement: Statement,
	context: ProgressContext,
	existing: Partial<QuestionProgress> | undefined,
): Record<string, unknown> | undefined {
	const now = Date.now();
	const fields: Record<string, unknown> = {};
	if (typeof existing?.statementId !== 'string') fields.statementId = statement.statementId;
	if (typeof existing?.topParentId !== 'string') fields.topParentId = context.topParentId;
	for (const counter of COUNTERS) {
		if (typeof existing?.[counter] !== 'number') fields[counter] = FieldValue.increment(0);
	}
	if (typeof existing?.lastActivity !== 'number') {
		fields.lastActivity = millisOf(statement.lastUpdate) ?? now;
	}
	if (typeof existing?.lastUpdate !== 'number') fields.lastUpdate = now;
	if (Object.keys(fields).length === 0) return undefined;

	return context.organizationId && !existing?.organizationId
		? { ...fields, organizationId: context.organizationId }
		: fields;
}

/** Creates or completes the document before anything is counted into it. */
async function repairProgressDoc(statement: Statement, execute: boolean): Promise<boolean> {
	const context = await ensureProgressDoc(statement);
	const ref = progressRefOf(statement.statementId);
	const missingIn = (snap: DocumentSnapshot) =>
		missingProgressFields(statement, context, snap.data() as Partial<QuestionProgress> | undefined);

	if (!execute) return !!missingIn(await ref.get());

	return db.runTransaction(async (transaction) => {
		const fields = missingIn(await transaction.get(ref));
		if (!fields) return false;

		transaction.set(ref, fields, { merge: true });

		return true;
	});
}

async function raiseEventCounters(
	statementId: string,
	sets: ParticipationSets,
	execute: boolean,
): Promise<Pick<QuestionBackfillResult, 'options' | 'evaluations'>> {
	const ref = progressRefOf(statementId);
	const resultFrom = (data: Partial<QuestionProgress> | undefined) => {
		const options = data?.options ?? 0;
		const evaluations = data?.evaluations ?? 0;

		return {
			options: { from: options, to: Math.max(options, sets.options) },
			evaluations: { from: evaluations, to: Math.max(evaluations, sets.evaluations) },
		};
	};

	if (!execute) return resultFrom((await ref.get()).data() as Partial<QuestionProgress>);

	return db.runTransaction(async (transaction) => {
		const snap = await transaction.get(ref);
		const result = resultFrom(snap.data() as Partial<QuestionProgress> | undefined);
		if (
			result.options.to > result.options.from ||
			result.evaluations.to > result.evaluations.from
		) {
			transaction.set(
				ref,
				{
					options: result.options.to,
					evaluations: result.evaluations.to,
					lastUpdate: Date.now(),
				},
				{ merge: true },
			);
		}

		return result;
	});
}

export async function backfillQuestion(
	statement: Statement,
	execute: boolean,
): Promise<QuestionBackfillResult> {
	const { statementId } = statement;
	const repaired = await repairProgressDoc(statement, execute);
	const sets = await collectParticipation(statementId);
	const users = kindsByUser(sets);
	const added: KindCounts = { entered: 0, suggested: 0, evaluated: 0 };

	for (let start = 0; start < users.length; start += MARKER_CHUNK_SIZE) {
		const counts = await addMissingPeople(
			statementId,
			users.slice(start, start + MARKER_CHUNK_SIZE),
			execute,
		);
		KINDS.forEach((kind) => (added[kind] += counts[kind]));
	}

	const { options, evaluations } = await raiseEventCounters(statementId, sets, execute);
	const changed =
		repaired ||
		KINDS.some((kind) => added[kind] > 0) ||
		options.to > options.from ||
		evaluations.to > evaluations.from;

	return { statementId, added, options, evaluations, changed };
}

async function processQuestion(
	statement: Statement,
	run: BackfillRun,
	totals: BackfillTotals,
): Promise<void> {
	try {
		if (!(await hasRatingsOrAnswers(statement))) return;

		const result = await backfillQuestion(statement, run.execute);
		totals.processed++;
		if (result.changed) totals.changed++;
		run.report(result);
		if (run.execute) run.markDone(statement.statementId);
	} catch (error) {
		totals.failed++;
		logError(error, {
			operation: 'migrations.questionProgressBackfill',
			statementId: statement.statementId,
		});
	}
}

/** Walks every question in id order; a failed question is counted and left for a rerun. */
export async function runQuestionProgressBackfill(run: BackfillRun): Promise<BackfillTotals> {
	const totals: BackfillTotals = {
		scanned: 0,
		processed: 0,
		changed: 0,
		skippedDone: 0,
		failed: 0,
	};
	let cursor: QueryDocumentSnapshot | undefined;

	for (;;) {
		let page = db
			.collection(Collections.statements)
			.where('statementType', '==', StatementType.question)
			.orderBy(FieldPath.documentId())
			.limit(QUESTION_PAGE_SIZE);
		if (cursor) page = page.startAfter(cursor);
		const snapshot = await page.get();

		for (const doc of snapshot.docs) {
			if (run.limit !== undefined && totals.processed >= run.limit) return totals;

			totals.scanned++;
			const statement = doc.data() as Statement;
			if (!isOlderThan(statement, run.before)) continue;
			if (run.isDone(statement.statementId)) {
				totals.skippedDone++;
				continue;
			}
			await processQuestion(statement, run, totals);
		}

		if (snapshot.size < QUESTION_PAGE_SIZE) return totals;
		cursor = snapshot.docs[snapshot.docs.length - 1];
	}
}
