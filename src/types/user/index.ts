import {
	object,
	string,
	number,
	boolean,
	optional,
	nullable,
	enum_,
	InferInput,
	InferOutput,
} from 'valibot';
import { Access, membersAllowed, StepType } from '../enums';

export const AgreementSchema = object({
	text: string(),
	date: number(),
	version: string(),
});

export type Agreement = InferInput<typeof AgreementSchema>;

export const UserSchema = object({
	displayName: string(),
	defaultLanguage: optional(string()),
	email: optional(nullable(string())),
	photoURL: optional(nullable(string())),
	uid: string(),
	isAnonymous: optional(boolean()),
	fontSize: optional(nullable(number())),
	color: optional(string()),
	agreement: optional(nullable(AgreementSchema)),
	role: optional(string()),
});

export type User = InferInput<typeof UserSchema>;

export const DocumentApprovalSchema = object({
	approved: number(),
	totalVoters: number(),
	averageApproval: number(),
});

export type DocumentApproval = InferInput<typeof DocumentApprovalSchema>;

export const DocumentImportanceSchema = object({
	numberOfUsers: number(),
	averageImportance: number(),
	sumImportance: number(),
});

export type DocumentImportance = InferInput<typeof DocumentImportanceSchema>;

export const AgreeSchema = object({
	agree: optional(number()),
	disagree: optional(number()),
	avgAgree: optional(number()),
});

export type Agree = InferInput<typeof AgreeSchema>;

export const MembershipSchema = object({
	adminApproveMembers: optional(boolean()),
	access: optional(enum_(Access)),
	typeOfMembersAllowed: optional(enum_(membersAllowed)),
});

export type Membership = InferInput<typeof MembershipSchema>;

export const StepSchema = object({
	stepId: string(),
	stepType: enum_(StepType),
	instructions: optional(string()),
	duration: optional(number()),
	endTime: optional(number()),
	order: optional(number()),
});

export type Step = InferInput<typeof StepSchema>;

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
	defaultLanguage: enum_(Languages),
	ent: optional(nullable(AgreementSchema)),
	role: enum_(Role),
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
