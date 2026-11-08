import { beforeEach, describe, expect, it, vi } from 'vitest';

const setChallengeQuestion = vi.fn<(mainId: string, questionId: string) => Promise<void>>();
const createPlanQuestion =
	vi.fn<
		(mainId: string, text: string, role: string, order: number | undefined) => Promise<string>
	>();

vi.mock('@/lib/lesson', () => ({
	setChallengeQuestion: (mainId: string, questionId: string) =>
		setChallengeQuestion(mainId, questionId),
}));
vi.mock('../planApi', () => ({
	createPlanQuestion: (mainId: string, text: string, role: string, order: number | undefined) =>
		createPlanQuestion(mainId, text, role, order),
}));
vi.mock('@/lib/i18n', () => ({ t: (key: string) => key }));
vi.mock('../consoleState', () => ({
	act: async (_key: string, _label: string, run: () => Promise<unknown>) => {
		await run();

		return true;
	},
}));

import { addProposalsQuestion, setProposalsQuestion } from '../challengeActions';

describe('challengeActions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setChallengeQuestion.mockResolvedValue(undefined);
		createPlanQuestion.mockResolvedValue('new-id');
	});

	it('marks an existing question as the Proposals question', async () => {
		await expect(setProposalsQuestion('main1', 'q1')).resolves.toBe(true);
		expect(setChallengeQuestion).toHaveBeenCalledWith('main1', 'q1');
	});

	it('creates a new question with the challenge role, trimmed', async () => {
		await expect(addProposalsQuestion('main1', '  How do we cut waste?  ')).resolves.toBe(true);
		expect(createPlanQuestion).toHaveBeenCalledWith(
			'main1',
			'How do we cut waste?',
			'challenge',
			undefined,
		);
	});

	it('does nothing for blank text', async () => {
		await expect(addProposalsQuestion('main1', '   ')).resolves.toBe(false);
		expect(createPlanQuestion).not.toHaveBeenCalled();
	});
});
