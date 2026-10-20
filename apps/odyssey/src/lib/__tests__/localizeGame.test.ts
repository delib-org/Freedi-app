import { describe, expect, it } from 'vitest';
import type {
	OdysseyElder,
	OdysseyGame,
	OdysseyGameTranslation,
	Statement,
} from '@freedi/shared-types';
import type { GameContent, IslandContent } from '../game';
import { localizeElder, localizeGame, siblingChip } from '../localizeGame';

function statement(statementId: string, text: string): Statement {
	return { statementId, statement: text } as unknown as Statement;
}

function elder(): OdysseyElder {
	return {
		elderId: 'golda',
		name: 'גולדה מאיר',
		role: 'ראשת הממשלה',
		years: '1898–1978',
		portraitUrl: null,
		color: '#abc',
		bio: 'ביוגרפיה',
		needs: ['ביטחון', 'סולידריות'],
		values: [{ valueId: 'solidarity', label: 'סולידריות', description: 'ערבות הדדית' }],
		positions: { 'island-1': 'stance-1' },
		reactions: { 'stance-1': 'תגובה', 'stance-2': 'תגובה נגדית' },
		challenges: { 'island-1': 'אתגר' },
		counsel: { 'island-1': { 'stance-1': 'עצה', 'stance-2': 'עצה אחרת' } },
		sortOrder: 1,
		enabled: true,
	};
}

function game(): OdysseyGame {
	return {
		gameId: 'default',
		rootStatementId: 'root',
		texts: { gameTitle: 'אודיסיאה', agoraOrigin: 'https://agora.example' },
		compassQuestions: [
			{
				questionId: 'q1',
				title: 'רוח האהבה',
				prompt: 'מה אתם אוהבים?',
				chips: ['ים', 'הרים', 'מדבר'],
				sortOrder: 1,
				enabled: true,
			},
		],
		values: [
			{ valueId: 'value-1', label: 'חירות', sortOrder: 1, enabled: true },
			{ valueId: 'value-2', label: 'שוויון', sortOrder: 2, enabled: true },
		],
		islands: [],
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
		elders: [elder()],
		adminUids: [],
		creatorId: 'admin',
		createdAt: 1,
		lastUpdate: 1,
	};
}

function island(): IslandContent {
	return {
		statementId: 'island-1',
		title: 'שלטון החוק',
		issue: 'סוגיה',
		shortExplain: 'הסבר',
		opening: 'פתיחה',
		depthQuestion: 'שאלת עומק',
		posX: 10,
		posY: 20,
		sortOrder: 1,
		enabled: true,
		statement: statement('island-1', 'מהי השאלה?'),
		stances: [statement('stance-1', 'חוף א'), statement('stance-2', 'חוף ב')],
	};
}

function content(): GameContent {
	return { game: game(), islands: [island()] };
}

function translation(): OdysseyGameTranslation {
	return {
		gameId: 'default',
		lang: 'en',
		updatedAt: 2,
		texts: { gameTitle: 'Odyssey', unknownKey: 'ignored' },
		compassQuestions: { q1: { title: 'Wind of Love', chips: ['Sea', '', 'Desert'] } },
		values: { 'value-1': 'Liberty' },
		islands: { 'island-1': { title: 'Rule of Law', question: 'What is the question?' } },
		stances: { 'stance-1': 'Shore A' },
		parties: { p1: { name: 'Party' } },
		elders: {
			golda: {
				name: 'Golda Meir',
				needs: ['Security'],
				values: { solidarity: { label: 'Solidarity' } },
				reactions: { 'stance-1': 'Reaction' },
				counsel: { 'island-1': { 'stance-2': 'Other counsel' } },
			},
		},
	};
}

describe('localizeGame', () => {
	it('returns the same object when there is no translation', () => {
		const source = content();

		expect(localizeGame(source, null)).toBe(source);
	});

	it('does not mutate the canonical content', () => {
		const source = content();
		const snapshot = JSON.stringify(source);
		localizeGame(source, translation());

		expect(JSON.stringify(source)).toBe(snapshot);
	});

	it('overlays translated screen texts and keeps config keys and unknown keys out', () => {
		const localized = localizeGame(content(), translation());

		expect(localized.game.texts.gameTitle).toBe('Odyssey');
		expect(localized.game.texts.agoraOrigin).toBe('https://agora.example');
		expect(localized.game.texts).not.toHaveProperty('unknownKey');
	});

	it('translates compass chips by index and keeps the Hebrew for a blank entry', () => {
		const [question] = localizeGame(content(), translation()).game.compassQuestions;

		expect(question.title).toBe('Wind of Love');
		expect(question.prompt).toBe('מה אתם אוהבים?');
		expect(question.chips).toEqual(['Sea', 'הרים', 'Desert']);
	});

	it('falls back per value, party and island field', () => {
		const localized = localizeGame(content(), translation());

		expect(localized.game.values.map((value) => value.label)).toEqual(['Liberty', 'שוויון']);
		expect(localized.game.parties[0]).toMatchObject({ name: 'Party', description: 'תיאור' });
		expect(localized.islands[0]).toMatchObject({
			statementId: 'island-1',
			title: 'Rule of Law',
			issue: 'סוגיה',
			posX: 10,
		});
	});

	it('translates the island question and stance texts on their Statements', () => {
		const [localizedIsland] = localizeGame(content(), translation()).islands;

		expect(localizedIsland.statement.statement).toBe('What is the question?');
		expect(localizedIsland.statement.statementId).toBe('island-1');
		expect(localizedIsland.stances.map((stance) => stance.statement)).toEqual(['Shore A', 'חוף ב']);
	});

	it('keeps the stance Statement objects when no stance is translated', () => {
		const source = content();
		const withoutStances = { ...translation(), stances: undefined };

		expect(localizeGame(source, withoutStances).islands[0].stances[0]).toBe(
			source.islands[0].stances[0],
		);
	});

	it('leaves islands without a translation entry untouched except stances', () => {
		const source = content();
		const localized = localizeGame(source, { ...translation(), islands: undefined });

		expect(localized.islands[0].title).toBe('שלטון החוק');
		expect(localized.islands[0].stances[0].statement).toBe('Shore A');
	});
});

describe('localizeElder', () => {
	it('returns the elder itself when there is nothing to overlay', () => {
		const source = elder();

		expect(localizeElder(source, undefined)).toBe(source);
	});

	it('translates every display field and keeps ids, colour and positions', () => {
		const localized = localizeElder(elder(), translation().elders?.golda);

		expect(localized).toMatchObject({
			elderId: 'golda',
			name: 'Golda Meir',
			role: 'ראשת הממשלה',
			color: '#abc',
			positions: { 'island-1': 'stance-1' },
			needs: ['Security', 'סולידריות'],
			reactions: { 'stance-1': 'Reaction', 'stance-2': 'תגובה נגדית' },
			challenges: { 'island-1': 'אתגר' },
			counsel: { 'island-1': { 'stance-1': 'עצה', 'stance-2': 'Other counsel' } },
		});
		expect(localized.values[0]).toEqual({
			valueId: 'solidarity',
			label: 'Solidarity',
			description: 'ערבות הדדית',
		});
	});

	it('keeps an absent counsel absent', () => {
		const source = { ...elder(), counsel: undefined };

		expect(localizeElder(source, { counsel: { 'island-1': { 'stance-1': 'x' } } }).counsel).toBe(
			undefined,
		);
	});
});

describe('siblingChip', () => {
	const canonical = content();
	const localized = localizeGame(canonical, translation());

	it('walks a displayed chip back to the Hebrew chip at the same index', () => {
		expect(siblingChip(localized, canonical, 'q1', 'Desert')).toBe('מדבר');
	});

	it('walks a stored Hebrew chip forward to its displayed twin', () => {
		expect(siblingChip(canonical, localized, 'q1', 'ים')).toBe('Sea');
	});

	it('returns the chip unchanged when it is not one of the question chips', () => {
		expect(siblingChip(localized, canonical, 'q1', 'free text')).toBe('free text');
	});

	it('returns the chip unchanged for an unknown question or when both copies are the same', () => {
		expect(siblingChip(localized, canonical, 'nope', 'Sea')).toBe('Sea');
		expect(siblingChip(canonical, canonical, 'q1', 'ים')).toBe('ים');
		expect(siblingChip(null, canonical, 'q1', 'ים')).toBe('ים');
	});
});
