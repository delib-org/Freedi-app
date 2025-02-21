import {
	object,
	string,
	number,
	boolean,
	optional,
	nullable,
	enum_,
	InferOutput,
} from 'valibot';
import { Access, membersAllowed, StepType } from '../TypeEnums';
import { AgreementSchema } from '../agreement/Agreement';

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

export type User = InferOutput<typeof UserSchema>;

export const MembershipSchema = object({
	adminApproveMembers: optional(boolean()),
	access: optional(enum_(Access)),
	typeOfMembersAllowed: optional(enum_(membersAllowed)),
});

export type Membership = InferOutput<typeof MembershipSchema>;

export const StepSchema = object({
	stepId: string(),
	stepType: enum_(StepType),
	instructions: optional(string()),
	duration: optional(number()),
	endTime: optional(number()),
	order: optional(number()),
});

export type Step = InferOutput<typeof StepSchema>;
