import { describe, expect, it } from 'vitest';
import type { AgoraTeacherMessage } from '@freedi/shared-types';
import {
	languagePlaceKey,
	markLanguageSeen,
	pendingLanguageAlerts,
	pendingWallStrikes,
	readLanguageSeen,
} from './languageAlerts';

function line(overrides: Partial<AgoraTeacherMessage>): AgoraTeacherMessage {
	return {
		messageId: 'm',
		sessionId: 's1',
		teacherId: 't1',
		studentUid: 'u1',
		from: 'system',
		kind: 'language',
		text: '',
		createdAt: 100,
		...overrides,
	};
}

describe('pendingLanguageAlerts', () => {
	it('turns every unseen language line into an alert, newest first, with its words', () => {
		const threads = new Map<string, AgoraTeacherMessage[]>([
			[
				'u1',
				[
					line({ messageId: 'a', createdAt: 100, removedText: 'first', languagePlace: 'note' }),
					line({ messageId: 'n', from: 'teacher', kind: 'note', text: 'hi', createdAt: 150 }),
				],
			],
			[
				'u2',
				[
					line({
						messageId: 'b',
						studentUid: 'u2',
						createdAt: 200,
						removedText: 'second',
						languagePlace: 'answer',
						languageItemId: 'q1',
						aboutStatementId: 'st',
					}),
				],
			],
		]);
		const alerts = pendingLanguageAlerts(threads, 0);
		expect(alerts.map((alert) => alert.messageId)).toEqual(['b', 'a']);
		expect(alerts[0]).toEqual({
			messageId: 'b',
			studentUid: 'u2',
			createdAt: 200,
			text: 'second',
			place: 'answer',
			itemId: 'q1',
			aboutStatementId: 'st',
		});
		expect(alerts[1]).toMatchObject({ text: 'first', place: 'note' });
	});

	it('drops what the teacher already acknowledged', () => {
		const threads = new Map([
			['u1', [line({ createdAt: 100 }), line({ messageId: 'x', createdAt: 300 })]],
		]);
		expect(pendingLanguageAlerts(threads, 100).map((alert) => alert.messageId)).toEqual(['x']);
		expect(pendingLanguageAlerts(threads, 300)).toEqual([]);
	});

	it('ignores a place it does not know rather than mislabelling it', () => {
		const threads = new Map([['u1', [line({ languagePlace: 'hologram' })]]]);
		expect(pendingLanguageAlerts(threads, 0)[0].place).toBeUndefined();
	});
});

describe('pendingWallStrikes', () => {
	it('counts students struck after the watermark, never naming them', () => {
		const result = pendingWallStrikes(
			[
				{ lastLanguageStrikeAt: 50 },
				{ lastLanguageStrikeAt: 500 },
				{},
				{ lastLanguageStrikeAt: 900 },
			],
			100,
		);
		expect(result).toEqual({ count: 2, latest: 900 });
	});
});

describe('languagePlaceKey', () => {
	it('names the place, or says it is unknown', () => {
		expect(languagePlaceKey('improvement')).toBe('teacher.language_alert.place_improvement');
		expect(languagePlaceKey(undefined)).toBe('teacher.language_alert.place_unknown');
	});
});

describe('the seen watermark', () => {
	function memoryStorage(): {
		getItem: (key: string) => string | null;
		setItem: (key: string, value: string) => void;
	} {
		const map = new Map<string, string>();

		return {
			getItem: (key) => map.get(key) ?? null,
			setItem: (key, value) => {
				map.set(key, value);
			},
		};
	}

	it('starts at zero and never moves backwards', () => {
		const storage = memoryStorage();
		expect(readLanguageSeen('s1', storage)).toBe(0);
		expect(markLanguageSeen('s1', 500, storage)).toBe(500);
		expect(markLanguageSeen('s1', 200, storage)).toBe(500);
		expect(readLanguageSeen('s1', storage)).toBe(500);
		expect(readLanguageSeen('s2', storage)).toBe(0);
	});

	it('reads zero when storage refuses', () => {
		const broken = {
			getItem: (): string | null => {
				throw new Error('denied');
			},
			setItem: (): void => {
				throw new Error('denied');
			},
		};
		expect(readLanguageSeen('s1', broken)).toBe(0);
		expect(markLanguageSeen('s1', 50, broken)).toBe(50);
	});
});
