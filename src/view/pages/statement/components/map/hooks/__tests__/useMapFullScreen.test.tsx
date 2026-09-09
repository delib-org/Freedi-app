import { createRef } from 'react';
import { act, renderHook } from '@testing-library/react';
import { MAP_FULL_SCREEN_CLASS, useMapFullScreen } from '../useMapFullScreen';

function mountControl({ inRoot = true } = {}) {
	const host = document.createElement('div');
	host.innerHTML = inRoot
		? '<div data-map-root><div class="controls"></div></div>'
		: '<div class="controls"></div>';
	document.body.appendChild(host);
	const anchor = createRef<HTMLElement>();
	(anchor as { current: HTMLElement | null }).current = host.querySelector('.controls');

	return { host, anchor, root: host.querySelector<HTMLElement>('[data-map-root]') };
}

describe('useMapFullScreen', () => {
	let fullScreenElement: Element | null;

	beforeEach(() => {
		fullScreenElement = null;
		Object.defineProperty(document, 'fullscreenElement', {
			configurable: true,
			get: () => fullScreenElement,
		});
		Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
			configurable: true,
			value: jest.fn(() => Promise.resolve()),
		});
		Object.defineProperty(document, 'exitFullscreen', {
			configurable: true,
			value: jest.fn(() => {
				fullScreenElement = null;
				document.dispatchEvent(new Event('fullscreenchange'));

				return Promise.resolve();
			}),
		});
	});

	afterEach(() => {
		document.body.innerHTML = '';
		delete (HTMLElement.prototype as Partial<HTMLElement>).requestFullscreen;
		delete (document as Partial<Document>).exitFullscreen;
	});

	it('offers nothing when no map root is above the control', () => {
		const { anchor } = mountControl({ inRoot: false });
		const { result } = renderHook(() => useMapFullScreen(anchor));

		expect(result.current.available).toBe(false);
	});

	it('enters and exits native full screen for the map root', async () => {
		const { anchor, root } = mountControl();
		(root!.requestFullscreen as jest.Mock).mockImplementationOnce(() => {
			fullScreenElement = root;
			document.dispatchEvent(new Event('fullscreenchange'));

			return Promise.resolve();
		});
		const { result } = renderHook(() => useMapFullScreen(anchor));

		expect(result.current.available).toBe(true);

		await act(async () => result.current.toggle());
		expect(root?.requestFullscreen).toHaveBeenCalledTimes(1);
		expect(result.current.isFullScreen).toBe(true);
		expect(root).toHaveClass(MAP_FULL_SCREEN_CLASS);

		await act(async () => result.current.toggle());
		expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
		expect(result.current.isFullScreen).toBe(false);
		expect(root).not.toHaveClass(MAP_FULL_SCREEN_CLASS);
	});

	it('does not imitate full screen when the browser rejects the request', async () => {
		const { anchor, root } = mountControl();
		(root!.requestFullscreen as jest.Mock).mockRejectedValueOnce(new Error('denied'));
		const { result } = renderHook(() => useMapFullScreen(anchor));

		await act(async () => result.current.toggle());

		expect(result.current.isFullScreen).toBe(false);
		expect(root).not.toHaveClass(MAP_FULL_SCREEN_CLASS);
	});

	it('syncs when the browser exits full screen', async () => {
		const { anchor, root } = mountControl();
		(root!.requestFullscreen as jest.Mock).mockImplementationOnce(() => {
			fullScreenElement = root;
			document.dispatchEvent(new Event('fullscreenchange'));

			return Promise.resolve();
		});
		const { result } = renderHook(() => useMapFullScreen(anchor));
		await act(async () => result.current.toggle());

		act(() => {
			fullScreenElement = null;
			document.dispatchEvent(new Event('fullscreenchange'));
		});

		expect(result.current.isFullScreen).toBe(false);
		expect(root).not.toHaveClass(MAP_FULL_SCREEN_CLASS);
	});

	it('removes its state when the page unmounts', async () => {
		const { anchor, root } = mountControl();
		(root!.requestFullscreen as jest.Mock).mockImplementationOnce(() => {
			fullScreenElement = root;
			document.dispatchEvent(new Event('fullscreenchange'));

			return Promise.resolve();
		});
		const { result, unmount } = renderHook(() => useMapFullScreen(anchor));
		await act(async () => result.current.toggle());

		unmount();

		expect(root).not.toHaveClass(MAP_FULL_SCREEN_CLASS);
	});
});
