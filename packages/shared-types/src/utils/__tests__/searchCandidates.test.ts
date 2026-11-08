import {
	isTopLevelSearchCandidate,
	statementToSearchCandidate,
	subscriptionToSearchCandidate,
} from '../searchCandidates';
import { StatementType } from '../../models/TypeEnums';
import { Role } from '../../models/user/UserSettings';

describe('statementToSearchCandidate', () => {
	const base = {
		statementId: 's1',
		statement: 'Talk about parks',
		statementType: StatementType.option,
		parentId: 'q1',
		topParentId: 't1',
		lastUpdate: 7,
	};

	it('maps the fields search needs', () => {
		expect(statementToSearchCandidate({ ...base, description: 'more' })).toEqual({
			statementId: 's1',
			title: 'Talk about parks',
			description: 'more',
			statementType: StatementType.option,
			parentId: 'q1',
			topParentId: 't1',
			lastUpdate: 7,
		});
	});

	it('skips hidden statements but keeps hide undefined or false', () => {
		expect(statementToSearchCandidate({ ...base, hide: true })).toBeNull();
		expect(statementToSearchCandidate({ ...base, hide: false })).not.toBeNull();
		expect(statementToSearchCandidate(base)).not.toBeNull();
	});

	it('skips paragraphs and documents', () => {
		expect(
			statementToSearchCandidate({ ...base, statementType: StatementType.paragraph }),
		).toBeNull();
		expect(
			statementToSearchCandidate({ ...base, statementType: StatementType.document }),
		).toBeNull();
	});

	it('fills a missing topParentId and lastUpdate', () => {
		const top = statementToSearchCandidate({
			statementId: 't1',
			statement: 'Top',
			statementType: StatementType.group,
			parentId: 'top',
			createdAt: 3,
		});
		expect(top?.topParentId).toBe('t1');
		expect(top?.lastUpdate).toBe(3);
		expect(top && isTopLevelSearchCandidate(top)).toBe(true);

		const child = statementToSearchCandidate({
			...base,
			topParentId: undefined,
			lastUpdate: undefined,
		});
		expect(child?.topParentId).toBe('q1');
		expect(child?.lastUpdate).toBe(0);
	});
});

describe('subscriptionToSearchCandidate', () => {
	const subscription = {
		statementId: 't1',
		role: Role.member,
		parentId: 'top',
		statementType: StatementType.question,
		lastUpdate: 9,
		statement: { statement: 'City budget', description: 'Where the money goes' },
	};

	it('maps the embedded statement', () => {
		expect(subscriptionToSearchCandidate(subscription)).toMatchObject({
			statementId: 't1',
			title: 'City budget',
			description: 'Where the money goes',
			parentId: 'top',
			topParentId: 't1',
			lastUpdate: 9,
		});
	});

	it('falls back to the embedded statement for legacy subscriptions', () => {
		const legacy = {
			statementId: 'o1',
			statement: {
				statement: 'Idea',
				statementType: StatementType.option,
				parentId: 'q1',
				createdAt: 4,
			},
		};
		expect(subscriptionToSearchCandidate(legacy)).toMatchObject({
			parentId: 'q1',
			statementType: StatementType.option,
			lastUpdate: 4,
		});
	});

	it('skips banned, unsubscribed, documents, and subscriptions without text', () => {
		expect(subscriptionToSearchCandidate({ ...subscription, role: Role.banned })).toBeNull();
		expect(subscriptionToSearchCandidate({ ...subscription, role: Role.unsubscribed })).toBeNull();
		expect(subscriptionToSearchCandidate({ ...subscription, isDocument: true })).toBeNull();
		expect(subscriptionToSearchCandidate({ statementId: 'x' })).toBeNull();
	});
});
