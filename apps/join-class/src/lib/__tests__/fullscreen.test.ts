import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	enterFullscreen,
	exitFullscreen,
	fullscreenSupported,
	isFullscreen,
	onFullscreenChange,
} from '../fullscreen';

interface FakeDoc {
	fullscreenEnabled?: boolean;
	webkitFullscreenEnabled?: boolean;
	fullscreenElement?: unknown;
	webkitFullscreenElement?: unknown;
	exitFullscreen?: () => Promise<void>;
	webkitExitFullscreen?: () => void;
	addEventListener: (name: string, fn: () => void) => void;
	removeEventListener: (name: string, fn: () => void) => void;
	documentElement: object;
}

function stubDoc(partial: Partial<FakeDoc>): FakeDoc {
	const fake: FakeDoc = {
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		documentElement: {},
		...partial,
	};
	vi.stubGlobal('document', fake);

	return fake;
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('support and state', () => {
	it('reads the standard flag, then the webkit one, else false', () => {
		stubDoc({ fullscreenEnabled: true });
		expect(fullscreenSupported()).toBe(true);
		stubDoc({ webkitFullscreenEnabled: true });
		expect(fullscreenSupported()).toBe(true);
		stubDoc({});
		expect(fullscreenSupported()).toBe(false);
	});

	it('is full screen when either element is set', () => {
		stubDoc({ fullscreenElement: {} });
		expect(isFullscreen()).toBe(true);
		stubDoc({ webkitFullscreenElement: {} });
		expect(isFullscreen()).toBe(true);
		stubDoc({ fullscreenElement: null });
		expect(isFullscreen()).toBe(false);
	});
});

describe('enterFullscreen', () => {
	it('uses the standard request with the navigation UI hidden', async () => {
		stubDoc({});
		const requestFullscreen = vi.fn(() => Promise.resolve());

		expect(await enterFullscreen({ requestFullscreen } as unknown as HTMLElement)).toBe(true);
		expect(requestFullscreen).toHaveBeenCalledWith({ navigationUI: 'hide' });
	});

	it('wraps the promise-less webkit request', async () => {
		stubDoc({});
		const webkitRequestFullscreen = vi.fn(() => undefined);

		expect(await enterFullscreen({ webkitRequestFullscreen } as unknown as HTMLElement)).toBe(true);
		expect(webkitRequestFullscreen).toHaveBeenCalledTimes(1);
	});

	it('returns false when the browser has no API or refuses', async () => {
		stubDoc({});
		vi.spyOn(console, 'info').mockImplementation(() => undefined);

		expect(await enterFullscreen({} as HTMLElement)).toBe(false);
		const refusing = { requestFullscreen: () => Promise.reject(new Error('denied')) };
		expect(await enterFullscreen(refusing as unknown as HTMLElement)).toBe(false);
	});
});

describe('exitFullscreen', () => {
	it('does nothing when not full screen', async () => {
		const exit = vi.fn(() => Promise.resolve());
		stubDoc({ exitFullscreen: exit });
		await exitFullscreen();
		expect(exit).not.toHaveBeenCalled();
	});

	it('falls back to the webkit exit', async () => {
		const webkitExit = vi.fn();
		stubDoc({ webkitFullscreenElement: {}, webkitExitFullscreen: webkitExit });
		await exitFullscreen();
		expect(webkitExit).toHaveBeenCalledTimes(1);
	});
});

describe('onFullscreenChange', () => {
	it('listens to both events and unsubscribes from both', () => {
		const fake = stubDoc({});
		const listener = vi.fn();
		const off = onFullscreenChange(listener);

		expect(fake.addEventListener).toHaveBeenCalledWith('fullscreenchange', listener);
		expect(fake.addEventListener).toHaveBeenCalledWith('webkitfullscreenchange', listener);
		off();
		expect(fake.removeEventListener).toHaveBeenCalledWith('fullscreenchange', listener);
		expect(fake.removeEventListener).toHaveBeenCalledWith('webkitfullscreenchange', listener);
	});
});
