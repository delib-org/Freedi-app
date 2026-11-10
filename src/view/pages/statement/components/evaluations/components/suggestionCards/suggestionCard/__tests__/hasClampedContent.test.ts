import { hasClampedContent } from '../hasClampedContent';

function withHeights(element: HTMLElement, scrollHeight: number, clientHeight: number): void {
	Object.defineProperty(element, 'scrollHeight', { value: scrollHeight, configurable: true });
	Object.defineProperty(element, 'clientHeight', { value: clientHeight, configurable: true });
}

describe('hasClampedContent', () => {
	it('is false when nothing is cut off', () => {
		const container = document.createElement('div');
		const body = document.createElement('div');
		container.appendChild(body);
		withHeights(container, 40, 40);
		withHeights(body, 20, 20);

		expect(hasClampedContent(container)).toBe(false);
	});

	it('ignores sub-pixel rounding', () => {
		const container = document.createElement('div');
		withHeights(container, 41, 40);

		expect(hasClampedContent(container)).toBe(false);
	});

	it('is true when the container itself is cut off', () => {
		const container = document.createElement('div');
		withHeights(container, 80, 40);

		expect(hasClampedContent(container)).toBe(true);
	});

	it('is true when only the clamped body inside is cut off', () => {
		const container = document.createElement('div');
		const title = document.createElement('span');
		const body = document.createElement('div');
		container.append(title, body);
		withHeights(container, 60, 60);
		withHeights(title, 20, 20);
		withHeights(body, 90, 40);

		expect(hasClampedContent(container)).toBe(true);
	});
});
