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
}

export enum AgoraSuggestionStatus {
	open = 'open',
	accepted = 'accepted',
	thanked = 'thanked',
}
