import { Collections, ODYSSEY_GAME_FIELD, odysseyTranslationsPath } from '@freedi/shared-types';
import { createFakeDb, type FakeDb } from '../../organizations/__tests__/fakeFirestore';

const fakeDb: FakeDb = createFakeDb();

jest.mock('firebase-admin/firestore', () => ({
	getFirestore: () => fakeDb,
}));

import { buildOdysseyDigest, type DigestTranslationCache } from '../digest/odysseyDigestBuilder';

const USER = 'user-1';
const GAME = 'default';
const UNSUBSCRIBE = 'https://fns.example/odysseyDigestUnsubscribe?userId=user-1&t=abc';

function seedSea(): void {
	fakeDb.seed(Collections.odysseyGames, GAME, {
		gameId: GAME,
		rootStatementId: 'root',
		texts: { gameTitle: 'אודיסיאה ישראלית' },
		compassQuestions: [],
		values: [],
		islands: [
			{ statementId: 'island-1', title: 'שלטון החוק', enabled: true, sortOrder: 1 },
			{ statementId: 'island-2', title: 'חינוך', enabled: true, sortOrder: 2 },
		],
		parties: [],
		elders: [
			{
				elderId: 'golda',
				name: 'גולדה מאיר',
				role: 'ראשת הממשלה',
				color: '#fff',
				bio: '',
				needs: [],
				values: [],
				positions: { 'island-1': 'stance-1' },
				reactions: {},
				challenges: { 'island-1': 'אתגר בעברית' },
				sortOrder: 1,
				enabled: true,
			},
		],
		adminUids: [],
		creatorId: 'admin',
		createdAt: 1,
		lastUpdate: 1,
	});
	fakeDb.seed(Collections.statements, 'stance-1', { statementId: 'stance-1', statement: 'חוף א' });
	fakeDb.seed(Collections.statements, 'stance-2', { statementId: 'stance-2', statement: 'חוף ב' });
	const evaluation = (
		id: string,
		evaluatorId: string,
		statementId: string,
		value: number,
		updatedAt: number,
	): void =>
		fakeDb.seed(Collections.evaluations, id, {
			evaluationId: id,
			parentId: 'island-1',
			statementId,
			evaluatorId,
			evaluation: value,
			updatedAt,
			[ODYSSEY_GAME_FIELD]: GAME,
		});
	evaluation('e1', USER, 'stance-1', 1, 100);
	evaluation('e2', 'other-1', 'stance-1', -1, 2000);
	evaluation('e3', 'other-1', 'stance-2', 1, 2000);
	fakeDb.seed(Collections.odysseyDigestState, USER, {
		userId: USER,
		lastDigestAt: 1000,
		islandTopStances: { 'island-1': 'stance-1' },
		lastElderId: '',
		lastUpdate: 1000,
	});
}

function seedJourney(lang?: string): void {
	fakeDb.seed(Collections.odysseyJourneys, `${USER}--${GAME}`, {
		journeyId: `${USER}--${GAME}`,
		gameId: GAME,
		userId: USER,
		compassAnswers: {},
		valueRankings: {},
		selectedIslandIds: [],
		depthAnswers: {},
		logEntries: [],
		createdAt: 1,
		lastUpdate: 1,
		...(lang ? { lang } : {}),
	});
}

function seedEnglishOverlay(): void {
	fakeDb.seed(odysseyTranslationsPath(GAME), 'en', {
		gameId: GAME,
		lang: 'en',
		updatedAt: 5,
		texts: { gameTitle: 'Israeli Odyssey' },
		islands: { 'island-1': { title: 'Rule of Law' }, 'island-2': { title: 'Education' } },
		stances: { 'stance-2': 'Shore B' },
		elders: {
			golda: {
				name: 'Golda Meir',
				role: 'Prime Minister',
				challenges: { 'island-1': 'Challenge EN' },
			},
		},
	});
}

async function build(translations?: DigestTranslationCache) {
	return buildOdysseyDigest({
		userId: USER,
		gameId: GAME,
		appBaseUrl: 'https://odyssey.example/',
		unsubscribeUrl: UNSUBSCRIBE,
		translations,
	});
}

describe('buildOdysseyDigest languages', () => {
	beforeEach(() => {
		fakeDb.reset();
		seedSea();
	});

	it('writes the Hebrew digest exactly as before for a journey without a language', async () => {
		seedJourney();
		seedEnglishOverlay();

		const built = await build();

		expect(built).not.toBeNull();
		const digest = built!.digest;
		expect(digest.lang).toBe('he');
		expect(digest.subject).toBe('אודיסיאה ישראלית: הרוח התהפכה באי שלטון החוק');
		expect(digest.bodyText).toBe(
			[
				'1 מפליגים סימנו עמדות חדשות בים מאז הביקור האחרון שלכם.',
				'באי שלטון החוק הרוח התהפכה — החוף המוביל עכשיו: "חוף ב".',
				'אי אחד עוד מחכה לכם: חינוך.',
				'גולדה מאיר: "אתגר בעברית"',
				'חזרו אל המפה: https://odyssey.example/map',
			].join('\n'),
		);
		expect(digest.emailHtml).toContain('<html dir="rtl" lang="he">');
		expect(digest.emailHtml).toContain('border-right:4px solid');
		expect(digest.emailHtml).toContain('padding:0 18px 0 0;');
		expect(digest.emailHtml).toContain('סיפור המסע שלכם — מה קרה בים מאז שירדתם לחוף');
		expect(digest.emailHtml).toContain('>חזרה אל הים ⛵</a>');
		expect(digest.emailHtml).toContain('דמות בינה מלאכותית בהשראת דמות היסטורית');
		expect(digest.unsubscribeUrl).toBe(UNSUBSCRIBE);
	});

	it('never reads the overlay for a Hebrew reader', async () => {
		seedJourney('he');
		seedEnglishOverlay();
		const reads = jest.spyOn(fakeDb, 'collection');

		await build();

		expect(reads.mock.calls.map(([name]) => name)).not.toContain(odysseyTranslationsPath(GAME));
		reads.mockRestore();
	});

	it('speaks English, left to right, with the overlay titles, shores and elder', async () => {
		seedJourney('en');
		seedEnglishOverlay();

		const digest = (await build())!.digest;

		expect(digest.lang).toBe('en');
		expect(digest.subject).toBe('Israeli Odyssey: the wind has turned on Rule of Law');
		expect(digest.bodyText).toBe(
			[
				'1 sailors marked new positions at sea since your last visit.',
				'On Rule of Law island the wind has turned — the leading shore is now: "Shore B".',
				'One island is still waiting for you: Education.',
				'Golda Meir: "Challenge EN"',
				'Back to the map: https://odyssey.example/map',
			].join('\n'),
		);
		expect(digest.emailHtml).toContain('<html dir="ltr" lang="en">');
		expect(digest.emailHtml).toContain('border-left:4px solid');
		expect(digest.emailHtml).toContain('padding:0 0 0 18px;');
		expect(digest.emailHtml).toContain('Prime Minister');
		expect(digest.emailHtml).toContain('>Unsubscribe</a>');
		expect(digest.unsubscribeUrl).toBe(`${UNSUBSCRIBE}&lang=en`);
		expect(digest.emailHtml).toContain(`href="${UNSUBSCRIBE}&lang=en"`);
	});

	it('speaks Arabic over the Hebrew content when no Arabic overlay exists', async () => {
		seedJourney('ar');

		const digest = (await build())!.digest;

		expect(digest.lang).toBe('ar');
		expect(digest.subject).toBe('אודיסיאה ישראלית: انقلبت الريح في جزيرة שלטון החוק');
		expect(digest.bodyText).toContain(
			'في جزيرة שלטון החוק انقلبت الريح — الشاطئ المتقدّم الآن: "חוף ב".',
		);
		expect(digest.bodyText).toContain('جزيرة واحدة ما زالت تنتظركم: חינוך.');
		expect(digest.emailHtml).toContain('<html dir="rtl" lang="ar">');
		expect(digest.unsubscribeUrl).toBe(`${UNSUBSCRIBE}&lang=ar`);
	});

	it('falls back to Hebrew per field inside a partial overlay', async () => {
		seedJourney('en');
		fakeDb.seed(odysseyTranslationsPath(GAME), 'en', {
			gameId: GAME,
			lang: 'en',
			updatedAt: 5,
			islands: { 'island-1': { title: 'Rule of Law' } },
		});

		const digest = (await build())!.digest;

		expect(digest.subject).toBe('אודיסיאה ישראלית: the wind has turned on Rule of Law');
		expect(digest.bodyText).toContain('"חוף ב"');
		expect(digest.bodyText).toContain('One island is still waiting for you: חינוך.');
		expect(digest.bodyText).toContain('גולדה מאיר: "אתגר בעברית"');
	});

	it('reads one overlay per game and language across a run', async () => {
		seedJourney('en');
		seedEnglishOverlay();
		const cache: DigestTranslationCache = new Map();
		const reads = jest.spyOn(fakeDb, 'collection');

		await build(cache);
		await build(cache);

		const overlayReads = reads.mock.calls.filter(
			([name]) => name === odysseyTranslationsPath(GAME),
		);
		expect(overlayReads).toHaveLength(1);
		expect(cache.get(`${GAME}:en`)).toMatchObject({ lang: 'en' });
		reads.mockRestore();
	});

	it('still sends nothing when nothing moved', async () => {
		seedJourney('en');
		fakeDb.seed(Collections.odysseyDigestState, USER, {
			userId: USER,
			lastDigestAt: 5000,
			islandTopStances: { 'island-1': 'stance-2' },
			lastElderId: '',
			lastUpdate: 5000,
		});

		expect(await build()).toBeNull();
	});
});
