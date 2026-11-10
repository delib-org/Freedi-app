import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ReadMoreClamp from '../ReadMoreClamp';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

const mockHeights = (scrollHeight: number, clientHeight: number): void => {
	Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
		configurable: true,
		get: () => scrollHeight,
	});
	Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
		configurable: true,
		get: () => clientHeight,
	});
};

describe('ReadMoreClamp', () => {
	afterEach(() => {
		Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
		Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
	});

	it('shows no toggle when the text fits', () => {
		mockHeights(40, 40);
		render(
			<ReadMoreClamp contentKey="a">
				<p>Short</p>
			</ReadMoreClamp>,
		);

		expect(screen.queryByRole('button')).not.toBeInTheDocument();
	});

	it('clips paragraphs, shows Read more, and expands and collapses', () => {
		mockHeights(120, 40);
		render(
			<ReadMoreClamp contentKey="a">
				<p>One</p>
				<p>Two</p>
				<p>Three</p>
			</ReadMoreClamp>,
		);

		const toggle = screen.getByRole('button', { name: 'Read more' });
		expect(toggle).toHaveAttribute('aria-expanded', 'false');

		fireEvent.click(toggle);

		const showLess = screen.getByRole('button', { name: 'Show less' });
		expect(showLess).toHaveAttribute('aria-expanded', 'true');
		expect(screen.getByText('Three')).toBeInTheDocument();

		fireEvent.click(showLess);

		expect(screen.getByRole('button', { name: 'Read more' })).toBeInTheDocument();
	});
});
