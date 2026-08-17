import m from 'mithril';
import { db, doc, collection, query, where, setDoc, onSnapshot, Unsubscribe } from './firebase';
import { Collections, AgoraSession, Vote, NO_VOTE, getVoteId } from '@freedi/shared-types';
import { trackWrite } from './confirmedWrite';
import { getUserState } from './user';
import { getSessionState } from './session';
import { agoraCreator } from './statementDocs';

/**
 * The voting stage's Firestore side.
 *
 * Agora votes in the same collection the rest of Freedi votes in, so the
 * counting trigger (`addVote` → `selections` on the question) is the one that
 * already exists, and the tallies a student sees are server-written numbers
 * rather than a count this app did for itself.
 *
 * The ballot itself is NOT read here: candidates come from the frozen
 * `session.voting` snapshot, because the question's `results` keep being
 * rewritten by the shared selector as ratings continue to arrive.
 */

export interface VotingState {
	/** statementId → votes, as counted by the server. Never includes withdrawals. */
	selections: Record<string, number>;
	/** What I voted for, or null if I have not voted (or withdrew) */
	myVoteStatementId: string | null;
	/** Who has voted at all — the teacher's "n of N" chips */
	voterUids: Set<string>;
	/** The question doc has answered once; "no votes yet" is a fact, not a gap */
	loaded: boolean;
}

const state: VotingState = {
	selections: {},
	myVoteStatementId: null,
	voterUids: new Set(),
	loaded: false,
};

export function getVotingState(): VotingState {
	return state;
}

/** Total votes cast, ignoring withdrawals */
export function totalVotes(): number {
	return Object.values(state.selections).reduce((sum, count) => sum + count, 0);
}

let unsubscribers: Unsubscribe[] = [];
let listeningKey = '';

/**
 * Attaches the three listeners the voting stage needs. Idempotent: views call
 * it on every redraw, and re-attaching would restart the subscriptions.
 */
export function listenToVoting(
	sessionId: string,
	challengeQuestionId: string,
	userId: string,
): void {
	const key = `${sessionId}--${userId}`;
	if (listeningKey === key) return;
	stopVotingListeners();
	listeningKey = key;

	// The tallies live on the question, written by the counting trigger.
	unsubscribers.push(
		onSnapshot(doc(db, Collections.statements, challengeQuestionId), (docSnap) => {
			const data = (docSnap.data() ?? {}) as Record<string, unknown>;
			const selections = (data.selections ?? {}) as Record<string, number>;
			const counted: Record<string, number> = {};
			for (const [statementId, count] of Object.entries(selections)) {
				// Withdrawals accumulate under a sentinel key. It is not an option
				// and must never be shown as one, nor counted in the total.
				if (statementId === NO_VOTE) continue;
				if (typeof count === 'number' && count > 0) counted[statementId] = count;
			}
			state.selections = counted;
			state.loaded = true;
			m.redraw();
		}),
	);

	// My own vote, so the ballot can show which one is mine after a refresh.
	unsubscribers.push(
		onSnapshot(doc(db, Collections.votes, getVoteId(userId, challengeQuestionId)), (docSnap) => {
			const vote = docSnap.data() as Vote | undefined;
			const votedFor = vote?.statementId;
			state.myVoteStatementId = !votedFor || votedFor === NO_VOTE ? null : votedFor;
			m.redraw();
		}),
	);

	// Who has voted — a class-sized query, and the only way the teacher knows
	// whether to wait or to close the vote.
	unsubscribers.push(
		onSnapshot(
			query(collection(db, Collections.votes), where('parentId', '==', challengeQuestionId)),
			(snapshot) => {
				const voters = new Set<string>();
				snapshot.forEach((docSnap) => {
					const vote = docSnap.data() as Vote;
					if (vote.statementId && vote.statementId !== NO_VOTE) voters.add(vote.userId);
				});
				state.voterUids = voters;
				m.redraw();
			},
		),
	);
}

export function stopVotingListeners(): void {
	unsubscribers.forEach((unsubscribe) => unsubscribe());
	unsubscribers = [];
	listeningKey = '';
	state.selections = {};
	state.myVoteStatementId = null;
	state.voterUids = new Set();
	state.loaded = false;
}

/**
 * Casts, changes, or withdraws a vote — one doc per student per question, so
 * changing your mind overwrites rather than accumulates.
 *
 * Voting for the option you already hold withdraws it. The doc is rewritten
 * with the `none` sentinel instead of being deleted, because the counting
 * trigger needs to see the transition in order to decrement the option you
 * left.
 */
export async function castVote(session: AgoraSession, statementId: string): Promise<void> {
	const { user } = getUserState();
	if (!user) throw new Error('Not authenticated');

	const parentId = session.challengeQuestionId;
	const voteId = getVoteId(user.uid, parentId);
	const withdrawing = state.myVoteStatementId === statementId;
	const now = Date.now();

	const vote: Vote = {
		voteId,
		statementId: withdrawing ? NO_VOTE : statementId,
		userId: user.uid,
		parentId,
		// Proposals are known by number in this game; the anon name keeps a vote
		// traceable to a seat without naming a child.
		voter: agoraCreator(user.uid, getSessionState().myParticipant?.anonName ?? 'traveler'),
		createdAt: now,
		lastUpdate: now,
	};

	await trackWrite(
		'voting.saving_vote',
		setDoc(doc(db, Collections.votes, voteId), vote, { merge: true }),
	);
}
