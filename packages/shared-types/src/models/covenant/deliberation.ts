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
