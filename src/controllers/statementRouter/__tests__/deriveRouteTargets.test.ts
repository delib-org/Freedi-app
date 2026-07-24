import { QuestionType, SourceApp, StatementType, type Statement } from '@freedi/shared-types';
import {
	deriveRouteTargets,
	type RouteTarget,
} from '../../../../packages/event-core/src/deriveRouteTargets';
import { createActivityUrlResolver } from '../../../../packages/event-core/src/activityUrls';

const resolver = createActivityUrlResolver({
	mainAppBaseUrl: 'https://app.example.com',
	massConsensusBaseUrl: 'https://mc.example.com',
	signBaseUrl: 'https://sign.example.com',
	joinBaseUrl: 'https://join.example.com',
});

const resolverWithoutJoin = createActivityUrlResolver({
	mainAppBaseUrl: 'https://app.example.com',
	massConsensusBaseUrl: 'https://mc.example.com',
	signBaseUrl: 'https://sign.example.com',
});

function makeStatement(overrides: Partial<Statement>): Statement {
	return {
		statementId: 'st-1',
		statement: 'Test statement',
		statementType: StatementType.question,
		parentId: 'parent-1',
		topParentId: 'top-1',
		creatorId: 'user-1',
		createdAt: 1,
		lastUpdate: 1,
		consensus: 0,
		creator: {
			displayName: 'Tester',
			uid: 'user-1',
		},
		...overrides,
	} as Statement;
}

function bySourceApp(targets: RouteTarget[], sourceApp: SourceApp): RouteTarget | undefined {
	return targets.find((target) => target.def.sourceApp === sourceApp);
}

describe('deriveRouteTargets', () => {
	describe('role gating', () => {
		it('returns no targets for non-admins (v1 is admin/creator only)', () => {
			const statement = makeStatement({ statementType: StatementType.question });
			const targets = deriveRouteTargets(statement, resolver, { isAdmin: false });

			expect(targets).toHaveLength(0);
		});

		it('returns targets for admins', () => {
			const statement = makeStatement({ statementType: StatementType.question });
			const targets = deriveRouteTargets(statement, resolver, { isAdmin: true });

			expect(targets.length).toBeGreaterThan(0);
		});
	});

	describe('question statements', () => {
		const question = makeStatement({ statementType: StatementType.question });
		const targets = deriveRouteTargets(question, resolver, { isAdmin: true });

		it('offers Join as a ready pure-open route with the /q/{statementId} long route', () => {
			const join = bySourceApp(targets, SourceApp.JOIN);

			expect(join).toBeDefined();
			expect(join?.state).toBe('ready');
			expect(join?.href).toBe('https://join.example.com/q/st-1');
			expect(join?.external).toBe(true);
		});

		it('offers Mass-Consensus as needsMark when questionType is not massConsensus', () => {
			const mc = bySourceApp(targets, SourceApp.MASS_CONSENSUS);

			expect(mc).toBeDefined();
			expect(mc?.state).toBe('needsMark');
			expect(mc?.href).toBe('https://mc.example.com/q/st-1');
		});

		it('offers Mass-Consensus as alreadyMarked when questionType is already massConsensus', () => {
			const mcQuestion = makeStatement({
				statementType: StatementType.question,
				questionSettings: { questionType: QuestionType.massConsensus },
			});
			const mcTargets = deriveRouteTargets(mcQuestion, resolver, { isAdmin: true });
			const mc = bySourceApp(mcTargets, SourceApp.MASS_CONSENSUS);

			expect(mc?.state).toBe('alreadyMarked');
		});

		it('shows Sign disabled-with-reason on questions (visible but not eligible)', () => {
			const sign = bySourceApp(targets, SourceApp.SIGN);

			expect(sign).toBeDefined();
			expect(sign?.state).toBe('disabled');
			expect(sign?.disabledReason).toBe('Only answers (options) can become documents');
			expect(sign?.href).toBeNull();
		});
	});

	describe('option statements', () => {
		it('hides Join and Mass-Consensus entirely (type-ineligible)', () => {
			const option = makeStatement({ statementType: StatementType.option });
			const targets = deriveRouteTargets(option, resolver, { isAdmin: true });

			expect(bySourceApp(targets, SourceApp.JOIN)).toBeUndefined();
			expect(bySourceApp(targets, SourceApp.MASS_CONSENSUS)).toBeUndefined();
		});

		it('offers Sign as needsMark when the option is not yet a document', () => {
			const option = makeStatement({ statementType: StatementType.option });
			const targets = deriveRouteTargets(option, resolver, { isAdmin: true });
			const sign = bySourceApp(targets, SourceApp.SIGN);

			expect(sign?.state).toBe('needsMark');
			expect(sign?.href).toBe('https://sign.example.com/doc/st-1');
		});

		it('offers Sign as alreadyMarked when isDocument is true', () => {
			const option = makeStatement({
				statementType: StatementType.option,
				isDocument: true,
			});
			const targets = deriveRouteTargets(option, resolver, { isAdmin: true });
			const sign = bySourceApp(targets, SourceApp.SIGN);

			expect(sign?.state).toBe('alreadyMarked');
		});
	});

	describe('unresolvable URLs', () => {
		it('disables Join with an environment reason when joinBaseUrl is missing', () => {
			const question = makeStatement({ statementType: StatementType.question });
			const targets = deriveRouteTargets(question, resolverWithoutJoin, { isAdmin: true });
			const join = bySourceApp(targets, SourceApp.JOIN);

			expect(join?.state).toBe('disabled');
			expect(join?.disabledReason).toBe('Not available in this environment');
			expect(join?.href).toBeNull();
		});
	});

	describe('non-routable statement types', () => {
		it('returns no targets for plain statements', () => {
			const plain = makeStatement({ statementType: StatementType.statement });
			const targets = deriveRouteTargets(plain, resolver, { isAdmin: true });

			expect(targets).toHaveLength(0);
		});
	});
});
