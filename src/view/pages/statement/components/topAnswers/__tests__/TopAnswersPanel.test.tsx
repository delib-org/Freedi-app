/**
 * Tests for the Top Answers admin panel — the floating control over which
 * answers are marked as leading, and in what order the list reads.
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import {
	CutoffBy,
	EvaluationUI,
	ResultsBy,
	SortType,
	Statement,
	evaluationType,
} from '@freedi/shared-types';
import TopAnswersPanel from '../TopAnswersPanel';
import {
	requestTopOptionsRecompute,
	setCutoffMethod,
	setCutoffValue,
	setRankBy,
	setResultsBy,
} from '@/controllers/db/statements/setTopAnswersSettings';
import { setRatingScale } from '@/controllers/db/evaluation/setEvaluation';
import { setStatementSettingToDB } from '@/controllers/db/statementSettings/setStatementSettings';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (text: string) => text, dir: 'ltr' }),
}));

// The reorder modal pulls in Redux, the bulk loader and a portal; none of that
// is under test here, and it only renders once the admin opens it.
jest.mock('../ManualOrderModal', () => ({
	__esModule: true,
	default: () => null,
}));

jest.mock('@/controllers/db/evaluation/setEvaluation', () => ({
	setRatingScale: jest.fn(),
}));

jest.mock('@/controllers/db/statementSettings/setStatementSettings', () => ({
	setStatementSettingToDB: jest.fn(),
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
const mockSetRatingScale = setRatingScale as jest.Mock;
const mockSetSetting = setStatementSettingToDB as jest.Mock;

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

	describe('rating scale', () => {
		it('marks the scale the question currently uses', () => {
			render(
				<TopAnswersPanel
					statement={question({
						statementSettings: { evaluationType: evaluationType.singleLike },
					})}
				/>,
			);
			openPanel();

			expect(screen.getByRole('radio', { name: 'Likes only' })).toHaveAttribute(
				'aria-checked',
				'true',
			);
		});

		it('defaults to the agree/disagree faces when the question has never set one', () => {
			render(<TopAnswersPanel statement={question()} />);
			openPanel();

			expect(screen.getByRole('radio', { name: 'Agree - Disagree' })).toHaveAttribute(
				'aria-checked',
				'true',
			);
		});

		it('separates the two range face sets by ratingMode, not evaluationType', () => {
			// Both are `evaluationType.range`; only `ratingMode` tells them apart, so
			// a segment keyed on evaluationType alone would light up both.
			render(
				<TopAnswersPanel
					statement={question({
						statementSettings: { evaluationType: evaluationType.range, ratingMode: 'reactions' },
					})}
				/>,
			);
			openPanel();

			expect(screen.getByRole('radio', { name: 'Emoji reactions' })).toHaveAttribute(
				'aria-checked',
				'true',
			);
			expect(screen.getByRole('radio', { name: 'Agree - Disagree' })).toHaveAttribute(
				'aria-checked',
				'false',
			);
		});

		it('writes through setRatingScale, which also refreshes the derived flag', () => {
			// Writing `evaluationType` directly would leave the deprecated
			// `enhancedEvaluation` flag stale, and parts of the UI still read it.
			render(<TopAnswersPanel statement={question()} />);
			openPanel();

			fireEvent.click(screen.getByRole('radio', { name: 'Thumbs up or down' }));

			expect(mockSetRatingScale).toHaveBeenCalledWith(
				expect.objectContaining({ statementId: 'q-1' }),
				evaluationType.likeDislike,
			);
		});

		it('picking the 0→1 reaction faces sets both fields', () => {
			render(<TopAnswersPanel statement={question()} />);
			openPanel();

			fireEvent.click(screen.getByRole('radio', { name: 'Emoji reactions' }));

			expect(mockSetRatingScale).toHaveBeenCalledWith(expect.anything(), evaluationType.range);
			expect(mockSetSetting).toHaveBeenCalledWith(
				expect.objectContaining({ property: 'ratingMode', newValue: 'reactions' }),
			);
		});

		it('picking agree/disagree writes the face set back explicitly', () => {
			render(
				<TopAnswersPanel
					statement={question({ statementSettings: { ratingMode: 'reactions' } })}
				/>,
			);
			openPanel();

			fireEvent.click(screen.getByRole('radio', { name: 'Agree - Disagree' }));

			expect(mockSetSetting).toHaveBeenCalledWith(
				expect.objectContaining({ property: 'ratingMode', newValue: 'agree-disagree' }),
			);
		});

		it('leaves ratingMode alone on scales where it means nothing', () => {
			// So an admin who wanders off to thumbs and back still finds their faces.
			render(<TopAnswersPanel statement={question()} />);
			openPanel();

			fireEvent.click(screen.getByRole('radio', { name: 'Likes only' }));

			expect(mockSetSetting).not.toHaveBeenCalled();
		});

		it('names the active scale in the panel rather than only in a tooltip', () => {
			render(
				<TopAnswersPanel
					statement={question({ statementSettings: { ratingMode: 'reactions' } })}
				/>,
			);
			openPanel();

			// The name and its description share one paragraph, split by a <strong>,
			// so match the paragraph rather than a bare text node.
			expect(screen.getByText(/Five positive steps from 0 to 1/)).toHaveTextContent(
				'Emoji reactions — Five positive steps from 0 to 1 — no disagree',
			);
		});

		it('hides the choice in voting mode, where the scale is imposed', () => {
			render(
				<TopAnswersPanel
					statement={question({
						evaluationSettings: { evaluationUI: EvaluationUI.voting },
					})}
				/>,
			);
			openPanel();

			expect(screen.queryByRole('radio', { name: 'Agree - Disagree' })).not.toBeInTheDocument();
			expect(
				screen.getByText('Rating scale is set automatically for this mode'),
			).toBeInTheDocument();
		});
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
