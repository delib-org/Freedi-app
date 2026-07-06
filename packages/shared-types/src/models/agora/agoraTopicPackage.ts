import {
	object,
	string,
	number,
	optional,
	array,
	tuple,
	record,
	enum_,
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
	/** The values underlying the arguments — used as the grading answer key */
	values: array(AgoraValueSchema),
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

export const AgoraTopicPackageSchema = object({
	topicPackageId: string(),
	creatorId: string(),
	/** The teacher's original topic prompt, e.g. "המהפכה הצרפתית" */
	topic: string(),
	/** BCP-47 language code the package content is written in */
	language: string(),
	status: enum_(AgoraTopicStatus),
	title: string(),
	/** The "save the era" mission framing shown to students */
	framingText: string(),
	characters: tuple([AgoraCharacterSchema, AgoraCharacterSchema]),
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
