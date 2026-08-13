import m from 'mithril';
import {
	db,
	doc,
	collection,
	query,
	where,
	setDoc,
	updateDoc,
	onSnapshot,
	functions,
	httpsCallable,
	Unsubscribe,
} from './firebase';
import {
	Collections,
	AgoraCharacterReview,
	AgoraCharacterReviewSchema,
	AgoraMessageKind,
	AgoraProposalScore,
	AgoraProposalScoreSchema,
	AgoraSession,
	AgoraSuggestionStatus,
	AGORA_ANTI_GAMING,
	Evaluation,
	StatementType,
	isAgoraAiUid,
} from '@freedi/shared-types';
import { parse } from 'valibot';
import { getUserState } from './user';
import { getSessionState } from './session';
import {
	detectClassBridgeRecord,
	detectHelpedImprovements,
	detectProposalMilestones,
	detectThreadMessages,
} from './notifications';
import { agoraCreator, buildProposalStatement, buildThreadMessageStatement } from './statementDocs';

/** Minimal client view of a proposal/suggestion statement */
export interface AgoraProposal {
	statementId: string;
	statement: string;
	creatorId: string;
	anonName: string;
	statementType: string;
	parentId: string;
	createdAt: number;
	lastUpdate: number;
	suggestionStatus?: AgoraSuggestionStatus;
	/** When suggestionStatus last changed (server-stamped by the resolve callable) */
	statusChangedAt?: number;
	/** Thread-message discriminator; absent on legacy docs — treat as suggestion */
	agoraMessageKind?: AgoraMessageKind;
	/** The helper uid keying the thread; absent on legacy docs — fall back to creatorId */
	agoraThreadUserId?: string;
	/** `edit` messages: the proposal text before the change, for the diff */
	agoraPreviousText?: string;
	/** `award` messages: what this moment paid the helper */
	agoraPointsAwarded?: number;
	consensus?: number;
	evaluation?: { agreement?: number; agreementIndex?: number; numberOfEvaluators?: number };
}

export interface DeliberationState {
	/** First statements snapshot arrived — "no proposals" is now a fact, not a gap */
	statementsLoaded: boolean;
	/** First evaluations snapshot arrived — myRatings counts are trustworthy */
	evaluationsLoaded: boolean;
	proposals: AgoraProposal[];
	/** proposalId → improvement suggestions */
	suggestions: Record<string, AgoraProposal[]>;
	/** statementId → my rating (five-level value) + when I cast/updated it */
	myRatings: Record<string, { value: number; updatedAt: number }>;
	/**
	 * statementId → all STUDENT raters' (evaluatorId, updatedAt). AI raters
	 * excluded at ingestion. Values are deliberately NOT stored — individual
	 * ratings stay anonymous; only aggregate counts may be displayed.
	 */
	studentEvalTimes: Record<string, Array<{ evaluatorId: string; updatedAt: number }>>;
	/** proposalId → server-computed camp score */
	scores: Record<string, AgoraProposalScore>;
	/** `${statementId}--${characterId}` → in-character AI review */
	characterReviews: Record<string, AgoraCharacterReview>;
}

const state: DeliberationState = {
	statementsLoaded: false,
	evaluationsLoaded: false,
	proposals: [],
	suggestions: {},
	myRatings: {},
	studentEvalTimes: {},
	scores: {},
	characterReviews: {},
};

let unsubscribers: Unsubscribe[] = [];
let listeningKey = '';

/**
 * Statement ids the SERVER has acknowledged at least once.
 *
 * Firestore answers a write from the local cache before it leaves the device,
 * so a proposal appears in this client's own snapshot instantly — even when
 * the write is stuck in the queue and no classmate will ever see it. A student
 * on a wedged connection was therefore handed the whole game (tabs, laps,
 * ratings) around a proposal that did not exist, while their classmates' square
 * stayed one short. Every gate that means "my proposal is really on the square"
 * reads THIS, not the mere presence of a doc.
 *
 * Monotonic on purpose: an EDIT re-raises hasPendingWrites for a moment, and a
 * confirmation that blinks off would fold the tabs away mid-lesson.
 */
const serverConfirmed = new Set<string>();

/** Has the server acknowledged this statement, or is it only in my cache? */
export function isProposalConfirmed(statementId: string): boolean {
	return serverConfirmed.has(statementId);
}

export function getDeliberationState(): Readonly<DeliberationState> {
	return state;
}

function toProposal(data: Record<string, unknown>): AgoraProposal {
	return {
		statementId: String(data.statementId ?? ''),
		statement: String(data.statement ?? ''),
		creatorId: String(data.creatorId ?? ''),
		anonName: String(data.anonName ?? ''),
		statementType: String(data.statementType ?? ''),
		parentId: String(data.parentId ?? ''),
		createdAt: Number(data.createdAt ?? 0),
		lastUpdate: Number(data.lastUpdate ?? data.createdAt ?? 0),
		suggestionStatus: data.suggestionStatus as AgoraSuggestionStatus | undefined,
		statusChangedAt: typeof data.statusChangedAt === 'number' ? data.statusChangedAt : undefined,
		agoraMessageKind: data.agoraMessageKind as AgoraMessageKind | undefined,
		agoraThreadUserId:
			typeof data.agoraThreadUserId === 'string' ? data.agoraThreadUserId : undefined,
		agoraPreviousText:
			typeof data.agoraPreviousText === 'string' ? data.agoraPreviousText : undefined,
		agoraPointsAwarded:
			typeof data.agoraPointsAwarded === 'number' ? data.agoraPointsAwarded : undefined,
		consensus: typeof data.consensus === 'number' ? data.consensus : undefined,
		evaluation: data.evaluation as AgoraProposal['evaluation'],
	};
}

/** One listener catches proposals AND suggestions (both carry agoraSessionId) */
export function listenToDeliberation(sessionId: string, userId: string): void {
	const key = `${sessionId}--${userId}`;
	if (listeningKey === key) return;
	stopDeliberationListeners();
	listeningKey = key;

	const statementsUnsub = onSnapshot(
		query(collection(db, Collections.statements), where('agoraSessionId', '==', sessionId)),
		// The ack is a METADATA change: the server sends back the same fields it
		// was given, so without this flag the moment a write becomes real never
		// reaches the client at all (see serverConfirmed).
		{ includeMetadataChanges: true },
		(snapshot) => {
			const proposals: AgoraProposal[] = [];
			const suggestions: Record<string, AgoraProposal[]> = {};
			snapshot.forEach((docSnap) => {
				if (!docSnap.metadata.hasPendingWrites) serverConfirmed.add(docSnap.id);
				const item = toProposal(docSnap.data() as Record<string, unknown>);
				if (item.statementType === StatementType.option) {
					proposals.push(item);
				} else if (item.statementType === StatementType.suggestion) {
					(suggestions[item.parentId] ??= []).push(item);
				}
			});
			proposals.sort((a, b) => a.createdAt - b.createdAt);
			Object.values(suggestions).forEach((list) => list.sort((a, b) => a.createdAt - b.createdAt));
			state.proposals = proposals;
			state.suggestions = suggestions;
			// "Loaded" means the SERVER has spoken, not that a snapshot arrived.
			// Against the emulator every snapshot is effectively a server one; on
			// a real network the SDK answers from an empty cache first, and a
			// student mid-lesson would be shown the writing desk — and start
			// retyping a proposal they already have — every time the connection
			// hiccuped. Monotonic: once the server has answered it stays true, so
			// a later offline blip cannot un-load the game.
			if (!snapshot.metadata.fromCache) state.statementsLoaded = true;
			// Close the collaboration loop: tell helpers their proposal moved
			detectHelpedImprovements(sessionId, userId);
			// ...and the mirror: a message arrived in a thread I'm part of
			detectThreadMessages(sessionId, userId);
			m.redraw();
		},
		(error) => {
			console.error('[Delib] Statements listener failed:', error);
		},
	);

	// ONE session-wide evaluations listener feeds both my own ratings and the
	// anonymous "who rated when" timeline (owner-side aggregate signals).
	const ratingsUnsub = onSnapshot(
		query(collection(db, Collections.evaluations), where('agoraSessionId', '==', sessionId)),
		(snapshot) => {
			const ratings: DeliberationState['myRatings'] = {};
			const evalTimes: DeliberationState['studentEvalTimes'] = {};
			snapshot.forEach((docSnap) => {
				const data = docSnap.data() as {
					statementId?: string;
					evaluatorId?: string;
					evaluation?: number;
					updatedAt?: number;
				};
				if (!data.statementId || typeof data.evaluation !== 'number' || !data.evaluatorId) {
					return;
				}
				// The characters' synthetic raters never appear in student-facing
				// counts (their weight lives in the server-side camp aggregates)
				if (isAgoraAiUid(data.evaluatorId)) return;
				const updatedAt = data.updatedAt ?? 0;
				if (data.evaluatorId === userId) {
					ratings[data.statementId] = { value: data.evaluation, updatedAt };
				}
				(evalTimes[data.statementId] ??= []).push({
					evaluatorId: data.evaluatorId,
					updatedAt,
				});
			});
			state.myRatings = ratings;
			state.studentEvalTimes = evalTimes;
			state.evaluationsLoaded = true;
			m.redraw();
		},
		(error) => {
			console.error('[Delib] Ratings listener failed:', error);
		},
	);

	const scoresUnsub = onSnapshot(
		query(collection(db, Collections.agoraScores), where('sessionId', '==', sessionId)),
		(snapshot) => {
			const scores: Record<string, AgoraProposalScore> = {};
			snapshot.forEach((docSnap) => {
				try {
					const score = parse(AgoraProposalScoreSchema, docSnap.data());
					scores[score.statementId] = score;
				} catch (error) {
					console.error('[Delib] Invalid score doc:', error);
				}
			});
			state.scores = scores;
			// The class's shared outcome, announced when it actually moves —
			// the only collective celebration in a game full of personal ones
			let classMax = 0;
			for (const score of Object.values(scores)) {
				if (score.bridgingScore > classMax) classMax = score.bridgingScore;
			}
			detectClassBridgeRecord(sessionId, classMax);
			// ...and the author's own two: standing in the bridge zone, and
			// climbing past another proposal on the way there
			detectProposalMilestones(sessionId, userId);
			m.redraw();
		},
		(error) => {
			console.error('[Delib] Scores listener failed:', error);
		},
	);

	const reviewsUnsub = onSnapshot(
		query(collection(db, Collections.agoraCharacterReviews), where('sessionId', '==', sessionId)),
		(snapshot) => {
			const reviews: Record<string, AgoraCharacterReview> = {};
			snapshot.forEach((docSnap) => {
				try {
					const review = parse(AgoraCharacterReviewSchema, docSnap.data());
					reviews[review.reviewId] = review;
				} catch {
					// Ignore docs mid-write (the ask-slot reservation lands before
					// the verdict fields do)
				}
			});
			state.characterReviews = reviews;
			m.redraw();
		},
		(error) => {
			console.error('[Delib] Character reviews listener failed:', error);
		},
	);

	unsubscribers = [statementsUnsub, ratingsUnsub, scoresUnsub, reviewsUnsub];
}

export function stopDeliberationListeners(): void {
	unsubscribers.forEach((unsubscribe) => unsubscribe());
	unsubscribers = [];
	listeningKey = '';
	state.statementsLoaded = false;
	state.evaluationsLoaded = false;
	state.proposals = [];
	state.suggestions = {};
	state.myRatings = {};
	state.studentEvalTimes = {};
	state.scores = {};
	state.characterReviews = {};
	// Confirmations belong to the listener that observed them; the next one
	// re-earns them from its own first snapshot (server docs arrive acked).
	serverConfirmed.clear();
}

/**
 * Is this thread message an improvement suggestion (as opposed to plain
 * chat, or one of the system lines)? Absent kind = suggestion: every
 * pre-thread doc was one.
 *
 * Stated as an allow-list on purpose. It used to read "not chat", which
 * silently swept every kind added later — edit and award notices — into the
 * improvement economy: they would have occupied open-idea slots and asked
 * the author for a decision.
 */
export function isSuggestionKind(message: AgoraProposal): boolean {
	return (
		message.agoraMessageKind === undefined ||
		message.agoraMessageKind === AgoraMessageKind.suggestion
	);
}

/** A line the SYSTEM wrote — the proposal changed, or points landed */
export function isSystemKind(message: AgoraProposal): boolean {
	return (
		message.agoraMessageKind === AgoraMessageKind.edit ||
		message.agoraMessageKind === AgoraMessageKind.award
	);
}

/**
 * An edit notice belongs to EVERY conversation about the proposal, so it
 * carries no thread uid. Everything else belongs to exactly one.
 */
function isProposalWideNotice(message: AgoraProposal): boolean {
	return message.agoraMessageKind === AgoraMessageKind.edit;
}

/** The helper uid a thread message belongs to (legacy docs: the author) */
export function threadUserIdOf(message: AgoraProposal): string {
	return message.agoraThreadUserId ?? message.creatorId;
}

/** A helped proposal: someone else's proposal I sent at least one suggestion on */
export interface HelpedProposal {
	proposal: AgoraProposal;
	mySuggestions: AgoraProposal[];
}

/**
 * Proposals I contributed suggestions to — the "collaboration loop" roster.
 * Suggestion-kind messages only: chatting at a stall is not yet helping it.
 */
export function getHelpedProposals(userId: string): HelpedProposal[] {
	return state.proposals
		.filter((proposal) => proposal.creatorId !== userId)
		.map((proposal) => ({
			proposal,
			mySuggestions: (state.suggestions[proposal.statementId] ?? []).filter(
				(suggestion) => suggestion.creatorId === userId && isSuggestionKind(suggestion),
			),
		}))
		.filter((entry) => entry.mySuggestions.length > 0);
}

/**
 * One proposal↔helper conversation, chronological. The owner and the helper
 * see the same list; every other student's thread on the same proposal is a
 * different helperUid.
 */
export function getThreadMessages(proposalId: string, helperUid: string): AgoraProposal[] {
	return (state.suggestions[proposalId] ?? []).filter(
		(message) => isProposalWideNotice(message) || threadUserIdOf(message) === helperUid,
	);
}

/** All threads on my proposal, keyed by helper uid — the owner's inbox */
export function getOwnerThreads(proposalId: string): Map<string, AgoraProposal[]> {
	const threads = new Map<string, AgoraProposal[]>();
	for (const message of state.suggestions[proposalId] ?? []) {
		// An edit notice has no owner — counting it would conjure a phantom
		// conversation with whoever wrote the proposal
		if (isProposalWideNotice(message)) continue;
		const helperUid = threadUserIdOf(message);
		const list = threads.get(helperUid);
		if (list) {
			list.push(message);
		} else {
			threads.set(helperUid, [message]);
		}
	}

	return threads;
}

/** Create the student's proposal, or update it on later rounds */
export async function submitProposal(
	session: AgoraSession,
	anonName: string,
	text: string,
	existingProposalId?: string,
): Promise<void> {
	const { user } = getUserState();
	if (!user) throw new Error('Not authenticated');

	if (existingProposalId) {
		await updateDoc(doc(db, Collections.statements, existingProposalId), {
			statement: text,
			lastUpdate: Date.now(),
		});

		return;
	}

	const newRef = doc(collection(db, Collections.statements));
	await setDoc(newRef, buildProposalStatement(session, newRef.id, user.uid, anonName, text));
}

/**
 * The FIRST write, with a caller-supplied id.
 *
 * The id is the whole point: a first write that hangs can be retried (the desk
 * offers a reload when one does), and a retry that minted a fresh id would
 * post the proposal TWICE the moment the original turned out to have landed
 * after all — on a real network, "stuck" and "slow" look identical from here.
 * Writing the same id twice is one proposal, whatever the network decides.
 */
export async function createProposal(
	session: AgoraSession,
	anonName: string,
	text: string,
	proposalId: string,
): Promise<void> {
	const { user } = getUserState();
	if (!user) throw new Error('Not authenticated');
	await setDoc(
		doc(db, Collections.statements, proposalId),
		buildProposalStatement(session, proposalId, user.uid, anonName, text),
		// MERGE, for the one case this id exists to survive: a retry landing on
		// a doc the first attempt did create after all. A plain overwrite would
		// take the evaluation aggregates the pipeline had already written on it
		// down with it; merging leaves the class's ratings where they are and
		// only restates the author's own fields.
		{ merge: true },
	);
}

/** Five-level rating scale, MC-style: -1 … +1 in half steps */
export type AgoraRating = -1 | -0.5 | 0 | 0.5 | 1;

/** Rate a proposal on the five-level scale. Deterministic id dedupes. */
export async function rateProposal(
	session: AgoraSession,
	statementId: string,
	value: AgoraRating,
): Promise<void> {
	const { user } = getUserState();
	if (!user) throw new Error('Not authenticated');
	const evaluationId = `${user.uid}--${statementId}`;
	// Typed as Evaluation so the shared pipeline's required fields are a compile
	// error to omit, not a trigger that silently fails at parse time.
	const evaluation: Evaluation = {
		evaluationId,
		parentId: session.challengeQuestionId,
		statementId,
		evaluatorId: user.uid,
		evaluation: value,
		// The shared pipeline (statement.evaluation stats) requires an evaluator
		// object; anonName keeps students anonymous to each other
		evaluator: agoraCreator(user.uid, getSessionState().myParticipant?.anonName ?? 'traveler'),
		agoraSessionId: session.sessionId,
		updatedAt: Date.now(),
	};

	await setDoc(doc(db, Collections.evaluations, evaluationId), evaluation);
}

/**
 * How many unresolved ideas I still have waiting on this proposal. This is
 * the game's spam guard: bounding OPEN ideas binds on the spammer directly,
 * unlike a points penalty, which the floor at zero made free for exactly the
 * students it was meant to deter. Resolved ideas free the slot immediately,
 * so a genuinely helpful classmate is never blocked for long.
 */
export function openSuggestionsBy(proposalId: string, userId: string): number {
	return (state.suggestions[proposalId] ?? []).filter(
		(suggestion) =>
			suggestion.creatorId === userId &&
			// Plain chat never occupies an idea slot — the cap guards unresolved
			// WORK on the owner's desk, and a chat message asks nothing of them
			isSuggestionKind(suggestion) &&
			(suggestion.suggestionStatus === undefined ||
				suggestion.suggestionStatus === AgoraSuggestionStatus.open),
	).length;
}

/**
 * Send one thread message on a proposal. A suggestion-kind message is an
 * improvement idea (capped, enters the accept/weave economy); a chat-kind
 * message is free conversation. The owner replies into the HELPER's thread —
 * `helperUid` names the conversation, defaulting to the sender (the helper
 * case).
 */
export async function submitThreadMessage(
	session: AgoraSession,
	proposal: AgoraProposal,
	anonName: string,
	text: string,
	kind: AgoraMessageKind,
	helperUid?: string,
): Promise<void> {
	const { user } = getUserState();
	if (!user) throw new Error('Not authenticated');
	if (
		kind === AgoraMessageKind.suggestion &&
		openSuggestionsBy(proposal.statementId, user.uid) >=
			AGORA_ANTI_GAMING.MAX_OPEN_SUGGESTIONS_PER_HELPER
	) {
		throw new Error('Too many open suggestions on this proposal');
	}
	const newRef = doc(collection(db, Collections.statements));

	await setDoc(
		newRef,
		buildThreadMessageStatement(
			session,
			proposal.statementId,
			newRef.id,
			user.uid,
			anonName,
			text,
			kind,
			helperUid ?? user.uid,
		),
	);
}

/** Send an improvement suggestion on someone else's proposal */
export async function submitSuggestion(
	session: AgoraSession,
	proposal: AgoraProposal,
	anonName: string,
	text: string,
): Promise<void> {
	await submitThreadMessage(session, proposal, anonName, text, AgoraMessageKind.suggestion);
}

export async function resolveSuggestion(
	sessionId: string,
	suggestionId: string,
	resolution: AgoraSuggestionStatus,
): Promise<void> {
	const call = httpsCallable<
		{ sessionId: string; suggestionId: string; resolution: AgoraSuggestionStatus },
		{ ok: boolean }
	>(functions, 'agoraResolveSuggestion');
	await call({ sessionId, suggestionId, resolution });
}

export interface CharacterReviewResult {
	verdictText: string;
	acceptanceScore: number;
	advice: string[];
	asksLeft: number;
}

/** Show my proposal to a historical character — in-character verdict + rating */
export async function askCharacterReview(
	sessionId: string,
	characterId: string,
	statementId: string,
): Promise<CharacterReviewResult> {
	const call = httpsCallable<
		{ sessionId: string; characterId: string; statementId: string },
		CharacterReviewResult
	>(functions, 'agoraCharacterReview');
	const result = await call({ sessionId, characterId, statementId });

	return result.data;
}

export interface ReceptionEstimate {
	/** Predicted support of the LEFT camp, 0-100 */
	left: number;
	/** Predicted support of the RIGHT camp, 0-100 */
	right: number;
	/** Predicted average evaluation, 0-100 */
	average: number;
}

/** Numbers-only forecast of how each camp would receive this draft (no AI advice) */
export async function estimateReception(
	sessionId: string,
	text: string,
): Promise<ReceptionEstimate> {
	const call = httpsCallable<{ sessionId: string; text: string }, ReceptionEstimate>(
		functions,
		'agoraEstimateReception',
	);
	const result = await call({ sessionId, text });

	return result.data;
}

export async function improveWithAI(
	sessionId: string,
	text: string,
): Promise<{ improvedText: string; coachNote: string }> {
	const call = httpsCallable<
		{ sessionId: string; text: string },
		{ improvedText: string; coachNote: string }
	>(functions, 'agoraWritingAssistant');
	const result = await call({ sessionId, text });

	return result.data;
}

export async function setRound(
	sessionId: string,
	roundPhase: 'propose' | 'rate' | 'improve',
): Promise<void> {
	const call = httpsCallable<{ sessionId: string; roundPhase: string }, { roundNumber: number }>(
		functions,
		'agoraSetRound',
	);
	await call({ sessionId, roundPhase });
}
