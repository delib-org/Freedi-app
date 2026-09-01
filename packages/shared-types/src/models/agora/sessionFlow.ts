import { object, number, boolean, optional, InferOutput } from 'valibot';
import { AgoraSessionMode } from './agoraEnums';
import { AGORA_CYCLE } from './agoraConstants';
import type { OdysseyGameScript } from '../odyssey/odysseyGameScript';

/**
 * Which beats this session runs, snapshotted onto the session document.
 *
 * The organizer authors a script on the Odyssey game (`OdysseyGameScript`);
 * provisioning projects it onto every session it opens. Agora then reads only
 * this — it never reaches into an Odyssey document — which also means a
 * session keeps running the script it was opened with until someone
 * deliberately patches it.
 *
 * Absent fields mean the legacy default for the session's mode, so the tens of
 * thousands of sessions written before flows existed resolve to exactly the
 * behaviour they already had.
 */
export const AgoraSessionFlowSchema = object({
	stances: optional(boolean()),
	needs: optional(boolean()),
	elders: optional(boolean()),
	rounds: optional(number()),
	ratingsPerRound: optional(number()),
	voting: optional(boolean()),
	framing: optional(boolean()),
});

export type AgoraSessionFlow = InferOutput<typeof AgoraSessionFlowSchema>;

/**
 * How a session earns its class score.
 *
 * `bridging` rewards a proposal that both camps can live with. It is a claim
 * about crossing a divide, so it is only meaningful when there ARE camps —
 * without them every proposal bridges nothing and the score is inert. A
 * camp-less room is scored on `convergence` instead: whether people's stated
 * positions moved closer over the course of the deliberation.
 */
export type AgoraScoreMode = 'bridging' | 'convergence';

export interface ResolvedSessionFlow {
	stances: boolean;
	needs: boolean;
	elders: boolean;
	rounds: number;
	ratingsPerRound: number;
	voting: boolean;
	framing: boolean;
	/** Derived from `stances`, never stored — one source of truth */
	scoreMode: AgoraScoreMode;
}

/**
 * What a session runs when its flow says nothing.
 *
 * A classroom lesson is the full track the teacher has always driven. A civic
 * square drops needs and the elders, which is precisely what the hard-coded
 * `civic` conditionals in the deliberation view did before this existed.
 */
function legacyDefaults(mode: AgoraSessionMode): Omit<ResolvedSessionFlow, 'scoreMode'> {
	const civic = mode === AgoraSessionMode.civic;

	return {
		stances: true,
		needs: !civic,
		elders: !civic,
		rounds: AGORA_CYCLE.ROUNDS,
		ratingsPerRound: AGORA_CYCLE.RATINGS_PER_ROUND,
		voting: true,
		framing: false,
	};
}

/**
 * Fold a session's stored flow over the defaults for its mode.
 *
 * Every reader goes through here rather than testing `sessionMode === civic`
 * at the point of use, so that "does this session show needs?" has one answer
 * in the view, in the score, and in the cloud function.
 */
export function resolveSessionFlow(session: {
	sessionMode?: AgoraSessionMode;
	flow?: AgoraSessionFlow | null;
}): ResolvedSessionFlow {
	const defaults = legacyDefaults(session.sessionMode ?? AgoraSessionMode.classroom);
	const flow = session.flow;

	const stances = flow?.stances ?? defaults.stances;

	return {
		stances,
		needs: flow?.needs ?? defaults.needs,
		elders: flow?.elders ?? defaults.elders,
		rounds: flow?.rounds ?? defaults.rounds,
		ratingsPerRound: flow?.ratingsPerRound ?? defaults.ratingsPerRound,
		voting: flow?.voting ?? defaults.voting,
		framing: flow?.framing ?? defaults.framing,
		scoreMode: stances ? 'bridging' : 'convergence',
	};
}

/**
 * Does this session run the voting stage at all?
 *
 * TWO knobs answer that question and they used to be consulted separately —
 * the teacher panel read `votingSettings.enabled` while the advance callable
 * read `resolveSessionFlow(session).voting` — so a session whose knobs
 * disagreed either dead-ended the teacher's advance button or opened a ballot
 * the teacher had switched off. One function now folds them: an explicit
 * `enabled: false` from the teacher wins outright, otherwise the organizer's
 * flow (or the mode's legacy default) decides.
 */
export function sessionRunsVoting(session: {
	sessionMode?: AgoraSessionMode;
	flow?: AgoraSessionFlow | null;
	votingSettings?: { enabled?: boolean };
}): boolean {
	if (session.votingSettings?.enabled === false) return false;

	return resolveSessionFlow(session).voting;
}

/**
 * The provision-time projection: an organizer's script becomes a session flow.
 *
 * Only fields the organizer actually set are carried across, so a session
 * opened from an empty script still resolves through `legacyDefaults` and a
 * civic square with no script behaves exactly as civic squares always have.
 */
export function scriptToFlow(script?: OdysseyGameScript): AgoraSessionFlow | undefined {
	if (!script) return undefined;

	const flow: AgoraSessionFlow = {};
	if (script.stancesEnabled !== undefined) flow.stances = script.stancesEnabled;
	if (script.needsEnabled !== undefined) flow.needs = script.needsEnabled;
	if (script.eldersEnabled !== undefined) flow.elders = script.eldersEnabled;
	if (script.rounds !== undefined) flow.rounds = script.rounds;
	if (script.ratingsPerRound !== undefined) flow.ratingsPerRound = script.ratingsPerRound;
	if (script.votingEnabled !== undefined) flow.voting = script.votingEnabled;
	if (script.framingEnabled !== undefined) flow.framing = script.framingEnabled;

	return Object.keys(flow).length > 0 ? flow : undefined;
}
