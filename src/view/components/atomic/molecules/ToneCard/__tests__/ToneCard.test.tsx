import React from 'react';
import { render, screen } from '@testing-library/react';
import ToneCard, { toneFor, TONE_CYCLE } from '../ToneCard';

describe('ToneCard', () => {
	it('renders a plain surface card by default', () => {
		render(<ToneCard data-testid="card">Hello</ToneCard>);
		const card = screen.getByTestId('card');
		expect(card.tagName).toBe('DIV');
		expect(card).toHaveClass('tone-card');
		expect(card.className).not.toMatch(/tone-card--(lilac|mint|yellow|pink|peach)/);
		expect(card).toHaveAttribute('data-tone', 'surface');
	});

	it('wears a tone and the compact modifier', () => {
		render(
			<ToneCard tone="mint" compact data-testid="card">
				Hello
			</ToneCard>,
		);
		const card = screen.getByTestId('card');
		expect(card).toHaveClass('tone-card--mint', 'tone-card--compact');
		expect(card).toHaveAttribute('data-tone', 'mint');
	});

	it('is interactive when rendered as a link or button, or when asked', () => {
		const { rerender } = render(
			<ToneCard as="a" href="/x" tone="peach">
				Open
			</ToneCard>,
		);
		expect(screen.getByRole('link')).toHaveClass('tone-card--interactive');

		rerender(
			<ToneCard as="button" type="button">
				Press
			</ToneCard>,
		);
		expect(screen.getByRole('button')).toHaveClass('tone-card--interactive');

		rerender(
			<ToneCard interactive data-testid="card">
				Lift
			</ToneCard>,
		);
		expect(screen.getByTestId('card')).toHaveClass('tone-card--interactive');
	});

	it('cycles tones for a list, including negative indexes', () => {
		expect(TONE_CYCLE.map((_, i) => toneFor(i))).toEqual([...TONE_CYCLE]);
		expect(toneFor(TONE_CYCLE.length)).toBe(TONE_CYCLE[0]);
		expect(toneFor(-1)).toBe(TONE_CYCLE[TONE_CYCLE.length - 1]);
	});
});
