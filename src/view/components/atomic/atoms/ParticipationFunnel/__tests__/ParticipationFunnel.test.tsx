import React from 'react';
import { render, screen } from '@testing-library/react';
import ParticipationFunnel from '../ParticipationFunnel';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({
		t: (text: string) => text,
		currentLanguage: 'en',
	}),
}));

describe('ParticipationFunnel', () => {
	it('renders all three segments when counts are positive', () => {
		render(<ParticipationFunnel entered={18} suggested={13} evaluated={9} />);

		expect(screen.getByText('18 entered')).toBeInTheDocument();
		expect(screen.getByText('13 added answers')).toBeInTheDocument();
		expect(screen.getByText('9 evaluated')).toBeInTheDocument();
	});

	it('hides segments with zero or missing counts', () => {
		render(<ParticipationFunnel suggested={13} evaluated={9} />);

		expect(screen.queryByText(/entered/)).not.toBeInTheDocument();
		expect(screen.getByText('13 added answers')).toBeInTheDocument();
	});

	it('renders nothing when all counts are zero or missing', () => {
		const { container } = render(<ParticipationFunnel entered={0} suggested={0} />);

		expect(container).toBeEmptyDOMElement();
	});

	it('leaves the counts readable to screen readers', () => {
		const { container } = render(<ParticipationFunnel entered={18} suggested={13} evaluated={9} />);

		expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
		expect(container.querySelector('[aria-label]')).toBeNull();
		expect(screen.getByText('18 entered')).toBeVisible();
	});

	it('uses the participant wording and lead-in when asked', () => {
		render(
			<ParticipationFunnel audience="participant" leadIn="So far:" suggested={13} evaluated={9} />,
		);

		expect(screen.getByText('So far:')).toBeInTheDocument();
		expect(screen.getByText('progress.peopleAddedAnswers')).toBeInTheDocument();
		expect(screen.getByText('progress.peopleRated')).toBeInTheDocument();
	});

	it('formats large numbers compactly', () => {
		render(<ParticipationFunnel entered={1200} />);

		expect(screen.getByText('1.2K entered')).toBeInTheDocument();
	});
});
