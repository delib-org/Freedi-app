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
	/**
	 * Refuse the call when the limiter itself errors. Email only: a burst of mail
	 * cannot be taken back, while a burst of AI calls is a bill the global ceiling
	 * still bounds, and refusing it would lock a classroom out on contention.
	 */
	failClosed?: boolean;
}

const budget = (
	name: string,
	perUidPerHour: number,
	globalPerDay: number,
	perIpPerHour?: number,
): RateBudget => ({ name, perUidPerHour, globalPerDay, perIpPerHour });

const emailBudget = (
	name: string,
	perUidPerHour: number,
	globalPerDay: number,
	perIpPerHour?: number,
): RateBudget => ({ ...budget(name, perUidPerHour, globalPerDay, perIpPerHour), failClosed: true });

/** Roomy enough that a whole school behind one address is not throttled together. */
const SCHOOL_IP_HOUR = 3000;
/** Subscribing happens once per person, so this stays tighter: it limits mailing-list stuffing. */
const EMAIL_IP_HOUR = 600;

export const RATE_BUDGETS = {
	findSimilarStatements: budget('findSimilarStatements', 60, 30000),
	prepareSuggestion: budget('prepareSuggestion', 60, 30000),
	detectMultipleSuggestions: budget('detectMultipleSuggestions', 60, 30000),
	mergeStatements: budget('mergeStatements', 30, 5000),
	processVersionAI: budget('processVersionAI', 20, 500),
	generateDocumentReportAI: budget('generateDocumentReportAI', 20, 200),
	processRefinementAI: budget('processRefinementAI', 30, 1000),
	rescoreStatement: budget('rescoreStatement', 30, 500),

	// No IP budget: these run on every keystroke-sized action, so a class behind
	// one address would turn a single IP document into a write hot spot.
	detectStatementType: budget('detectStatementType', 120, 30000),
	checkProfanity: budget('checkProfanity', 120, 30000),

	// A person asks once per few answers rated, plus a call when they reopen the tab.
	// No IP budget: a whole school rates at once from one address.
	getAnswerBatch: budget('getAnswerBatch', 300, 500000),

	improveSuggestion: budget('improveSuggestion', 30, 10000, SCHOOL_IP_HOUR),
	analyzeFalsifiability: budget('analyzeFalsifiability', 30, 5000, SCHOOL_IP_HOUR),
	refineIdea: budget('refineIdea', 60, 5000, SCHOOL_IP_HOUR),
	summarizeLink: budget('summarizeLink', 30, 2000, SCHOOL_IP_HOUR),
	generateDialecticalRevision: budget('generateDialecticalRevision', 30, 3000, SCHOOL_IP_HOUR),
	getCluster: budget('getCluster', 10, 200, SCHOOL_IP_HOUR),

	addEmailSubscriber: emailBudget('addEmailSubscriber', 10, 5000, EMAIL_IP_HOUR),
	addFeedback: emailBudget('addFeedback', 5, 200, EMAIL_IP_HOUR),
	sendEmailToSubscribers: emailBudget('sendEmailToSubscribers', 5, 100),
} as const;

/** Addressees across every admin send in a day. One Gmail account carries them all. */
export const EMAIL_RECIPIENTS_GLOBAL_PER_DAY = 2000;
