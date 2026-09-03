import {
	object,
	string,
	number,
	optional,
	picklist,
	pipe,
	regex,
	maxLength,
	minLength,
	trim,
	InferOutput,
} from 'valibot';
import { AgoraSessionMode } from './agoraEnums';

/**
 * The looks a room can wear.
 *
 * `candy` is the default: vibrant candy-shop colours on a cotton-candy page.
 * `purple` is the look the app shipped with ("Purple Agora": mine is purple, a
 * classmate's is white). `custom` is a look a student built from a few seed
 * colours — see AgoraCustomThemeSchema. A civic square never picks: it wears
 * Odyssey's navy regardless, because it is the next room of a voyage.
 */
export const AGORA_THEME_PRESETS = ['candy', 'purple'] as const;
export type AgoraThemePreset = (typeof AGORA_THEME_PRESETS)[number];

export const AGORA_DEFAULT_THEME: AgoraThemePreset = 'candy';

export const AGORA_THEME = {
	/** A style's name is a label on a chip, not a sentence */
	MAX_NAME_LENGTH: 24,
	MIN_NAME_LENGTH: 1,
} as const;

/** `#rrggbb`, lowercase or upper — the only colour syntax a seed may carry */
export const HexColourSchema = pipe(string(), regex(/^#[0-9a-fA-F]{6}$/));

/**
 * The four colours a custom look is grown from. Everything else — the light
 * and deep rungs of each family, borders, glows, gradients — is derived in
 * the stylesheet with `color-mix()`, so a student picks four swatches and gets
 * a whole coherent palette rather than forty knobs.
 *
 *   page  the paper everything sits on (kept light, so ink stays dark)
 *   mine  the colour of what is MINE — fills that carry white text
 *   peer  a classmate's stroke: hairlines, tiles, avatar rings
 *   go    the "good / progress" accent: meters, the current lap
 */
export const AgoraThemeSeedsSchema = object({
	page: HexColourSchema,
	mine: HexColourSchema,
	peer: HexColourSchema,
	go: HexColourSchema,
});

export type AgoraThemeSeeds = InferOutput<typeof AgoraThemeSeedsSchema>;

/** A look a student built, named, and put on the class list */
export const AgoraCustomThemeSchema = object({
	name: pipe(
		string(),
		trim(),
		minLength(AGORA_THEME.MIN_NAME_LENGTH),
		maxLength(AGORA_THEME.MAX_NAME_LENGTH),
	),
	/** Who built it — kept on every copy, so a borrowed look still credits its maker */
	authorId: string(),
	seeds: AgoraThemeSeedsSchema,
	createdAt: number(),
});

export type AgoraCustomTheme = InferOutput<typeof AgoraCustomThemeSchema>;

/**
 * What a person (or a room) chose to wear. A custom choice carries its own
 * copy of the look: if the classmate who built it rebuilds theirs later, the
 * people already wearing the old one keep it.
 */
export const AgoraThemeChoiceSchema = object({
	preset: picklist([...AGORA_THEME_PRESETS, 'custom']),
	custom: optional(AgoraCustomThemeSchema),
});

export type AgoraThemeChoice = InferOutput<typeof AgoraThemeChoiceSchema>;

/** The look a screen actually paints — what `resolveAgoraTheme` answers with */
export type AgoraResolvedTheme =
	| { kind: 'civic' }
	| { kind: AgoraThemePreset }
	| { kind: 'custom'; custom: AgoraCustomTheme };

/** The subset of a session the resolver reads */
export interface ThemeSession {
	sessionMode?: AgoraSessionMode;
	theme?: AgoraThemeChoice | null;
}

/** The subset of a participant the resolver reads */
export interface ThemeParticipant {
	theme?: AgoraThemeChoice | null;
}

function fromChoice(choice: AgoraThemeChoice | null | undefined): AgoraResolvedTheme | null {
	if (!choice) return null;
	if (choice.preset === 'custom') {
		// A custom choice with no look attached is a broken write; fall through
		// to the next rung rather than paint nothing
		return choice.custom ? { kind: 'custom', custom: choice.custom } : null;
	}

	return { kind: choice.preset };
}

/**
 * Which look this screen wears, in order of who gets a say:
 *   1. a civic square wears Odyssey's colours, full stop;
 *   2. the person's own choice, if they made one;
 *   3. the room's choice, set by the teacher;
 *   4. the default.
 * The teacher's screen has no participant and so resolves at rung 3.
 */
export function resolveAgoraTheme(
	session: ThemeSession | null | undefined,
	participant?: ThemeParticipant | null,
): AgoraResolvedTheme {
	if (session?.sessionMode === AgoraSessionMode.civic) return { kind: 'civic' };

	return (
		fromChoice(participant?.theme) ??
		fromChoice(session?.theme) ?? { kind: AGORA_DEFAULT_THEME }
	);
}

/** How a finished room dressed — what the sys-admin dashboard counts */
export interface AgoraThemeTally {
	/** Students by the look they actually wore (their own pick, or the room's) */
	worn: Record<AgoraThemePreset | 'custom', number>;
	/** Students who built a look of their own */
	built: number;
	/** Students wearing a look a classmate built */
	borrowed: number;
	/** What the teacher set for the room */
	sessionDefault: AgoraThemePreset | 'custom';
}

/** The subset of a participant the tally reads */
export interface TallyParticipant extends ThemeParticipant {
	userId: string;
	isAI?: boolean;
	builtTheme?: AgoraCustomTheme | null;
}

/**
 * Count how a room dressed, once. Pure and shared, so the client can show the
 * teacher the same numbers the trigger will file. AI raters never dress.
 */
export function tallyAgoraThemes(
	session: ThemeSession,
	participants: readonly TallyParticipant[],
): AgoraThemeTally {
	const roomChoice = fromChoice(session.theme);
	const tally: AgoraThemeTally = {
		worn: { candy: 0, purple: 0, custom: 0 },
		built: 0,
		borrowed: 0,
		sessionDefault:
			roomChoice && roomChoice.kind !== 'civic' ? roomChoice.kind : AGORA_DEFAULT_THEME,
	};

	for (const participant of participants) {
		if (participant.isAI) continue;
		const resolved = resolveAgoraTheme(session, participant);
		if (resolved.kind === 'civic') continue;
		tally.worn[resolved.kind] += 1;
		if (participant.builtTheme) tally.built += 1;
		if (resolved.kind === 'custom' && resolved.custom.authorId !== participant.userId) {
			tally.borrowed += 1;
		}
	}

	return tally;
}
