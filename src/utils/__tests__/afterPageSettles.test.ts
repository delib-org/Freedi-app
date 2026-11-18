import { afterPageSettles, PAGE_SETTLE_DELAY_MS } from '../afterPageSettles';

describe('afterPageSettles', () => {
	const originalIdle = window.requestIdleCallback;

	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
		window.requestIdleCallback = originalIdle;
		jest.restoreAllMocks();
	});

	it('waits for the settle delay after an already-complete load', () => {
		jest.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
		Object.defineProperty(window, 'requestIdleCallback', {
			value: undefined,
			configurable: true,
			writable: true,
		});
		const callback = jest.fn();

		afterPageSettles(callback);
		jest.advanceTimersByTime(PAGE_SETTLE_DELAY_MS - 1);
		expect(callback).not.toHaveBeenCalled();

		jest.advanceTimersByTime(1);
		expect(callback).toHaveBeenCalledTimes(1);
	});

	it('does not start the delay until the load event fires', () => {
		jest.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
		Object.defineProperty(window, 'requestIdleCallback', {
			value: undefined,
			configurable: true,
			writable: true,
		});
		const callback = jest.fn();

		afterPageSettles(callback);
		jest.advanceTimersByTime(PAGE_SETTLE_DELAY_MS * 2);
		expect(callback).not.toHaveBeenCalled();

		window.dispatchEvent(new Event('load'));
		jest.advanceTimersByTime(PAGE_SETTLE_DELAY_MS);
		expect(callback).toHaveBeenCalledTimes(1);
	});

	it('hands the callback to requestIdleCallback when it exists', () => {
		jest.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
		const idle = jest.fn((cb: IdleRequestCallback) => {
			cb({ didTimeout: false, timeRemaining: () => 10 });

			return 1;
		});
		Object.defineProperty(window, 'requestIdleCallback', {
			value: idle,
			configurable: true,
			writable: true,
		});
		const callback = jest.fn();

		afterPageSettles(callback);
		jest.advanceTimersByTime(PAGE_SETTLE_DELAY_MS);

		expect(idle).toHaveBeenCalledTimes(1);
		expect(callback).toHaveBeenCalledTimes(1);
	});
});
