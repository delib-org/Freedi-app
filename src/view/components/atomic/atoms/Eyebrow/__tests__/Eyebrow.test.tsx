import React from 'react';
import { render, screen } from '@testing-library/react';
import Eyebrow from '../Eyebrow';

describe('Eyebrow', () => {
	it('renders a span with the block class by default', () => {
		render(<Eyebrow>Your spaces</Eyebrow>);
		const el = screen.getByText('Your spaces');
		expect(el.tagName).toBe('SPAN');
		expect(el).toHaveClass('eyebrow');
		expect(el).not.toHaveClass('eyebrow--accent');
	});

	it('takes the accent and inherit modifiers and another tag', () => {
		render(
			<Eyebrow as="p" accent inherit className="extra">
				Our starting question
			</Eyebrow>,
		);
		const el = screen.getByText('Our starting question');
		expect(el.tagName).toBe('P');
		expect(el).toHaveClass('eyebrow', 'eyebrow--accent', 'eyebrow--inherit', 'extra');
	});

	it('places an icon before the text', () => {
		render(<Eyebrow icon={<svg data-testid="icon" />}>Kind</Eyebrow>);
		const el = screen.getByText('Kind');
		expect(el.firstChild).toBe(screen.getByTestId('icon'));
	});
});
