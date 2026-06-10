import {
	object,
	string,
	number,
	boolean,
	optional,
	enum_,
	record,
	InferOutput,
} from 'valibot';
import { NotificationFrequency } from '../engagement/NotificationFrequency';

/**
 * Per-user, app-agnostic notification preferences stored at
 * `notificationSettings/{uid}`. This is the home for user-wide settings —
 * the master mute, per-channel master switches, quiet hours, digest cadence,
 * and per-source-app overrides. Per-discussion overrides continue to live on
 * `statementsSubscribe/{uid}--{statementId}` (channel flags, notificationFrequency,
 * branchPreferences, mutedUntil).
 *
 * Quiet hours previously lived per-device on `pushNotifications/{token}.quietHours`,
 * which diverged across devices. This per-user doc replaces that (with a
 * fallback read during migration).
 */

export const QuietHoursSchema = object({
	enabled: boolean(),
	startTime: string(), // 'HH:mm' local
	endTime: string(), // 'HH:mm' local
	timezone: string(), // IANA, e.g. 'Asia/Jerusalem'
});

export type QuietHours = InferOutput<typeof QuietHoursSchema>;

export const ChannelSwitchesSchema = object({
	push: boolean(),
	inApp: boolean(),
	email: boolean(),
});

export type ChannelSwitches = InferOutput<typeof ChannelSwitchesSchema>;

export const PerAppNotificationSettingsSchema = object({
	muted: boolean(),
	channels: optional(ChannelSwitchesSchema),
});

export type PerAppNotificationSettings = InferOutput<
	typeof PerAppNotificationSettingsSchema
>;

export const NotificationSettingsSchema = object({
	userId: string(),
	muted: boolean(), // master mute (the easy one-tap toggle)
	defaultChannels: ChannelSwitchesSchema, // per-channel master switches
	defaultFrequency: enum_(NotificationFrequency), // default INSTANT
	quietHours: optional(QuietHoursSchema), // user-wide, replaces per-token
	perApp: optional(record(string(), PerAppNotificationSettingsSchema)), // keyed by SourceApp value
	digestHourLocal: optional(number()), // 0-23, hour to deliver the daily digest
	weeklyDigestDay: optional(number()), // 0-6 (Sun-Sat), day for weekly digest
	createdAt: number(),
	lastUpdate: number(),
});

export type NotificationSettings = InferOutput<typeof NotificationSettingsSchema>;

/**
 * Default settings for a user who has never configured notifications.
 * Conservative low-noise defaults: in-app + push on, email off, instant
 * frequency (the backend down-grades non-critical events to digest), and
 * quiet hours 21:00–08:00 enabled.
 */
export function createDefaultNotificationSettings(
	userId: string,
	now: number,
	timezone = 'UTC'
): NotificationSettings {
	return {
		userId,
		muted: false,
		defaultChannels: { push: true, inApp: true, email: false },
		defaultFrequency: NotificationFrequency.INSTANT,
		quietHours: {
			enabled: true,
			startTime: '21:00',
			endTime: '08:00',
			timezone,
		},
		createdAt: now,
		lastUpdate: now,
	};
}
