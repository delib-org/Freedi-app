import React, { useCallback, useEffect, useRef, useState } from 'react';
import { STORAGE_KEYS } from '@/constants/common';
import { logError } from '@/utils/errorHandling';

/**
 * A draggable sidebar: space titles are long, so the person sets how much room
 * the rail gets and we remember it. Desktop only — below 1024px the rail is
 * replaced by the floating bottom nav and the separator is hidden in CSS.
 */

export const SIDEBAR_WIDTH_DEFAULT = 232;
export const SIDEBAR_WIDTH_MIN = 180;
export const SIDEBAR_WIDTH_MAX = 460;
/** Arrow-key step; Page Up/Down and Home/End move further. */
const KEYBOARD_STEP = 16;
const KEYBOARD_PAGE = 64;

export function clampSidebarWidth(width: number): number {
	if (!Number.isFinite(width)) return SIDEBAR_WIDTH_DEFAULT;

	return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(width)));
}

function readStoredWidth(): number {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEYS.SIDEBAR_WIDTH);
		if (!raw) return SIDEBAR_WIDTH_DEFAULT;

		return clampSidebarWidth(Number.parseInt(raw, 10));
	} catch (error) {
		logError(error, { operation: 'hooks.useSidebarWidth.readStoredWidth' });

		return SIDEBAR_WIDTH_DEFAULT;
	}
}

export interface SeparatorProps {
	role: 'separator';
	'aria-orientation': 'vertical';
	'aria-valuenow': number;
	'aria-valuemin': number;
	'aria-valuemax': number;
	tabIndex: 0;
	onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
	onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
	onDoubleClick: () => void;
}

export interface SidebarWidthValue {
	width: number;
	isResizing: boolean;
	separatorProps: SeparatorProps;
}

/**
 * @param dir reading direction — in RTL the rail sits on the right, so dragging
 * towards the start of the screen makes it wider.
 */
export function useSidebarWidth(dir: 'ltr' | 'rtl' = 'ltr'): SidebarWidthValue {
	const [width, setWidth] = useState<number>(readStoredWidth);
	const [isResizing, setIsResizing] = useState(false);
	const widthRef = useRef(width);
	widthRef.current = width;

	useEffect(() => {
		if (isResizing) return;
		try {
			window.localStorage.setItem(STORAGE_KEYS.SIDEBAR_WIDTH, String(width));
		} catch (error) {
			logError(error, {
				operation: 'hooks.useSidebarWidth.persist',
				metadata: { width },
			});
		}
	}, [width, isResizing]);

	const onPointerDown = useCallback(
		(event: React.PointerEvent<HTMLElement>) => {
			if (event.button !== 0) return;
			event.preventDefault();

			const element = event.currentTarget;
			const startX = event.clientX;
			const startWidth = widthRef.current;
			const sign = dir === 'rtl' ? -1 : 1;

			const move = (moveEvent: PointerEvent): void => {
				setWidth(clampSidebarWidth(startWidth + (moveEvent.clientX - startX) * sign));
			};
			const stop = (): void => {
				element.removeEventListener('pointermove', move);
				element.removeEventListener('pointerup', stop);
				element.removeEventListener('pointercancel', stop);
				element.releasePointerCapture?.(event.pointerId);
				setIsResizing(false);
			};

			element.setPointerCapture?.(event.pointerId);
			element.addEventListener('pointermove', move);
			element.addEventListener('pointerup', stop);
			element.addEventListener('pointercancel', stop);
			setIsResizing(true);
		},
		[dir],
	);

	const onKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLElement>) => {
			// Arrows follow the screen, not the text: in RTL, "left" widens.
			const towardsWider = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
			const towardsNarrower = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
			const step = (delta: number): void => {
				event.preventDefault();
				setWidth((current) => clampSidebarWidth(current + delta));
			};

			if (event.key === towardsWider) step(KEYBOARD_STEP);
			else if (event.key === towardsNarrower) step(-KEYBOARD_STEP);
			else if (event.key === 'PageUp') step(KEYBOARD_PAGE);
			else if (event.key === 'PageDown') step(-KEYBOARD_PAGE);
			else if (event.key === 'Home') {
				event.preventDefault();
				setWidth(SIDEBAR_WIDTH_MIN);
			} else if (event.key === 'End') {
				event.preventDefault();
				setWidth(SIDEBAR_WIDTH_MAX);
			}
		},
		[dir],
	);

	const onDoubleClick = useCallback(() => setWidth(SIDEBAR_WIDTH_DEFAULT), []);

	return {
		width,
		isResizing,
		separatorProps: {
			role: 'separator',
			'aria-orientation': 'vertical',
			'aria-valuenow': width,
			'aria-valuemin': SIDEBAR_WIDTH_MIN,
			'aria-valuemax': SIDEBAR_WIDTH_MAX,
			tabIndex: 0,
			onPointerDown,
			onKeyDown,
			onDoubleClick,
		},
	};
}
