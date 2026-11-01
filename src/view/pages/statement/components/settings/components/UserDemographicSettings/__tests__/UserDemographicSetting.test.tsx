import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import {
	Statement,
	StatementType,
	UserDemographicQuestion,
	UserDemographicQuestionType,
} from '@freedi/shared-types';
import { renderWithProviders } from '@/test-utils/test-utils';
import { setStatements } from '@/redux/statements/statementsSlice';
import { setUserDemographicQuestions } from '@/redux/userDemographic/userDemographicSlice';
import { setExcludedInheritedDemographics } from '@/controllers/db/userDemographic/excludedInheritedDemographics';
import { logError } from '@/utils/errorHandling';
import UserDemographicSetting from '../UserDemographicSetting';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (k: string) => k, dir: 'ltr' }),
}));
jest.mock('@/controllers/db/userDemographic/excludedInheritedDemographics', () => ({
	setExcludedInheritedDemographics: jest.fn(),
}));
jest.mock('@/controllers/db/userDemographic/setUserDemographic', () => ({
	deleteUserDemographicOption: jest.fn(),
	deleteUserDemographicQuestion: jest.fn(),
	setUserDemographicOption: jest.fn(),
	setUserDemographicQuestion: jest.fn(),
}));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

const mockedSaveExcluded = setExcludedInheritedDemographics as jest.MockedFunction<
	typeof setExcludedInheritedDemographics
>;

function makeStatement(overrides: Partial<Statement>): Statement {
	return {
		statementId: 'g1',
		topParentId: 'g1',
		parentId: 'top',
		statement: 'Neighbourhood budget',
		statementType: StatementType.group,
		creator: { uid: 'u', displayName: 'U' },
		creatorId: 'u',
		createdAt: 1,
		lastUpdate: 1,
		consensus: 0,
		...overrides,
	} as Statement;
}

const groupQuestion = (id: string, question: string): UserDemographicQuestion =>
	({
		userQuestionId: id,
		question,
		type: UserDemographicQuestionType.text,
		statementId: 'g1',
		topParentId: 'g1',
		scope: 'group',
		options: [],
	}) as UserDemographicQuestion;

function renderOn(statement: Statement) {
	const view = renderWithProviders(
		<MemoryRouter>
			<UserDemographicSetting statement={statement} />
		</MemoryRouter>,
	);
	act(() => {
		view.store.dispatch(setStatements([makeStatement({}), statement]));
		view.store.dispatch(
			setUserDemographicQuestions([
				groupQuestion('d1', 'Which street do you live on?'),
				groupQuestion('d2', 'Age group'),
			]),
		);
	});

	return view;
}

const question = (excluded: string[] = []): Statement =>
	makeStatement({
		statementId: 'q1',
		parentId: 'g1',
		statement: 'Where should the bench go?',
		statementType: StatementType.question,
		statementSettings: { excludedInheritedDemographicIds: excluded },
	} as Partial<Statement>);

describe('UserDemographicSetting — inherited questions on joining', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockedSaveExcluded.mockResolvedValue();
	});

	it('lists the group questions read-only while inherited', () => {
		renderOn(question());

		expect(screen.getByRole('button', { name: 'people.sameAsGroup' })).toHaveAttribute(
			'aria-pressed',
			'true',
		);
		expect(screen.getByText('Which street do you live on?')).toBeTruthy();
		expect(screen.getByText('Age group')).toBeTruthy();
		expect(screen.queryByRole('checkbox')).toBeNull();
		expect(screen.getByRole('link', { name: 'people.joinQuestions.editInGroup' })).toHaveAttribute(
			'href',
			'/statement-screen/g1/settings?section=people#questions',
		);
	});

	it('goes inherited → override → back: excludes one question, then asks all again', async () => {
		renderOn(question());

		fireEvent.click(screen.getByRole('button', { name: 'people.changeHere' }));
		const ageAsk = screen.getByRole('checkbox', { name: 'people.joinQuestions.ask: Age group' });
		expect(ageAsk).toBeChecked();
		expect(mockedSaveExcluded).not.toHaveBeenCalled();

		fireEvent.click(ageAsk);
		await waitFor(() => expect(mockedSaveExcluded).toHaveBeenLastCalledWith('q1', ['d2']));

		fireEvent.click(screen.getByRole('button', { name: 'people.sameAsGroup' }));
		await waitFor(() => expect(mockedSaveExcluded).toHaveBeenLastCalledWith('q1', []));
		expect(screen.queryByRole('checkbox')).toBeNull();
	});

	it('opens overridden when the question already skips one', () => {
		renderOn(question(['d1']));

		expect(screen.getByRole('button', { name: 'people.changeHere' })).toHaveAttribute(
			'aria-pressed',
			'true',
		);
		expect(
			screen.getByRole('checkbox', {
				name: 'people.joinQuestions.ask: Which street do you live on?',
			}),
		).not.toBeChecked();
	});

	it('shows an inline error and logs with context when saving fails', async () => {
		mockedSaveExcluded.mockRejectedValue(new Error('denied'));
		renderOn(question());

		fireEvent.click(screen.getByRole('button', { name: 'people.changeHere' }));
		fireEvent.click(screen.getByRole('checkbox', { name: 'people.joinQuestions.ask: Age group' }));

		expect(await screen.findByRole('alert')).toHaveTextContent('people.error.save');
		expect(logError).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({
				operation: 'UserDemographicSetting.handleExcludedIdsChange',
				statementId: 'q1',
			}),
		);
	});

	it('shows no inheritance switch on the group itself', () => {
		renderOn(makeStatement({}));

		expect(screen.queryByRole('button', { name: 'people.sameAsGroup' })).toBeNull();
	});
});
