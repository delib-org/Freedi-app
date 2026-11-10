import { render, screen } from '@testing-library/react';
import AgreementStatus from '../AgreementStatus';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

describe('AgreementStatus', () => {
	it('tells a viewer the guard allows how the agreement stands', () => {
		render(<AgreementStatus agreed cp={0.8} evaluators={12} showScores />);

		expect(screen.getByText(/Passed the agreement threshold/)).toBeInTheDocument();
		expect(screen.getByText(/People who rated/)).toHaveTextContent('12');
	});

	it.each([true, false])('says nothing to a viewer who has not rated (agreed: %s)', (agreed) => {
		const { container } = render(
			<AgreementStatus agreed={agreed} cp={0.8} evaluators={12} showScores={false} />,
		);

		expect(container).toBeEmptyDOMElement();
	});
});
