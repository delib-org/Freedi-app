import { Statement, StatementType, NotificationType } from '@freedi/shared-types';
import { getEngagementSuggestion } from '../engagementSuggestion';
import { notificationDestination, relevantNotifications } from '../engagementNavigation';

const update = {
	userId: 'me',
	creatorId: 'other',
	statementId: 'reply',
	parentId: 'question',
	read: false,
	notificationId: 'n1',
	createdAt: 1,
} as NotificationType;
const question = { statementId: 'question', statementType: StatementType.question } as Statement;
const proposal = { statementId: 'proposal', statementType: StatementType.option } as Statement;
const base = { unread: [], options: [], evaluatedIds: new Set<string>(), halted: false };
it('prioritizes actual unread contributions over evaluation prompts', () => {
	expect(
		getEngagementSuggestion({ ...base, statement: question, unread: [update], options: [proposal] })
			.to,
	).toBe('/statement/question?tab=chat#reply');
});
it('does not pull unrelated discussion updates into a local prompt', () => {
	expect(
		getEngagementSuggestion({
			...base,
			statement: question,
			unread: [{ ...update, parentId: 'elsewhere' }],
			options: [proposal],
		}).to,
	).toBe('/statement/proposal');
});
it.each([
	{ halted: true },
	{ evaluatedIds: new Set(['proposal']) },
	{ options: [{ ...proposal, hide: true }] },
	{ statement: { ...question, statementSettings: { showEvaluation: false } } },
])('does not prompt unavailable or completed evaluation: %p', (override) => {
	expect(
		getEngagementSuggestion({ ...base, statement: question, options: [proposal], ...override })
			.action,
	).toBe('Join the conversation');
});
it('offers creation only when no conversation is available', () => {
	expect(getEngagementSuggestion(base).to).toBeUndefined();
	expect(getEngagementSuggestion({ ...base, firstSpaceId: 'room' }).to).toBe('/statement/room');
});
it('excludes read-independent self events and another account', () => {
	expect(
		relevantNotifications(
			[update, { ...update, creatorId: 'me' }, { ...update, userId: 'elsewhere' }],
			'me',
		),
	).toEqual([update]);
	expect(relevantNotifications([update], undefined)).toEqual([]);
});
it('rejects external or malformed notification targets', () => {
	for (const targetPath of ['//evil.example', 'https://evil.example', '/\\evil.example'])
		expect(notificationDestination({ ...update, targetPath })).toBe(
			'/statement/question?tab=chat#reply',
		);
	expect(notificationDestination({ ...update, targetPath: '/my/engagement' })).toBe(
		'/my/engagement',
	);
});
