import { describe, expect, it } from 'vitest';
import type { Statement } from '@freedi/shared-types';
import {
	REPLY_TOAST_GAP_MS,
	firstUnreadId,
	replyRole,
	shouldToast,
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

describe('shouldToast', () => {
	const fresh = [reply('r1', { createdAt: 10 })];
	const base = {
		now: 1_000_000,
		lastToastAt: null,
		seen: new Set<string>(),
		unread: fresh,
		sheetOpen: false,
	};

	it('speaks for a reply not announced yet', () => {
		expect(shouldToast(base)).toBe(true);
	});

	it('stays quiet when nothing is new, the replies are open, or within the minute', () => {
		expect(shouldToast({ ...base, seen: new Set(['r1']) })).toBe(false);
		expect(shouldToast({ ...base, unread: [] })).toBe(false);
		expect(shouldToast({ ...base, sheetOpen: true })).toBe(false);
		expect(shouldToast({ ...base, lastToastAt: base.now - REPLY_TOAST_GAP_MS + 1 })).toBe(false);
		expect(shouldToast({ ...base, lastToastAt: base.now - REPLY_TOAST_GAP_MS })).toBe(true);
	});
});
