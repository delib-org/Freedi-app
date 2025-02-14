import {
	object,
	string,
	optional,
	number,
	enum_,
	nullable,
	InferOutput,
} from 'valibot';
import { AgreementSchema } from '../agreement/Agreement';

export enum Role {
	admin = 'admin',
	member = 'member',
	banned = 'banned',
	unsubscribed = 'unsubscribed',
	creator = 'statement-creator',
}

export enum Languages {
	english = 'en',
	hebrew = 'he',
	arabic = 'ar',
}

export const userSettingsSchema = object({
	userId: string(),
	fontSize: optional(number()),
	color: optional(string()),
	defaultLanguage: optional(enum_(Languages)),
	ent: optional(nullable(AgreementSchema)),
	role: optional(enum_(Role)),
	learning: optional(
		object({
			evaluation: optional(number()),
			addOptions: optional(number()),
		})
	),
});

export type UserSettings = InferOutput<typeof userSettingsSchema>;

export const UserDataSchema = object({
	userId: string(),
	email: optional(string()),
	displayName: optional(string()),
	city: optional(string()),
	country: optional(string()),
	dateOfBirth: optional(number()),
});

export type UserData = InferOutput<typeof UserDataSchema>;
