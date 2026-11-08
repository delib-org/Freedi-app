export type CovenantPosition = 'endorse' | 'no-objection' | 'object';
export interface CovenantClause {
	id: string;
	text: string;
	sourceId: string;
	sourceText: string;
}
export interface CovenantNote {
	id: string;
	clauseId: string;
	authorId: string;
	text: string;
	proposedText: string;
	createdAt: number;
	status: 'open' | 'accepted' | 'withdrawn';
}
export interface CovenantReview {
	version: number;
	title: string;
	clauses: CovenantClause[];
	reviewerIds: string[];
	threshold: number;
	positions: Record<string, { position: CovenantPosition; reason: string; at: number }>;
	openedAt: number;
	adoptedAt?: number;
	adoptedBy?: string;
}
export interface CovenantRecord {
	questionId: string;
	title: string;
	revision: number;
	phase: 'draft' | 'review' | 'adopted';
	clauses: CovenantClause[];
	notes: CovenantNote[];
	reviews: CovenantReview[];
	updatedAt: number;
}
export type CovenantAction =
	| { type: 'title'; text: string }
	| { type: 'add-clause'; sourceId: string }
	| { type: 'amend'; clauseId: string; text: string; reason: string }
	| { type: 'remove-clause'; clauseId: string; reason: string }
	| { type: 'note'; clauseId: string; text: string; proposedText: string }
	| { type: 'accept-note'; noteId: string }
	| { type: 'withdraw-note'; noteId: string }
	| { type: 'open-review'; reviewerIds: string[]; threshold: number }
	| { type: 'position'; version: number; position: CovenantPosition; reason: string }
	| { type: 'reopen' }
	| { type: 'adopt'; version: number };
export interface CovenantMember {
	uid: string;
	name: string;
}
export interface CovenantResponse {
	record: CovenantRecord;
	members: CovenantMember[];
	canManage: boolean;
}
export function covenantReadiness(review: CovenantReview | undefined) {
	const positions = review
		? review.reviewerIds.map((uid) =>
				Object.prototype.hasOwnProperty.call(review.positions, uid)
					? review.positions[uid]
					: undefined,
			)
		: [];
	const endorsed = positions.filter((p) => p?.position === 'endorse').length;
	const objections = positions.filter((p) => p?.position === 'object').length;
	const answered = positions.filter(Boolean).length;
	const total = positions.length;
	return {
		total,
		answered,
		endorsed,
		objections,
		noObjection: positions.filter((p) => p?.position === 'no-objection').length,
		ready:
			!!review &&
			total > 0 &&
			answered === total &&
			objections === 0 &&
			endorsed * 100 >= total * review.threshold,
	};
}
export function emptyCovenant(questionId: string, title: string): CovenantRecord {
	return {
		questionId,
		title,
		revision: 0,
		phase: 'draft',
		clauses: [],
		notes: [],
		reviews: [],
		updatedAt: 0,
	};
}
