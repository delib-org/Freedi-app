/**
 * Agora — classroom deliberative time-tunnel game.
 * Shared enums used by the agora app and Cloud Functions.
 */

export enum AgoraStage {
	lobby = 'lobby',
	framing = 'framing',
	perspectives = 'perspectives',
	/** After positions: each side answers "what do you actually need?" — empathy before solutions */
	needs = 'needs',
	valueIdentification = 'valueIdentification',
	positioning = 'positioning',
	deliberation = 'deliberation',
	/**
	 * The class elects one of the proposals deliberation produced. Optional:
	 * a teacher may advance deliberation → results and never hold a vote.
	 */
	voting = 'voting',
	results = 'results',
	ended = 'ended',
	/**
	 * An admin-authored question the room answers and rates before (or
	 * between) the other beats. Only ever appears in an explicit stage plan —
	 * a session without a plan never carries it. Its answers are Statements
	 * under the item's own question Statement; the top ones travel into every
	 * later stage as carried context.
	 */
	question = 'question',
}

/**
 * The forward-only order the stages run in. The advance callable and every
 * teacher UI walk THIS array — it used to be duplicated in both and a drifted
 * copy would let a client offer a transition the server refuses.
 */
export const AGORA_STAGE_ORDER: readonly AgoraStage[] = [
	AgoraStage.lobby,
	AgoraStage.framing,
	AgoraStage.perspectives,
	AgoraStage.needs,
	AgoraStage.positioning,
	AgoraStage.deliberation,
	AgoraStage.voting,
	AgoraStage.results,
	AgoraStage.ended,
];

export enum AgoraRoundPhase {
	propose = 'propose',
	rate = 'rate',
	improve = 'improve',
}

export enum AgoraDeviceMode {
	individual = 'individual',
	team = 'team',
}

export enum AgoraCamp {
	left = 'left',
	right = 'right',
	center = 'center',
}

export enum AgoraSessionStatus {
	open = 'open',
	live = 'live',
	ended = 'ended',
}

/**
 * Which track a session runs. Absent on every session written before civic
 * mode existed — readers MUST treat `undefined` as `classroom`, so a teacher's
 * lesson keeps the stage-by-stage track it has always had.
 *
 * `civic` is the self-serve track an Odyssey island opens onto: it starts at
 * the deliberation stage, has no teacher to advance it and no clock to end it,
 * and derives each participant's camp from the stances they already took in
 * Odyssey instead of from the positioning screen.
 */
export enum AgoraSessionMode {
	classroom = 'classroom',
	civic = 'civic',
}

export enum AgoraTopicStatus {
	draft = 'draft',
	ready = 'ready',
}

export enum AgoraSceneKind {
	intro = 'intro',
	timeTunnel = 'timeTunnel',
	periodExplainer = 'periodExplainer',
	perspectiveA = 'perspectiveA',
	perspectiveB = 'perspectiveB',
	/** The narrator turns to both sides: "beyond your positions — what do you actually need?" */
	needsQuestion = 'needsQuestion',
	needsA = 'needsA',
	needsB = 'needsB',
	successEnding = 'successEnding',
	failureEnding = 'failureEnding',
	/** No proposal won both camps, but the class mapped the divergence — a dignified ending, not a defeat */
	honestDisagreementEnding = 'honestDisagreementEnding',
}

/**
 * How the session ended. "Honest disagreement is itself an achievement" —
 * a class that mapped exactly where the camps differ gets a dignified ending,
 * not the collapse one.
 */
export enum AgoraSessionOutcome {
	success = 'success',
	honestDisagreement = 'honestDisagreement',
	collapse = 'collapse',
}

/**
 * What a thread message on a proposal IS. Absent on legacy docs — every
 * reader must treat `undefined` as `suggestion` (all pre-thread messages
 * were improvement suggestions).
 */
export enum AgoraMessageKind {
	/** An improvement idea — carries `suggestionStatus` and the accept/weave economy */
	suggestion = 'suggestion',
	/** Plain conversation — no status, no points */
	chat = 'chat',
	/**
	 * The author changed the proposal. Written server-side, carries the text
	 * as it stood before (`agoraPreviousText`) so every conversation on the
	 * proposal can show WHAT changed, not just that something did.
	 */
	edit = 'edit',
	/**
	 * Points landed for a helper (`agoraPointsAwarded`). Said in the very
	 * conversation that earned them, so the reward is never something the
	 * student has to go somewhere else to discover.
	 */
	award = 'award',
}

export enum AgoraSuggestionStatus {
	open = 'open',
	accepted = 'accepted',
	thanked = 'thanked',
	/** Polite decline ("no thanks") — closes the suggestion; no points, no notification */
	declined = 'declined',
	/**
	 * The owner edited their proposal and marked this ACCEPTED suggestion as
	 * woven into the text — precise attribution for the suggester ("YOUR idea
	 * is in the proposal now"). Only reachable from `accepted`.
	 */
	implemented = 'implemented',
}
