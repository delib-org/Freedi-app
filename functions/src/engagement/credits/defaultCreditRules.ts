import { CreditAction } from '@freedi/shared-types';
import type { CreditRule } from '@freedi/shared-types';

/**
 * Default credit rules to seed into the creditRules collection.
 * These are Firestore-configurable - no code deploys needed to change values.
 */
export const DEFAULT_CREDIT_RULES: CreditRule[] = [
	{
		ruleId: CreditAction.JOIN_DISCUSSION,
		action: CreditAction.JOIN_DISCUSSION,
		baseAmount: 5,
		cooldownMs: 0,
		dailyLimit: 10,
		enabled: true,
	},
	{
		ruleId: CreditAction.EVALUATE_OPTION,
		action: CreditAction.EVALUATE_OPTION,
		baseAmount: 3,
		cooldownMs: 30_000, // 30 seconds
		dailyLimit: 20,
		enabled: true,
	},
	{
		ruleId: CreditAction.CREATE_OPTION,
		action: CreditAction.CREATE_OPTION,
		baseAmount: 10,
		cooldownMs: 0,
		dailyLimit: 5,
		qualityGate: {
			minTextLength: 20,
		},
		enabled: true,
	},
	{
		ruleId: CreditAction.COMMENT,
		action: CreditAction.COMMENT,
		baseAmount: 2,
		cooldownMs: 0,
		dailyLimit: 15,
		qualityGate: {
			minTextLength: 10,
		},
		enabled: true,
	},
	{
		ruleId: CreditAction.VOTE,
		action: CreditAction.VOTE,
		baseAmount: 5,
		cooldownMs: 0,
		dailyLimit: 10,
		enabled: true,
	},
	{
		ruleId: CreditAction.SIGN_DOCUMENT,
		action: CreditAction.SIGN_DOCUMENT,
		baseAmount: 10,
		cooldownMs: 0,
		dailyLimit: 5,
		enabled: true,
	},
	{
		ruleId: CreditAction.DAILY_LOGIN,
		action: CreditAction.DAILY_LOGIN,
		baseAmount: 2,
		cooldownMs: 0,
		dailyLimit: 1,
		enabled: true,
	},
	{
		ruleId: CreditAction.STREAK_BONUS,
		action: CreditAction.STREAK_BONUS,
		baseAmount: 15,
		cooldownMs: 0,
		dailyLimit: 1,
		enabled: true,
	},
	{
		ruleId: CreditAction.CONSENSUS_REACHED,
		action: CreditAction.CONSENSUS_REACHED,
		baseAmount: 25,
		cooldownMs: 0,
		dailyLimit: 5,
		enabled: true,
	},
	{
		ruleId: CreditAction.SUGGESTION_ACCEPTED,
		action: CreditAction.SUGGESTION_ACCEPTED,
		baseAmount: 30,
		cooldownMs: 0,
		dailyLimit: 5,
		enabled: true,
	},
	{
		ruleId: CreditAction.MC_PARTICIPATION,
		action: CreditAction.MC_PARTICIPATION,
		baseAmount: 3,
		cooldownMs: 10_000, // 10 seconds
		dailyLimit: 50,
		enabled: true,
	},
	{
		ruleId: CreditAction.INVITE_FRIEND,
		action: CreditAction.INVITE_FRIEND,
		baseAmount: 10,
		cooldownMs: 0,
		dailyLimit: 5,
		enabled: true,
	},
];
