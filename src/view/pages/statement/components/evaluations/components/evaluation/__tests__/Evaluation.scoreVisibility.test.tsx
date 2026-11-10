import React from 'react';
import { render, screen } from '@testing-library/react';
import { Statement } from '@freedi/shared-types';
import Evaluation from '../Evaluation';

const PHONE_WIDTH = 375;
const DESKTOP_WIDTH = 1280;

let mockEvaluationType = 'like-dislike';
let mockCanSee = true;
let mockShowRevealHint = false;

jest.mock('../EvalautionMV', () => ({
	useEvaluation: () => ({
		parentStatement: {
			statementId: 'q1',
			statementSettings: { evaluationType: mockEvaluationType },
		},
	}),
}));
jest.mock('@/controllers/hooks/useIsProcessHalted', () => ({
	useIsProcessHalted: () => ({ isHalted: false }),
}));
jest.mock('../../../../questionScreen/useAnswerScoreGate', () => ({
	useAnswerScoreGate: () => ({ canSee: mockCanSee, showRevealHint: mockShowRevealHint }),
}));

interface ScoredProps {
	shouldDisplayScore: boolean;
	showRevealHint: boolean;
}

jest.mock('../simpleEvaluation/SimpleEvaluation', () => ({
	__esModule: true,
	default: ({ shouldDisplayScore, showRevealHint }: ScoredProps) => (
		<div data-testid="simple">
			{shouldDisplayScore ? 'score-on' : 'score-off'}
			{showRevealHint ? ' hint-on' : ''}
		</div>
	),
}));
jest.mock('../singleLikeEvaluation/SingleLikeEvaluation', () => ({
	__esModule: true,
	default: ({ shouldDisplayScore, showRevealHint }: ScoredProps) => (
		<div data-testid="single-like">
			{shouldDisplayScore ? 'score-on' : 'score-off'}
			{showRevealHint ? ' hint-on' : ''}
		</div>
	),
}));
jest.mock('../enhancedEvaluation/EnhancedEvaluation', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock('../communityVoiceEvaluation/CommunityVoiceEvaluation', () => ({
	__esModule: true,
	default: () => null,
}));

function setWidth(width: number): void {
	Object.defineProperty(window, 'innerWidth', {
		writable: true,
		configurable: true,
		value: width,
	});
}

const statement = { statementId: 'a1', parentId: 'q1', evaluation: {} } as unknown as Statement;

describe('Evaluation - when scores show', () => {
	beforeEach(() => {
		mockEvaluationType = 'like-dislike';
		mockCanSee = true;
		mockShowRevealHint = false;
	});

	it.each([PHONE_WIDTH, DESKTOP_WIDTH])('shows scores at %dpx when the guard allows', (width) => {
		setWidth(width);

		render(<Evaluation statement={statement} />);

		expect(screen.getByTestId('simple')).toHaveTextContent('score-on');
	});

	it('hides the score and shows the reveal hint on a two-face card before rating', () => {
		mockCanSee = false;
		mockShowRevealHint = true;

		render(<Evaluation statement={statement} />);

		expect(screen.getByTestId('simple')).toHaveTextContent('score-off hint-on');
	});

	it('hides the score and shows the reveal hint on a single-like card before rating', () => {
		mockEvaluationType = 'single-like';
		mockCanSee = false;
		mockShowRevealHint = true;

		render(<Evaluation statement={statement} />);

		expect(screen.getByTestId('single-like')).toHaveTextContent('score-off hint-on');
	});

	it('keeps scores hidden for an answer chosen by a selection function', () => {
		mockShowRevealHint = true;

		render(
			<Evaluation
				statement={
					{
						...statement,
						evaluation: { selectionFunction: 'random' },
					} as unknown as Statement
				}
			/>,
		);

		expect(screen.getByTestId('simple')).toHaveTextContent('score-off');
		expect(screen.getByTestId('simple')).not.toHaveTextContent('hint-on');
	});
});
