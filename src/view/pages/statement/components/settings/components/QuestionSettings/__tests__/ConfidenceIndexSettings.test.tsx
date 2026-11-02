import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Statement, StatementType } from '@freedi/shared-types';
import {
	requestRecalculateIndices,
	setConfidenceIndexSettings,
} from '@/controllers/db/evaluation/setEvaluation';
import { logError } from '@/utils/errorHandling';
import ConfidenceIndexSettings from '../ConfidenceIndexSettings';

const mockStatements: Record<string, Statement> = {};

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (k: string) => k, dir: 'ltr' }),
}));
jest.mock('@/controllers/hooks/reduxHooks', () => ({
	useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));
jest.mock('@/redux/statements/statementsSlice', () => ({
	statementSelector: (id: string | undefined) => () => (id ? mockStatements[id] : undefined),
}));
jest.mock('@/controllers/db/evaluation/setEvaluation', () => ({
	setConfidenceIndexSettings: jest.fn(),
	requestRecalculateIndices: jest.fn(),
}));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

const mockedSave = setConfidenceIndexSettings as jest.MockedFunction<
	typeof setConfidenceIndexSettings
>;
const mockedRecalc = requestRecalculateIndices as jest.MockedFunction<
	typeof requestRecalculateIndices
>;

function makeStatement(overrides: Partial<Statement>): Statement {
	return {
		statementId: 'g1',
		topParentId: 'g1',
		parentId: 'top',
		statement: 'Group',
		statementType: StatementType.group,
		creator: { uid: 'u', displayName: 'U' },
		creatorId: 'u',
		createdAt: 1,
		lastUpdate: 1,
		consensus: 0,
		...overrides,
	} as Statement;
}

const group = makeStatement({
	evaluationSettings: { targetPopulation: 1200 },
} as Partial<Statement>);
const question = (targetPopulation?: number): Statement =>
	makeStatement({
		statementId: 'q1',
		parentId: 'g1',
		statementType: StatementType.question,
		evaluationSettings: targetPopulation ? { targetPopulation } : undefined,
	} as Partial<Statement>);

const renderSettings = (statement: Statement) =>
	render(
		<MemoryRouter>
			<ConfidenceIndexSettings statement={statement} />
		</MemoryRouter>,
	);

const countInput = (): HTMLInputElement =>
	screen.getByLabelText('Number of stakeholders') as HTMLInputElement;

describe('ConfidenceIndexSettings', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockedSave.mockResolvedValue();
		mockStatements.g1 = group;
	});

	it('on the group: the count is editable, no inheritance switch, saves on blur', async () => {
		renderSettings(makeStatement({}));

		expect(screen.queryByRole('button', { name: 'people.sameAsGroup' })).toBeNull();
		fireEvent.change(countInput(), { target: { value: '500' } });
		fireEvent.blur(countInput());

		await waitFor(() => expect(mockedSave).toHaveBeenCalledWith('g1', { targetPopulation: 500 }));
	});

	it('on a question: inherited, read-only, placeholder and caption show the group value', () => {
		renderSettings(question());

		expect(screen.getByRole('button', { name: 'people.sameAsGroup' })).toHaveAttribute(
			'aria-pressed',
			'true',
		);
		expect(countInput()).toHaveAttribute('readonly');
		expect(countInput().placeholder).toBe(
			`${(1200).toLocaleString()} (people.stakeholders.fromGroup)`,
		);
		expect(screen.getByRole('link', { name: 'people.groupIs' })).toHaveAttribute(
			'href',
			'/statement-screen/g1/settings?section=people#stakeholders',
		);

		fireEvent.blur(countInput());
		expect(mockedSave).not.toHaveBeenCalled();
	});

	it('goes inherited → override → back: prefills and saves, edits, then clears', async () => {
		renderSettings(question());

		fireEvent.click(screen.getByRole('button', { name: 'people.changeHere' }));
		expect(countInput()).not.toHaveAttribute('readonly');
		expect(countInput().value).toBe('1200');
		await waitFor(() =>
			expect(mockedSave).toHaveBeenLastCalledWith('q1', { targetPopulation: 1200 }),
		);

		fireEvent.change(countInput(), { target: { value: '80' } });
		fireEvent.blur(countInput());
		await waitFor(() =>
			expect(mockedSave).toHaveBeenLastCalledWith('q1', { targetPopulation: 80 }),
		);

		fireEvent.click(screen.getByRole('button', { name: 'people.sameAsGroup' }));
		await waitFor(() => expect(mockedSave).toHaveBeenLastCalledWith('q1', { targetPopulation: 0 }));
		expect(countInput()).toHaveAttribute('readonly');
	});

	it('starts overridden when the question declares its own count', () => {
		renderSettings(question(40));

		expect(screen.getByRole('button', { name: 'people.changeHere' })).toHaveAttribute(
			'aria-pressed',
			'true',
		);
		expect(countInput().value).toBe('40');
	});

	it('says not set anywhere when nobody declares a count', () => {
		mockStatements.g1 = makeStatement({});
		renderSettings(question());

		expect(countInput().placeholder).toBe('people.notSetAnywhere');
		expect(screen.getAllByText('people.notSetAnywhere').length).toBeGreaterThan(0);
	});

	it('shows an inline error and logs with context when the count save fails', async () => {
		mockedSave.mockRejectedValue(new Error('offline'));
		renderSettings(makeStatement({}));

		fireEvent.change(countInput(), { target: { value: '9' } });
		fireEvent.blur(countInput());

		expect(await screen.findByRole('alert')).toHaveTextContent('people.error.save');
		expect(logError).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({
				operation: 'ConfidenceIndexSettings.saveTargetPopulation',
				statementId: 'g1',
			}),
		);
	});

	describe('More', () => {
		it('keeps sample quality and recalculate inside a closed disclosure', () => {
			const { container } = renderSettings(makeStatement({}));
			const details = container.querySelector('details.disclosure');

			expect(details).not.toHaveAttribute('open');
			expect(screen.getByText('people.more')).toHaveClass('disclosure__summary');
			expect(details).toContainElement(screen.getByLabelText('people.sampleQuality'));
			expect(details).toContainElement(screen.getByRole('button', { name: 'people.recalculate' }));
		});

		it('saves sample quality on change', async () => {
			renderSettings(makeStatement({}));

			fireEvent.change(screen.getByLabelText('people.sampleQuality'), {
				target: { value: '0.9' },
			});

			await waitFor(() => expect(mockedSave).toHaveBeenCalledWith('g1', { samplingQuality: 0.9 }));
		});

		it('recalculates and reports the result', async () => {
			mockedRecalc.mockResolvedValue({ optionsUpdated: 3 } as Awaited<
				ReturnType<typeof requestRecalculateIndices>
			>);
			renderSettings(makeStatement({}));

			fireEvent.click(screen.getByRole('button', { name: 'people.recalculate' }));

			expect(await screen.findByRole('status')).toHaveTextContent('Recalculated indices for 3');
		});

		it('says recalculation failed', async () => {
			mockedRecalc.mockRejectedValue(new Error('x'));
			renderSettings(makeStatement({}));

			fireEvent.click(screen.getByRole('button', { name: 'people.recalculate' }));

			expect(await screen.findByRole('alert')).toHaveTextContent('Recalculation failed');
		});
	});
});
