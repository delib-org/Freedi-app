import { render, screen } from '@testing-library/react';
import { Statement } from '@freedi/shared-types';
import CommunityVoiceEvaluation from '../CommunityVoiceEvaluation';

let mockCanSee = false;
let mockShowRevealHint = true;

jest.mock('../CommunityVoiceEvaluation.module.scss', () => ({
	__esModule: true,
	default: new Proxy({}, { get: (_target, key) => key }),
}));
jest.mock('../../shared/ScoreRevealHint.module.scss', () => ({
	__esModule: true,
	default: new Proxy({}, { get: (_target, key) => key }),
}));
jest.mock('../CommunityVoiceEvaluationModel', () => ({ communityVoiceOptions: [] }));
jest.mock('@/controllers/db/evaluation/setEvaluation', () => ({ setEvaluationToDB: jest.fn() }));
jest.mock('@/controllers/hooks/reduxHooks', () => ({ useAppSelector: () => undefined }));
jest.mock('@/controllers/hooks/useUserConfig', () => ({
	useUserConfig: () => ({ t: (key: string) => key, learning: { communityVoiceLabels: 0 } }),
}));
jest.mock('@/redux/evaluations/evaluationsSlice', () => ({
	evaluationSelector: () => jest.fn(),
}));
jest.mock('@/redux/statements/statementsSlice', () => ({
	statementSelectorById: () => () => undefined,
}));
jest.mock('react-redux', () => ({
	...jest.requireActual('react-redux'),
	useSelector: () => undefined,
}));
jest.mock('@/controllers/hooks/useAuthentication', () => ({
	useAuthentication: () => ({ creator: { uid: 'u1' } }),
}));
jest.mock('@/controllers/hooks/useDecreaseLearningRemain', () => ({
	useDecreaseLearningRemain: () => jest.fn(),
}));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/view/components/atomic/molecules/ResultsStrip', () => ({
	ResultsStrip: () => <div data-testid="results-strip" />,
}));
jest.mock('../../shared/EvaluationCircle', () => ({
	EvaluationCircle: () => null,
	EvaluationCircleRow: () => null,
}));
jest.mock('../../../../../questionScreen/useAnswerScoreGate', () => ({
	useAnswerScoreGate: () => ({ canSee: mockCanSee, showRevealHint: mockShowRevealHint }),
}));

const statement = { statementId: 'a1', parentId: 'q1' } as Statement;

describe('CommunityVoiceEvaluation score guard', () => {
	beforeEach(() => {
		mockCanSee = false;
		mockShowRevealHint = true;
	});

	it.each(['default', 'card'] as const)('hides results before rating (%s)', (variant) => {
		render(<CommunityVoiceEvaluation statement={statement} variant={variant} />);

		expect(screen.queryByTestId('results-strip')).not.toBeInTheDocument();
		expect(screen.getByTestId('results-reveal-hint')).toBeInTheDocument();
	});

	it.each(['default', 'card'] as const)('shows results once the guard allows (%s)', (variant) => {
		mockCanSee = true;
		mockShowRevealHint = false;

		render(<CommunityVoiceEvaluation statement={statement} variant={variant} />);

		expect(screen.getByTestId('results-strip')).toBeInTheDocument();
		expect(screen.queryByTestId('results-reveal-hint')).not.toBeInTheDocument();
	});
});
