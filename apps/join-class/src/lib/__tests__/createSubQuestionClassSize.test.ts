import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSetDoc = vi.fn();
const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();

vi.mock('../firebase', () => ({
	db: {},
	collection: vi.fn(),
	doc: (_db: unknown, col: string, id: string) => ({ col, id }),
	getDoc: (...args: unknown[]) => mockGetDoc(...args),
	getDocs: (...args: unknown[]) => mockGetDocs(...args),
	setDoc: (...args: unknown[]) => mockSetDoc(...args),
	query: vi.fn(),
	where: vi.fn(),
	writeBatch: vi.fn(),
	deleteField: vi.fn(),
}));
vi.mock('mithril', () => ({ default: { redraw: vi.fn() } }));
vi.mock('../resilientListeners', () => ({ resilientOnSnapshot: vi.fn() }));
vi.mock('../user', () => ({
	getUserState: () => ({ user: { uid: 't1', displayName: 'T', isAnonymous: false } }),
	ensureUser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../i18n', () => ({
	applyStatementLanguage: vi.fn(),
	releaseForcedLanguage: vi.fn(),
	t: (key: string) => key,
}));
vi.mock('../admin', () => ({ checkAdminStatus: vi.fn(), isAdmin: () => true }));
vi.mock('../lessonLook', () => ({ applyLessonLookOf: vi.fn() }));
vi.mock('../userEvaluations', () => ({
	getEffectiveEvaluation: vi.fn(),
	setEvaluation: vi.fn(),
}));

import { createSubQuestion, loadMainStatement } from '../store';

async function openLesson(main: Record<string, unknown>): Promise<void> {
	mockGetDoc.mockResolvedValue({ exists: () => true, data: () => main });
	mockGetDocs.mockResolvedValue({ docs: [] });
	await loadMainStatement('m1');
}

describe('createSubQuestion copies the class size from the lesson', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSetDoc.mockResolvedValue(undefined);
	});

	it('a lesson with N hands it to the new question', async () => {
		await openLesson({
			statementId: 'm1',
			topParentId: 'home',
			parents: ['home'],
			evaluationSettings: { targetPopulation: 28 },
		});

		const id = await createSubQuestion('m1', 'A new question');

		expect(id).toBeTruthy();
		expect(mockSetDoc.mock.calls[0][1]).toMatchObject({
			evaluationSettings: { targetPopulation: 28 },
		});
	});

	it('a lesson that never had N leaves the new question open-population', async () => {
		await openLesson({ statementId: 'm1', topParentId: 'home', parents: ['home'] });

		await createSubQuestion('m1', 'A new question');

		expect(mockSetDoc.mock.calls[0][1]).not.toHaveProperty('evaluationSettings');
	});
});
