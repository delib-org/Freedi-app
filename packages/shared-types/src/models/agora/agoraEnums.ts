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
	results = 'results',
	ended = 'ended',
}

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

export enum AgoraSuggestionStatus {
	open = 'open',
	accepted = 'accepted',
	thanked = 'thanked',
}
