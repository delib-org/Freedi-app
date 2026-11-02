import { formatWaitingCount, pickWaitingStatementId } from '../waitingBadgeLogic';

const wait = (statementId: string) => ({ statementId });

describe('pickWaitingStatementId', () => {
	it('is null when nobody waits', () => {
		expect(pickWaitingStatementId([], 's1')).toBeNull();
	});

	it('prefers the space on screen when someone waits there', () => {
		expect(pickWaitingStatementId([wait('a'), wait('a'), wait('s1')], 's1')).toBe('s1');
	});

	it('otherwise picks the space where most people wait', () => {
		expect(pickWaitingStatementId([wait('a'), wait('b'), wait('b')], 's1')).toBe('b');
		expect(pickWaitingStatementId([wait('a'), wait('b'), wait('b')])).toBe('b');
	});

	it('keeps the first space on a tie', () => {
		expect(pickWaitingStatementId([wait('a'), wait('b')])).toBe('a');
	});
});

describe('formatWaitingCount', () => {
	it('caps at 99+', () => {
		expect(formatWaitingCount(3)).toBe('3');
		expect(formatWaitingCount(99)).toBe('99');
		expect(formatWaitingCount(100)).toBe('99+');
	});
});
