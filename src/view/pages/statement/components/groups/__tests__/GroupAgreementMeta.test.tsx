import { render, screen } from '@testing-library/react';
import GroupAgreementMeta from '../GroupAgreementMeta';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

describe('GroupAgreementMeta', () => {
	it('shows the agreement while results can be shown', () => {
		render(<GroupAgreementMeta agreement={0.42} resultsOff={false} />);

		expect(screen.getByText('42% agree')).toBeInTheDocument();
	});

	it('shows nothing while results are off', () => {
		const { container } = render(<GroupAgreementMeta agreement={0.42} resultsOff />);

		expect(container).toBeEmptyDOMElement();
	});
});
