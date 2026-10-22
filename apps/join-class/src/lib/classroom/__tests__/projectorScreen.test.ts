import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	POINTER_WAKE_PX,
	PROJECTOR_CONTROLS_IDLE_MS,
	PROJECTOR_HINT_MS,
	movedFarEnough,
	openProjectorWindow,
	projectorMode,
	projectorPath,
	projectorWindowName,
	resetProjectorWindow,
	windowFeatures,
	type OpenedWindow,
	type OpenerHost,
} from '../projectorScreen';

function fakeWindow(href: string): OpenedWindow {
	return {
		closed: false,
		location: { href, assign: vi.fn() },
		focus: vi.fn(),
	};
}

function hostReturning(win: OpenedWindow | null): OpenerHost {
	return { open: vi.fn(() => win), origin: 'https://join.test' };
}

describe('projector mode', () => {
	it('reads only "window" as the own window; everything else is here', () => {
		expect(projectorMode('window')).toBe('window');
		expect(projectorMode(undefined)).toBe('here');
		expect(projectorMode('')).toBe('here');
		expect(projectorMode('Window')).toBe('here');
		expect(projectorMode(['window'])).toBe('here');
	});

	it('writes the path and window name per lesson', () => {
		expect(projectorPath('m1', 'here')).toBe('/t/m1/screen');
		expect(projectorPath('m1', 'window')).toBe('/t/m1/screen?mode=window');
		expect(projectorWindowName('m1')).toBe('projector-m1');
		expect(windowFeatures()).toBe('popup,width=1280,height=720');
	});

	it('keeps the timing constants from the spec', () => {
		expect(PROJECTOR_CONTROLS_IDLE_MS).toBe(3000);
		expect(PROJECTOR_HINT_MS).toBe(10000);
		expect(POINTER_WAKE_PX).toBe(4);
	});
});

describe('movedFarEnough', () => {
	it('wakes on the first move and on 4 px or more', () => {
		expect(movedFarEnough(null, { x: 1, y: 1 })).toBe(true);
		expect(movedFarEnough({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
		expect(movedFarEnough({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(false);
		expect(movedFarEnough({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(true);
	});
});

describe('openProjectorWindow', () => {
	beforeEach(() => resetProjectorWindow());

	it('opens a blank window, points it at the projector and focuses it', () => {
		const win = fakeWindow('about:blank');
		const host = hostReturning(win);

		expect(openProjectorWindow('m1', host)).toBe(true);
		expect(host.open).toHaveBeenCalledWith('', 'projector-m1', 'popup,width=1280,height=720');
		expect(win.location.assign).toHaveBeenCalledWith('https://join.test/t/m1/screen?mode=window');
		expect(win.focus).toHaveBeenCalled();
	});

	it('reuses the live window without reloading or opening a second one', () => {
		const win = fakeWindow('about:blank');
		const host = hostReturning(win);
		openProjectorWindow('m1', host);
		(win.focus as ReturnType<typeof vi.fn>).mockClear();

		expect(openProjectorWindow('m1', host)).toBe(true);
		expect(host.open).toHaveBeenCalledTimes(1);
		expect(win.location.assign).toHaveBeenCalledTimes(1);
		expect(win.focus).toHaveBeenCalledTimes(1);
	});

	it('does not reload a named window that already shows the projector', () => {
		const win = fakeWindow('https://join.test/t/m1/screen?mode=window');

		expect(openProjectorWindow('m1', hostReturning(win))).toBe(true);
		expect(win.location.assign).not.toHaveBeenCalled();
	});

	it('opens a new one after the old one was closed', () => {
		const first = fakeWindow('about:blank');
		const host = hostReturning(first);
		openProjectorWindow('m1', host);
		first.closed = true;

		openProjectorWindow('m1', host);
		expect(host.open).toHaveBeenCalledTimes(2);
	});

	it('reports a blocked pop-up and navigates nothing', () => {
		const host = hostReturning(null);

		expect(openProjectorWindow('m1', host)).toBe(false);
	});
});
