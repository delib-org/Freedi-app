import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { UI } from '@/constants/common';
import { usePeopleAnchors } from '../usePeopleAnchors';

const SETTLE_MS = UI.COLLAPSE_DURATION_MS + UI.COLLAPSE_FALLBACK_BUFFER_MS;

const wrapper = ({ children }: { children: React.ReactNode }) => (
	<MemoryRouter>{children}</MemoryRouter>
);

describe('usePeopleAnchors jumpTo', () => {
	const scrollIntoView = jest.fn();

	beforeEach(() => {
		jest.useFakeTimers();
		scrollIntoView.mockClear();
		Element.prototype.scrollIntoView = scrollIntoView;
		document.body.innerHTML = '<section id="waiting"></section>';
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	function jump(): void {
		const { result } = renderHook(
			() => usePeopleAnchors({ available: ['waiting'], defaultOpen: null }),
			{ wrapper },
		);

		act(() => result.current.jumpTo('waiting'));
		act(() => {
			jest.advanceTimersByTime(50);
		});
	}

	it('scrolls once now and once more when the move has settled', () => {
		jump();
		expect(scrollIntoView).toHaveBeenCalledTimes(1);

		act(() => {
			jest.advanceTimersByTime(SETTLE_MS);
		});
		expect(scrollIntoView).toHaveBeenCalledTimes(2);
	});

	it('does not pull the page back when the user scrolled in the meantime', () => {
		jump();
		window.dispatchEvent(new Event('wheel'));

		act(() => {
			jest.advanceTimersByTime(SETTLE_MS);
		});
		expect(scrollIntoView).toHaveBeenCalledTimes(1);
	});
});
