import { render, screen } from '@testing-library/react';
import { Statement } from '@freedi/shared-types';
import { useQuestionProgress } from '@/controllers/hooks/useQuestionProgress';
import BackgroundTab from '../BackgroundTab';
import type { QuestionScreenData } from '../useQuestionScreenData';

jest.mock('@/controllers/hooks/useQuestionProgress', () => ({ useQuestionProgress: jest.fn() }));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('react-router', () => ({ useLocation: () => ({ hash: '' }) }));
jest.mock('react-redux', () => ({ useSelector: () => undefined }));
jest.mock('@/redux/statements/statementsSlice', () => ({
	statementSelectorById: () => () => undefined,
}));
jest.mock('@/view/components/atomic/molecules/StatementBody/StatementBody', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock('@/view/components/atomic/molecules/StatementDescription/StatementDescription', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock('../GroupProgress', () => ({ __esModule: true, default: () => null }));
jest.mock('../questionTabs', () => ({ HOW_IT_WORKS_ANCHOR: 'how-it-works' }));

const mockProgress = useQuestionProgress as jest.Mock;

const statement = (numberOfMembers?: number): Statement =>
	({ statementId: 'q1', topParentId: 'top', numberOfMembers }) as unknown as Statement;

const data = { stage: 0, isHost: false, isDeadlinePassed: false } as unknown as QuestionScreenData;

describe('BackgroundTab participant count', () => {
	it('shows the exact number from the progress doc', () => {
		mockProgress.mockReturnValue({ members: 43 });

		render(<BackgroundTab statement={statement(40)} data={data} />);

		expect(screen.getByText('{n} participants'.replace('{n}', '43'))).toBeTruthy();
	});

	it('shows the statement field for a question with no member count on its progress doc', () => {
		mockProgress.mockReturnValue(null);

		render(<BackgroundTab statement={statement(40)} data={data} />);

		expect(screen.getByText('{n} participants'.replace('{n}', '40'))).toBeTruthy();
	});

	it('shows no count while neither source has one', () => {
		mockProgress.mockReturnValue(null);

		render(<BackgroundTab statement={statement()} data={data} />);

		expect(screen.queryByText(/participants/)).toBeNull();
	});
});
