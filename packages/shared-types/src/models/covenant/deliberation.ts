export interface AgreementLink {
	questionId: string;
	familyId: string;
	previousId?: string;
	kind: 'initial' | 'version' | 'alternative';
	sourceHash: string;
	sourceIds: string[];
	introduction: string;
	model?: string;
}
export interface AgreementSnapshot {
	id: string;
	title: string;
	hash: string;
	introduction: string;
	familyId: string;
	previousId?: string;
	kind: string;
	cp: number;
	evaluators: number;
	myRating: number | null;
	agreed: boolean;
	paragraphs: Array<{ id: string; text: string; type: string }>;
}
export interface AgreementChange {
	id: string;
	documentId: string;
	baseHash: string;
	authorId: string;
	issue: string;
	changes: Array<{ paragraphId: string; text: string }>;
	status: 'open' | 'applied';
	resultId?: string;
}
export interface DeliberationStatus {
	questionId: string;
	canManage: boolean;
	sources: Array<{ id: string; text: string; cp: number }>;
	sourceHash: string;
	summary: string;
	summaryAt: number;
	summaryStale: boolean;
	agreements: AgreementSnapshot[];
	changes: AgreementChange[];
	ballots: Array<{
		id: string;
		title: string;
		result: { documentId: string; hash: string; title: string; at: number; votes: number } | null;
	}>;
	automatic: boolean;
}

/** Shared workflow limits; validation and input controls must agree. */
export const DELIBERATION_LIMITS = {
 agreementCp: 0.7,
 issueCharacters: 1500,
 paragraphCharacters: 5000,
 titleCharacters: 200,
 idCharacters: 128,
 paragraphs: 100,
 changesPerRequest: 30,
 ballotAlternatives: 12,
 pollMs: 30_000,
 generationTimeoutMs: 9 * 60 * 1000,
 draftTokens: 12_000,
 handoffTtlMs: 60_000,
 handoffCodeCharacters: 100,
} as const;
