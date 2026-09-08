import { describe, expect, it } from 'vitest';
import { AgoraMessageKind, type AgoraParticipant } from '@freedi/shared-types';
import type { AgoraProposal } from '../proposals';
import { authorsOf, buildTextRows, filterRows } from '../flows/moderationQueue';

function item(overrides: Partial<AgoraProposal>): AgoraProposal {
	return {
		statementId: 'x',
		statement: 'words',
		creatorId: 'a',
		anonName: 'Alpha',
		statementType: 'option',
		parentId: 'q',
		createdAt: 1,
		lastUpdate: 1,
		...overrides,
	};
}

const participants: AgoraParticipant[] = ['a', 'b'].map((uid) => ({
	participantId: `s--${uid}`,
	sessionId: 's',
	userId: uid,
	anonName: uid === 'a' ? 'Alpha' : 'Beta',
	points: { valueAccuracy: 0, proposals: 0, helping: 0, total: 0 },
	joinedAt: 0,
	lastActive: 0,
}));

describe('buildTextRows', () => {
	const rows = buildTextRows({
		proposals: [
			item({ statementId: 'p1', createdAt: 5 }),
			item({ statementId: 'p2', creatorId: 'b', anonName: 'Beta', createdAt: 9, hidden: true }),
			item({ statementId: 'ai', creatorId: 'agora-ai--x--1', createdAt: 99 }),
			item({ statementId: 'pitch', creatorId: 'b', anonName: 'Beta', createdAt: 12 }),
		],
		answersByQuestion: { q2: [item({ statementId: 'ans', createdAt: 3, teacherEdited: true })] },
		suggestions: {
			p1: [
				item({
					statementId: 'sug',
					creatorId: 'b',
					anonName: 'Beta',
					statementType: 'suggestion',
					createdAt: 7,
				}),
				item({
					statementId: 'chat',
					creatorId: 'b',
					statementType: 'suggestion',
					agoraMessageKind: AgoraMessageKind.chat,
					createdAt: 8,
				}),
				item({
					statementId: 'edit',
					statementType: 'suggestion',
					agoraMessageKind: AgoraMessageKind.edit,
					createdAt: 10,
				}),
			],
		},
		participants,
		challengerStatementId: 'pitch',
	});

	it('flattens every student line, newest first, without system lines or AI authors', () => {
		expect(rows.map((r) => r.statementId)).toEqual(['pitch', 'p2', 'chat', 'sug', 'p1', 'ans']);
	});

	it('labels kinds and carries the marks', () => {
		const byId = Object.fromEntries(rows.map((r) => [r.statementId, r]));
		expect(byId.pitch.kind).toBe('pitch');
		expect(byId.p2.hidden).toBe(true);
		expect(byId.ans.kind).toBe('answer');
		expect(byId.ans.editedByTeacher).toBe(true);
		expect(byId.chat.kind).toBe('chat');
		expect(byId.sug.proposalId).toBe('p1');
	});

	it('filters by author, kind and hidden state', () => {
		expect(filterRows(rows, { showHidden: false }).some((r) => r.hidden)).toBe(false);
		expect(
			filterRows(rows, { showHidden: true, studentUid: 'a' }).map((r) => r.statementId),
		).toEqual(['p1', 'ans']);
		expect(filterRows(rows, { showHidden: true, kind: 'chat' })).toHaveLength(1);
	});

	it('lists authors by pseudonym, sorted', () => {
		expect(authorsOf(rows)).toEqual([
			{ uid: 'a', anonName: 'Alpha' },
			{ uid: 'b', anonName: 'Beta' },
		]);
	});
});
