import type { ReactNode } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { EvaluationUI, Statement, StatementType } from '@freedi/shared-types';
import { renderWithProviders } from '@/test-utils/test-utils';
import { setStagePresetToDB } from '@/controllers/db/statements/setStagePreset';
import HostHubSheet from '../HostHubSheet';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (k: string) => k, dir: 'ltr' }),
}));
jest.mock('@/controllers/db/statements/setStagePreset', () => ({
	setStagePresetToDB: jest.fn(),
}));
jest.mock('@/services/analytics', () => ({ uxAnalytics: { settingChanged: jest.fn() } }));
jest.mock('../../settings/useStatementSettingsHandlers', () => ({
	useStatementSettingsHandlers: () => ({ handleSettingChange: jest.fn() }),
}));
jest.mock('../../settings/components/allowAddAnswers/AllowAddAnswersToggle', () => ({
	ALLOW_ADD_ANSWERS_KEYS: ['enableAddEvaluationOption', 'enableAddVotingOption'],
}));
jest.mock('@/view/components/atomic/molecules/Sheet/Sheet', () => ({
	__esModule: true,
	default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const savePreset = setStagePresetToDB as jest.MockedFunction<typeof setStagePresetToDB>;

function makeStatement(showEvaluation: boolean): Statement {
	return {
		statementId: 'q1',
		statement: 'Q',
		statementType: StatementType.question,
		parentId: 'top',
		topParentId: 'q1',
		creatorId: 'u1',
		createdAt: 1,
		lastUpdate: 1,
		consensus: 0,
		evaluationSettings: { evaluationUI: EvaluationUI.suggestions },
		statementSettings: {
			enableAddEvaluationOption: true,
			enableAddVotingOption: true,
			enableEvaluation: true,
			showEvaluation,
		},
	} as Statement;
}

function renderSheet(statement: Statement) {
	return renderWithProviders(
		<MemoryRouter>
			<HostHubSheet isOpen onClose={jest.fn()} statement={statement} stage={1} />
		</MemoryRouter>,
	);
}

describe('HostHubSheet stage preset', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		savePreset.mockResolvedValue(undefined);
	});

	it('uses the three shared switch labels', () => {
		renderSheet(makeStatement(false));
		expect(screen.getByText('Participants can add answers')).toBeInTheDocument();
		expect(screen.getByText('Participants can rate and vote')).toBeInTheDocument();
		expect(screen.getByText('Participants see live results')).toBeInTheDocument();
	});

	it('shows no status line while the switches match the stage', () => {
		renderSheet(makeStatement(true));
		expect(screen.queryByTestId('host-stage-differs')).not.toBeInTheDocument();
	});

	it('restores the current stage from the status line', async () => {
		const statement = makeStatement(false);
		renderSheet(statement);
		expect(screen.getByText('host.stageDiffers')).toBeInTheDocument();

		fireEvent.click(screen.getByTestId('host-apply-stage-preset'));

		await waitFor(() => expect(screen.getByText('host.stagePresetApplied')).toBeInTheDocument());
		expect(savePreset).toHaveBeenCalledWith(statement, 1);
	});

	it('a stage pick applies that stage', async () => {
		const statement = makeStatement(false);
		renderSheet(statement);
		fireEvent.click(screen.getByTestId('host-stage-2'));
		await waitFor(() => expect(savePreset).toHaveBeenCalledWith(statement, 2));
	});

	it('says so when the write fails', async () => {
		savePreset.mockRejectedValue(new Error('denied'));
		renderSheet(makeStatement(false));
		fireEvent.click(screen.getByTestId('host-stage-2'));
		await waitFor(() =>
			expect(screen.getByText('Could not save. Please try again.')).toBeInTheDocument(),
		);
	});
});
