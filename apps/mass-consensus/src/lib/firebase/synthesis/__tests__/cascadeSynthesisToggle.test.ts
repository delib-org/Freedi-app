/**
 * Tests for cascadeSynthesisToggle.
 *
 * Covers:
 *   - Survey OFF → all questions get false (hard kill switch)
 *   - Survey ON, no per-question override → all questions get true (MC default)
 *   - Survey ON, explicit per-question false → that question gets false
 *   - Skip writes when current value already matches
 *   - Batches respect the Firestore 500-op chunk size
 */

import type { Survey } from '@/types/survey';
import { cascadeSynthesisToggle, __INTERNAL } from '../cascadeSynthesisToggle';

const COMMIT_MOCK = jest.fn().mockResolvedValue(undefined);
const UPDATE_MOCK = jest.fn();
const BATCH_MOCK = jest.fn(() => ({ update: UPDATE_MOCK, commit: COMMIT_MOCK }));

const docGetMocks: Record<string, jest.Mock> = {};

function makeDocRef(id: string) {
	const ref = {
		id,
		get: docGetMocks[id],
	};
	return ref;
}

const docMock = jest.fn((id: string) => makeDocRef(id));
const collectionMock = jest.fn(() => ({ doc: docMock }));

jest.mock('../../admin', () => ({
	getFirestoreAdmin: () => ({
		collection: collectionMock,
		batch: BATCH_MOCK,
	}),
}));

jest.mock('@/lib/utils/logger', () => ({
	logger: {
		info: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
	},
}));

function setStatementMock(
	id: string,
	exists: boolean,
	currentLiveSynth: boolean | undefined = undefined
) {
	docGetMocks[id] = jest.fn().mockResolvedValue({
		exists,
		data: () => ({
			statementId: id,
			statement: `Q${id}`,
			statementSettings:
				currentLiveSynth === undefined
					? {}
					: { liveSynthEnabled: currentLiveSynth },
		}),
	});
}

function makeSurvey(opts: {
	liveSynthEnabled?: boolean;
	questionIds: string[];
	questionOverrides?: Record<string, boolean | undefined>;
}): Survey {
	return {
		surveyId: 'survey_test',
		title: 'Test',
		creatorId: 'creator',
		questionIds: opts.questionIds,
		settings: {
			allowSkipping: false,
			allowReturning: true,
			minEvaluationsPerQuestion: 3,
			...(opts.liveSynthEnabled === undefined ? {} : { liveSynthEnabled: opts.liveSynthEnabled }),
		} as Survey['settings'],
		questionSettings: opts.questionOverrides
			? Object.fromEntries(
					Object.entries(opts.questionOverrides)
						.filter(([, v]) => v !== undefined)
						.map(([k, v]) => [k, { liveSynthEnabled: v } as unknown])
				) as Survey['questionSettings']
			: {},
		status: 'draft' as Survey['status'],
		createdAt: 0,
		lastUpdate: 0,
	};
}

beforeEach(() => {
	jest.clearAllMocks();
	for (const k of Object.keys(docGetMocks)) delete docGetMocks[k];
});

describe('readLiveSynth helper', () => {
	const { readLiveSynth } = __INTERNAL;

	it('returns true/false/undefined per spec', () => {
		expect(readLiveSynth({ liveSynthEnabled: true })).toBe(true);
		expect(readLiveSynth({ liveSynthEnabled: false })).toBe(false);
		expect(readLiveSynth({ liveSynthEnabled: undefined })).toBeUndefined();
		expect(readLiveSynth({})).toBeUndefined();
		expect(readLiveSynth(undefined)).toBeUndefined();
		expect(readLiveSynth(null)).toBeUndefined();
		expect(readLiveSynth({ liveSynthEnabled: 'true' })).toBeUndefined();
	});
});

describe('cascadeSynthesisToggle', () => {
	it('writes false to every question when survey-level is OFF (hard kill switch)', async () => {
		setStatementMock('q1', true, true);
		setStatementMock('q2', true, true);

		const survey = makeSurvey({
			liveSynthEnabled: false,
			questionIds: ['q1', 'q2'],
			questionOverrides: { q1: true, q2: true }, // Per-question ON loses
		});

		const result = await cascadeSynthesisToggle(survey);

		expect(result.surveyOn).toBe(false);
		expect(result.totalQuestions).toBe(2);
		expect(result.updated).toBe(2);
		expect(UPDATE_MOCK).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'q1' }),
			{ 'statementSettings.liveSynthEnabled': false }
		);
		expect(UPDATE_MOCK).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'q2' }),
			{ 'statementSettings.liveSynthEnabled': false }
		);
		expect(COMMIT_MOCK).toHaveBeenCalledTimes(1);
	});

	it('defaults survey-level to ON when unset, with per-question defaulting to true', async () => {
		setStatementMock('q1', true, undefined);
		setStatementMock('q2', true, undefined);

		const survey = makeSurvey({
			questionIds: ['q1', 'q2'],
			// No survey-level setting, no per-question overrides
		});

		const result = await cascadeSynthesisToggle(survey);

		expect(result.surveyOn).toBe(true);
		expect(result.updated).toBe(2);
		expect(UPDATE_MOCK).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'q1' }),
			{ 'statementSettings.liveSynthEnabled': true }
		);
		expect(UPDATE_MOCK).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'q2' }),
			{ 'statementSettings.liveSynthEnabled': true }
		);
	});

	it('honors per-question false override when survey is ON', async () => {
		setStatementMock('q1', true, undefined);
		setStatementMock('q2', true, undefined);

		const survey = makeSurvey({
			liveSynthEnabled: true,
			questionIds: ['q1', 'q2'],
			questionOverrides: { q2: false },
		});

		await cascadeSynthesisToggle(survey);

		expect(UPDATE_MOCK).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'q1' }),
			{ 'statementSettings.liveSynthEnabled': true }
		);
		expect(UPDATE_MOCK).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'q2' }),
			{ 'statementSettings.liveSynthEnabled': false }
		);
	});

	it('skips questions whose current Statement value already matches', async () => {
		setStatementMock('q1', true, true); // already matches the resolved value
		setStatementMock('q2', true, false); // needs flip to true

		const survey = makeSurvey({
			liveSynthEnabled: true,
			questionIds: ['q1', 'q2'],
		});

		const result = await cascadeSynthesisToggle(survey);

		expect(result.updated).toBe(1); // only q2 written
		expect(result.skipped).toBe(1);
		expect(UPDATE_MOCK).toHaveBeenCalledTimes(1);
		expect(UPDATE_MOCK).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'q2' }),
			{ 'statementSettings.liveSynthEnabled': true }
		);
	});

	it('skips when a question doc does not exist', async () => {
		setStatementMock('q1', false);

		const survey = makeSurvey({ liveSynthEnabled: true, questionIds: ['q1'] });
		const result = await cascadeSynthesisToggle(survey);

		expect(result.updated).toBe(0);
		expect(result.skipped).toBe(1);
		expect(UPDATE_MOCK).not.toHaveBeenCalled();
	});

	it('chunks writes into batches of 500 to respect the Firestore limit', async () => {
		const ids = Array.from({ length: 1100 }, (_, i) => `q${i}`);
		for (const id of ids) setStatementMock(id, true, false); // needs flip

		const survey = makeSurvey({ liveSynthEnabled: true, questionIds: ids });
		const result = await cascadeSynthesisToggle(survey);

		expect(result.updated).toBe(1100);
		// 1100 / 500 = 3 batches (500 + 500 + 100)
		expect(BATCH_MOCK).toHaveBeenCalledTimes(3);
		expect(COMMIT_MOCK).toHaveBeenCalledTimes(3);
	});

	it('no-ops when the survey has no questions', async () => {
		const survey = makeSurvey({ liveSynthEnabled: false, questionIds: [] });
		const result = await cascadeSynthesisToggle(survey);

		expect(result.totalQuestions).toBe(0);
		expect(result.updated).toBe(0);
		expect(BATCH_MOCK).not.toHaveBeenCalled();
	});

	it('deduplicates repeated questionIds before fetching', async () => {
		setStatementMock('q1', true, false);

		const survey = makeSurvey({
			liveSynthEnabled: true,
			questionIds: ['q1', 'q1', 'q1'], // intentional duplicates
		});

		const result = await cascadeSynthesisToggle(survey);

		expect(result.totalQuestions).toBe(1);
		expect(result.updated).toBe(1);
		expect(UPDATE_MOCK).toHaveBeenCalledTimes(1);
	});
});
