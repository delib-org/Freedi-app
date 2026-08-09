import { describe, it, expect } from 'vitest';
import { safeParse } from 'valibot';
import {
	AgoraDeviceMode,
	AgoraMessageKind,
	AgoraSession,
	AgoraSessionStatus,
	AgoraStage,
	AgoraSuggestionStatus,
	SourceApp,
	StatementSchema,
	StatementType,
} from '@freedi/shared-types';
import {
	buildProposalStatement,
	buildSuggestionStatement,
	buildThreadMessageStatement,
} from '../statementDocs';

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

		// The wrapper is the compat contract: legacy call sites must keep
		// producing suggestion-kind messages keyed by their own author
		it('is a suggestion-kind thread message keyed by its author', () => {
			expect(suggestion.agoraMessageKind).toBe(AgoraMessageKind.suggestion);
			expect(suggestion.agoraThreadUserId).toBe('other-uid');
		});
	});

	describe('buildThreadMessageStatement', () => {
		const chat = buildThreadMessageStatement(
			session,
			'proposal-1',
			'message-1',
			'teacherless-uid',
			'quiet-elk',
			'Could you make the arbitration part more concrete?',
			AgoraMessageKind.chat,
			'helper-uid',
		);

		it('produces a document the shared StatementSchema accepts', () => {
			const result = safeParse(StatementSchema, chat);
			expect(result.success).toBe(true);
		});

		// A chat message with a status would enter the accept/weave economy —
		// the one thing plain conversation must never do
		it('a chat message carries NO suggestionStatus', () => {
			expect(chat.agoraMessageKind).toBe(AgoraMessageKind.chat);
			expect(chat.suggestionStatus).toBeUndefined();
		});

		// The owner's reply lands in the HELPER's conversation, not their own
		it('keys the thread by the helper uid it was given', () => {
			expect(chat.agoraThreadUserId).toBe('helper-uid');
		});

		it('a suggestion-kind message opens in the awaiting-author state', () => {
			const idea = buildThreadMessageStatement(
				session,
				'proposal-1',
				'message-2',
				'helper-uid',
				'brave-fox',
				'Add a drought clause',
				AgoraMessageKind.suggestion,
				'helper-uid',
			);
			expect(idea.suggestionStatus).toBe(AgoraSuggestionStatus.open);
			expect(safeParse(StatementSchema, idea).success).toBe(true);
		});
	});
});
