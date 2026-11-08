import type { Statement } from '@freedi/shared-types';
import { aboveGateIds, onlyAboveGateOn, scopeCounts } from '../voteScope';

function p(id: string, consensus?: number): Statement {
	return { statementId: id, statement: id, consensus } as unknown as Statement;
}

const proposals = [p('a', 0.9), p('b', 0.7), p('c', 0.3), p('d')];
const ids = ['a', 'b', 'c', 'd', 'gone'];

describe('voteScope', () => {
	it('is on unless the teacher chose All', () => {
		expect(onlyAboveGateOn(null)).toBe(true);
		expect(onlyAboveGateOn({ statementSettings: {} } as unknown as Statement)).toBe(true);
		expect(
			onlyAboveGateOn({
				statementSettings: { voteDisplay: { onlyAboveGate: false } },
			} as unknown as Statement),
		).toBe(false);
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
});
