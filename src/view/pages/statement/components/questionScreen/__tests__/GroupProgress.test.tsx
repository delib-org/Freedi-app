import { render, screen } from '@testing-library/react';
import { QuestionProgress } from '@freedi/shared-types';
import { useQuestionProgress } from '@/controllers/hooks/useQuestionProgress';
import GroupProgress from '../GroupProgress';
import type { QuestionScreenData } from '../useQuestionScreenData';

jest.mock('@/controllers/hooks/useQuestionProgress', () => ({ useQuestionProgress: jest.fn() }));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key, currentLanguage: 'en' }),
}));

const mockProgress = useQuestionProgress as jest.Mock;

const data = {
	isHost: false,
	stage: 1,
	ratedCount: 2,
	hasVoted: false,
	answers: [{}, {}, {}],
	rateableCount: 3,
} as unknown as QuestionScreenData;

function counts(suggested: number, evaluated: number, entered = 80): QuestionProgress {
	return { suggested, evaluated, entered } as QuestionProgress;
}

describe('GroupProgress', () => {
	beforeEach(() => {
		mockProgress.mockReset();
	});

	it('shows both counts at five or more, with the lead-in', () => {
		mockProgress.mockReturnValue(counts(6, 9));

		render(<GroupProgress statementId="q1" data={data} />);

		expect(screen.getByText('progress.soFar')).toBeInTheDocument();
		expect(screen.getByText('progress.peopleAddedAnswers')).toBeInTheDocument();
		expect(screen.getByText('progress.peopleRated')).toBeInTheDocument();
	});

	it('hides one segment below five', () => {
		mockProgress.mockReturnValue(counts(2, 9));

		render(<GroupProgress statementId="q1" data={data} />);

		expect(screen.queryByText('progress.peopleAddedAnswers')).not.toBeInTheDocument();
		expect(screen.getByText('progress.peopleRated')).toBeInTheDocument();
	});

	it('renders nothing, not even a lead-in, when both are below five', () => {
		mockProgress.mockReturnValue(counts(1, 4));

		const { container } = render(<GroupProgress statementId="q1" data={data} />);

		expect(container).toBeEmptyDOMElement();
	});

	it('never shows how many people entered', () => {
		mockProgress.mockReturnValue(counts(6, 9, 80));

		const { container } = render(<GroupProgress statementId="q1" data={data} />);

		expect(container.textContent).not.toMatch(/80|entered/);
	});

	it('uses the single decided line once the question is decided', () => {
		mockProgress.mockReturnValue(counts(6, 9));

		render(<GroupProgress statementId="q1" data={{ ...data, stage: 3 }} />);

		expect(screen.getByTestId('group-progress')).toHaveTextContent('progress.tookPartInDecision');
		expect(screen.queryByText('progress.soFar')).not.toBeInTheDocument();
	});

	it('renders nothing at decided below five', () => {
		mockProgress.mockReturnValue(counts(1, 4));

		const { container } = render(<GroupProgress statementId="q1" data={{ ...data, stage: 3 }} />);

		expect(container).toBeEmptyDOMElement();
	});

	it('does not read or show anything for a host', () => {
		mockProgress.mockReturnValue(counts(6, 9));

		const { container } = render(
			<GroupProgress statementId="q1" data={{ ...data, isHost: true }} />,
		);

		expect(mockProgress).toHaveBeenCalledWith(undefined, expect.any(String));
		expect(container).toBeEmptyDOMElement();
	});

	it('asks for a fresh read after the viewer acts', () => {
		mockProgress.mockReturnValue(null);

		const { rerender } = render(<GroupProgress statementId="q1" data={data} />);
		const firstKey = mockProgress.mock.calls[0][1];

		rerender(<GroupProgress statementId="q1" data={{ ...data, ratedCount: 3 }} />);

		expect(mockProgress.mock.calls[1][1]).not.toBe(firstKey);
	});
});
