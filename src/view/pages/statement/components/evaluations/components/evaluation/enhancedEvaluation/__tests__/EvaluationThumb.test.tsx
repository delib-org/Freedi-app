import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { Statement } from '@freedi/shared-types';
import { EvaluationThumb } from '../EnhancedEvaluation';
import { enhancedEvaluationsThumbs } from '../EnhancedEvaluationModel';

// Class names come back as their own keys so the modifiers can be asserted.
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
jest.mock('@/view/components/tooltip/Tooltip', () => ({
	Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const statement = { statementId: 's1', statement: 'x' } as unknown as Statement;

describe('EvaluationThumb circle shape', () => {
	it('gives the selected face the active modifier and a check badge', () => {
		const [selected, other] = enhancedEvaluationsThumbs;
		const { container } = render(
			<>
				<EvaluationThumb
					statement={statement}
					evaluationThumb={selected}
					isActive
					onEvaluate={jest.fn()}
					shape="circle"
				/>
				<EvaluationThumb
					statement={statement}
					evaluationThumb={other}
					isActive={false}
					onEvaluate={jest.fn()}
					shape="circle"
				/>
			</>,
		);

		const active = screen.getByTestId(`face-scale-option-${selected.id}`);
		const idle = screen.getByTestId(`face-scale-option-${other.id}`);

		expect(active).toHaveClass('circle--active');
		expect(idle).not.toHaveClass('circle--active');
		expect(container.querySelectorAll('.circle__check')).toHaveLength(1);
		expect(active).toHaveAttribute('aria-label', 'Strongly like');
		expect(active).toHaveAttribute('title', 'Strongly like');
	});
});
