import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import ActionToast from '../ActionToast';

describe('ActionToast', () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	it('renders the docked toast block with a status role', () => {
		render(<ActionToast message="Dana let in" onDismiss={jest.fn()} />);
		const toast = screen.getByRole('status');

		expect(toast).toHaveClass('toast', 'toast--default', 'toast--docked');
		expect(toast).toHaveTextContent('Dana let in');
		expect(screen.queryByRole('button')).toBeNull();
	});

	it('runs the action from the toast__action button', () => {
		const onAction = jest.fn();
		render(
			<ActionToast
				message="Dana let in"
				actionLabel="Undo"
				onAction={onAction}
				onDismiss={jest.fn()}
			/>,
		);
		const undo = screen.getByRole('button', { name: 'Undo' });

		expect(undo).toHaveClass('toast__action');
		fireEvent.click(undo);
		expect(onAction).toHaveBeenCalledTimes(1);
	});

	it('dismisses itself after the duration', () => {
		const onDismiss = jest.fn();
		render(<ActionToast message="Saved" onDismiss={onDismiss} durationMs={1000} />);

		act(() => jest.advanceTimersByTime(999));
		expect(onDismiss).not.toHaveBeenCalled();
		act(() => jest.advanceTimersByTime(1));
		expect(onDismiss).toHaveBeenCalledTimes(1);
	});

	it('pauses while hovered and resumes after', () => {
		const onDismiss = jest.fn();
		render(<ActionToast message="Saved" onDismiss={onDismiss} durationMs={1000} />);
		const toast = screen.getByRole('status');

		fireEvent.mouseEnter(toast);
		act(() => jest.advanceTimersByTime(5000));
		expect(onDismiss).not.toHaveBeenCalled();

		fireEvent.mouseLeave(toast);
		act(() => jest.advanceTimersByTime(1000));
		expect(onDismiss).toHaveBeenCalledTimes(1);
	});

	it('pauses while the action has focus', () => {
		const onDismiss = jest.fn();
		render(
			<ActionToast
				message="Saved"
				actionLabel="Undo"
				onAction={jest.fn()}
				onDismiss={onDismiss}
				durationMs={1000}
			/>,
		);

		fireEvent.focus(screen.getByRole('button', { name: 'Undo' }));
		act(() => jest.advanceTimersByTime(5000));
		expect(onDismiss).not.toHaveBeenCalled();
	});
});
