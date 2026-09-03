import { describe, it, expect, vi, beforeEach } from 'vitest';
import { safeParse } from 'valibot';
import {
	AgoraCustomThemeSchema,
	AgoraThemeChoiceSchema,
	type AgoraCustomTheme,
	type AgoraParticipant,
} from '@freedi/shared-types';

/**
 * The looks module writes the student's participant doc, so firebase and the
 * two state singletons it reads are mocked; the resolver and tally are
 * covered in shared-types, and the schemas are asserted HERE because that
 * package's jest mocks valibot wholesale.
 */

const mockUpdateDoc = vi.fn<(ref: unknown, payload: Record<string, unknown>) => Promise<void>>(
	async () => {},
);
const mockDoc = vi.fn((_db: unknown, collection: string, id: string) => `${collection}/${id}`);

const sessionState: {
	session: { sessionId: string; theme?: { preset: 'candy' | 'purple' } } | null;
	myParticipant: { userId: string } | null;
} = { session: null, myParticipant: null };
const userState: { user: { uid: string } | null } = { user: null };

vi.mock('../firebase', () => ({
	db: {},
	doc: (...args: [unknown, string, string]) => mockDoc(...args),
	updateDoc: (...args: [unknown, Record<string, unknown>]) => mockUpdateDoc(...args),
}));
vi.mock('../session', () => ({ getSessionState: () => sessionState }));
vi.mock('../user', () => ({ getUserState: () => userState }));
vi.mock('mithril', () => ({ default: { redraw: () => {} } }));

const {
	classLooks,
	isWearing,
	sameLook,
	wearLook,
	buildLook,
	LOOK_SWATCHES,
	PROPOSAL_HUES,
	proposalHue,
} = await import('../looks');
const { attrOf } = await import('../theme');

const look = (authorId: string, createdAt: number, name = 'Lemonade'): AgoraCustomTheme => ({
	name,
	authorId,
	seeds: { page: '#fffbe3', mine: '#7b2ff2', peer: '#1668d8', go: '#ffd400' },
	createdAt,
});

const participant = (userId: string, extra: Partial<AgoraParticipant> = {}): AgoraParticipant => ({
	participantId: `s1--${userId}`,
	sessionId: 's1',
	userId,
	anonName: `anon-${userId}`,
	points: { valueAccuracy: 0, proposals: 0, helping: 0, total: 0 },
	joinedAt: 1,
	lastActive: 1,
	...extra,
});

beforeEach(() => {
	mockUpdateDoc.mockClear();
	mockDoc.mockClear();
	sessionState.session = { sessionId: 's1', theme: { preset: 'purple' } };
	sessionState.myParticipant = { userId: 'me' };
	userState.user = { uid: 'me' };
});

describe('schemas (real valibot)', () => {
	it('a choice names a preset, or carries the custom look it points at', () => {
		expect(safeParse(AgoraThemeChoiceSchema, { preset: 'candy' }).success).toBe(true);
		expect(safeParse(AgoraThemeChoiceSchema, { preset: 'neon' }).success).toBe(false);
		expect(
			safeParse(AgoraThemeChoiceSchema, { preset: 'custom', custom: look('u', 1) }).success,
		).toBe(true);
	});

	it('a seed is #rrggbb and nothing else', () => {
		const bad = { ...look('u', 1), seeds: { ...look('u', 1).seeds, mine: 'purple' } };
		expect(safeParse(AgoraCustomThemeSchema, bad).success).toBe(false);
		const short = { ...look('u', 1), seeds: { ...look('u', 1).seeds, mine: '#fff' } };
		expect(safeParse(AgoraCustomThemeSchema, short).success).toBe(false);
	});

	it('trims and bounds the name', () => {
		const parsed = safeParse(AgoraCustomThemeSchema, look('u', 1, '  Bubblegum  '));
		expect(parsed.success && parsed.output.name).toBe('Bubblegum');
		expect(safeParse(AgoraCustomThemeSchema, look('u', 1, 'x'.repeat(25))).success).toBe(false);
		expect(safeParse(AgoraCustomThemeSchema, look('u', 1, '   ')).success).toBe(false);
	});

	it('every swatch on offer is a valid seed', () => {
		for (const swatches of Object.values(LOOK_SWATCHES)) {
			for (const swatch of swatches) {
				expect(swatch.hex).toMatch(/^#[0-9a-f]{6}$/);
			}
		}
	});
});

describe('classLooks', () => {
	it('is every built look in the room, newest first, with its maker named', () => {
		const looks = classLooks(
			[
				participant('a', { builtTheme: look('a', 10, 'Old') }),
				participant('b', { builtTheme: look('b', 30, 'New'), displayName: 'Dana' }),
				participant('c'), // built nothing
				participant('ai', { isAI: true, builtTheme: look('ai', 99) }),
			],
			'a',
		);
		expect(looks.map((entry) => entry.look.name)).toEqual(['New', 'Old']);
		expect(looks[0].makerName).toBe('Dana');
		expect(looks[1].makerName).toBe('anon-a');
		expect(looks.map((entry) => entry.mine)).toEqual([false, true]);
	});

	it('identifies a look by its maker and moment, not its name', () => {
		expect(sameLook(look('a', 1, 'X'), look('a', 1, 'Y'))).toBe(true);
		expect(sameLook(look('a', 1), look('a', 2))).toBe(false);
		expect(isWearing({ kind: 'custom', custom: look('a', 1) }, look('a', 1))).toBe(true);
		expect(isWearing({ kind: 'candy' }, look('a', 1))).toBe(false);
	});
});

describe('wearing and building', () => {
	it('wearLook writes the choice onto my participant doc', async () => {
		await wearLook({ preset: 'candy' });
		expect(mockDoc).toHaveBeenCalledWith({}, 'agoraParticipants', 's1--me');
		expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
		expect(mockUpdateDoc.mock.calls[0][1]).toMatchObject({ theme: { preset: 'candy' } });
	});

	it('wearLook(null) clears the pick so the room look shows through', async () => {
		await wearLook(null);
		expect(mockUpdateDoc.mock.calls[0][1]).toMatchObject({ theme: null });
	});

	it('buildLook stores the look under my name and wears it at once', async () => {
		await buildLook('  Grape Soda ', look('me', 1).seeds);
		const payload = mockUpdateDoc.mock.calls[0][1] as {
			builtTheme: AgoraCustomTheme;
			theme: { preset: string; custom: AgoraCustomTheme };
		};
		expect(payload.builtTheme.name).toBe('Grape Soda');
		expect(payload.builtTheme.authorId).toBe('me');
		expect(payload.theme.preset).toBe('custom');
		expect(payload.theme.custom).toEqual(payload.builtTheme);
	});

	it('writes nothing when there is no seat to write to', async () => {
		sessionState.myParticipant = null;
		await wearLook({ preset: 'candy' });
		expect(mockUpdateDoc).not.toHaveBeenCalled();
	});

	it('a swallowed write failure is logged, not thrown', async () => {
		mockUpdateDoc.mockRejectedValueOnce(new Error('offline'));
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		await expect(wearLook({ preset: 'purple' })).resolves.toBeUndefined();
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});
});

describe('proposalHue', () => {
	it('gives the first twelve proposals twelve different colours, then wraps', () => {
		const first = Array.from({ length: PROPOSAL_HUES }, (_unused, index) => proposalHue(index + 1));
		expect(new Set(first).size).toBe(PROPOSAL_HUES);
		expect(proposalHue(PROPOSAL_HUES + 1)).toBe(proposalHue(1));
		expect(proposalHue(1)).toBe(1);
	});

	it('never yields 0 — that is reserved for mine', () => {
		expect(proposalHue(0)).toBe(1);
		expect(proposalHue(-3)).toBe(1);
	});
});

describe('attrOf', () => {
	it('is the resolved kind, which is what the stylesheet keys on', () => {
		expect(attrOf({ kind: 'civic' })).toBe('civic');
		expect(attrOf({ kind: 'custom', custom: look('a', 1) })).toBe('custom');
	});
});
