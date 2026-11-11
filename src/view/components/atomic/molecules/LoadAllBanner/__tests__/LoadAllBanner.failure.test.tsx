import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import statements from '@/redux/statements/statementsSlice';
import {
	bulkLoadStatements,
	getStatementsCount,
} from '@/controllers/db/statements/bulkLoadStatements';
import LoadAllBanner from '../LoadAllBanner';

jest.mock('@/controllers/db/statements/bulkLoadStatements', () => ({
	bulkLoadStatements: jest.fn(),
	getStatementsCount: jest.fn(),
}));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key, currentLanguage: 'en' }),
}));
jest.mock('@/utils/errorHandling', () => ({
	...jest.requireActual('@/utils/errorHandling'),
	logError: jest.fn(),
}));

const FAILURE = 'Could not load everything. Please try again.';

function renderBanner(onLoaded?: () => void) {
	const store = configureStore({ reducer: { statements } });

	render(
		<Provider store={store}>
			<LoadAllBanner
				rootId="q"
				mode="direct"
				label="See all answers"
				description="40 answers"
				alwaysOffer
				onLoaded={onLoaded}
			/>
		</Provider>,
	);
}

describe('LoadAllBanner when loading fails', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		(getStatementsCount as jest.Mock).mockResolvedValue(40);
	});

	it('tells the person and offers the button again', async () => {
		(bulkLoadStatements as jest.Mock).mockRejectedValueOnce(new Error('network'));
		const onLoaded = jest.fn();
		renderBanner(onLoaded);

		fireEvent.click(await screen.findByRole('button', { name: 'See all answers' }));

		expect(await screen.findByRole('alert')).toHaveTextContent(FAILURE);
		expect(screen.getByRole('button', { name: 'See all answers' })).toBeInTheDocument();
		expect(onLoaded).not.toHaveBeenCalled();
	});

	it('goes on after a second try works', async () => {
		(bulkLoadStatements as jest.Mock)
			.mockRejectedValueOnce(new Error('network'))
			.mockResolvedValueOnce({ loaded: 40, watermark: 1 });
		const onLoaded = jest.fn();
		renderBanner(onLoaded);

		fireEvent.click(await screen.findByRole('button', { name: 'See all answers' }));
		await screen.findByRole('alert');
		fireEvent.click(screen.getByRole('button', { name: 'See all answers' }));

		await waitFor(() => expect(onLoaded).toHaveBeenCalledTimes(1));
		expect(screen.queryByRole('alert')).not.toBeInTheDocument();
	});
});
