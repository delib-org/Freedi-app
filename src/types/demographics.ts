import { User, Role, UserDemographicQuestion } from '@freedi/shared-types';

export interface MemberReviewData {
	userId: string;
	user: User;
	role?: Role;
	responses: {
		questionId: string;
		question: string;
		answer: string | string[];
		answeredAt?: number;
	}[];
	joinedAt?: number;
	flags: string[];
	status: 'pending' | 'approved' | 'flagged' | 'banned';
}

export interface InheritedQuestion extends UserDemographicQuestion {
	/** ID of the source statement */
	sourceStatementId: string;
	/** Title/name of the source statement */
	sourceStatementTitle: string;
	/** Whether this is a group-level or statement-level source */
	sourceType: 'group' | 'discussion';
	/** Whether this inherited question is enabled for the current statement */
	isEnabled: boolean;
}
