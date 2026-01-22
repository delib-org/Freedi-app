/**
 * Tests for useClickOutside hook
 */

import { renderHook } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import useClickOutside from '../useClickOutside';

describe('useClickOutside', () => {
	describe('basic functionality', () => {
		it('should return a ref', () => {
			const handler = jest.fn();
			const { result } = renderHook(() => useClickOutside(handler));

			expect(result.current).toHaveProperty('current');
		});

		it('should call handler when clicking outside the referenced element', () => {
			const handler = jest.fn();
			const { result } = renderHook(() => useClickOutside(handler));

			// Create a DOM element and attach the ref
			const div = document.createElement('div');
			document.body.appendChild(div);
			Object.defineProperty(result.current, 'current', { value: div, writable: true });

			// Create an outside element
			const outsideElement = document.createElement('button');
			document.body.appendChild(outsideElement);

			// Simulate click outside
			fireEvent.mouseDown(outsideElement);

			expect(handler).toHaveBeenCalled();

			// Cleanup
			document.body.removeChild(div);
			document.body.removeChild(outsideElement);
		});

		it('should NOT call handler when clicking inside the referenced element', () => {
			const handler = jest.fn();
			const { result } = renderHook(() => useClickOutside(handler));

			// Create a DOM element and attach the ref
			const div = document.createElement('div');
			const innerElement = document.createElement('span');
			div.appendChild(innerElement);
			document.body.appendChild(div);
			Object.defineProperty(result.current, 'current', { value: div, writable: true });

			// Simulate click inside
			fireEvent.mouseDown(innerElement);

			expect(handler).not.toHaveBeenCalled();

			// Cleanup
			document.body.removeChild(div);
		});

		it('should NOT call handler when clicking on the referenced element itself', () => {
			const handler = jest.fn();
			const { result } = renderHook(() => useClickOutside(handler));

			// Create a DOM element and attach the ref
			const div = document.createElement('div');
			document.body.appendChild(div);
			Object.defineProperty(result.current, 'current', { value: div, writable: true });

			// Simulate click on the element itself
			fireEvent.mouseDown(div);

			expect(handler).not.toHaveBeenCalled();

			// Cleanup
			document.body.removeChild(div);
		});
	});

	describe('event listener management', () => {
		it('should add event listener on mount', () => {
			const addEventListenerSpy = jest.spyOn(document, 'addEventListener');
			const handler = jest.fn();

			renderHook(() => useClickOutside(handler));

			expect(addEventListenerSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));

			addEventListenerSpy.mockRestore();
		});

		it('should remove event listener on unmount', () => {
			const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');
			const handler = jest.fn();

			const { unmount } = renderHook(() => useClickOutside(handler));

			unmount();

			expect(removeEventListenerSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));

			removeEventListenerSpy.mockRestore();
		});
	});

	describe('handler updates', () => {
		it('should use updated handler when it changes', () => {
			const handler1 = jest.fn();
			const handler2 = jest.fn();

			const { result, rerender } = renderHook(
				({ handler }) => useClickOutside(handler),
				{ initialProps: { handler: handler1 } }
			);

			// Create element setup
			const div = document.createElement('div');
			document.body.appendChild(div);
			Object.defineProperty(result.current, 'current', { value: div, writable: true });

			const outsideElement = document.createElement('button');
			document.body.appendChild(outsideElement);

			// Update to new handler
			rerender({ handler: handler2 });

			// Simulate click outside
			fireEvent.mouseDown(outsideElement);

			// New handler should be called
			expect(handler2).toHaveBeenCalled();

			// Cleanup
			document.body.removeChild(div);
			document.body.removeChild(outsideElement);
		});
	});

	describe('ref behavior', () => {
		it('should return null current value initially', () => {
			const handler = jest.fn();
			const { result } = renderHook(() => useClickOutside(handler));

			expect(result.current.current).toBeNull();
		});

		it('should handle ref not being attached to any element', () => {
			const handler = jest.fn();
			renderHook(() => useClickOutside(handler));

			// Create an outside element and click it
			const outsideElement = document.createElement('button');
			document.body.appendChild(outsideElement);

			// Should not throw when ref.current is null
			expect(() => {
				fireEvent.mouseDown(outsideElement);
			}).not.toThrow();

			// Cleanup
			document.body.removeChild(outsideElement);
		});
	});

	describe('edge cases', () => {
		it('should handle nested elements correctly', () => {
			const handler = jest.fn();
			const { result } = renderHook(() => useClickOutside(handler));

			// Create nested structure
			const container = document.createElement('div');
			const child = document.createElement('div');
			const grandchild = document.createElement('span');
			child.appendChild(grandchild);
			container.appendChild(child);
			document.body.appendChild(container);

			Object.defineProperty(result.current, 'current', { value: container, writable: true });

			// Click on grandchild (should not trigger handler)
			fireEvent.mouseDown(grandchild);
			expect(handler).not.toHaveBeenCalled();

			// Cleanup
			document.body.removeChild(container);
		});

		it('should handle multiple clicks', () => {
			const handler = jest.fn();
			const { result } = renderHook(() => useClickOutside(handler));

			const div = document.createElement('div');
			document.body.appendChild(div);
			Object.defineProperty(result.current, 'current', { value: div, writable: true });

			const outsideElement = document.createElement('button');
			document.body.appendChild(outsideElement);

			// Multiple clicks
			fireEvent.mouseDown(outsideElement);
			fireEvent.mouseDown(outsideElement);
			fireEvent.mouseDown(outsideElement);

			expect(handler).toHaveBeenCalledTimes(3);

			// Cleanup
			document.body.removeChild(div);
			document.body.removeChild(outsideElement);
		});
	});
});
