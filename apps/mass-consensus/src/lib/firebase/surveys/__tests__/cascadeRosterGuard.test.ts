/**
 * A survey can already hold a question nobody running it administers: planted
 * before the routes checked, or its admin has since left. The survey stays
 * editable, so each cascade has to leave that question alone by itself.
 */

type Doc = Record<string, unknown>;

const store = new Map<string, Doc>();
const reads: string[] = [];
const mockBatchUpdate = jest.fn();

jest.mock('@/lib/firebase/admin', () => ({
	getFirestoreAdmin: () => ({
		collection: (name: string) => ({
			doc: (id: string) => ({
				id,
				get: async () => {
					reads.push(`${name}/${id}`);

					return { exists: store.has(`${name}/${id}`), data: () => store.get(`${name}/${id}`) };
				},
			}),
			where: (_field: string, _op: string, surveyId: string) => ({
				limit: () => ({
					get: async () => {
						reads.push(`${name}?surveyId=${surveyId}`);

						return {
							docs: [...store.entries()]
								.filter(([key, doc]) => key.startsWith(`${name}/`) && doc.surveyId === surveyId)
								.map(([, doc]) => ({ data: () => doc })),
						};
					},
				}),
			}),
		}),
		batch: () => ({ update: mockBatchUpdate, commit: jest.fn().mockResolvedValue(undefined) }),
	}),
}));

jest.mock('@/lib/utils/logger', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { SurveyAdminRole } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';
import type { Survey } from '@/types/survey';
import { cascadeSynthesisToggle } from '../../synthesis/cascadeSynthesisToggle';
import { cascadeAutoAiHandling } from '../cascadeAutoAiHandling';
import { cascadeMinResponseWords } from '../cascadeMinResponseWords';
import { cascadeRatingMode } from '../cascadeRatingMode';
import { findQuestionsOutsideRoster, keepRosterAdministeredWrites } from '../questionAdminAccess';

const OWNER = 'owner';
const EDITOR = 'editor';
const STRANGER = 'stranger';

function question(id: string, creatorId: string): void {
	store.set(`statements/${id}`, { statementId: id, creatorId, topParentId: id });
}

function survey(questionIds: string[]): Survey {
	const overrides = { minResponseWords: 5, ratingMode: 'reactions', liveSynthEnabled: true };

	return {
		surveyId: 's1',
		creatorId: OWNER,
		questionIds,
		settings: { autoSplitMultiSuggestions: true },
		questionSettings: Object.fromEntries(questionIds.map((id) => [id, overrides])),
	} as unknown as Survey;
}

function writtenIds(): string[] {
	return (mockBatchUpdate.mock.calls as [{ id: string }, Doc][]).map(([ref]) => ref.id);
}

const CASCADES: [string, (s: Survey) => Promise<{ updated: number; skipped: number }>][] = [
	['cascadeSynthesisToggle', cascadeSynthesisToggle],
	['cascadeAutoAiHandling', cascadeAutoAiHandling],
	['cascadeMinResponseWords', cascadeMinResponseWords],
	['cascadeRatingMode', cascadeRatingMode],
];

describe('survey cascades: the roster guard', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		store.clear();
		reads.length = 0;
		question('own', OWNER);
		question('foreign', STRANGER);
	});

	describe.each(CASCADES)('%s', (operation, cascade) => {
		it('writes to the question the owner administers and leaves the foreign one alone', async () => {
			const result = await cascade(survey(['own', 'foreign']));

			expect(writtenIds()).toEqual(['own']);
			expect(result.updated).toBe(1);
			expect(result.skipped).toBe(1);
			expect(logger.warn).toHaveBeenCalledWith(
				expect.stringContaining(operation),
				expect.objectContaining({ surveyId: 's1', statementId: 'foreign' }),
			);
		});

		it('writes to a question only a co-admin administers', async () => {
			question('editors', EDITOR);
			store.set(`surveyAdmins/s1--${EDITOR}`, {
				surveyId: 's1',
				userId: EDITOR,
				role: SurveyAdminRole.editor,
			});

			await cascade(survey(['editors']));

			expect(writtenIds()).toEqual(['editors']);
		});

		it('writes nothing when the roster cannot be read', async () => {
			store.set('surveyAdmins/poison', {
				get surveyId(): string {
					throw new Error('roster unavailable');
				},
			});

			await expect(cascade(survey(['own']))).rejects.toThrow('roster unavailable');
			expect(mockBatchUpdate).not.toHaveBeenCalled();
		});
	});

	describe('keepRosterAdministeredWrites', () => {
		it('reads nothing when there is nothing to write', async () => {
			await expect(keepRosterAdministeredWrites({ surveyId: 's1', creatorId: OWNER }, [], 'op')).resolves.toEqual([]);
			expect(reads).toEqual([]);
		});
	});

	describe('findQuestionsOutsideRoster', () => {
		it('returns foreign and missing ids once each, and not the administered ones', async () => {
			const outside = await findQuestionsOutsideRoster([OWNER], ['own', 'foreign', 'foreign', 'missing']);

			expect(outside).toEqual(['foreign', 'missing']);
		});
	});
});
