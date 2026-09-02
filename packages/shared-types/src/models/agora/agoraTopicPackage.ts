import {
	object,
	string,
	number,
	boolean,
	optional,
	array,
	tupleWithRest,
	record,
	enum_,
	picklist,
	InferOutput,
} from 'valibot';
import { AgoraSceneKind, AgoraTopicStatus } from './agoraEnums';

/** A value held by a historical character — also the AI grading answer key */
export const AgoraValueSchema = object({
	valueId: string(),
	label: string(),
	description: string(),
});

export type AgoraValue = InferOutput<typeof AgoraValueSchema>;

export const AgoraCharacterSchema = object({
	characterId: string(),
	name: string(),
	/** e.g. "Royalist noble", "Jacobin lawyer" */
	role: string(),
	portraitUrl: optional(string()),
	/** The character's spoken arguments, in presentation order */
	arguments: array(string()),
	/**
	 * The human needs beneath the positions — the character's answer to
	 * "what do you actually need?", shown after the arguments to build
	 * empathy. Optional for packages authored before the needs stage.
	 */
	needs: optional(array(string())),
	/** The values underlying the arguments — used as the grading answer key */
	values: array(AgoraValueSchema),
	/**
	 * An Odyssey Elder persona (AI character inspired by a historical leader)
	 * appended to a civic package. When any character carries this flag, the
	 * ask-the-characters panel shows only the elders — the two stance "voices"
	 * that wear the schema for the positioning scale stay off the panel.
	 */
	isElder: optional(boolean()),
});

export type AgoraCharacter = InferOutput<typeof AgoraCharacterSchema>;

export const AgoraDialogueLineSchema = object({
	speaker: string(),
	line: string(),
});

export type AgoraDialogueLine = InferOutput<typeof AgoraDialogueLineSchema>;

/**
 * One narrative scene. If videoUrl is missing, clients render the
 * dialogue/text fallback over the scene images.
 */
export const AgoraSceneSchema = object({
	sceneId: string(),
	kind: enum_(AgoraSceneKind),
	title: string(),
	text: string(),
	videoUrl: optional(string()),
	imageUrls: array(string()),
	dialogue: array(AgoraDialogueLineSchema),
});

export type AgoraScene = InferOutput<typeof AgoraSceneSchema>;

export const AgoraHealthMetricDefSchema = object({
	metricId: string(),
	label: string(),
	description: string(),
	min: number(),
	max: number(),
	baseline: number(),
	/** false for metrics where a drop is good (e.g. bread price); default true */
	higherIsBetter: optional(boolean()),
});

export type AgoraHealthMetricDef = InferOutput<typeof AgoraHealthMetricDefSchema>;

export const AgoraRubricCriterionSchema = object({
	criterionId: string(),
	label: string(),
	description: string(),
	/** Relative weight, all criteria of a rubric sum to 1 */
	weight: number(),
});

export type AgoraRubricCriterion = InferOutput<typeof AgoraRubricCriterionSchema>;

export const AgoraPlausibilityRubricSchema = object({
	criteria: array(AgoraRubricCriterionSchema),
});

export type AgoraPlausibilityRubric = InferOutput<typeof AgoraPlausibilityRubricSchema>;

export const AgoraPositioningScaleSchema = object({
	leftLabel: string(),
	rightLabel: string(),
	leftCharacterId: string(),
	rightCharacterId: string(),
});

export type AgoraPositioningScale = InferOutput<typeof AgoraPositioningScaleSchema>;

/** AI-generated or teacher-replaced era artwork for the 2.5D map */
export const AgoraArtworkSchema = object({
	mapBackdropUrl: optional(string()),
	/** location key (e.g. 'portal', 'palace', 'assembly', 'square') → image URL */
	locationVignetteUrls: optional(record(string(), string())),
	/** The style-locked prompt used to generate this set, kept for consistent regeneration */
	stylePrompt: optional(string()),
});

export type AgoraArtwork = InferOutput<typeof AgoraArtworkSchema>;

export const AgoraValueAnswerKeySchema = object({
	characterId: string(),
	expectedValues: array(AgoraValueSchema),
});

export type AgoraValueAnswerKey = InferOutput<typeof AgoraValueAnswerKeySchema>;

/**
 * How a package came to be. A `scenario` is the authored time-tunnel package
 * (characters, scenes, the era's health metrics). A `quick` package is the
 * minimal shell `agoraCreateSession` writes for a game the admin started by
 * typing a main question: two placeholder characters to satisfy the tuple,
 * no scenes, nothing to simulate. Absent means `scenario`.
 */
export const AgoraTopicKindSchema = picklist(['scenario', 'quick']);

export type AgoraTopicKind = InferOutput<typeof AgoraTopicKindSchema>;

export const AgoraTopicPackageSchema = object({
	topicPackageId: string(),
	creatorId: string(),
	kind: optional(AgoraTopicKindSchema),
	/** The teacher's original topic prompt, e.g. "המהפכה הצרפתית" */
	topic: string(),
	/** BCP-47 language code the package content is written in */
	language: string(),
	status: enum_(AgoraTopicStatus),
	title: string(),
	/** The "save the era" mission framing shown to students */
	framingText: string(),
	/**
	 * The first two are the era's two sides (the positioning scale's voices);
	 * any further entries are appended personas — today the Odyssey elders,
	 * flagged `isElder`.
	 */
	characters: tupleWithRest([AgoraCharacterSchema, AgoraCharacterSchema], AgoraCharacterSchema),
	positioningScale: AgoraPositioningScaleSchema,
	challengeQuestion: string(),
	valueAnswerKey: array(AgoraValueAnswerKeySchema),
	plausibilityRubric: AgoraPlausibilityRubricSchema,
	healthMetrics: array(AgoraHealthMetricDefSchema),
	scenes: array(AgoraSceneSchema),
	artwork: optional(AgoraArtworkSchema),
	createdAt: number(),
	lastUpdate: number(),
});

export type AgoraTopicPackage = InferOutput<typeof AgoraTopicPackageSchema>;
