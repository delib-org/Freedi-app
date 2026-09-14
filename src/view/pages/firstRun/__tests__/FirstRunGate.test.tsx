import { render, screen, waitFor } from '@testing-library/react';
import { User } from '@freedi/shared-types';

const getLatestTermsAcceptance = jest.fn();
jest.mock('@/controllers/db/termsOfUse/termsOfUseService', () => ({
	getLatestTermsAcceptance: (...args: unknown[]) => getLatestTermsAcceptance(...args),
}));
jest.mock('../FirstRunFlow', () => ({
	__esModule: true,
	default: ({ onDone }: { onDone: () => void }) => (
		<button data-testid="flow" onClick={onDone}>
			flow
		</button>
	),
}));
jest.mock('@/view/pages/loadingPage/LoadingPage', () => ({
	__esModule: true,
	default: () => <div data-testid="loading" />,
}));

import { FirstRunGate } from '../FirstRunGate';
import { useFirstRunPending } from '../FirstRunContext';

function Probe() {
	return <span data-testid="pending">{String(useFirstRunPending())}</span>;
}

const user = { uid: 'u1' } as unknown as User;

describe('FirstRunGate', () => {
	beforeEach(() => jest.clearAllMocks());

	it('renders the page and the flow over it when the user has no terms record', async () => {
		getLatestTermsAcceptance.mockResolvedValue(null);
		render(
			<FirstRunGate user={user}>
				<Probe />
			</FirstRunGate>,
		);
		expect(screen.getByTestId('loading')).toBeInTheDocument();
		await waitFor(() => expect(screen.getByTestId('flow')).toBeInTheDocument());
		expect(screen.getByTestId('pending')).toHaveTextContent('true');
		screen.getByTestId('flow').click();
		await waitFor(() => expect(screen.queryByTestId('flow')).not.toBeInTheDocument());
		expect(screen.getByTestId('pending')).toHaveTextContent('false');
	});

	it('renders nothing extra when terms were already accepted', async () => {
		getLatestTermsAcceptance.mockResolvedValue({ accepted: true });
		render(
			<FirstRunGate user={user}>
				<Probe />
			</FirstRunGate>,
		);
		await waitFor(() => expect(screen.getByTestId('pending')).toHaveTextContent('false'));
		expect(screen.queryByTestId('flow')).not.toBeInTheDocument();
	});

	it('skips the check for a signed-out visitor', async () => {
		render(
			<FirstRunGate user={null}>
				<Probe />
			</FirstRunGate>,
		);
		await waitFor(() => expect(screen.getByTestId('pending')).toHaveTextContent('false'));
		expect(getLatestTermsAcceptance).not.toHaveBeenCalled();
	});
});
