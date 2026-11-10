import { Statement } from '@freedi/shared-types';
import { PRESENCE } from '@/constants/common';
import { isLargeForPresence } from '../presenceVisibility';

const LARGE = PRESENCE.LARGE_QUESTION_PEOPLE;

function statementWith(fields: Partial<Statement>): Statement {
	return fields as Statement;
}

describe('isLargeForPresence', () => {
	it('is small with nothing known', () => {
		expect(isLargeForPresence(undefined, null)).toBe(false);
	});

	it('is small just below the line', () => {
		expect(isLargeForPresence(statementWith({}), { entered: LARGE - 1 })).toBe(false);
	});

	it('is large at the line, counting people who entered', () => {
		expect(isLargeForPresence(statementWith({}), { entered: LARGE })).toBe(true);
	});

	it('falls back to the raters on the statement without progress counters', () => {
		const rated = statementWith({
			evaluation: { asParentTotalEvaluators: LARGE },
		} as Partial<Statement>);

		expect(isLargeForPresence(rated, null)).toBe(true);
		expect(isLargeForPresence(statementWith({ totalEvaluators: LARGE }), null)).toBe(true);
	});
});
