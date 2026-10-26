import { describe, expect, it } from 'vitest';
import type { Statement } from '@freedi/shared-types';
import {
	firstUnreadId,
	newReplyIds,
	noticeKey,
	replyNotice,
	replyRole,
	threadsToOpen,
	unreadLineKey,
	unreadReplies,
	visibleReplies,
} from '../replyLogic';

const AUTHOR = 'author';
const MATE = 'mate';

function reply(id: string, over: Partial<Statement> = {}): Statement {
	return {
		statementId: id,
		statement: `text ${id}`,
		statementType: 'statement',
		parentId: 'p1',
		topParentId: 'main',
		creatorId: MATE,
		creator: { uid: MATE, displayName: 'Noa' },
		createdAt: 0,
		lastUpdate: 0,
		consensus: 0,
		classReply: { role: 'class', proposalCreatorId: AUTHOR },
		...over,
	} as Statement;
}

describe('visibleReplies', () => {
	const list = [
		reply('late', { createdAt: 30 }),
		reply('early', { createdAt: 10 }),
		reply('hidden', { createdAt: 20, hide: true }),
		reply('mine-hidden', { createdAt: 25, hide: true, creatorId: 'me' }),
		reply('not-a-reply', { createdAt: 5, classReply: undefined }),
	];

	it('shows oldest first, drops hidden ones and non-replies', () => {
		expect(visibleReplies(list, 'someone').map((r) => r.statementId)).toEqual(['early', 'late']);
	});

	it('keeps the viewer own hidden reply (greyed) and every one for the teacher', () => {
		expect(visibleReplies(list, 'me').map((r) => r.statementId)).toEqual([
			'early',
			'mine-hidden',
			'late',
		]);
		expect(visibleReplies(list, 'teacher', true)).toHaveLength(4);
	});
});

describe('unread replies for the author', () => {
	const list = [
		reply('old', { createdAt: 10 }),
		reply('new1', { createdAt: 30 }),
		reply('own', {
			createdAt: 40,
			creatorId: AUTHOR,
			classReply: { role: 'author', proposalCreatorId: AUTHOR },
		}),
		reply('hidden', { createdAt: 50, hide: true }),
		reply('new2', { createdAt: 60 }),
	];

	it('counts replies by others, not hidden, after the read mark', () => {
		expect(unreadReplies(list, AUTHOR, 20).map((r) => r.statementId)).toEqual(['new1', 'new2']);
		expect(unreadReplies(list, AUTHOR, undefined)).toHaveLength(3);
		expect(unreadReplies(list, AUTHOR, 100)).toHaveLength(0);
	});

	it('finds the first unread one in reading order', () => {
		expect(firstUnreadId(list, AUTHOR, 20)).toBe('new1');
		expect(firstUnreadId(list, AUTHOR, 100)).toBeNull();
	});

	it('words the count on the own card', () => {
		expect(unreadLineKey(0)).toBeNull();
		expect(unreadLineKey(1)).toEqual({ key: 'reply.new_one' });
		expect(unreadLineKey(3)).toEqual({ key: 'reply.new_n', params: { n: 3 } });
	});
});

describe('replyRole', () => {
	it('reads the server marker and treats an unmarked one as a classmate', () => {
		expect(
			replyRole(reply('t', { classReply: { role: 'teacher', proposalCreatorId: AUTHOR } })),
		).toBe('teacher');
		expect(replyRole(reply('c', { classReply: undefined }))).toBe('class');
	});
});

describe('replyNotice', () => {
	const r1 = reply('r1', { createdAt: 10 });
	const r2 = reply('r2', { createdAt: 20, parentId: 'p2' });

	it('counts unread replies by others and names the proposal of the oldest', () => {
		expect(replyNotice([r2, r1], AUTHOR, undefined)).toEqual({ count: 2, proposalId: 'p1' });
	});

	it("skips replies at or before the read mark, hidden ones, and the author's own", () => {
		expect(replyNotice([r1, r2], AUTHOR, 10)).toEqual({ count: 1, proposalId: 'p2' });
		expect(replyNotice([reply('h', { createdAt: 5, hide: true })], AUTHOR, 0).count).toBe(0);
		expect(replyNotice([reply('own', { createdAt: 5, creatorId: AUTHOR })], AUTHOR, 0).count).toBe(
			0,
		);
	});

	it('drops a reply the teacher hid at once, and replies under a hidden proposal', () => {
		expect(replyNotice([{ ...r1, hide: true }, r2], AUTHOR, undefined).count).toBe(1);
		expect(replyNotice([r1, r2], AUTHOR, undefined, new Set(['p1']))).toEqual({
			count: 1,
			proposalId: 'p2',
		});
	});

	it('is empty when there is nothing', () => {
		expect(replyNotice([], AUTHOR, undefined)).toEqual({ count: 0, proposalId: null });
	});
});

describe('newReplyIds', () => {
	it('tags every reply newer than the read mark, not only the first', () => {
		const list = [
			reply('a', { createdAt: 1 }),
			reply('b', { createdAt: 30 }),
			reply('c', { createdAt: 40 }),
		];

		expect([...newReplyIds(list, AUTHOR, 10)]).toEqual(['b', 'c']);
	});
});

describe('noticeKey', () => {
	it('picks the singular, the plural, or nothing', () => {
		expect(noticeKey(0)).toBeNull();
		expect(noticeKey(1)).toEqual({ key: 'reply.notice_one' });
		expect(noticeKey(3)).toEqual({ key: 'reply.notice_n', params: { n: 3 } });
	});
});

describe('threadsToOpen', () => {
	const a = [reply('a1'), reply('a2')];
	const b = [reply('b1', { parentId: 'p2' })];

	it('opens a thread whose replies the teacher has not seen this session', () => {
		const byProposal = new Map([
			['p1', a],
			['p2', b],
		]);

		expect(threadsToOpen(byProposal, new Map())).toEqual(['p1', 'p2']);
		expect(threadsToOpen(byProposal, new Map([['p1', 2]]))).toEqual(['p2']);
	});

	it('opens a thread again when a new reply arrives, and ignores empty ones', () => {
		expect(threadsToOpen(new Map([['p1', a]]), new Map([['p1', 1]]))).toEqual(['p1']);
		expect(threadsToOpen(new Map([['p1', []]]), new Map())).toEqual([]);
	});
});
