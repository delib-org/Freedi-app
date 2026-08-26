import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isChunkLoadError, lazyWithRetry } from '../lazyWithRetry';

describe('isChunkLoadError', () => {
	it('recognises the browser signatures of a missing chunk', () => {
		expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: x'))).toBe(
			true,
		);
		expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
		expect(isChunkLoadError(new Error('Loading chunk 42 failed'))).toBe(true);
		expect(isChunkLoadError(new Error('Expected a JavaScript-or-Wasm module script'))).toBe(true);
	});

	it('ignores unrelated errors', () => {
		expect(isChunkLoadError(new Error('permission-denied'))).toBe(false);
		expect(isChunkLoadError(undefined)).toBe(false);
	});
});

describe('lazyWithRetry', () => {
	const reload = vi.fn();

	beforeEach(() => {
		sessionStorage.clear();
		reload.mockReset();
		Object.defineProperty(window, 'location', {
			configurable: true,
			value: { ...window.location, reload },
		});
	});

	function loadOnce(component: unknown): Promise<unknown> {
		// React.lazy stores the loader on the exotic component; invoke it the
		// way React does to observe the promise without rendering.
		const lazyComponent = component as {
			_payload: { _result: () => Promise<unknown> };
		};

		return lazyComponent._payload._result();
	}

	it('reloads the page once when the chunk is missing', async () => {
		const factory = vi
			.fn()
			.mockRejectedValue(new Error('Failed to fetch dynamically imported module: /assets/x.js'));
		const Component = lazyWithRetry(factory, 'X');
		void loadOnce(Component);
		await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
		expect(sessionStorage.getItem('studio-chunk-reload')).toBe('X');
	});

	it('does not reload again after the guard is set — the error surfaces instead', async () => {
		sessionStorage.setItem('studio-chunk-reload', 'X');
		const factory = vi
			.fn()
			.mockRejectedValue(new Error('Failed to fetch dynamically imported module: /assets/x.js'));
		const Component = lazyWithRetry(factory, 'X');
		await expect(loadOnce(Component)).rejects.toThrow(/dynamically imported module/);
		expect(reload).not.toHaveBeenCalled();
	});

	it('clears the guard once the chunk loads', async () => {
		sessionStorage.setItem('studio-chunk-reload', 'X');
		const factory = vi.fn().mockResolvedValue({ default: () => null });
		const Component = lazyWithRetry(factory, 'X');
		await loadOnce(Component);
		expect(sessionStorage.getItem('studio-chunk-reload')).toBeNull();
	});
});
