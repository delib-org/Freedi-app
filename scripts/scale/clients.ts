/**
 * Sample participants: real client-SDK connections against the emulators, using
 * the exact query shapes the main app uses. Every shape below names the source
 * it mirrors. Documents delivered here are measured; multiplying them up to the
 * whole population is derived, and is done in report.ts.
 */
import { deleteApp, initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import {
	collection,
	connectFirestoreEmulator,
	doc,
	documentId,
	getDoc,
	getDocs,
	getFirestore,
	limit,
	onSnapshot,
	orderBy,
	query,
	terminate,
	where,
} from 'firebase/firestore';
import type { Firestore, Query, Unsubscribe } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import type { Functions } from 'firebase/functions';
import {
	Collections,
	functionConfig,
	isAnswerBatchQuestion,
	StatementType,
} from '@freedi/shared-types';
import type {
	GetAnswerBatchRequest,
	GetAnswerBatchResponse,
	QuestionProgress,
	Statement,
} from '@freedi/shared-types';
import {
	HEAD_START_LIMIT,
	IN_QUERY_LIMIT,
	isLargeForPresence,
	PRESENCE_CAP,
	RANKED_PAGE_SIZE,
	WINDOW_SIZE,
} from './config';
import { DISCUSSABLE_TYPES } from './seed';

const AUTH_URL = 'http://localhost:9119';
const FIRESTORE_HOST = 'localhost';
const FIRESTORE_PORT = 8101;
const FUNCTIONS_PORT = 5021;

export type Shape =
	| 'questionDoc'
	| 'subscriptionDoc'
	| 'myEvaluations'
	| 'answersHeadStart'
	| 'answersWindow'
	| 'presence'
	| 'participationRatings'
	| 'participationViewsCount'
	| 'questionProgress'
	| 'batchAnswers'
	/** Answers returned by getAnswerBatch: function reads, not client reads. */
	| 'answerBatch'
	| 'rankedTopPage';

export interface ProbeCount {
	snapshots: number;
	docs: number;
}

export type PhaseCounts = Record<string, Partial<Record<Shape, ProbeCount>>>;

/** Answer query: `listenToSubStatements(id, 'top', CHAT.INITIAL_MESSAGES_LIMIT)`. */
export function answersWindowQuery(db: Firestore, questionId: string, size: number): Query {
	return query(
		collection(db, Collections.statements),
		where('parentId', '==', questionId),
		where('statementType', 'in', DISCUSSABLE_TYPES),
		orderBy('createdAt', 'desc'),
		limit(size),
	);
}

export class SampleClient {
	readonly counts: PhaseCounts = {};
	readonly questionFieldChanges: Record<string, Record<string, number>> = {};
	questionDocBytes = 0;
	private phase = 'open';
	private previousQuestion: Record<string, unknown> | undefined;
	private readonly functions: Functions;
	private readonly unsubscribers: Unsubscribe[] = [];

	private constructor(
		readonly uid: string,
		readonly db: Firestore,
		private readonly app: FirebaseApp,
	) {
		this.functions = getFunctions(app, functionConfig.region);
		connectFunctionsEmulator(this.functions, FIRESTORE_HOST, FUNCTIONS_PORT);
	}

	static async connect(index: number, projectId: string): Promise<SampleClient> {
		const app = initializeApp(
			{ projectId, apiKey: 'emulator-only', appId: `scale-client-${index}` },
			`scale-client-${index}`,
		);
		const auth = getAuth(app);
		connectAuthEmulator(auth, AUTH_URL, { disableWarnings: true });
		const credential = await signInAnonymously(auth);
		const db = getFirestore(app);
		connectFirestoreEmulator(db, FIRESTORE_HOST, FIRESTORE_PORT);

		return new SampleClient(credential.user.uid, db, app);
	}

	setPhase(phase: string): void {
		this.phase = phase;
	}

	private bump(shape: Shape, snapshots: number, docs: number): void {
		const forPhase = (this.counts[this.phase] ??= {});
		const entry = (forPhase[shape] ??= { snapshots: 0, docs: 0 });
		entry.snapshots += snapshots;
		entry.docs += docs;
	}

	/**
	 * Counts what the server delivers, the way Firestore bills a listener: the
	 * whole result on the first server-confirmed snapshot, then each document
	 * that changes. Snapshots served from the local cache are not server reads.
	 */
	private listen(shape: Shape, target: Query): void {
		let synced = false;
		this.unsubscribers.push(
			onSnapshot(target, { includeMetadataChanges: true }, (snapshot) => {
				if (snapshot.metadata.fromCache) return;
				if (!synced) {
					synced = true;
					this.bump(shape, 1, snapshot.size);

					return;
				}
				const changed = snapshot.docChanges().length;
				if (changed > 0) this.bump(shape, 1, changed);
			}),
		);
	}

	/**
	 * The batch the Rate view shows, from the `getAnswerBatch` callable
	 * (useAnswerBatch, above 30 answers). The answers come back in the response,
	 * so they cost function reads, not client reads.
	 */
	async fetchAnswerBatch(questionId: string): Promise<string[]> {
		const call = httpsCallable<GetAnswerBatchRequest, GetAnswerBatchResponse>(
			this.functions,
			'getAnswerBatch',
		);
		const { data } = await call({ questionId });
		this.bump('answerBatch', 1, data.answers.length);

		return data.answers.map((answer) => answer.statementId);
	}

	/** listenToBatchAnswers: a live copy of the cards on screen, in chunks the `in` query allows. */
	private listenToBatch(ids: string[]): void {
		for (let start = 0; start < ids.length; start += IN_QUERY_LIMIT) {
			this.listen(
				'batchAnswers',
				query(
					collection(this.db, Collections.statements),
					where(documentId(), 'in', ids.slice(start, start + IN_QUERY_LIMIT)),
				),
			);
		}
	}

	/** fetchTopAnswers: one page by consensus, read once; a ranked list has no listener. */
	async openRankedList(questionId: string): Promise<void> {
		const page = await getDocs(
			query(
				collection(this.db, Collections.statements),
				where('parentId', '==', questionId),
				where('statementType', '==', StatementType.option),
				orderBy('consensus', 'desc'),
				orderBy(documentId(), 'desc'),
				limit(RANKED_PAGE_SIZE),
			),
		);
		this.bump('rankedTopPage', 1, page.size);
	}

	/** Everything a participant's browser does when the question screen opens. */
	async openQuestion(questionId: string): Promise<void> {
		const { db, uid } = this;

		// listenToStatement (useStatementListeners)
		const question = await new Promise<Statement | undefined>((resolve) => {
			let isFirstSnapshot = true;
			this.unsubscribers.push(
				onSnapshot(doc(db, Collections.statements, questionId), (snapshot) => {
					const data = snapshot.data() as Record<string, unknown> | undefined;
					this.bump('questionDoc', 1, 1);
					if (data) this.recordQuestionDiff(data);
					if (isFirstSnapshot) {
						isFirstSnapshot = false;
						resolve(data as Statement | undefined);
					}
				}),
			);
		});
		// listenToStatementSubscription (useStatementListeners)
		this.unsubscribers.push(
			onSnapshot(doc(db, Collections.statementsSubscribe, `${uid}--${questionId}`), () =>
				this.bump('subscriptionDoc', 1, 1),
			),
		);
		// listenToEvaluations(statementId, undefined, creator.uid)
		this.listen(
			'myEvaluations',
			query(
				collection(db, Collections.evaluations),
				where('parentId', '==', questionId),
				where('evaluatorId', '==', uid),
			),
		);
		// listenToSubStatements head start (firstLoadThenListen, limit 10)
		const firstPage = await getDocs(answersWindowQuery(db, questionId, HEAD_START_LIMIT));
		this.bump('answersHeadStart', 1, firstPage.size);
		// listenToSubStatements(statementId, 'top', CHAT.INITIAL_MESSAGES_LIMIT)
		this.listen('answersWindow', answersWindowQuery(db, questionId, WINDOW_SIZE));
		// getQuestionProgress: the one-shot read behind OnlineUsers, GroupProgress and, for
		// hosts, useParticipationStats. It replaces downloading every rating of the question,
		// and repeats for them shared at most once a minute.
		const progress = await getDoc(doc(db, Collections.questionProgress, questionId));
		this.bump('questionProgress', 1, 1);
		const counters = progress.data() as Partial<QuestionProgress> | undefined;
		// OnlineUsers: nothing mounts on a large question, so no presence listener at all
		if (
			!isLargeForPresence({
				entered: counters?.entered,
				asParentTotalEvaluators: question?.evaluation?.asParentTotalEvaluators,
				totalEvaluators: question?.totalEvaluators,
			})
		) {
			// ListenToOnlineUsers (controllers/db/online/getOnline.ts)
			this.listen(
				'presence',
				query(
					collection(db, Collections.online),
					where('statementId', '==', questionId),
					limit(PRESENCE_CAP),
				),
			);
		}
		// useAnswerBatch: only above the threshold does the Answers tab open on the Rate view
		if (isAnswerBatchQuestion(question?.numberOfOptions ?? 0)) {
			this.listenToBatch(await this.fetchAnswerBatch(questionId));
		}
	}

	private recordQuestionDiff(data: Record<string, unknown>): void {
		this.questionDocBytes = Buffer.byteLength(JSON.stringify(data));
		const previous = this.previousQuestion;
		this.previousQuestion = data;
		if (!previous) return;
		const forPhase = (this.questionFieldChanges[this.phase] ??= {});
		for (const key of new Set([...Object.keys(previous), ...Object.keys(data)])) {
			if (JSON.stringify(previous[key]) !== JSON.stringify(data[key])) {
				forPhase[key] = (forPhase[key] ?? 0) + 1;
			}
		}
	}

	async close(): Promise<void> {
		for (const unsubscribe of this.unsubscribers) unsubscribe();
		await terminate(this.db);
		await deleteApp(this.app);
	}
}
