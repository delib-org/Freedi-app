
import { object, string, number, boolean, array, optional, pipe, minValue, picklist, InferOutput } from 'valibot';
import { CreatorSchema } from '../user/User';

// Demographic Tag Schema
export const DemographicTagSchema = object({
  questionId: string(),
  questionText: string(),
  answer: string(),
  color: optional(string()),
});

export type DemographicTag = InferOutput<typeof DemographicTagSchema>;

// Room Settings Status
export const RoomSettingsStatusSchema = picklist(['draft', 'active', 'archived']);

export type RoomSettingsStatus = InferOutput<typeof RoomSettingsStatusSchema>;

// Room Settings Schema
export const RoomSettingsSchema = object({
  settingsId: string(),
  statementId: string(),
  topParentId: string(),
  roomSize: pipe(number(), minValue(2)),
  scrambleByQuestions: array(string()),
  createdAt: number(),
  lastUpdate: number(),
  createdBy: CreatorSchema,
  status: RoomSettingsStatusSchema,
  totalRooms: pipe(number(), minValue(0)),
  totalParticipants: pipe(number(), minValue(0)),
  notificationSent: boolean(),
  notificationSentAt: optional(number()),
});

export type RoomSettings = InferOutput<typeof RoomSettingsSchema>;

// Room Schema
export const RoomSchema = object({
  roomId: string(),
  settingsId: string(),
  statementId: string(),
  roomNumber: pipe(number(), minValue(1)),
  roomName: optional(string()),
  participants: array(string()),
  createdAt: number(),
});

export type Room = InferOutput<typeof RoomSchema>;

// Room Participant Schema
export const RoomParticipantSchema = object({
  participantId: string(),
  settingsId: string(),
  statementId: string(),
  roomId: string(),
  roomNumber: pipe(number(), minValue(1)),
  userId: string(),
  userName: string(),
  demographicTags: array(DemographicTagSchema),
  assignedAt: number(),
  notified: boolean(),
});

export type RoomParticipant = InferOutput<typeof RoomParticipantSchema>;
