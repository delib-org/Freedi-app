import { NotificationType, StatementType } from '@freedi/shared-types';
import { filterInbox, formatRelativeTime, inboxDestination, inboxKind } from '../inboxModel';

function notification(partial: Partial<NotificationType>): NotificationType {
	return {
		userId: 'u1',
		parentId: 'q1',
		statementId: 's1',
		statementType: StatementType.statement,
		text: 'hello',
		creatorId: 'u2',
		creatorName: 'Noa',
		createdAt: 0,
		read: false,
		notificationId: 'n1',
		...partial,
	} as NotificationType;
}

describe('inboxKind', () => {
	it('classifies by statement type', () => {
		expect(inboxKind(notification({ statementType: StatementType.agreement }))).toBe('agreement');
		expect(inboxKind(notification({ statementType: StatementType.option }))).toBe('answer');
		expect(inboxKind(notification({ statementType: StatementType.question }))).toBe('question');
		expect(inboxKind(notification({}))).toBe('chat');
	});
});

describe('filterInbox', () => {
	const list = [
		notification({ notificationId: 'a', read: true }),
		notification({ notificationId: 'b' }),
		notification({ notificationId: 'c', read: true, statementType: StatementType.agreement }),
	];

	it('keeps everything for all', () => {
		expect(filterInbox(list, 'all')).toHaveLength(3);
	});

	it('keeps unread only', () => {
		expect(filterInbox(list, 'unread').map((n) => n.notificationId)).toEqual(['b']);
	});

	it('keeps agreements only', () => {
		expect(filterInbox(list, 'agreements').map((n) => n.notificationId)).toEqual(['c']);
	});
});

describe('inboxDestination', () => {
	it('opens a chat message in the chat tab', () => {
		expect(inboxDestination(notification({}))).toBe('/statement/q1?tab=chat#s1');
	});

	it('opens an answer in the answers tab', () => {
		expect(inboxDestination(notification({ statementType: StatementType.option }))).toBe(
			'/statement/q1?tab=options#s1',
		);
	});

	it('opens an agreement in the covenant tab', () => {
		expect(inboxDestination(notification({ statementType: StatementType.agreement }))).toBe(
			'/statement/q1?tab=covenant',
		);
	});

	it('opens a new question itself', () => {
		expect(inboxDestination(notification({ statementType: StatementType.question }))).toBe(
			'/statement/s1',
		);
	});

	it('opens top-level items directly', () => {
		expect(inboxDestination(notification({ parentId: 'top' }))).toBe('/statement/s1');
	});

	it('prefers a safe target path and rejects unsafe ones', () => {
		expect(inboxDestination(notification({ targetPath: '/statement/x?tab=options' }))).toBe(
			'/statement/x?tab=options',
		);
		expect(inboxDestination(notification({ targetPath: '//evil.example' }))).toBe(
			'/statement/q1?tab=chat#s1',
		);
	});
});

describe('formatRelativeTime', () => {
	const now = Date.UTC(2026, 8, 15, 12);

	it('says an hour ago', () => {
		expect(formatRelativeTime(now - 60 * 60 * 1000, now, 'en')).toBe('1 hour ago');
	});

	it('says yesterday', () => {
		expect(formatRelativeTime(now - 26 * 60 * 60 * 1000, now, 'en')).toBe('yesterday');
	});

	it('says now for fresh items', () => {
		expect(formatRelativeTime(now, now, 'en')).toBe('this minute');
	});
});
