import { render, screen } from '@testing-library/react';
import CreditToast from '../CreditToast';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({
		t: (key: string) => (key === 'engagement.creditsEarned' ? '+{{amount}} נקודות' : key),
	}),
}));

describe('CreditToast', () => {
	it('shows the amount with the translated unit as its status text', () => {
		render(<CreditToast amount={3} />);

		expect(screen.getByRole('status').textContent).toBe('+3 נקודות');
	});

	it('renders nothing for a zero amount', () => {
		const { container } = render(<CreditToast amount={0} />);

		expect(container.firstChild).toBeNull();
	});
});
