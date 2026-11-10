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
	getCountFromServer,
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
import { Collections } from '@freedi/shared-types';
import { HEAD_START_LIMIT, WINDOW_SIZE } from './config';
import { DISCUSSABLE_TYPES } from './seed';

const AUTH_URL = 'http://localhost:9119';
const FIRESTORE_HOST = 'localhost';
const FIRESTORE_PORT = 8101;

export type Shape =
	| 'questionDoc'
	| 'subscriptionDoc'
	| 'myEvaluations'
	| 'answersHeadStart'
	| 'answersWindow'
	| 'presence'
	| 'participationRatings'
	| 'participationViewsCount';

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
	participationReadMs = 0;
	private phase = 'open';
	private previousQuestion: Record<string, unknown> | undefined;
	private readonly unsubscribers: Unsubscribe[] = [];

	private constructor(
		readonly uid: string,
		readonly db: Firestore,
		private readonly app: FirebaseApp,
	) {}

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

	/** Everything a participant's browser does when the question screen opens. */
	async openQuestion(questionId: string): Promise<void> {
		const { db, uid } = this;

		// listenToStatement (useStatementListeners)
		this.unsubscribers.push(
			onSnapshot(doc(db, Collections.statements, questionId), (snapshot) => {
				const data = snapshot.data() as Record<string, unknown> | undefined;
				this.bump('questionDoc', 1, 1);
				if (data) this.recordQuestionDiff(data);
			}),
		);
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
		// ListenToOnlineUsers (controllers/db/online/getOnline.ts)
		this.listen(
			'presence',
			query(collection(db, Collections.online), where('statementId', '==', questionId)),
		);
		// useParticipationStats: all evaluations of the question, then a views count
		const participationStart = Date.now();
		const ratings = await getDocs(
			query(collection(db, Collections.evaluations), where('parentId', '==', questionId)),
		);
		this.participationReadMs = Date.now() - participationStart;
		this.bump('participationRatings', 1, ratings.size);
		const views = await getCountFromServer(
			query(collection(db, Collections.statementViews), where('statementId', '==', questionId)),
		);
		this.bump('participationViewsCount', 1, views.data().count > 0 ? 1 : 0);
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
