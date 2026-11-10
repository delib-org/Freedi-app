import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { Statement } from '@freedi/shared-types';
import EnhancedEvaluation from '../EnhancedEvaluation';

jest.mock('../EnhancedEvaluation.module.scss', () => ({
	__esModule: true,
	default: new Proxy({}, { get: (_target, key) => key }),
}));
jest.mock('../../shared/EvaluationCircle.module.scss', () => ({
	__esModule: true,
	default: new Proxy({}, { get: (_target, key) => key }),
}));
jest.mock('@/controllers/db/evaluation/setEvaluation', () => ({ setEvaluationToDB: jest.fn() }));
jest.mock('@/controllers/hooks/useAuthentication', () => ({
	useAuthentication: () => ({ creator: { uid: 'u1' } }),
}));
jest.mock('@/controllers/hooks/useUserConfig', () => ({
	useUserConfig: () => ({ t: (text: string) => text }),
}));
jest.mock('@/controllers/hooks/useDecreaseLearningRemain', () => ({
	useDecreaseLearningRemain: () => jest.fn(),
}));
jest.mock('@/controllers/hooks/reduxHooks', () => ({
	useAppSelector: () => undefined,
}));
jest.mock('react-redux', () => ({
	useSelector: () => undefined,
}));
jest.mock('@/redux/evaluations/evaluationsSlice', () => ({
	evaluationSelector: () => () => undefined,
}));
jest.mock('@/redux/statements/statementsSlice', () => ({
	statementSelectorById: () => () => undefined,
	statementSubscriptionSelector: () => () => undefined,
}));
jest.mock('@/view/components/tooltip/Tooltip', () => ({
	Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
jest.mock('@/view/pages/statement/components/questionScreen/useAnswerScoreGate', () => ({
	useAnswerScoreGate: () => ({ canSee: true, showRevealHint: false }),
}));
jest.mock('@/view/components/atomic/molecules/ResultsStrip', () => ({
	ResultsStrip: () => null,
}));

const statement = { statementId: 's1', parentId: 'p1', statement: 'x' } as unknown as Statement;

describe('EnhancedEvaluation face labels', () => {
	it('shows the visible labels by default', () => {
		const { container } = render(<EnhancedEvaluation statement={statement} />);

		expect(container.querySelectorAll('.face__label').length).toBeGreaterThan(0);
	});

	it('hides the visible labels in the chat variant but keeps aria-labels', () => {
		const { container } = render(<EnhancedEvaluation statement={statement} hideFaceLabels />);

		expect(container.querySelectorAll('.face__label')).toHaveLength(0);

		const faces = screen.getAllByRole('button');

		expect(faces.length).toBeGreaterThan(0);
		faces.forEach((face) => expect(face).toHaveAttribute('aria-label'));
	});
});
