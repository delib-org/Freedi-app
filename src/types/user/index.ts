import {
	object,
	string,
	number,
	boolean,
	optional,
	nullable,
	enum_,
	InferInput,
} from 'valibot';
import { Access, membersAllowed, StepType } from '../enums';

const AgreementSchema = object({
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
