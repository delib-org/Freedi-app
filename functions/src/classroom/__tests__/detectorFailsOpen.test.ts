import { CLASS_LANGUAGE_FLAGS_COLLECTION } from '@freedi/shared-types';
import { containsBadLanguage } from '../../fn_profanityChecker';
import { postProposal } from '../fn_classPostProposal';
import { FakeFirestore } from './fakeFirestore';

/**
 * IA 24.3: "a failure must never accuse a child". The real detector, with the
 * model service down, answers "fine", and the proposal is published with no
 * flag for the teacher.
 */

jest.mock('../../config/gemini', () => ({
	GEMINI_MODEL: 'test-model',
	getGenAI: () => ({
		getGenerativeModel: () => ({
			generateContent: async () => {
				throw new Error('service unavailable');
			},
		}),
	}),
}));

describe('the language check when the detector is down', () => {
	it('containsBadLanguage answers false, not an accusation', async () => {
		await expect(containsBadLanguage('anything at all')).resolves.toBe(false);
	});

	it('a proposal goes through and nobody is flagged', async () => {
		const fake = new FakeFirestore();
		fake.seed('statements/m', {
			statementId: 'm',
			parentId: 'top',
			statementType: 'question',
			creatorId: 't',
			creator: { uid: 't', displayName: 'T' },
			statementSettings: { lessonPlan: { steps: ['proposals'], stepIndex: 0 } },
		});
		fake.seed('statementsSubscribe/s--m', {
			userId: 's',
			statementId: 'm',
			role: 'member',
			user: { uid: 's', displayName: 'S', isAnonymous: true },
		});
		fake.seed('statements/ch', {
			statementId: 'ch',
			parentId: 'm',
			statementType: 'question',
			statementSettings: { classRole: 'challenge' },
		});
		const res = await postProposal(
			fake.asFirestore(),
			's',
			{ mainId: 'm', proposalId: 'p', text: 'A fine idea' },
			{ detect: containsBadLanguage },
		);
		expect(res).toEqual({ ok: true, proposalId: 'p' });
		expect(fake.list(CLASS_LANGUAGE_FLAGS_COLLECTION)).toHaveLength(0);
	});
});
