import React from 'react';
import { render, screen } from '@testing-library/react';
import InlineNote from '../InlineNote';

describe('InlineNote', () => {
	it('announces an error at once', () => {
		render(<InlineNote variant="error">Could not save. Try again.</InlineNote>);
		const note = screen.getByRole('alert');

		expect(note).toHaveClass('inline-note', 'inline-note--error');
		expect(note).toHaveTextContent('Could not save. Try again.');
	});

	it.each(['success', 'info'] as const)('uses role status for %s', (variant) => {
		render(<InlineNote variant={variant}>Saved</InlineNote>);

		expect(screen.getByRole('status')).toHaveClass(`inline-note--${variant}`);
	});

	it('renders the action slot only when given', () => {
		const { rerender, container } = render(<InlineNote variant="error">Failed</InlineNote>);
		expect(container.querySelector('.inline-note__action')).toBeNull();

		rerender(
			<InlineNote variant="error" action={<button type="button">Retry</button>} className="extra">
				Failed
			</InlineNote>,
		);
		expect(container.querySelector('.inline-note__action')).toContainElement(
			screen.getByRole('button', { name: 'Retry' }),
		);
		expect(screen.getByRole('alert')).toHaveClass('extra');
	});
});
