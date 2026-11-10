import { updateDoc } from 'firebase/firestore';
import { QuestionStep, Statement } from '@freedi/shared-types';
import { logError } from '@/utils/errorHandling';
import { setStagePresetToDB } from '../setStagePreset';

jest.mock('firebase/firestore', () => ({ updateDoc: jest.fn() }));
jest.mock('@/utils/firebaseUtils', () => ({
	createStatementRef: jest.fn(() => 'ref'),
	updateTimestamp: () => ({ lastUpdate: 42 }),
}));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

const updateDocMock = updateDoc as jest.Mock;
const statement = { statementId: 'q1' } as Statement;

describe('setStagePresetToDB', () => {
	beforeEach(() => jest.clearAllMocks());

	it('writes the whole preset in one update', async () => {
		updateDocMock.mockResolvedValue(undefined);
		await setStagePresetToDB(statement, 3);
		expect(updateDocMock).toHaveBeenCalledTimes(1);
		expect(updateDocMock).toHaveBeenCalledWith('ref', {
			'questionSettings.currentStep': QuestionStep.finished,
			'statementSettings.enableAddEvaluationOption': false,
			'statementSettings.enableAddVotingOption': false,
			'statementSettings.enableEvaluation': false,
			'statementSettings.showEvaluation': true,
			lastUpdate: 42,
		});
	});

	it('logs with context and rethrows, so the sheet can say it failed', async () => {
		updateDocMock.mockRejectedValue(new Error('denied'));
		await expect(setStagePresetToDB(statement, 1)).rejects.toThrow('denied');
		expect(logError).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({
				operation: 'statements.setStagePreset.setStagePresetToDB',
				statementId: 'q1',
			}),
		);
	});
});
