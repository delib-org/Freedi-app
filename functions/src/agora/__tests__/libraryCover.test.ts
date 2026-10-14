import { describe, it, expect, jest } from '@jest/globals';
import { AgoraTopicPackage, AgoraTopicStatus } from '@freedi/shared-types';

// libraryAccess imports ../db (getFirestore on an uninitialised app); all pure here.
jest.mock('../../db', () => ({ db: {} }));
// The provider module pulls in the OpenAI client; the runner takes it as an argument.
jest.mock('../libraryCoverProvider', () => ({}));

import {
	AI_COVER_PREFIX,
	coverDownloadUrl,
	coverObjectPath,
	coverPrompt,
	coverSourceOf,
	fallbackBrief,
	isAiCoverUrl,
	sceneBriefPrompt,
} from '../libraryCover';
import { runCover } from '../libraryCoverRun';
import { countCover } from '../libraryAccess';
import { isScenarioCoverUrl } from '../libraryPublish';

const pkg = {
	topicPackageId: 'sc-1',
	creatorId: 'author',
	title: 'המהפכה הצרפתית',
	framingText: 'חוזרים בזמן ל-1789',
	challengeQuestion: 'מה עושים?',
	characters: [{ name: 'רוזן', role: 'אציל' }],
	scenes: [{ title: 'ארמון' }],
	status: AgoraTopicStatus.ready,
	library: { summary: 'הכיתה מצילה את צרפת' },
} as unknown as AgoraTopicPackage;

describe('cover prompt', () => {
	it('is built from the scenario content only', () => {
		const source = coverSourceOf(pkg);
		expect(source.title).toBe('המהפכה הצרפתית');
		expect(source.summary).toBe('הכיתה מצילה את צרפת');
		expect(source.characters).toEqual(['אציל']);
		const { user } = sceneBriefPrompt(source);
		expect(user).toContain('המהפכה הצרפתית');
		expect(user).toContain('אציל');
	});

	it('prefers the summary typed in the sheet and clips long text', () => {
		const source = coverSourceOf(pkg, 'x'.repeat(2000));
		expect(source.summary.length).toBeLessThanOrEqual(600);
	});

	it('always demands no text and a child-appropriate style', () => {
		const prompt = coverPrompt('Children planting a tree');
		expect(prompt).toContain('Children planting a tree');
		expect(prompt).toMatch(/no text/i);
		expect(prompt).toMatch(/12 to 15/);
	});

	it('has a plain fallback brief', () => {
		expect(fallbackBrief(coverSourceOf(pkg))).toContain('המהפכה הצרפתית');
	});
});

describe('cover storage', () => {
	it('stores under the scenario folder and the URL passes the publish check', () => {
		const path = coverObjectPath('sc-1', 1700000000000);
		expect(path).toBe(`agora/sc-1/${AI_COVER_PREFIX}1700000000000.webp`);
		const url = coverDownloadUrl('b.firebasestorage.app', path, 'tok', undefined);
		expect(isScenarioCoverUrl(url, 'sc-1')).toBe(true);
		expect(isScenarioCoverUrl(url, 'other')).toBe(false);
		expect(isAiCoverUrl(url)).toBe(true);
		expect(isAiCoverUrl(url.replace(AI_COVER_PREFIX, 'library-cover-'))).toBe(false);
	});
});

describe('countCover', () => {
	const now = Date.UTC(2026, 9, 14, 12);
	it('counts from one on a fresh day and stops at the limit', () => {
		expect(countCover(undefined, now)).toEqual({ coversDay: '2026-10-14', coversToday: 1 });
		expect(countCover({ coversDay: '2026-10-14', coversToday: 9 }, now)?.coversToday).toBe(10);
		expect(countCover({ coversDay: '2026-10-14', coversToday: 10 }, now)).toBeNull();
	});
	it('starts over on a new day', () => {
		expect(countCover({ coversDay: '2026-10-13', coversToday: 10 }, now)?.coversToday).toBe(1);
	});
});

describe('runCover with a stubbed provider', () => {
	const source = coverSourceOf(pkg);
	const bytes = Buffer.from('webp');
	const quiet = (): void => undefined;

	it('paints the brief inside the style prompt', async () => {
		const paint = jest.fn(async (_prompt: string) => bytes);
		const outcome = await runCover(
			source,
			{ writeBrief: async () => 'A quiet square', flagged: async () => false, paint },
			quiet,
		);
		expect(outcome).toEqual({ kind: 'image', bytes });
		expect(paint.mock.calls[0][0]).toContain('A quiet square');
	});

	it('refuses, without painting, when moderation flags it', async () => {
		const paint = jest.fn(async (_prompt: string) => bytes);
		const outcome = await runCover(
			source,
			{ writeBrief: async () => 'x', flagged: async () => true, paint },
			quiet,
		);
		expect(outcome).toEqual({ kind: 'refused' });
		expect(paint).not.toHaveBeenCalled();
	});

	it('refuses when moderation itself is down', async () => {
		const outcome = await runCover(
			source,
			{
				writeBrief: async () => 'x',
				flagged: async () => {
					throw new Error('down');
				},
				paint: async () => bytes,
			},
			quiet,
		);
		expect(outcome.kind).toBe('refused');
	});

	it('falls back to the plain brief when the brief fails', async () => {
		const paint = jest.fn(async (_prompt: string) => bytes);
		await runCover(
			source,
			{
				writeBrief: async () => {
					throw new Error('llm');
				},
				flagged: async () => false,
				paint,
			},
			quiet,
		);
		expect(paint.mock.calls[0][0]).toContain('המהפכה הצרפתית');
	});
});
