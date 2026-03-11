import {
	type InferOutput,
	boolean,
	enum_,
	number,
	object,
	optional,
	record,
	string,
} from 'valibot';
import { CreditAction } from './CreditAction';
import { SourceApp } from './SourceApp';

export const CreditRuleSchema = object({
	ruleId: string(),
	action: enum_(CreditAction),
	baseAmount: number(),
	cooldownMs: number(),
	dailyLimit: number(),
	qualityGate: optional(
		object({
			minTextLength: optional(number()),
			minEvaluators: optional(number()),
		})
	),
	appMultipliers: optional(record(string(), number())),
	enabled: boolean(),
});

export type CreditRule = InferOutput<typeof CreditRuleSchema>;

export const CreditTransactionSchema = object({
	transactionId: string(),
	userId: string(),
	action: enum_(CreditAction),
	amount: number(),
	sourceApp: enum_(SourceApp),
	statementId: optional(string()),
	parentId: optional(string()),
	topParentId: optional(string()),
	metadata: optional(record(string(), string())),
	createdAt: number(),
});

export type CreditTransaction = InferOutput<typeof CreditTransactionSchema>;
