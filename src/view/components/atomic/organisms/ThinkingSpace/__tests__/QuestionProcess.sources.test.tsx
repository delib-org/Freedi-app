import { render, screen, waitFor } from '@testing-library/react';
import { useSelector } from 'react-redux';
import { DeliberationStatus, Statement } from '@freedi/shared-types';
import { requestDeliberation } from '@/controllers/db/deliberation';
import QuestionProcess from '../QuestionProcess';

jest.mock('react-redux', () => ({ useSelector: jest.fn() }));
jest.mock('@/redux/statements/statementsSlice', () => ({ statementSelector: jest.fn() }));
jest.mock('@/controllers/db/deliberation', () => ({
	requestDeliberation: jest.fn(),
	createAgreementHandoff: jest.fn(),
	DELIBERATION_POLL_MS: 60000,
}));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/view/components/subGroupCard/SubGroupCardSummary', () => ({
	__esModule: true,
	default: () => null,
}));

const question = { statementId: 'q1', statement: 'What should we do?' } as Statement;

async function renderWithSources(count: number): Promise<HTMLElement> {
	const sources = Array.from({ length: count }, (_, index) => ({
		id: `s${index}`,
		text: `Source ${index}`,
		cp: 0.5,
	}));
	(requestDeliberation as unknown as jest.Mock).mockResolvedValue({
		data: { sources } as unknown as DeliberationStatus,
	});
	(useSelector as jest.Mock).mockReturnValue(question);
	const { container } = render(<QuestionProcess statement={question} view="summary" />);
	await waitFor(() => expect(screen.getByText(`Source ${count - 1}`)).toBeInTheDocument());

	return container.querySelector('summary') as HTMLElement;
}

describe('QuestionProcess source list heading', () => {
	it('is singular for one original answer', async () => {
		const summary = await renderWithSources(1);
		expect(summary.textContent).toBe('Source solution · 1');
	});

	it('is plural for more than one original answer', async () => {
		const summary = await renderWithSources(3);
		expect(summary.textContent).toBe('Original answers · 3');
	});
});
