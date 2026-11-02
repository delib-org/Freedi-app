import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import InviteLinkToLive from '../InviteLinkToLive';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (k: string) => k, dir: 'ltr' }),
}));

describe('InviteLinkToLive', () => {
	it('links to the Live now card of the same statement', () => {
		render(
			<MemoryRouter>
				<InviteLinkToLive statementId="q1" />
			</MemoryRouter>,
		);
		const link = screen.getByRole('link', { name: 'people.inviteLinkInLive' });

		expect(link).toHaveAttribute('href', '/statement-screen/q1/settings?section=live');
	});

	it('never points at the retired anonymous route', () => {
		render(
			<MemoryRouter>
				<InviteLinkToLive statementId="q1" />
			</MemoryRouter>,
		);

		expect(screen.getByTestId('invite-link-to-live').getAttribute('href')).not.toContain(
			'statement-an',
		);
	});
});
