import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { Statement } from '@freedi/shared-types';
import SimpleEvaluation from '../SimpleEvaluation';

// Class names come back as their own keys so the modifiers can be asserted.
jest.mock('../SimpleEvaluation.module.scss', () => ({
	__esModule: true,
	default: new Proxy({}, { get: (_target, key) => key }),
}));
jest.mock('../../shared/EvaluationCircle.module.scss', () => ({
	__esModule: true,
	default: new Proxy({}, { get: (_target, key) => key }),
}));
jest.mock('@/view/components/thumb/Thumb.module.scss', () => ({
	__esModule: true,
	default: new Proxy({}, { get: (_target, key) => key }),
}));
jest.mock('@/assets/icons/frownIcon.svg?react', () => ({
	__esModule: true,
	default: () => <svg data-testid="frown" />,
}));
jest.mock('@/assets/icons/smileIcon.svg?react', () => ({
	__esModule: true,
	default: () => <svg data-testid="smile" />,
}));
jest.mock('@/assets/icons/evaluation/evaluation1.svg', () => 'evaluation1.svg');
jest.mock('@/assets/icons/evaluation/evaluation2.svg', () => 'evaluation2.svg');
jest.mock('@/assets/icons/evaluation/evaluation3.svg', () => 'evaluation3.svg');
jest.mock('@/assets/icons/evaluation/evaluation4.svg', () => 'evaluation4.svg');
jest.mock('@/assets/icons/evaluation/evaluation5.svg', () => 'evaluation5.svg');
jest.mock('@/controllers/hooks/reduxHooks', () => ({ useAppSelector: () => 0 }));
jest.mock('@/redux/evaluations/evaluationsSlice', () => ({ evaluationSelector: () => jest.fn() }));
jest.mock('@/controllers/db/evaluation/setEvaluation', () => ({ setEvaluationToDB: jest.fn() }));
jest.mock('@/controllers/hooks/useAuthentication', () => ({
	useAuthentication: () => ({ creator: { uid: 'u1' } }),
}));
jest.mock('@/controllers/hooks/useEvaluationGuard', () => ({
	useEvaluationGuard: () => ({ canEvaluate: true, requiresSolution: false }),
}));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (text: string) => text }),
}));
jest.mock('@/view/components/evaluation/AddSolutionPrompt', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock('@/view/components/tooltip/Tooltip', () => ({
	Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const statement = {
	statementId: 's1',
	statement: 'x',
	consensus: 0.62,
	evaluation: { numberOfEvaluators: 12, sumPro: 10, sumCon: 2, averageEvaluation: 0.5 },
} as unknown as Statement;

describe('SimpleEvaluation', () => {
	it('card variant renders two circle faces with counts and a chips row', () => {
		const { container } = render(<SimpleEvaluation statement={statement} variant="card" />);

		expect(screen.getByTestId('thumb-up')).toHaveClass('circle');
		expect(screen.getByTestId('thumb-down')).toHaveClass('circle');
		expect(screen.getByTestId('thumb-up')).toHaveAttribute('aria-label', 'Vote up');
		expect(container.querySelector('.results-strip--chips')).not.toBeNull();
		expect(container.querySelector('.results-strip__item--primary')).not.toBeNull();
		expect(screen.getByText('10')).toBeInTheDocument();
		expect(screen.getByText('2')).toBeInTheDocument();
	});

	it('default variant keeps the compact thumbs and tile strip', () => {
		const { container } = render(<SimpleEvaluation statement={statement} />);

		expect(screen.queryByTestId('thumb-up')).toBeNull();
		expect(container.querySelector('.circle')).toBeNull();
		expect(container.querySelector('.results-strip--chips')).toBeNull();
		expect(container.querySelector('.results-strip')).not.toBeNull();
	});
});
