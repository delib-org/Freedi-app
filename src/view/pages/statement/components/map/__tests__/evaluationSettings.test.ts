/**
 * The mind-map toolbar rates a node with the 5-point scale its question asks
 * for. Settings are inherited, and the nearest question wins over the top
 * question — these tests pin that cascade, per setting.
 */

import type { Results, Statement } from '@freedi/shared-types';
import {
	DEFAULT_RATING_MODE,
	findAncestorChain,
	resolveEvaluationSettings,
} from '../mapHelpers/evaluationSettings';

type Settings = Statement['statementSettings'];

const makeStatement = (statementId: string, statementSettings?: Settings): Statement =>
	({ statementId, statementSettings }) as Statement;

const node = (statementId: string, settings?: Settings, sub: Results[] = []): Results => ({
	top: makeStatement(statementId, settings),
	sub,
});

// root ─ q1 (reactions) ─ opt1
//      └ q2 ─ opt2
const tree: Results = node('root', { ratingMode: 'agree-disagree' } as Settings, [
	node('q1', { ratingMode: 'reactions' } as Settings, [node('opt1')]),
	node('q2', undefined, [node('opt2')]),
]);

describe('findAncestorChain', () => {
	it('returns an empty chain for the tree root', () => {
		expect(findAncestorChain(tree, 'root')).toEqual([]);
	});

	it('returns null for an id that is not in the tree', () => {
		expect(findAncestorChain(tree, 'nowhere')).toBeNull();
	});

	it('returns the parent for a first-level node', () => {
		expect(findAncestorChain(tree, 'q1')?.map((s) => s.statementId)).toEqual(['root']);
	});

	it('orders deeper chains nearest ancestor first', () => {
		expect(findAncestorChain(tree, 'opt1')?.map((s) => s.statementId)).toEqual(['q1', 'root']);
	});
});

describe('resolveEvaluationSettings', () => {
	it('falls back to the signed agree-disagree scale when nothing is set', () => {
		expect(resolveEvaluationSettings([])).toEqual({
			ratingMode: DEFAULT_RATING_MODE,
			enableEvaluation: true,
		});
		expect(DEFAULT_RATING_MODE).toBe('agree-disagree');
	});

	it('lets the nearest question override the top question', () => {
		const chain = findAncestorChain(tree, 'opt1') ?? [];
		expect(resolveEvaluationSettings(chain).ratingMode).toBe('reactions');
	});

	it('inherits from the top question when the local one says nothing', () => {
		const chain = findAncestorChain(tree, 'opt2') ?? [];
		expect(resolveEvaluationSettings(chain).ratingMode).toBe('agree-disagree');
	});

	it('cascades each setting on its own', () => {
		// The near question pins the mode only; enableEvaluation must still be
		// answered by the question above it rather than swallowed.
		const chain = [
			makeStatement('near', { ratingMode: 'reactions' } as Settings),
			makeStatement('top', { enableEvaluation: false } as Settings),
		];
		expect(resolveEvaluationSettings(chain)).toEqual({
			ratingMode: 'reactions',
			enableEvaluation: false,
		});
	});

	it('treats evaluation as open unless a question closes it', () => {
		const chain = [makeStatement('near', {} as Settings)];
		expect(resolveEvaluationSettings(chain).enableEvaluation).toBe(true);
	});
});
