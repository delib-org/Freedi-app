import { formatUnreadCount } from '../unreadCount';

describe('formatUnreadCount', () => {
	it('shows the exact number up to the cap', () => {
		expect(formatUnreadCount(0)).toBe('0');
		expect(formatUnreadCount(99)).toBe('99');
	});

	it('shows 99+ once the bounded feed is full', () => {
		expect(formatUnreadCount(100)).toBe('99+');
		expect(formatUnreadCount(200)).toBe('99+');
	});

	it('accepts another cap', () => {
		expect(formatUnreadCount(10, 9)).toBe('9+');
	});
});
