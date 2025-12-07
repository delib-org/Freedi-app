import { object, string, number, optional, type InferOutput } from 'valibot';

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

// JoinedParticipant - stores spectrum data when user joins an option
export const JoinedParticipantSchema = object({
	participantId: string(),      // {statementId}--{userId}
	statementId: string(),        // The option ID user joined
	parentId: string(),           // The question ID (parent of option)
	userId: string(),
	userName: string(),
	userPhoto: optional(string()),
	spectrum: number(),           // 1-5 scale
	joinedAt: number(),           // timestamp in milliseconds
});

export type JoinedParticipant = InferOutput<typeof JoinedParticipantSchema>;

// Helper function to create a participant ID
export function createParticipantId(settingsId: string, userId: string): string {
	return `${settingsId}--${userId}`;
}

// Helper function to create a joined participant ID
export function createJoinedParticipantId(statementId: string, userId: string): string {
	return `${statementId}--${userId}`;
}
