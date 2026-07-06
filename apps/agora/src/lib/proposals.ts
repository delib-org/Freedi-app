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
	AgoraProposalScore,
	AgoraProposalScoreSchema,
	AgoraSession,
	AgoraSuggestionStatus,
	StatementType,
} from '@freedi/shared-types';
import { parse } from 'valibot';
import { getUserState } from './user';

// Flow-app precedent: improvement suggestions are statements with this raw
// type tag (not a StatementType enum member).
const SUGGESTION_TYPE = 'suggestion';

/** Minimal client view of a proposal/suggestion statement (flow-style raw doc) */
export interface AgoraProposal {
	statementId: string;
	statement: string;
	creatorId: string;
	anonName: string;
	statementType: string;
	parentId: string;
	createdAt: number;
	suggestionStatus?: AgoraSuggestionStatus;
	consensus?: number;
	evaluation?: { agreement?: number; agreementIndex?: number; numberOfEvaluators?: number };
}

export interface DeliberationState {
	proposals: AgoraProposal[];
	/** proposalId → improvement suggestions */
	suggestions: Record<string, AgoraProposal[]>;
	/** statementId → my rating (-1 | 1) */
	myRatings: Record<string, number>;
	/** proposalId → server-computed camp score */
	scores: Record<string, AgoraProposalScore>;
}

const state: DeliberationState = {
	proposals: [],
	suggestions: {},
	myRatings: {},
	scores: {},
};

let unsubscribers: Unsubscribe[] = [];
let listeningKey = '';

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
		suggestionStatus: data.suggestionStatus as AgoraSuggestionStatus | undefined,
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
		(snapshot) => {
			const proposals: AgoraProposal[] = [];
			const suggestions: Record<string, AgoraProposal[]> = {};
			snapshot.forEach((docSnap) => {
				const item = toProposal(docSnap.data() as Record<string, unknown>);
				if (item.statementType === StatementType.option) {
					proposals.push(item);
				} else if (item.statementType === SUGGESTION_TYPE) {
					(suggestions[item.parentId] ??= []).push(item);
				}
			});
			proposals.sort((a, b) => a.createdAt - b.createdAt);
			Object.values(suggestions).forEach((list) => list.sort((a, b) => a.createdAt - b.createdAt));
			state.proposals = proposals;
			state.suggestions = suggestions;
			m.redraw();
		},
		(error) => {
			console.error('[Delib] Statements listener failed:', error);
		},
	);

	const ratingsUnsub = onSnapshot(
		query(
			collection(db, Collections.evaluations),
			where('agoraSessionId', '==', sessionId),
			where('evaluatorId', '==', userId),
		),
		(snapshot) => {
			const ratings: Record<string, number> = {};
			snapshot.forEach((docSnap) => {
				const data = docSnap.data() as { statementId?: string; evaluation?: number };
				if (data.statementId && typeof data.evaluation === 'number') {
					ratings[data.statementId] = data.evaluation;
				}
			});
			state.myRatings = ratings;
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
			m.redraw();
		},
		(error) => {
			console.error('[Delib] Scores listener failed:', error);
		},
	);

	unsubscribers = [statementsUnsub, ratingsUnsub, scoresUnsub];
}

export function stopDeliberationListeners(): void {
	unsubscribers.forEach((unsubscribe) => unsubscribe());
	unsubscribers = [];
	listeningKey = '';
	state.proposals = [];
	state.suggestions = {};
	state.myRatings = {};
	state.scores = {};
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
	const now = Date.now();

	if (existingProposalId) {
		await updateDoc(doc(db, Collections.statements, existingProposalId), {
			statement: text,
			lastUpdate: now,
		});

		return;
	}

	const newRef = doc(collection(db, Collections.statements));
	await setDoc(newRef, {
		statementId: newRef.id,
		statement: text,
		statementType: StatementType.option,
		parentId: session.challengeQuestionId,
		topParentId: session.rootStatementId,
		parents: [session.rootStatementId, session.challengeQuestionId],
		creatorId: user.uid,
		anonName,
		agoraSessionId: session.sessionId,
		consensus: 0,
		randomSeed: Math.random(),
		createdAt: now,
		lastUpdate: now,
	});
}

/** Rate a proposal: agree (+1) or disagree (-1). Deterministic id dedupes. */
export async function rateProposal(
	session: AgoraSession,
	statementId: string,
	value: 1 | -1,
): Promise<void> {
	const { user } = getUserState();
	if (!user) throw new Error('Not authenticated');
	const evaluationId = `${user.uid}--${statementId}`;

	await setDoc(doc(db, Collections.evaluations, evaluationId), {
		evaluationId,
		parentId: session.challengeQuestionId,
		statementId,
		evaluatorId: user.uid,
		evaluation: value,
		agoraSessionId: session.sessionId,
		updatedAt: Date.now(),
	});
}

/** Send an improvement suggestion on someone else's proposal */
export async function submitSuggestion(
	session: AgoraSession,
	proposal: AgoraProposal,
	anonName: string,
	text: string,
): Promise<void> {
	const { user } = getUserState();
	if (!user) throw new Error('Not authenticated');
	const newRef = doc(collection(db, Collections.statements));
	const now = Date.now();

	await setDoc(newRef, {
		statementId: newRef.id,
		statement: text,
		statementType: SUGGESTION_TYPE,
		parentId: proposal.statementId,
		topParentId: session.rootStatementId,
		parents: [session.rootStatementId, session.challengeQuestionId, proposal.statementId],
		creatorId: user.uid,
		anonName,
		agoraSessionId: session.sessionId,
		suggestionStatus: AgoraSuggestionStatus.open,
		consensus: 0,
		createdAt: now,
		lastUpdate: now,
	});
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
