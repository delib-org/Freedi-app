import { safeParse } from 'valibot';
import { AgoraSessionMode } from '../models/agora/agoraEnums';
import {
	AGORA_DEFAULT_THEME,
	AgoraCustomTheme,
	AgoraCustomThemeSchema,
	AgoraThemeChoiceSchema,
	resolveAgoraTheme,
	tallyAgoraThemes,
	TallyParticipant,
} from '../models/agora/agoraTheme';

const look = (authorId: string, name = 'Lemonade'): AgoraCustomTheme => ({
	name,
	authorId,
	seeds: { page: '#fffbe6', mine: '#7b2ff2', peer: '#1668d8', go: '#ffd400' },
	createdAt: 1_756_000_000_000,
});

const student = (userId: string, extra: Partial<TallyParticipant> = {}): TallyParticipant => ({
	userId,
	...extra,
});

describe('resolveAgoraTheme', () => {
	it('defaults to candy when nobody chose', () => {
		expect(resolveAgoraTheme({}, null)).toEqual({ kind: AGORA_DEFAULT_THEME });
		expect(AGORA_DEFAULT_THEME).toBe('candy');
	});

	it('the room wears what the teacher set', () => {
		expect(resolveAgoraTheme({ theme: { preset: 'purple' } })).toEqual({ kind: 'purple' });
	});

	it("a student's own pick outranks the room's", () => {
		const resolved = resolveAgoraTheme(
			{ theme: { preset: 'purple' } },
			{ theme: { preset: 'custom', custom: look('u1') } },
		);
		expect(resolved).toEqual({ kind: 'custom', custom: look('u1') });
	});

	it('a civic square always wears Odyssey, whatever anyone picked', () => {
		expect(
			resolveAgoraTheme(
				{ sessionMode: AgoraSessionMode.civic, theme: { preset: 'purple' } },
				{ theme: { preset: 'candy' } },
			),
		).toEqual({ kind: 'civic' });
	});

	it('a custom choice with no look attached falls through to the room', () => {
		expect(resolveAgoraTheme({ theme: { preset: 'purple' } }, { theme: { preset: 'custom' } })).toEqual(
			{ kind: 'purple' },
		);
	});

	it('a null theme (a cleared field) reads as no choice', () => {
		expect(resolveAgoraTheme({ theme: null }, { theme: null })).toEqual({ kind: 'candy' });
	});
});

describe('tallyAgoraThemes', () => {
	it('counts what each student actually wore, and who built or borrowed', () => {
		const tally = tallyAgoraThemes({ theme: { preset: 'purple' } }, [
			student('a'), // follows the room
			student('b', { theme: { preset: 'candy' } }),
			student('c', { theme: { preset: 'custom', custom: look('c') }, builtTheme: look('c') }),
			student('d', { theme: { preset: 'custom', custom: look('c') } }), // wearing c's
			student('e', { builtTheme: look('e') }), // built one, wears the room's
			student('ai', { isAI: true, theme: { preset: 'candy' } }),
		]);
		expect(tally).toEqual({
			worn: { candy: 1, purple: 2, custom: 2 },
			built: 2,
			borrowed: 1,
			sessionDefault: 'purple',
		});
	});

	it('an untouched room reports the default', () => {
		expect(tallyAgoraThemes({}, []).sessionDefault).toBe('candy');
	});
});

describe('schemas', () => {
	it('accepts a well-formed choice and rejects a bad colour', () => {
		expect(safeParse(AgoraThemeChoiceSchema, { preset: 'candy' }).success).toBe(true);
		expect(safeParse(AgoraThemeChoiceSchema, { preset: 'neon' }).success).toBe(false);
		expect(
			safeParse(AgoraCustomThemeSchema, {
				...look('u1'),
				seeds: { ...look('u1').seeds, mine: 'purple' },
			}).success,
		).toBe(false);
	});

	it('trims and bounds the name', () => {
		const parsed = safeParse(AgoraCustomThemeSchema, { ...look('u1', '  Bubblegum  ') });
		expect(parsed.success && parsed.output.name).toBe('Bubblegum');
		expect(safeParse(AgoraCustomThemeSchema, look('u1', 'x'.repeat(25))).success).toBe(false);
		expect(safeParse(AgoraCustomThemeSchema, look('u1', '   ')).success).toBe(false);
	});
});
