import { object, string, number, boolean, tuple, optional, type InferOutput } from 'valibot';
import { CreatorSchema } from 'delib-npm';

// SpectrumSettings - admin-configurable spectrum question for room assignment
export const SpectrumSettingsSchema = object({
	settingsId: string(),
	statementId: string(),          // The question this applies to
	questionText: string(),         // e.g., "Where do you stand on this issue?"
	labels: tuple([                 // 5 labels for positions 1-5
		string(),
		string(),
		string(),
		string(),
		string(),
	]),
	enabled: boolean(),
	createdAt: number(),
	lastUpdate: optional(number()),
	createdBy: CreatorSchema,
});

export type SpectrumSettings = InferOutput<typeof SpectrumSettingsSchema>;

// Default spectrum labels
export const DEFAULT_SPECTRUM_LABELS: [string, string, string, string, string] = [
	'Very Left',
	'Left',
	'Center',
	'Right',
	'Very Right',
];

// Default spectrum question
export const DEFAULT_SPECTRUM_QUESTION = 'Where do you position yourself on this topic?';

// Helper to create default spectrum settings
export function createDefaultSpectrumSettings(
	settingsId: string,
	statementId: string,
	createdBy: { uid: string; displayName: string }
): SpectrumSettings {
	return {
		settingsId,
		statementId,
		questionText: DEFAULT_SPECTRUM_QUESTION,
		labels: DEFAULT_SPECTRUM_LABELS,
		enabled: true,
		createdAt: Date.now(),
		createdBy: {
			uid: createdBy.uid,
			displayName: createdBy.displayName,
		},
	};
}
