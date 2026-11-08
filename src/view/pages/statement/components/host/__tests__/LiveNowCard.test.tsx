import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { EvaluationUI, Statement, StatementType } from '@freedi/shared-types';
import { renderWithProviders } from '@/test-utils/test-utils';
import LiveNowCard from '../LiveNowCard';

const handleSettingChange = jest.fn();
const handlePowerFollowMeChange = jest.fn();

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (k: string) => k, dir: 'ltr' }),
}));
jest.mock('../../settings/useStatementSettingsHandlers', () => ({
	useStatementSettingsHandlers: () => ({ handleSettingChange, handlePowerFollowMeChange }),
}));
jest.mock('../../settings/components/QuestionSettings/DeadlineSettings', () => ({
	__esModule: true,
	default: () => <div data-testid="deadline-settings" />,
}));
jest.mock('../../header/invitePanel/InvitePanel', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock('@/view/components/shareModal/ShareModal', () => ({
	__esModule: true,
	default: () => null,
}));

function makeStatement(overrides: Partial<Statement> = {}): Statement {
	return {
		statementId: 'q1',
		topParentId: 'q1',
		parentId: 'top',
		statement: 'Q',
		statementType: StatementType.question,
		creator: { uid: 'u', displayName: 'U' },
		creatorId: 'u',
		createdAt: 1,
		lastUpdate: 1,
		consensus: 0,
		evaluationSettings: { evaluationUI: EvaluationUI.suggestions },
		statementSettings: { enableAddEvaluationOption: false, enableAddVotingOption: false },
		...overrides,
	} as Statement;
}

function renderCard(statement: Statement, compact = false) {
	return renderWithProviders(
		<MemoryRouter initialEntries={['/statement/q1/settings']}>
			<LiveNowCard statement={statement} compact={compact} />
		</MemoryRouter>,
	);
}

describe('LiveNowCard', () => {
	beforeEach(() => jest.clearAllMocks());

	it('"Allow participants to add answers" writes BOTH add flags', () => {
		renderCard(makeStatement());
		const toggle = screen.getByTestId('allow-add-answers');
		expect(toggle).not.toBeChecked();
		fireEvent.click(toggle);
		expect(handleSettingChange).toHaveBeenCalledWith('enableAddEvaluationOption', true);
		expect(handleSettingChange).toHaveBeenCalledWith('enableAddVotingOption', true);
	});

	it('reads the flag for the rating UI the question currently runs', () => {
		renderCard(
			makeStatement({
				evaluationSettings: { evaluationUI: EvaluationUI.voting },
				statementSettings: { enableAddEvaluationOption: false, enableAddVotingOption: true },
			}),
		);
		expect(screen.getByTestId('allow-add-answers')).toBeChecked();
	});

	it('Presenter mode uses the power-follow-me handler', () => {
		renderCard(makeStatement());
		fireEvent.click(screen.getByTestId('presenter-mode'));
		expect(handlePowerFollowMeChange).toHaveBeenCalledWith(true);
	});

	it('the strip starts collapsed and opens on the summary button', () => {
		renderCard(makeStatement(), true);
		// Collapsed: the summary row only, no chips competing with the question.
		expect(screen.queryByText('host.showPin')).not.toBeInTheDocument();

		fireEvent.click(screen.getByTestId('host-live-strip-toggle'));
		expect(screen.getByText('host.showPin')).toBeInTheDocument();
		expect(screen.getByText('host.allHostTools')).toBeInTheDocument();
	});

	it('the collapsed summary names what is currently on', () => {
		renderCard(makeStatement(), true);
		// enableEvaluation defaults on, so the summary says so without expanding.
		expect(screen.getByText(/host\.acceptingResponses/)).toBeInTheDocument();

		renderCard(
			makeStatement({
				statementSettings: {
					enableAddEvaluationOption: false,
					enableAddVotingOption: false,
					enableEvaluation: false,
					showEvaluation: false,
				},
			}),
			true,
		);
		expect(screen.getAllByText('host.nothingLive').length).toBeGreaterThan(0);
	});

	it('the full card carries the close-date editor, the strip does not', () => {
		renderCard(makeStatement());
		expect(screen.getByTestId('deadline-settings')).toBeInTheDocument();
		renderCard(makeStatement(), true);
		expect(screen.getByTestId('host-live-strip')).toBeInTheDocument();
		expect(screen.getAllByTestId('deadline-settings')).toHaveLength(1);
	});
});
