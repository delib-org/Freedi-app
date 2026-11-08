import {
	AgoraSceneKind,
	AgoraStage,
	type AgoraStagePlanItem,
	type AgoraTopicPackage,
} from '@freedi/shared-types';

/**
 * The scenario's two characters, ready to stand in the village. Everything
 * they say is already in the package — the scene's fixed lines, the
 * character's opinions and needs. Nothing here asks an AI for a new line.
 */
export interface CastMember {
	characterId: string;
	name: string;
	role: string;
	portraitUrl?: string;
	/** Which side of the positioning scale this voice stands on */
	side: 'a' | 'b';
	/** The three opinions — the front of the card */
	opinions: string[];
	/** The three needs — the back of the card */
	needs: string[];
	/** What the character says when met (the perspective scene's own lines) */
	meetLines: string[];
	/** What the character answers to "what do you actually need?" */
	needsLines: string[];
}

export type CastTopic = Pick<AgoraTopicPackage, 'characters' | 'scenes' | 'kind'>;

/** The stages whose place is the study house, where the cast stands */
export const CAST_STAGES: readonly AgoraStage[] = [
	AgoraStage.perspectives,
	AgoraStage.needs,
	AgoraStage.positioning,
];

export function isCastStage(stage: AgoraStage): boolean {
	return CAST_STAGES.includes(stage);
}

function linesOf(topic: CastTopic, kind: AgoraSceneKind): string[] {
	const scene = topic.scenes.find((candidate) => candidate.kind === kind);

	return (scene?.dialogue ?? [])
		.map((entry) => entry.line.trim())
		.filter((line) => line.length > 0);
}

function clean(list: readonly string[] | undefined): string[] {
	return (list ?? []).map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

/** The two voices of the era. Empty for a quick package: its characters are placeholders. */
export function scenarioCast(topic: CastTopic | undefined): CastMember[] {
	if (!topic || topic.kind === 'quick') return [];
	const [first, second] = topic.characters;
	if (!first || !second) return [];

	const member = (
		character: CastTopic['characters'][number],
		side: 'a' | 'b',
		meet: AgoraSceneKind,
		needs: AgoraSceneKind,
	): CastMember => {
		const opinions = clean(character.arguments);
		const needList = clean(character.needs);

		return {
			characterId: character.characterId,
			name: character.name,
			role: character.role,
			portraitUrl: character.portraitUrl?.trim() || undefined,
			side,
			opinions,
			needs: needList,
			meetLines: linesOf(topic, meet).length > 0 ? linesOf(topic, meet) : opinions,
			needsLines: linesOf(topic, needs).length > 0 ? linesOf(topic, needs) : needList,
		};
	};

	return [
		member(first, 'a', AgoraSceneKind.perspectiveA, AgoraSceneKind.needsA),
		member(second, 'b', AgoraSceneKind.perspectiveB, AgoraSceneKind.needsB),
	];
}

/** The cast stands only in a lesson that meets the two sides at all */
export function planHasCast(plan: readonly AgoraStagePlanItem[]): boolean {
	return plan.some((item) => isCastStage(item.stage));
}

/** Which booths a character stands at: the story and the needs booths, never the open questions */
export function castStandsAtBooth(kind: string): boolean {
	return kind === 'story' || kind === 'needs';
}

/** What a character says at a stage: the meeting lines, or the answer to the needs question */
export function castLinesFor(member: CastMember, stage: AgoraStage): string[] {
	return stage === AgoraStage.needs ? member.needsLines : member.meetLines;
}

/** The needs scene's question — "what do you actually need?" — read once before the answers */
export function needsQuestionOf(topic: CastTopic | undefined): string {
	const scene = topic?.scenes.find((candidate) => candidate.kind === AgoraSceneKind.needsQuestion);

	return scene?.text.trim() ?? '';
}

/** What the world needs to stand a character up: no lines, only the picture and the name */
export interface CastFigure {
	id: string;
	name: string;
	portraitUrl?: string;
}

export function castFigures(cast: readonly CastMember[]): CastFigure[] {
	return cast.map((member) => ({
		id: member.characterId,
		name: member.name,
		portraitUrl: member.portraitUrl,
	}));
}
