/**
 * Tests for the Top Answers admin panel — the floating control over which
 * answers are marked as leading, and in what order the list reads.
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { CutoffBy, ResultsBy, SortType, Statement } from '@freedi/shared-types';
import TopAnswersPanel from '../TopAnswersPanel';
import {
	requestTopOptionsRecompute,
	setCutoffMethod,
	setCutoffValue,
	setRankBy,
	setResultsBy,
} from '@/controllers/db/statements/setTopAnswersSettings';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (text: string) => text, dir: 'ltr' }),
}));

// The reorder modal pulls in Redux, the bulk loader and a portal; none of that
// is under test here, and it only renders once the admin opens it.
jest.mock('../ManualOrderModal', () => ({
	__esModule: true,
	default: () => null,
}));

jest.mock('@/controllers/db/statements/setTopAnswersSettings', () => {
	const actual = jest.requireActual('@/controllers/db/statements/setTopAnswersSettings');

	return {
		...actual,
		setRankBy: jest.fn().mockResolvedValue(undefined),
		setResultsBy: jest.fn().mockResolvedValue(undefined),
		setCutoffMethod: jest.fn().mockResolvedValue(undefined),
		setCutoffValue: jest.fn().mockResolvedValue(undefined),
		requestTopOptionsRecompute: jest.fn().mockResolvedValue(undefined),
	};
});

const mockSetRankBy = setRankBy as jest.Mock;
const mockSetResultsBy = setResultsBy as jest.Mock;
const mockSetCutoffMethod = setCutoffMethod as jest.Mock;
const mockSetCutoffValue = setCutoffValue as jest.Mock;
const mockRecompute = requestTopOptionsRecompute as jest.Mock;

function question(overrides: Partial<Statement> = {}): Statement {
	return {
		statementId: 'q-1',
		statement: 'Where should the new park go?',
		resultsSettings: {
			resultsBy: ResultsBy.consensus,
			cutoffBy: CutoffBy.topOptions,
			numberOfResults: 5,
		},
		...overrides,
	} as Statement;
}

function openPanel(): void {
	fireEvent.click(screen.getByRole('button', { name: 'Top answers' }));
}

describe('TopAnswersPanel', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers();
		localStorage.clear();
	});

	afterEach(() => {
		jest.runOnlyPendingTimers();
		jest.useRealTimers();
	});

	it('opens and closes from the floating handle', () => {
		render(<TopAnswersPanel statement={question()} />);

		const handle = screen.getByRole('button', { name: 'Top answers' });
		expect(handle).toHaveAttribute('aria-expanded', 'false');

		fireEvent.click(handle);
		expect(handle).toHaveAttribute('aria-expanded', 'true');

		fireEvent.click(screen.getByRole('button', { name: 'Close' }));
		expect(handle).toHaveAttribute('aria-expanded', 'false');
	});

	it('marks the question’s current rank, cutoff and score', () => {
		render(
			<TopAnswersPanel
				statement={question({
					statementSettings: { defaultSortType: SortType.newest },
					resultsSettings: {
						resultsBy: ResultsBy.mostLiked,
						cutoffBy: CutoffBy.aboveThreshold,
						cutoffNumber: 3,
					},
				})}
			/>,
		);
		openPanel();

		expect(screen.getByRole('radio', { name: 'Newest first' })).toHaveAttribute(
			'aria-checked',
			'true',
		);
		expect(screen.getByRole('radio', { name: 'Above a score' })).toHaveAttribute(
			'aria-checked',
			'true',
		);
		expect(screen.getByRole('radio', { name: 'Most liked' })).toHaveAttribute(
			'aria-checked',
			'true',
		);
	});

	it('shows manual as active when a hand-placed order is saved', () => {
		render(
			<TopAnswersPanel
				statement={question({
					statementSettings: {
						defaultSortType: SortType.newest,
						manualOptionOrder: ['a', 'b'],
					},
				})}
			/>,
		);
		openPanel();

		expect(screen.getByRole('radio', { name: 'Hand-placed order' })).toHaveAttribute(
			'aria-checked',
			'true',
		);
		expect(screen.getByRole('button', { name: 'Reorder manually…' })).toBeInTheDocument();
	});

	it('writes the chosen rank', () => {
		render(<TopAnswersPanel statement={question()} />);
		openPanel();

		fireEvent.click(screen.getByRole('radio', { name: 'By average rating' }));

		expect(mockSetRankBy).toHaveBeenCalledWith('q-1', SortType.averageEvaluation);
	});

	it('does not write when the manual segment is picked — it opens the reorder editor', () => {
		render(<TopAnswersPanel statement={question()} />);
		openPanel();

		fireEvent.click(screen.getByRole('radio', { name: 'Hand-placed order' }));

		expect(mockSetRankBy).not.toHaveBeenCalled();
	});

	it('recomputes the top marks after a cutoff-method change', async () => {
		render(<TopAnswersPanel statement={question()} />);
		openPanel();

		await act(async () => {
			fireEvent.click(screen.getByRole('radio', { name: 'Above a score' }));
		});

		expect(mockSetCutoffMethod).toHaveBeenCalledWith(
			'q-1',
			expect.objectContaining({ resultsBy: ResultsBy.consensus }),
			CutoffBy.aboveThreshold,
		);
		// Without this the badges on the cards would keep showing the old cutoff
		// until somebody next rated an answer.
		expect(mockRecompute).toHaveBeenCalledWith('q-1');
	});

	it('recomputes after a scoring-metric change', async () => {
		render(<TopAnswersPanel statement={question()} />);
		openPanel();

		await act(async () => {
			fireEvent.click(screen.getByRole('radio', { name: 'Most liked' }));
		});

		expect(mockSetResultsBy).toHaveBeenCalledWith('q-1', expect.anything(), ResultsBy.mostLiked);
		expect(mockRecompute).toHaveBeenCalledWith('q-1');
	});

	it('debounces a slider drag into a single write', async () => {
		render(<TopAnswersPanel statement={question()} />);
		openPanel();

		const slider = screen.getByRole('slider', { name: 'How many' });
		fireEvent.change(slider, { target: { value: '2' } });
		fireEvent.change(slider, { target: { value: '3' } });
		fireEvent.change(slider, { target: { value: '4' } });

		expect(mockSetCutoffValue).not.toHaveBeenCalled();

		await act(async () => {
			jest.runAllTimers();
		});

		expect(mockSetCutoffValue).toHaveBeenCalledTimes(1);
		expect(mockSetCutoffValue).toHaveBeenCalledWith('q-1', expect.anything(), 4);
	});

	it('converts the threshold slider from percent to the stored fraction', async () => {
		render(
			<TopAnswersPanel
				statement={question({
					resultsSettings: {
						resultsBy: ResultsBy.consensus,
						cutoffBy: CutoffBy.aboveThreshold,
						cutoffNumber: 0.5,
					},
				})}
			/>,
		);
		openPanel();

		// The slider reads in percent; consensus is stored as a fraction.
		fireEvent.change(screen.getByRole('slider', { name: 'Minimum score' }), {
			target: { value: '55' },
		});

		await act(async () => {
			jest.runAllTimers();
		});

		expect(mockSetCutoffValue).toHaveBeenCalledWith('q-1', expect.anything(), 0.55);
	});

	it('closes on Escape', () => {
		render(<TopAnswersPanel statement={question()} />);
		openPanel();

		fireEvent.keyDown(window, { key: 'Escape' });

		expect(screen.getByRole('button', { name: 'Top answers' })).toHaveAttribute(
			'aria-expanded',
			'false',
		);
	});
});
