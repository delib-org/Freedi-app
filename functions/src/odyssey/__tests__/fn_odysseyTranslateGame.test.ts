import { Collections, odysseyTranslationsPath } from '@freedi/shared-types';
import type { OdysseyGame, OdysseyGameTranslation } from '@freedi/shared-types';
import {
	asHandler,
	expectHttpsError,
	fakeDbFrom,
	makeRequest,
} from '../../organizations/__tests__/testUtils';

jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('firebase-functions/v2/https', () => ({
	onCall: (_opts: unknown, handler: unknown) => handler,
	HttpsError: class HttpsError extends Error {
		code: string;
		constructor(code: string, message: string) {
			super(message);
			this.code = code;
		}
	},
}));
jest.mock('../../db', () => {
	const { createFakeDb } = jest.requireActual('../../organizations/__tests__/fakeFirestore');

	return { db: createFakeDb() };
});
jest.mock('../../config/openai-chat', () => ({
	TAXONOMY_MODEL: 'test-model',
	callLLM: jest.fn(),
	extractJson: (text: string) => text,
}));

import * as dbModule from '../../db';
import { callLLM } from '../../config/openai-chat';
import { odysseyTranslateGame } from '../fn_odysseyTranslateGame';
import { hashSource } from '../translation/translationSource';
import { batchItems } from '../translation/translateChunk';

const db = fakeDbFrom(dbModule);
const mockCallLLM = callLLM as jest.MockedFunction<typeof callLLM>;
const translate = asHandler<
	Record<string, unknown>,
	{ translated: number; skipped: number; failed: number; total: number }
>(odysseyTranslateGame);

const ADMIN = 'admin-1';
const GAME_ID = 'default';
const ROOT = 'root-1';

function game(): OdysseyGame {
	return {
		gameId: GAME_ID,
		rootStatementId: ROOT,
		texts: {
			gameTitle: 'אודיסיאה',
			agoraOrigin: 'https://agora.example',
			privacyContact: 'a@b.co',
		},
		compassQuestions: [
			{
				questionId: 'q1',
				title: 'רוח',
				prompt: 'מה?',
				chips: ['ים', 'הר'],
				sortOrder: 1,
				enabled: true,
			},
		],
		values: [{ valueId: 'value-1', label: 'חירות', sortOrder: 1, enabled: true }],
		islands: [
			{
				statementId: 'island-1',
				title: 'אי',
				issue: 'סוגיה',
				shortExplain: 'הסבר',
				opening: 'פתיחה',
				depthQuestion: '',
				posX: 1,
				posY: 1,
				sortOrder: 1,
				enabled: true,
			},
		],
		parties: [
			{
				partyId: 'p1',
				name: 'מפלגה',
				color: '#000',
				description: 'תיאור',
				sortOrder: 1,
				enabled: true,
			},
		],
		elders: [
			{
				elderId: 'golda',
				name: 'גולדה',
				role: 'ראשת ממשלה',
				color: '#fff',
				bio: 'ביו',
				needs: ['ביטחון'],
				values: [{ valueId: 'v', label: 'ערך', description: 'תיאור ערך' }],
				positions: {},
				reactions: { 'stance-1': 'תגובה' },
				challenges: { 'island-1': 'אתגר' },
				counsel: { 'island-1': { 'stance-1': 'עצה' } },
				sortOrder: 1,
				enabled: true,
			},
		],
		adminUids: ['co-admin'],
		creatorId: ADMIN,
		createdAt: 1,
		lastUpdate: 1,
	};
}

function seedGame(): void {
	db.seed(Collections.odysseyGames, GAME_ID, game() as unknown as Record<string, unknown>);
	db.seed(Collections.statements, 'island-1', {
		statementId: 'island-1',
		statement: 'מהי השאלה?',
		statementType: 'question',
		parentId: ROOT,
		parents: [ROOT],
	});
	db.seed(Collections.statements, 'stance-1', {
		statementId: 'stance-1',
		statement: 'חוף א',
		statementType: 'option',
		parentId: 'island-1',
		parents: [ROOT, 'island-1'],
	});
	db.seed(Collections.statements, 'hidden-stance', {
		statementId: 'hidden-stance',
		statement: 'חוף נסתר',
		statementType: 'option',
		parentId: 'island-1',
		parents: [ROOT, 'island-1'],
		hide: true,
	});
}

/** The model as a faithful echo: every key back, prefixed, so tests can see which fields were sent. */
function echoTranslator(): void {
	mockCallLLM.mockImplementation(async ({ user }) => {
		const source = JSON.parse(user) as Record<string, string>;

		return JSON.stringify(
			Object.fromEntries(Object.entries(source).map(([path, text]) => [path, `EN:${text}`])),
		);
	});
}

function storedTranslation(lang = 'en'): OdysseyGameTranslation | undefined {
	return db.read(odysseyTranslationsPath(GAME_ID), lang) as OdysseyGameTranslation | undefined;
}

function sentPaths(): string[] {
	return mockCallLLM.mock.calls.flatMap(([opts]) => Object.keys(JSON.parse(opts.user)));
}

describe('odysseyTranslateGame', () => {
	beforeEach(() => {
		db.store.clear();
		mockCallLLM.mockReset();
		seedGame();
		echoTranslator();
	});

	it('rejects an unauthenticated caller', async () => {
		await expectHttpsError(
			translate(makeRequest({ gameId: GAME_ID, lang: 'en' })),
			'unauthenticated',
		);
	});

	it('rejects a caller who is not a game admin', async () => {
		await expectHttpsError(
			translate(makeRequest({ gameId: GAME_ID, lang: 'en' }, { uid: 'sailor' })),
			'permission-denied',
		);
		expect(mockCallLLM).not.toHaveBeenCalled();
	});

	it('rejects a language the game does not translate into and a missing game', async () => {
		await expectHttpsError(
			translate(makeRequest({ gameId: GAME_ID, lang: 'fr' }, { uid: ADMIN })),
			'invalid-argument',
		);
		await expectHttpsError(
			translate(makeRequest({ gameId: 'nope', lang: 'en' }, { uid: ADMIN })),
			'not-found',
		);
	});

	it('translates every prose field for the creator and writes the overlay doc', async () => {
		const result = await translate(makeRequest({ gameId: GAME_ID, lang: 'en' }, { uid: ADMIN }));

		expect(result).toMatchObject({ failed: 0, skipped: 0 });
		expect(result.translated).toBe(result.total);
		const doc = storedTranslation();
		expect(doc).toMatchObject({
			gameId: GAME_ID,
			lang: 'en',
			texts: { gameTitle: 'EN:אודיסיאה' },
			compassQuestions: { q1: { title: 'EN:רוח', prompt: 'EN:מה?', chips: ['EN:ים', 'EN:הר'] } },
			values: { 'value-1': 'EN:חירות' },
			islands: { 'island-1': { title: 'EN:אי', question: 'EN:מהי השאלה?' } },
			stances: { 'stance-1': 'EN:חוף א' },
			parties: { p1: { name: 'EN:מפלגה', description: 'EN:תיאור' } },
			elders: {
				golda: {
					name: 'EN:גולדה',
					needs: ['EN:ביטחון'],
					values: { v: { label: 'EN:ערך', description: 'EN:תיאור ערך' } },
					reactions: { 'stance-1': 'EN:תגובה' },
					challenges: { 'island-1': 'EN:אתגר' },
					counsel: { 'island-1': { 'stance-1': 'EN:עצה' } },
				},
			},
		});
		expect(typeof doc?.updatedAt).toBe('number');
		expect(doc?.sourceHashes?.['islands/island-1/title']).toBe(hashSource('אי'));
	});

	it('lets a listed co-admin translate too', async () => {
		await expect(
			translate(makeRequest({ gameId: GAME_ID, lang: 'ar' }, { uid: 'co-admin' })),
		).resolves.toMatchObject({ lang: 'ar' });
		expect(storedTranslation('ar')?.lang).toBe('ar');
	});

	it('never sends config keys, blanks, hidden stances, ids or colours to the model', async () => {
		await translate(makeRequest({ gameId: GAME_ID, lang: 'en' }, { uid: ADMIN }));

		const paths = sentPaths();
		expect(paths).not.toContain('texts/agoraOrigin');
		expect(paths).not.toContain('texts/privacyContact');
		expect(paths).not.toContain('islands/island-1/depthQuestion');
		expect(paths).not.toContain('stances/hidden-stance');
		expect(paths.some((path) => path.includes('/color') || path.includes('/positions'))).toBe(
			false,
		);
	});

	it('speaks in the elder voice only for the elder chunk', async () => {
		await translate(makeRequest({ gameId: GAME_ID, lang: 'en' }, { uid: ADMIN }));

		const voiced = mockCallLLM.mock.calls.filter(([opts]) => opts.system?.includes('גולדה'));
		expect(voiced).toHaveLength(1);
		expect(
			Object.keys(JSON.parse(voiced[0][0].user)).every((path) => path.startsWith('elders/golda/')),
		).toBe(true);
	});

	it('skips fields whose Hebrew is unchanged and keeps their stored translation', async () => {
		await translate(makeRequest({ gameId: GAME_ID, lang: 'en' }, { uid: ADMIN }));
		mockCallLLM.mockClear();
		const edited = game();
		edited.islands[0].title = 'אי חדש';
		db.seed(Collections.odysseyGames, GAME_ID, edited as unknown as Record<string, unknown>);

		const result = await translate(makeRequest({ gameId: GAME_ID, lang: 'en' }, { uid: ADMIN }));

		expect(result).toMatchObject({ translated: 1, failed: 0 });
		expect(result.skipped).toBe(result.total - 1);
		expect(sentPaths()).toEqual(['islands/island-1/title']);
		expect(storedTranslation()?.islands?.['island-1']).toMatchObject({
			title: 'EN:אי חדש',
			issue: 'EN:סוגיה',
		});
	});

	it('counts the stale fields on a dry run without calling the model or writing', async () => {
		await translate(makeRequest({ gameId: GAME_ID, lang: 'en' }, { uid: ADMIN }));
		const before = storedTranslation();
		const edited = game();
		edited.islands[0].title = 'אי חדש';
		edited.values[0].label = 'שוויון';
		db.seed(Collections.odysseyGames, GAME_ID, edited as unknown as Record<string, unknown>);
		mockCallLLM.mockClear();

		const result = await translate(
			makeRequest({ gameId: GAME_ID, lang: 'en', dryRun: true }, { uid: ADMIN }),
		);

		expect(result).toMatchObject({ translated: 2, failed: 0 });
		expect(result.skipped).toBe(result.total - 2);
		expect(mockCallLLM).not.toHaveBeenCalled();
		expect(storedTranslation()).toEqual(before);
	});

	it('re-translates everything when forced', async () => {
		await translate(makeRequest({ gameId: GAME_ID, lang: 'en' }, { uid: ADMIN }));
		mockCallLLM.mockClear();

		const result = await translate(
			makeRequest({ gameId: GAME_ID, lang: 'en', force: true }, { uid: ADMIN }),
		);

		expect(result.translated).toBe(result.total);
		expect(result.skipped).toBe(0);
	});

	it('drops a translation whose Hebrew field was removed', async () => {
		await translate(makeRequest({ gameId: GAME_ID, lang: 'en' }, { uid: ADMIN }));
		const trimmed = game();
		trimmed.compassQuestions[0].chips = ['ים'];
		db.seed(Collections.odysseyGames, GAME_ID, trimmed as unknown as Record<string, unknown>);

		await translate(makeRequest({ gameId: GAME_ID, lang: 'en' }, { uid: ADMIN }));

		expect(storedTranslation()?.compassQuestions?.q1.chips).toEqual(['EN:ים']);
		expect(storedTranslation()?.sourceHashes).not.toHaveProperty('compassQuestions/q1/chips/1');
	});

	it('keeps the previous translation and counts the field failed when a chunk throws', async () => {
		await translate(makeRequest({ gameId: GAME_ID, lang: 'en' }, { uid: ADMIN }));
		const edited = game();
		edited.parties[0].name = 'מפלגה אחרת';
		db.seed(Collections.odysseyGames, GAME_ID, edited as unknown as Record<string, unknown>);
		mockCallLLM.mockRejectedValue(new Error('openai down'));

		const result = await translate(makeRequest({ gameId: GAME_ID, lang: 'en' }, { uid: ADMIN }));

		expect(result).toMatchObject({ translated: 0, failed: 1 });
		expect(result.skipped).toBe(result.total - 1);
		const doc = storedTranslation();
		// Stale Hebrew: no translation is better than the old one for a renamed party
		expect(doc?.parties?.p1.name).toBeUndefined();
		expect(doc?.parties?.p1.description).toBe('EN:תיאור');
		expect(doc?.sourceHashes).not.toHaveProperty('parties/p1/name');
	});

	it('treats a key the model dropped or blanked as failed, not as translated', async () => {
		mockCallLLM.mockImplementation(async ({ user }) => {
			const source = JSON.parse(user) as Record<string, string>;
			const answer: Record<string, unknown> = {};
			for (const path of Object.keys(source)) {
				answer[path] = path.endsWith('/title') ? '' : `EN:${source[path]}`;
			}
			delete answer['values/value-1'];
			answer['injected/key'] = 'ignored';

			return JSON.stringify(answer);
		});

		const result = await translate(makeRequest({ gameId: GAME_ID, lang: 'en' }, { uid: ADMIN }));

		const doc = storedTranslation();
		expect(doc?.values).toBeUndefined();
		expect(doc?.islands?.['island-1'].title).toBeUndefined();
		expect(doc).not.toHaveProperty('injected');
		expect(result.failed).toBe(3); // q1 title, island title, value-1
	});

	it('reports internal when the overlay cannot be written', async () => {
		const real = db.collection.bind(db);
		const failing = jest.spyOn(db, 'collection').mockImplementation((name: string) =>
			name === odysseyTranslationsPath(GAME_ID)
				? ({
						doc: () => ({
							get: () => Promise.resolve({ exists: false, data: () => undefined }),
							set: () => Promise.reject(new Error('firestore down')),
						}),
					} as unknown as ReturnType<typeof db.collection>)
				: real(name),
		);

		await expectHttpsError(
			translate(makeRequest({ gameId: GAME_ID, lang: 'en' }, { uid: ADMIN })),
			'internal',
		);
		failing.mockRestore();
	});
});

describe('batchItems', () => {
	it('keeps order and never splits a single item', () => {
		const items = [
			{ path: 'a', text: 'x'.repeat(5) },
			{ path: 'b', text: 'y'.repeat(5) },
			{ path: 'c', text: 'z'.repeat(20) },
			{ path: 'd', text: 'w' },
		];

		expect(batchItems(items, 10).map((batch) => batch.map((entry) => entry.path))).toEqual([
			['a', 'b'],
			['c'],
			['d'],
		]);
		expect(batchItems([], 10)).toEqual([]);
	});
});
