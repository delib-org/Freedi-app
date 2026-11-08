/**
 * How often each AI and email endpoint may run.
 *
 * Anonymous sign-in is open, so a uid budget alone stops nothing: a script mints
 * a new uid per call. The global daily ceiling is what bounds the bill, and the
 * per-IP budget keeps one address from spending that ceiling for everyone.
 *
 * `perIpPerHour` is deliberately absent on endpoints reached through the MC and
 * Sign server routes. Those calls arrive from Vercel, so all of their users share
 * a handful of addresses and an IP budget would count them as one person.
 */
export interface RateBudget {
	/** Namespace of the counter documents */
	name: string;
	perUidPerHour: number;
	perIpPerHour?: number;
	globalPerDay: number;
}

const budget = (
	name: string,
	perUidPerHour: number,
	globalPerDay: number,
	perIpPerHour?: number,
): RateBudget => ({ name, perUidPerHour, globalPerDay, perIpPerHour });

/** Roomy enough that a class behind one school address is not throttled together. */
const CLASSROOM_IP_HOUR = 600;

export const RATE_BUDGETS = {
	findSimilarStatements: budget('findSimilarStatements', 60, 30000),
	prepareSuggestion: budget('prepareSuggestion', 60, 30000),
	detectMultipleSuggestions: budget('detectMultipleSuggestions', 60, 30000),
	mergeStatements: budget('mergeStatements', 30, 5000),
	processVersionAI: budget('processVersionAI', 20, 500),
	generateDocumentReportAI: budget('generateDocumentReportAI', 20, 200),
	processRefinementAI: budget('processRefinementAI', 30, 1000),
	rescoreStatement: budget('rescoreStatement', 30, 500),

	improveSuggestion: budget('improveSuggestion', 30, 10000, CLASSROOM_IP_HOUR),
	detectStatementType: budget('detectStatementType', 120, 30000, CLASSROOM_IP_HOUR),
	checkProfanity: budget('checkProfanity', 120, 30000, CLASSROOM_IP_HOUR),
	analyzeFalsifiability: budget('analyzeFalsifiability', 30, 5000, CLASSROOM_IP_HOUR),
	refineIdea: budget('refineIdea', 60, 5000, CLASSROOM_IP_HOUR),
	summarizeLink: budget('summarizeLink', 30, 2000, CLASSROOM_IP_HOUR),
	generateDialecticalRevision: budget('generateDialecticalRevision', 30, 3000, CLASSROOM_IP_HOUR),
	getCluster: budget('getCluster', 10, 200, CLASSROOM_IP_HOUR),

	addEmailSubscriber: budget('addEmailSubscriber', 10, 5000, CLASSROOM_IP_HOUR),
	addFeedback: budget('addFeedback', 5, 200, CLASSROOM_IP_HOUR),
	sendEmailToSubscribers: budget('sendEmailToSubscribers', 5, 100),
} as const;

/** Addressees across every admin send in a day. One Gmail account carries them all. */
export const EMAIL_RECIPIENTS_GLOBAL_PER_DAY = 2000;
