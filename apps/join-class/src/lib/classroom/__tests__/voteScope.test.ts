import type { Statement } from '@freedi/shared-types';
import { aboveGateIds, onlyAboveGateOn, scopeCounts, scopedIds } from '../voteScope';

function p(id: string, consensus?: number): Statement {
	return { statementId: id, statement: id, consensus } as unknown as Statement;
}

const proposals = [p('a', 0.9), p('b', 0.7), p('c', 0.3), p('d')];
const ids = ['a', 'b', 'c', 'd', 'gone'];

describe('voteScope', () => {
	it('is off unless the teacher switched it on', () => {
		expect(onlyAboveGateOn(null)).toBe(false);
		expect(onlyAboveGateOn({ statementSettings: {} } as unknown as Statement)).toBe(false);
		expect(
			onlyAboveGateOn({
				statementSettings: { voteDisplay: { onlyAboveGate: true } },
			} as unknown as Statement),
		).toBe(true);
	});

	it('keeps proposals at or above the gate, in order; unrated ones are not above', () => {
		expect(aboveGateIds(ids, proposals, 0.7)).toEqual(['a', 'b']);
	});

	it('counts above and total', () => {
		expect(scopeCounts(ids, proposals, 0.7)).toEqual({ total: 5, above: 2 });
	});

	it('shows all when the switch is off', () => {
		expect(scopedIds(ids, proposals, 0.7, false)).toEqual({ ids, fellBack: false });
	});

	it('shows only the proposals above the goal when on', () => {
		expect(scopedIds(ids, proposals, 0.7, true)).toEqual({ ids: ['a', 'b'], fellBack: false });
	});

	it('keeps All and flags it when none is above the goal', () => {
		expect(scopedIds(ids, proposals, 0.95, true)).toEqual({ ids, fellBack: true });
		expect(scopedIds([], proposals, 0.95, true)).toEqual({ ids: [], fellBack: false });
	});
});
