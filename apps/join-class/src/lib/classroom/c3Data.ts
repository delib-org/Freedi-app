import {
	Collections,
	NO_VOTE,
	StatementType,
	createStatementObject,
	getVoteId,
	type ClassTableMarker,
	type Statement,
	type StatementSubscription,
	type Vote,
} from '@freedi/shared-types';
import { collection, db, doc, query, setDoc, updateDoc, where } from '../firebase';
import type { Unsubscribe } from '../firebase';
import { resilientOnSnapshot } from '../resilientListeners';
import { getCreator } from '../store';
import { getUserState } from '../user';
import type { Mate } from './c3Logic';

/**
 * Firestore access of the student table screens (lane C3). Listeners go
 * through `resilientOnSnapshot`; every write is try/catch with a [C3] tag and
 * rethrows so the view shows its inline error + retry. Join's store is
 * single-question (one `question`, one `allOptions`), and a table works across
 * several questions at once, so the class's options and my ratings are read
 * here by the workspace's top parent instead.
 */

const LISTENER = {
	options: 'classOptions',
	mates: 'classMates',
	ratings: 'classMyRatings',
	vote: 'classMyVote',
} as const;

/** Firestore `in` queries take at most this many values. */
export const IN_QUERY_LIMIT = 30;

export function currentUid(): string | null {
	return getUserState().user?.uid ?? null;
}

/**
 * Every option under the lesson's questions (answers and proposals). Keyed on
 * `parents array-contains <lessonId>`, not `topParentId`: since lessons sit under a
 * class or teacher home the top parent is the home, and the same query still finds
 * the descendants of an old top-level lesson (their `parents` hold the lesson id).
 */
export function listenClassOptions(
	lessonId: string,
	onData: (options: Statement[]) => void,
	onError?: (error: Error) => void,
): Unsubscribe {
	return resilientOnSnapshot(
		LISTENER.options,
		query(
			collection(db, Collections.statements),
			where('parents', 'array-contains', lessonId),
			where('statementType', '==', StatementType.option),
		),
		(snap) => onData(snap.docs.map((d) => d.data() as Statement)),
		(err) => onError?.(err),
	);
}

/** The people seated at one table (display names from their subscriptions). */
export function listenMates(
	mainId: string,
	tableId: string,
	onData: (subs: StatementSubscription[]) => void,
	onError?: (error: Error) => void,
): Unsubscribe {
	return resilientOnSnapshot(
		LISTENER.mates,
		query(
			collection(db, Collections.statementsSubscribe),
			where('statementId', '==', mainId),
			where('tableId', '==', tableId),
		),
		(snap) => onData(snap.docs.map((d) => d.data() as StatementSubscription)),
		(err) => onError?.(err),
	);
}

export function matesOf(subs: readonly StatementSubscription[], fallbackName: string): Mate[] {
	return subs
		.map((sub) => ({
			uid: sub.userId,
			name: sub.user?.displayName?.trim() || fallbackName,
		}))
		.sort((a, b) => a.uid.localeCompare(b.uid));
}

/** My evaluations under the given questions as optionId -> score (chunks of 30). */
export function listenMyRatings(
	parentIds: readonly string[],
	onData: (ratings: Map<string, number>) => void,
	onError?: (error: Error) => void,
): Unsubscribe {
	const uid = currentUid();
	if (!uid || parentIds.length === 0) {
		onData(new Map());

		return () => undefined;
	}
	const chunks: string[][] = [];
	for (let i = 0; i < parentIds.length; i += IN_QUERY_LIMIT) {
		chunks.push(parentIds.slice(i, i + IN_QUERY_LIMIT));
	}
	const parts: Map<string, number>[] = chunks.map(() => new Map<string, number>());
	const emit = (): void => {
		const merged = new Map<string, number>();
		for (const part of parts) for (const [id, score] of part) merged.set(id, score);
		onData(merged);
	};
	const stops = chunks.map((chunk, index) =>
		resilientOnSnapshot(
			`${LISTENER.ratings}:${index}`,
			query(
				collection(db, Collections.evaluations),
				where('evaluatorId', '==', uid),
				where('parentId', 'in', chunk),
			),
			(snap) => {
				const next = new Map<string, number>();
				for (const d of snap.docs) {
					const data = d.data() as { statementId?: string; evaluation?: number };
					if (typeof data.statementId === 'string' && typeof data.evaluation === 'number') {
						next.set(data.statementId, data.evaluation);
					}
				}
				parts[index] = next;
				emit();
			},
			(err) => onError?.(err),
		),
	);

	return () => stops.forEach((stop) => stop());
}

/** My vote doc on the challenge question: the option id, or null (none / no doc). */
export function listenMyVote(
	challengeId: string,
	onData: (optionId: string | null) => void,
	onError?: (error: Error) => void,
): Unsubscribe {
	const uid = currentUid();
	if (!uid) {
		onData(null);

		return () => undefined;
	}

	return resilientOnSnapshot(
		LISTENER.vote,
		doc(db, Collections.votes, getVoteId(uid, challengeId)),
		(snap) => {
			const voted = snap.exists() ? (snap.data() as Vote).statementId : null;
			onData(voted && voted !== NO_VOTE ? voted : null);
		},
		(err) => onError?.(err),
	);
}

export interface NewClassOption {
	main: Statement;
	/** The question the option answers (guiding or challenge). */
	parentId: string;
	text: string;
	marker: ClassTableMarker;
}

/** Write an answer or a proposal. Returns its id. */
export async function createClassOption(input: NewClassOption): Promise<string> {
	try {
		const creator = getCreator();
		if (!creator) throw new Error('no signed-in user');
		const text = input.text.trim();
		if (!text) throw new Error('empty text');
		const option = createStatementObject({
			statement: text,
			statementType: StatementType.option,
			parentId: input.parentId,
			topParentId: input.main.topParentId || input.main.statementId,
			parents: [...(input.main.parents ?? []), input.main.statementId, input.parentId],
			creatorId: creator.uid,
			creator,
		});
		if (!option) throw new Error('statement validation failed');
		await setDoc(doc(db, Collections.statements, option.statementId), {
			...option,
			classTable: input.marker,
		});

		return option.statementId;
	} catch (error) {
		console.error('[C3] createClassOption failed:', error);
		throw error;
	}
}

/** Change the text of my own answer / proposal (until the Vote opens). */
export async function updateClassOption(statementId: string, text: string): Promise<void> {
	try {
		const trimmed = text.trim();
		if (!trimmed) throw new Error('empty text');
		await updateDoc(doc(db, Collections.statements, statementId), {
			statement: trimmed,
			lastUpdate: Date.now(),
		});
	} catch (error) {
		console.error('[C3] updateClassOption failed:', error);
		throw error;
	}
}

/**
 * "+ שאלה משלנו": a guiding sub-question that belongs to one table. Join's
 * `createSubQuestion` is admin-only, so this writes the statement directly (the
 * rules decide); a refusal shows as the inline error.
 */
export async function createTableQuestion(
	main: Statement,
	title: string,
	tableId: string,
): Promise<string> {
	try {
		const creator = getCreator();
		if (!creator) throw new Error('no signed-in user');
		const text = title.trim();
		if (!text) throw new Error('empty text');
		const question = createStatementObject({
			statement: text,
			statementType: StatementType.question,
			parentId: main.statementId,
			topParentId: main.topParentId || main.statementId,
			parents: [...(main.parents ?? []), main.statementId],
			creatorId: creator.uid,
			creator,
			statementSettings: {
				showEvaluation: true,
				enableAddEvaluationOption: true,
				enableAddVotingOption: true,
				enableSimilaritiesSearch: true,
				enableNavigationalElements: true,
				classRole: 'guiding',
			},
		});
		if (!question) throw new Error('statement validation failed');
		await setDoc(doc(db, Collections.statements, question.statementId), {
			...question,
			classTable: { tableId, shared: false, coAuthors: [] },
		});

		return question.statementId;
	} catch (error) {
		console.error('[C3] createTableQuestion failed:', error);
		throw error;
	}
}
