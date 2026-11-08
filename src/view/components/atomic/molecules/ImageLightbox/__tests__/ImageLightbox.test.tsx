/**
 * Tests for the ImageLightbox atomic molecule
 */

import React from 'react';
import { render, screen, fireEvent, createEvent } from '@testing-library/react';
import ImageLightbox from '../ImageLightbox';
import { IMAGE_ZOOM } from '../imageZoomMath';

const STAGE_RECT = {
	left: 0,
	top: 0,
	width: 1000,
	height: 600,
	right: 1000,
	bottom: 600,
	x: 0,
	y: 0,
};

function renderLightbox(props: Partial<React.ComponentProps<typeof ImageLightbox>> = {}) {
	const onClose = jest.fn();
	render(
		<ImageLightbox
			isOpen
			onClose={onClose}
			src="https://example.com/street.jpg"
			alt="A shared street"
			closeLabel="Close"
			zoomInLabel="Zoom in"
			zoomOutLabel="Zoom out"
			{...props}
		/>,
	);

	const stage = document.querySelector<HTMLDivElement>('.image-lightbox__stage');
	const image = document.querySelector<HTMLImageElement>('.image-lightbox__image');
	if (stage && image) {
		// jsdom lays nothing out: give the stage and the picture their sizes.
		stage.getBoundingClientRect = () => ({ ...STAGE_RECT, toJSON: () => STAGE_RECT });
		Object.defineProperty(image, 'offsetWidth', { value: 800, configurable: true });
		Object.defineProperty(image, 'offsetHeight', { value: 400, configurable: true });
	}

	return { onClose, stage, image };
}

function scaleOf(image: HTMLImageElement | null): number {
	return Number(image?.style.getPropertyValue('--image-lightbox-scale'));
}

function pointer(
	type: 'pointerDown' | 'pointerMove' | 'pointerUp',
	target: Element,
	init: { pointerId: number; clientX: number; clientY: number },
) {
	// jsdom has no PointerEvent, so the coordinates are set on a plain event.
	const event = createEvent[type](target, { bubbles: true });
	Object.assign(event, { pointerType: 'touch', button: 0, ...init });
	fireEvent(target, event);
}

function wheel(stage: Element, deltaY: number, timeStamp: number) {
	const event = createEvent.wheel(stage, { deltaY, clientX: 500, clientY: 300 });
	Object.defineProperty(event, 'timeStamp', { value: timeStamp });
	fireEvent(stage, event);
}

describe('ImageLightbox', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('renders nothing while closed', () => {
		renderLightbox({ isOpen: false });

		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
	});

	it('opens as a dialog named after the picture, at its fitted size', () => {
		const { image } = renderLightbox();

		expect(screen.getByRole('dialog', { name: 'A shared street' })).toBeInTheDocument();
		expect(image).toHaveAttribute('src', 'https://example.com/street.jpg');
		expect(scaleOf(image)).toBe(1);
	});

	it('closes on the close button and on Escape', () => {
		const { onClose } = renderLightbox();

		fireEvent.click(screen.getByRole('button', { name: 'Close' }));
		fireEvent.keyDown(document, { key: 'Escape' });

		expect(onClose).toHaveBeenCalledTimes(2);
	});

	describe('zoom buttons', () => {
		it('zooms in, and marks the viewer as zoomed', () => {
			const { image, onClose } = renderLightbox();

			fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));

			expect(scaleOf(image)).toBe(IMAGE_ZOOM.BUTTON_STEP);
			expect(screen.getByRole('dialog')).toHaveClass('image-lightbox--zoomed');
			expect(onClose).not.toHaveBeenCalled();
		});

		it('zooms back out to the fitted size without closing', () => {
			const { image, onClose } = renderLightbox();

			fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
			fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));

			expect(scaleOf(image)).toBe(1);
			expect(onClose).not.toHaveBeenCalled();
		});

		it('closes when zooming out from the fitted size', () => {
			const { onClose } = renderLightbox();

			fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));

			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('disables zoom in at the maximum scale', () => {
			renderLightbox();
			const zoomIn = screen.getByRole('button', { name: 'Zoom in' });

			for (let press = 0; press < 6; press++) fireEvent.click(zoomIn);

			expect(zoomIn).toBeDisabled();
		});
	});

	describe('keyboard', () => {
		it('zooms with + and -, and - at the fitted size closes', () => {
			const { image, onClose } = renderLightbox();
			const dialog = screen.getByRole('dialog');

			fireEvent.keyDown(dialog, { key: '+' });
			expect(scaleOf(image)).toBe(IMAGE_ZOOM.BUTTON_STEP);

			fireEvent.keyDown(dialog, { key: '-' });
			expect(scaleOf(image)).toBe(1);
			expect(onClose).not.toHaveBeenCalled();

			fireEvent.keyDown(dialog, { key: '-' });
			expect(onClose).toHaveBeenCalledTimes(1);
		});
	});

	describe('wheel', () => {
		it('zooms in on scroll up and closes on a fresh scroll down at the fitted size', () => {
			const { stage, image, onClose } = renderLightbox();
			if (!stage) throw new Error('stage missing');

			wheel(stage, -400, 1000);
			expect(scaleOf(image)).toBeGreaterThan(1);

			wheel(stage, 4000, 2000);
			expect(scaleOf(image)).toBe(1);
			expect(onClose).not.toHaveBeenCalled();

			wheel(stage, 100, 3000);
			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('does not close when one continuous scroll overshoots the fitted size', () => {
			const { stage, image, onClose } = renderLightbox();
			if (!stage) throw new Error('stage missing');

			wheel(stage, -400, 1000);
			wheel(stage, 4000, 1100);
			wheel(stage, 100, 1200);
			wheel(stage, 100, 1300);

			expect(scaleOf(image)).toBe(1);
			expect(onClose).not.toHaveBeenCalled();
		});
	});

	describe('touch', () => {
		it('closes on a tap beside the picture, not on a tap on it', () => {
			const { stage, image, onClose } = renderLightbox();
			if (!stage || !image) throw new Error('stage missing');

			pointer('pointerDown', image, { pointerId: 1, clientX: 500, clientY: 300 });
			pointer('pointerUp', image, { pointerId: 1, clientX: 500, clientY: 300 });
			expect(onClose).not.toHaveBeenCalled();

			pointer('pointerDown', stage, { pointerId: 2, clientX: 20, clientY: 20 });
			pointer('pointerUp', stage, { pointerId: 2, clientX: 20, clientY: 20 });
			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('zooms in when two fingers spread', () => {
			const { image, onClose } = renderLightbox();
			if (!image) throw new Error('image missing');

			pointer('pointerDown', image, { pointerId: 1, clientX: 450, clientY: 300 });
			pointer('pointerDown', image, { pointerId: 2, clientX: 550, clientY: 300 });
			pointer('pointerMove', image, { pointerId: 2, clientX: 650, clientY: 300 });
			pointer('pointerUp', image, { pointerId: 2, clientX: 650, clientY: 300 });
			pointer('pointerUp', image, { pointerId: 1, clientX: 450, clientY: 300 });

			expect(scaleOf(image)).toBe(2);
			expect(onClose).not.toHaveBeenCalled();
		});

		it('closes when the picture is pinched smaller than its fitted size', () => {
			const { image, onClose } = renderLightbox();
			if (!image) throw new Error('image missing');

			pointer('pointerDown', image, { pointerId: 1, clientX: 400, clientY: 300 });
			pointer('pointerDown', image, { pointerId: 2, clientX: 600, clientY: 300 });
			pointer('pointerMove', image, { pointerId: 2, clientX: 500, clientY: 300 });
			pointer('pointerUp', image, { pointerId: 2, clientX: 500, clientY: 300 });

			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('springs back when a pinch ends only slightly under the fitted size', () => {
			const { image, onClose } = renderLightbox();
			if (!image) throw new Error('image missing');

			pointer('pointerDown', image, { pointerId: 1, clientX: 400, clientY: 300 });
			pointer('pointerDown', image, { pointerId: 2, clientX: 600, clientY: 300 });
			pointer('pointerMove', image, { pointerId: 2, clientX: 580, clientY: 300 });
			expect(scaleOf(image)).toBeCloseTo(0.9);

			pointer('pointerUp', image, { pointerId: 2, clientX: 580, clientY: 300 });

			expect(scaleOf(image)).toBe(1);
			expect(onClose).not.toHaveBeenCalled();
		});
	});
});
