import { describe, it, expect } from 'vitest';
import { safeParse } from 'valibot';
import {
	AgoraDeviceMode,
	AgoraSession,
	AgoraSessionStatus,
	AgoraStage,
	AgoraSuggestionStatus,
	SourceApp,
	StatementSchema,
	StatementType,
} from '@freedi/shared-types';
import { buildProposalStatement, buildSuggestionStatement } from '../statementDocs';

const session: AgoraSession = {
	sessionId: 'session-1',
	code: 'AB12',
	topicPackageId: 'topic-1',
	teacherId: 'teacher-uid',
	rootStatementId: 'root-1',
	challengeQuestionId: 'challenge-1',
	deviceMode: AgoraDeviceMode.individual,
	teamSizeMax: 4,
	stage: AgoraStage.deliberation,
	roundNumber: 1,
	participantCount: 2,
	status: AgoraSessionStatus.open,
	createdAt: 1,
	lastUpdate: 1,
};

describe('statementDocs', () => {
	describe('buildProposalStatement', () => {
		const proposal = buildProposalStatement(
			session,
			'proposal-1',
			'student-uid',
			'swift-owl',
			'Split the water rights by season',
		);

		// The regression this file exists for: an incomplete doc is accepted by
		// Firestore but rejected by every shared trigger that parses it first.
		it('produces a document the shared StatementSchema accepts', () => {
			const result = safeParse(StatementSchema, proposal);
			expect(result.success).toBe(true);
		});

		it('hangs off the challenge question, under the session root', () => {
			expect(proposal.statementType).toBe(StatementType.option);
			expect(proposal.parentId).toBe('challenge-1');
			expect(proposal.topParentId).toBe('root-1');
			expect(proposal.parents).toEqual(['root-1', 'challenge-1']);
		});

		it('carries the session handle and app provenance', () => {
			expect(proposal.agoraSessionId).toBe('session-1');
			expect(proposal.sourceApp).toBe(SourceApp.AGORA);
		});

		// Classmates read `creator.displayName` directly, so a real account name
		// there would deanonymize the author mid-lesson.
		it('shows the pseudonym as the creator name, never the account name', () => {
			expect(proposal.creator.displayName).toBe('swift-owl');
			expect(proposal.creator.isAnonymous).toBe(true);
			expect(proposal.creator.email).toBeNull();
			expect(proposal.creator.uid).toBe('student-uid');
			expect(proposal.creatorId).toBe('student-uid');
			expect(proposal.anonName).toBe('swift-owl');
		});
	});

	describe('buildSuggestionStatement', () => {
		const suggestion = buildSuggestionStatement(
			session,
			'proposal-1',
			'suggestion-1',
			'other-uid',
			'brave-fox',
			'Name who arbitrates when the seasons are disputed',
		);

		it('produces a document the shared StatementSchema accepts', () => {
			const result = safeParse(StatementSchema, suggestion);
			expect(result.success).toBe(true);
		});

		it('is parented on the proposal it improves, with the full ancestor chain', () => {
			expect(suggestion.statementType).toBe(StatementType.suggestion);
			expect(suggestion.parentId).toBe('proposal-1');
			expect(suggestion.topParentId).toBe('root-1');
			expect(suggestion.parents).toEqual(['root-1', 'challenge-1', 'proposal-1']);
		});

		it('opens in the awaiting-author state', () => {
			expect(suggestion.suggestionStatus).toBe(AgoraSuggestionStatus.open);
		});
	});
});
