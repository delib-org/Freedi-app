import { Statement } from '@freedi/shared-types';
import {
	deriveFlowConfig,
	flowReducer,
	initialFlowState,
	planSteps,
	stepAfter,
	toAnalyticsStep,
	type FlowConfig,
	type FlowEvent,
	type FlowState,
} from '../createStatementFlow';

const parent = (settings: Record<string, boolean>) =>
	({ statementId: 'q1', statementSettings: settings }) as unknown as Statement;

const NONE: FlowConfig = { preCheck: false, multiSplit: false, similarity: false };

function run(config: FlowConfig, events: FlowEvent[], from: FlowState = initialFlowState) {
	return events.reduce((s, e) => flowReducer(s, e, config), from);
}

const typed = (title = 'My answer') => ({ type: 'EDIT', draft: { title } }) as const;

describe('createStatementFlow', () => {
	describe('deriveFlowConfig', () => {
		it.each<[string, Record<string, boolean>, string, string, FlowConfig]>([
			['nothing on', {}, 'answer', 'db', NONE],
			[
				'similarity via defaultLookForSimilarities',
				{ defaultLookForSimilarities: true },
				'answer',
				'db',
				{ preCheck: false, multiSplit: false, similarity: true },
			],
			[
				'similarity via enableSimilaritiesSearch',
				{ enableSimilaritiesSearch: true },
				'answer',
				'db',
				{ preCheck: false, multiSplit: false, similarity: true },
			],
			[
				'multi split',
				{ enableMultiSuggestionDetection: true },
				'answer',
				'db',
				{ preCheck: false, multiSplit: true, similarity: false },
			],
			[
				'pre-check wins over the other AI steps',
				{
					popperianDiscussionEnabled: true,
					popperianPreCheckEnabled: true,
					enableMultiSuggestionDetection: true,
					defaultLookForSimilarities: true,
				},
				'answer',
				'db',
				{ preCheck: true, multiSplit: false, similarity: false },
			],
			[
				'pre-check needs both structured-debate flags',
				{ popperianPreCheckEnabled: true },
				'answer',
				'db',
				NONE,
			],
			[
				'questions get no AI steps',
				{ enableMultiSuggestionDetection: true, defaultLookForSimilarities: true },
				'question',
				'db',
				NONE,
			],
			[
				'temp nodes get no AI steps',
				{ enableMultiSuggestionDetection: true, defaultLookForSimilarities: true },
				'answer',
				'storeTemp',
				NONE,
			],
		])('%s', (_name, settings, intent, commit, expected) => {
			expect(
				deriveFlowConfig(
					parent(settings),
					intent as 'answer' | 'question',
					commit as 'db' | 'storeTemp',
				),
			).toEqual(expected);
		});

		it('top-level creation has no AI steps', () => {
			expect(deriveFlowConfig('top', 'question')).toEqual(NONE);
		});
	});

	describe('planSteps / stepAfter', () => {
		it.each<[FlowConfig, string[]]>([
			[NONE, ['draft', 'create', 'done']],
			[{ ...NONE, similarity: true }, ['draft', 'similarity', 'create', 'done']],
			[{ ...NONE, multiSplit: true }, ['draft', 'multiSplit', 'create', 'done']],
			[
				{ ...NONE, multiSplit: true, similarity: true },
				['draft', 'multiSplit', 'similarity', 'create', 'done'],
			],
			[{ ...NONE, preCheck: true }, ['draft', 'structuredDebatePreCheck', 'create', 'done']],
		])('plans %j', (config, plan) => {
			expect(planSteps(config)).toEqual(plan);
			expect(stepAfter('draft', config)).toBe(plan[1]);
			expect(stepAfter('done', config)).toBe('done');
		});
	});

	describe('reducer sequences', () => {
		it('plain: draft → create (pending) → done', () => {
			const s1 = run(NONE, [typed(), { type: 'SUBMIT' }]);
			expect(s1.step).toBe('create');
			expect(s1.pending).toBe(true);
			expect(s1.toCreate).toEqual([{ title: 'My answer', description: '' }]);
			const s2 = flowReducer(s1, { type: 'CREATE_OK', ids: ['n1'] }, NONE);
			expect(s2).toMatchObject({ step: 'done', pending: false, createdIds: ['n1'] });
		});

		it('refuses to submit an empty draft', () => {
			expect(run(NONE, [{ type: 'SUBMIT' }]).step).toBe('draft');
			expect(run(NONE, [{ type: 'EDIT', draft: { title: '   ' } }, { type: 'SUBMIT' }]).step).toBe(
				'draft',
			);
		});

		it('similarity: none found → create; found → wait; support → done without creating', () => {
			const cfg = { ...NONE, similarity: true };
			const waiting = run(cfg, [typed(), { type: 'SUBMIT' }]);
			expect(waiting).toMatchObject({ step: 'similarity', pending: true });

			expect(flowReducer(waiting, { type: 'SIMILARITY_RESULT', similar: [] }, cfg).step).toBe(
				'create',
			);

			const found = flowReducer(
				waiting,
				{ type: 'SIMILARITY_RESULT', similar: [{ statementId: 'a' } as Statement] },
				cfg,
			);
			expect(found).toMatchObject({ step: 'similarity', pending: false });
			expect(found.similar).toHaveLength(1);

			const supported = flowReducer(found, { type: 'SIMILARITY_SUPPORTED' }, cfg);
			expect(supported).toMatchObject({ step: 'done', createdIds: [] });
			expect(flowReducer(found, { type: 'SIMILARITY_CONTINUE' }, cfg).step).toBe('create');
			expect(flowReducer(found, { type: 'SIMILARITY_BACK' }, cfg)).toMatchObject({
				step: 'draft',
				draft: { title: 'My answer' },
			});
		});

		it('multi split: one idea → next step; several → wait; confirm creates each and skips similarity', () => {
			const cfg = { ...NONE, multiSplit: true, similarity: true };
			const waiting = run(cfg, [typed('A and B'), { type: 'SUBMIT' }]);
			expect(waiting).toMatchObject({ step: 'multiSplit', pending: true });

			expect(
				flowReducer(
					waiting,
					{ type: 'MULTI_RESULT', splits: [{ title: 'A', description: '' }] },
					cfg,
				).step,
			).toBe('similarity');

			const splits = [
				{ title: 'A', description: '' },
				{ title: 'B', description: '' },
			];
			const offered = flowReducer(waiting, { type: 'MULTI_RESULT', splits }, cfg);
			expect(offered).toMatchObject({ step: 'multiSplit', pending: false, splits });

			const confirmed = flowReducer(offered, { type: 'MULTI_CONFIRM', splits }, cfg);
			expect(confirmed).toMatchObject({ step: 'create', toCreate: splits });

			expect(flowReducer(offered, { type: 'MULTI_DISMISS' }, cfg)).toMatchObject({
				step: 'similarity',
				toCreate: [{ title: 'A and B', description: '' }],
			});
			expect(flowReducer(offered, { type: 'MULTI_CANCEL' }, cfg).step).toBe('draft');
		});

		it('pre-check: publish goes straight to create with the refined text; close returns to draft', () => {
			const cfg = { ...NONE, preCheck: true };
			const waiting = run(cfg, [typed('raw'), { type: 'SUBMIT' }]);
			expect(waiting).toMatchObject({ step: 'structuredDebatePreCheck', pending: false });
			const refined = { title: 'Refined', description: 'because' };
			expect(flowReducer(waiting, { type: 'PRECHECK_PUBLISH', draft: refined }, cfg)).toMatchObject(
				{
					step: 'create',
					draft: refined,
					toCreate: [refined],
				},
			);
			expect(flowReducer(waiting, { type: 'PRECHECK_CLOSE' }, cfg).step).toBe('draft');
		});

		it('failure keeps the draft and retry returns to it', () => {
			const failed = run(NONE, [typed(), { type: 'SUBMIT' }, { type: 'FAIL', message: 'boom' }]);
			expect(failed).toMatchObject({ step: 'error', error: 'boom', draft: { title: 'My answer' } });
			expect(flowReducer(failed, { type: 'RETRY' }, NONE)).toMatchObject({
				step: 'draft',
				error: null,
			});
		});

		it('ignores events that do not belong to the current step', () => {
			const draft = run(NONE, [typed()]);
			for (const event of [
				{ type: 'CREATE_OK', ids: ['x'] },
				{ type: 'SIMILARITY_SUPPORTED' },
				{ type: 'MULTI_CONFIRM', splits: [] },
				{ type: 'PRECHECK_CLOSE' },
				{ type: 'RETRY' },
			] as FlowEvent[]) {
				expect(flowReducer(draft, event, NONE)).toBe(draft);
			}
		});
	});

	it('maps every step to an analytics step', () => {
		expect(toAnalyticsStep('draft')).toBe('draft');
		expect(toAnalyticsStep('structuredDebatePreCheck')).toBe('precheck');
		expect(toAnalyticsStep('multiSplit')).toBe('split');
		expect(toAnalyticsStep('similarity')).toBe('similarity');
		expect(toAnalyticsStep('create')).toBe('create');
		expect(toAnalyticsStep('done')).toBe('create');
	});
});
