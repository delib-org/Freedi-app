import React from 'react';
import { render, screen } from '@testing-library/react';
import { Statement } from '@freedi/shared-types';
import Evaluation from '../Evaluation';

const PHONE_WIDTH = 375;
const DESKTOP_WIDTH = 1280;

let mockShowEvaluation = true;

jest.mock('../EvalautionMV', () => ({
	useEvaluation: () => ({
		parentStatement: {
			statementId: 'q1',
			statementSettings: { showEvaluation: mockShowEvaluation, evaluationType: 'like-dislike' },
		},
	}),
}));
jest.mock('@/controllers/hooks/useIsProcessHalted', () => ({
	useIsProcessHalted: () => ({ isHalted: false }),
}));
jest.mock('../simpleEvaluation/SimpleEvaluation', () => ({
	__esModule: true,
	default: ({ shouldDisplayScore }: { shouldDisplayScore: boolean }) => (
		<div data-testid="simple">{shouldDisplayScore ? 'score-on' : 'score-off'}</div>
	),
}));
jest.mock('../enhancedEvaluation/EnhancedEvaluation', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock('../singleLikeEvaluation/SingleLikeEvaluation', () => ({
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
		mockShowEvaluation = true;
	});

	it.each([PHONE_WIDTH, DESKTOP_WIDTH])('shows scores at %dpx when results are on', (width) => {
		setWidth(width);

		render(<Evaluation statement={statement} />);

		expect(screen.getByTestId('simple')).toHaveTextContent('score-on');
	});

	it('keeps scores hidden on a phone when results are off', () => {
		setWidth(PHONE_WIDTH);
		mockShowEvaluation = false;

		render(<Evaluation statement={statement} />);

		expect(screen.getByTestId('simple')).toHaveTextContent('score-off');
	});

	it('keeps scores hidden on a phone for an answer chosen by a selection function', () => {
		setWidth(PHONE_WIDTH);

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
	});
});
