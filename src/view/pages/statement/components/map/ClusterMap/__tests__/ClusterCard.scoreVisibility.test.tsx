import { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { Statement } from '@freedi/shared-types';
import ClusterCard from '../ClusterCard';
import type { ScoreViewerFacts } from '../../../questionScreen/canSeeScore';

let mockMyEvaluation: number | undefined;

jest.mock('../ClusterBoard.module.scss', () => ({
	__esModule: true,
	default: new Proxy({}, { get: (_target, key) => key }),
}));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/controllers/hooks/useAuthentication', () => ({
	useAuthentication: () => ({ creator: { uid: 'viewer' } }),
}));
jest.mock('@/controllers/hooks/reduxHooks', () => ({
	useAppSelector: () => mockMyEvaluation,
}));
jest.mock('@/redux/evaluations/evaluationsSlice', () => ({ evaluationSelector: () => jest.fn() }));
jest.mock('@/controllers/db/evaluation/setEvaluation', () => ({ setEvaluationToDB: jest.fn() }));
jest.mock(
	'@/view/pages/statement/components/evaluations/components/evaluation/enhancedEvaluation/EnhancedEvaluationModel',
	() => ({ enhancedEvaluationsThumbs: [] }),
);
jest.mock('@/view/pages/statement/components/evaluations/statementsEvaluationCont', () => ({
	getEvaluationThumbIdByScore: () => null,
}));
jest.mock('../NoteFocusOverlay', () => ({ __esModule: true, default: () => null }));

const facts: ScoreViewerFacts = {
	isHost: false,
	stage: 1,
	showLiveResults: true,
	isDeadlinePassed: false,
	ratingClosed: false,
};

const statement = {
	statementId: 'a1',
	statement: 'A note',
	creatorId: 'someone-else',
	consensus: 0.5,
	evaluation: { numberOfEvaluators: 7, averageEvaluation: 0.5 },
} as unknown as Statement;

function renderCard(overrides: Partial<ComponentProps<typeof ClusterCard>> = {}) {
	return render(
		<ClusterCard
			statement={statement}
			color={{ card: 'var(--card-default)', text: 'var(--text-body)' } as never}
			canManage={false}
			scoreViewer={facts}
			isEditing={false}
			onRequestEdit={jest.fn()}
			onSaveText={jest.fn()}
			onCancelEdit={jest.fn()}
			onDuplicate={jest.fn()}
			onDelete={jest.fn()}
			onDragStart={jest.fn()}
			clusterId="c1"
			moveTargets={[]}
			onMove={jest.fn()}
			{...overrides}
		/>,
	);
}

describe('ClusterCard score guard', () => {
	beforeAll(() => {
		global.ResizeObserver = class {
			observe(): void {}
			unobserve(): void {}
			disconnect(): void {}
		} as unknown as typeof ResizeObserver;
	});

	beforeEach(() => {
		mockMyEvaluation = undefined;
	});

	it('shows no score on a card the viewer has not rated', () => {
		renderCard();

		expect(screen.queryByTitle('Agreement score')).not.toBeInTheDocument();
	});

	it('shows the score once the viewer rated this card', () => {
		mockMyEvaluation = 0;

		renderCard();

		expect(screen.getByTitle('Agreement score')).toHaveTextContent('50');
	});

	it('shows authors the score of their own note', () => {
		renderCard({ isMine: true });

		expect(screen.getByTitle('Agreement score')).toBeInTheDocument();
	});

	it('shows a host the score with live results off', () => {
		renderCard({ scoreViewer: { ...facts, isHost: true, showLiveResults: false } });

		expect(screen.getByTitle('Agreement score')).toBeInTheDocument();
	});

	it('hides the score from a rater when the host hid live results', () => {
		mockMyEvaluation = 1;

		renderCard({ scoreViewer: { ...facts, showLiveResults: false } });

		expect(screen.queryByTitle('Agreement score')).not.toBeInTheDocument();
	});
});
