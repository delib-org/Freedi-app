import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Statement, StatementType } from '@freedi/shared-types';
import CreateStatementModal from '../CreateStatementModal';

const mockCreate = jest.fn();
const mockDetect = jest.fn();

jest.mock('../../settings/statementSettingsCont', () => ({
	createStatementFromModal: (...args: unknown[]) => mockCreate(...args),
}));
jest.mock('@/services/multiSuggestionDetection', () => ({
	detectMultipleSuggestionsWithTimeout: (...args: unknown[]) => mockDetect(...args),
}));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/controllers/hooks/useAuthentication', () => ({
	useAuthentication: () => ({ creator: { uid: 'u1' } }),
}));
jest.mock('@/controllers/general/helpers', () => ({
	validateStatementTypeHierarchy: () => ({ allowed: true }),
}));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));
jest.mock('@/utils/paragraphUtils', () => ({ generateParagraphId: () => 'p1' }));
jest.mock('@/view/components/multiSuggestion', () => ({
	MultiSuggestionPreviewModal: () => null,
}));
jest.mock('@/view/components/buttons/button/Button', () => ({
	__esModule: true,
	default: ({ text }: { text: string }) => <button>{text}</button>,
	ButtonType: { PRIMARY: 'primary', SECONDARY: 'secondary' },
}));

const question = {
	statementId: 'q1',
	statementType: StatementType.question,
} as unknown as Statement;
const REJECTED = {
	ok: false,
	isMultipleSuggestions: false,
	suggestions: [],
	originalText: 'bad words',
	rejection: { reason: 'Please rephrase', category: 'other' },
};
const CLEAN = { ok: true, isMultipleSuggestions: false, suggestions: [], originalText: 'fine' };
const titleInput = () => screen.getByPlaceholderText('Title') as HTMLInputElement;

function renderAndSubmit(title: string, isMultiSuggestionEnabled = true) {
	const setShowModal = jest.fn();
	const { container } = render(
		<CreateStatementModal
			parentStatement={question}
			isOption
			setShowModal={setShowModal}
			isMultiSuggestionEnabled={isMultiSuggestionEnabled}
		/>,
	);
	fireEvent.change(titleInput(), { target: { value: title } });
	fireEvent.submit(container.querySelector('form') as HTMLFormElement);

	return setShowModal;
}

describe('CreateStatementModal moderation', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockCreate.mockResolvedValue(undefined);
	});

	it('shows a rejection, creates nothing and keeps the text', async () => {
		mockDetect.mockResolvedValue(REJECTED);
		const setShowModal = renderAndSubmit('bad words');

		expect(await screen.findByRole('alert')).toHaveTextContent('Please rephrase');
		expect(mockCreate).not.toHaveBeenCalled();
		expect(setShowModal).not.toHaveBeenCalled();
		expect(titleInput().value).toBe('bad words');
	});

	it('clears the rejection when the text changes', async () => {
		mockDetect.mockResolvedValue(REJECTED);
		renderAndSubmit('bad words');
		await screen.findByRole('alert');

		fireEvent.change(titleInput(), { target: { value: 'kind words' } });

		expect(screen.queryByRole('alert')).not.toBeInTheDocument();
	});

	it('still creates when the check finds nothing', async () => {
		mockDetect.mockResolvedValue(CLEAN);
		renderAndSubmit('fine');

		await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
	});

	it('does not call the detector while the feature is off, the main-app default', async () => {
		renderAndSubmit('fine', false);

		await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
		expect(mockDetect).not.toHaveBeenCalled();
	});
});
