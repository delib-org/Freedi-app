// Re-export room assignment types from delib-npm 5.6.76
export {
	RoomSchema,
	RoomSettingsSchema,
	RoomParticipantSchema,
	DemographicTagSchema,
} from 'delib-npm';

export type {
	Room,
	RoomSettings,
	RoomParticipant,
	DemographicTag,
	Creator,
} from 'delib-npm';

// Room Settings Status type (derived from schema)
export type RoomSettingsStatus = 'draft' | 'active' | 'archived';

// Helper function to create a participant ID
export function createParticipantId(settingsId: string, userId: string): string {
	return `${settingsId}--${userId}`;
}
