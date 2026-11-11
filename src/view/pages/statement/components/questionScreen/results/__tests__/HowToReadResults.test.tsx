import React from 'react';
import { render, screen } from '@testing-library/react';
import HowToReadResults from '../HowToReadResults';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

describe('HowToReadResults', () => {
	it('is closed by default', () => {
		render(<HowToReadResults />);

		expect(screen.getByTestId('results-how-to-read')).not.toHaveAttribute('open');
	});

	it('names itself and carries the four lines', () => {
		render(<HowToReadResults />);

		expect(screen.getByText('results.howToRead')).toBeInTheDocument();
		['1', '2', '3', '4'].forEach((line) => {
			expect(screen.getByText(`results.howToRead${line}`)).toBeInTheDocument();
		});
	});
});
