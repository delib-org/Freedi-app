import { ActivityType, QuestionType, SourceApp, StatementType } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';
import { deriveActivities } from '../deriveActivities';
import { createActivityUrlResolver } from '../activityUrls';

function question(overrides: Partial<Statement>): Statement {
	return {
		statementId: 'q1',
		statement: 'A question',
		creatorId: 'u1',
		creator: { uid: 'u1', displayName: 'U', isAnonymous: false },
		parentId: 'top-1',
		topParentId: 'top-1',
		statementType: StatementType.question,
		createdAt: 1,
		lastUpdate: 1,
		consensus: 0,
		...overrides,
	} as Statement;
}

const resolver = createActivityUrlResolver({
	mainAppBaseUrl: 'https://app.test',
	massConsensusBaseUrl: 'https://mc.test',
	signBaseUrl: 'https://sign.test',
	joinBaseUrl: 'https://join.test',
});

describe('deriveActivities — run state', () => {
	it('treats an undefined questionStatus as open (Join semantics), not queued', () => {
		const [activity] = deriveActivities([question({})], resolver);
		expect(activity.runState).toBe('open');
	});

	it('maps live/frozen/closed explicitly', () => {
		const states = ['live', 'frozen', 'closed'] as const;
		const derived = deriveActivities(
			states.map((questionStatus, i) =>
				question({ statementId: `q-${i}`, order: i, statementSettings: { questionStatus } }),
			),
			resolver,
		);
		expect(derived.map((a) => a.runState)).toEqual(['open', 'frozen', 'closed']);
	});

	it('classifies a join question and resolves its join links', () => {
		const [activity] = deriveActivities(
			[question({ sourceApp: SourceApp.JOIN })],
			resolver,
		);
		expect(activity.type).toBe(ActivityType.join);
		expect(activity.participant).toEqual({ href: 'https://join.test/q/q1', external: true });
		expect(activity.admin).toEqual({ href: 'https://join.test/q/q1', external: true });
	});

	it('keeps join precedence over questionType massConsensus', () => {
		const [activity] = deriveActivities(
			[
				question({
					sourceApp: SourceApp.JOIN,
					questionSettings: { questionType: QuestionType.massConsensus },
				}),
			],
			resolver,
		);
		expect(activity.type).toBe(ActivityType.join);
	});

	it('sorts by order and drops non-activity children', () => {
		const derived = deriveActivities(
			[
				question({ statementId: 'b', order: 2 }),
				question({ statementId: 'a', order: 1 }),
				question({ statementId: 'opt', statementType: StatementType.option }),
			],
			resolver,
		);
		expect(derived.map((a) => a.statementId)).toEqual(['a', 'b']);
	});
});
