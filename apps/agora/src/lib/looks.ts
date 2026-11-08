import m from 'mithril';
import { db, doc, updateDoc } from './firebase';
import {
	AgoraCustomTheme,
	AgoraParticipant,
	AgoraResolvedTheme,
	AgoraThemeChoice,
	AgoraThemeSeeds,
	Collections,
	createAgoraParticipantId,
	resolveAgoraTheme,
} from '@freedi/shared-types';
import { getSessionState } from './session';
import { getUserState } from './user';
import { paintTheme } from './theme';

/**
 * The student's own look: what they wear, what they build, and what the
 * class has built between them.
 *
 * A look is four seed colours (see shared-types agoraTheme.ts) and the
 * stylesheet grows the rest. The seeds are picked from swatches rather than
 * typed, and the swatch lists are the contract that keeps a built look
 * readable: every MINE and PEER swatch carries white text at AA or better on
 * its own (measured, 4.5:1 minimum), and every GO swatch is bright enough to
 * carry the dark ink the app puts on a progress fill. A free colour picker
 * would hand a fourteen-year-old lemon-yellow buttons with white labels, and
 * the contrast audit only runs on the presets.
 */

export interface LookSwatch {
	hex: string;
	/** i18n key of the swatch's name — the swatch is a coloured disc, so the name is its label */
	nameKey: string;
}

/** Light papers only: ink stays dark, so nothing on the page has to invert */
const PAGE_SWATCHES: readonly LookSwatch[] = [
	{ hex: '#ffffff', nameKey: 'swatch.snow' },
	{ hex: '#fff5fa', nameKey: 'swatch.cotton' },
	{ hex: '#effff5', nameKey: 'swatch.mint_cream' },
	{ hex: '#eef7ff', nameKey: 'swatch.sky_cream' },
	{ hex: '#fffbe3', nameKey: 'swatch.lemon_cream' },
	{ hex: '#f6f1ff', nameKey: 'swatch.lavender' },
	{ hex: '#fff3e9', nameKey: 'swatch.peach' },
];

/** Vivid fills that hold WHITE text: raspberry 4.8:1 … cocoa 7.3:1 */
const INK_SWATCHES: readonly LookSwatch[] = [
	{ hex: '#d81b7a', nameKey: 'swatch.raspberry' },
	{ hex: '#d62839', nameKey: 'swatch.cherry' },
	{ hex: '#c24a08', nameKey: 'swatch.tangerine' },
	{ hex: '#7b2ff2', nameKey: 'swatch.grape' },
	{ hex: '#1668d8', nameKey: 'swatch.blueberry' },
	{ hex: '#12803f', nameKey: 'swatch.apple' },
	{ hex: '#0b796b', nameKey: 'swatch.teal' },
	{ hex: '#a648d8', nameKey: 'swatch.plum' },
	{ hex: '#4a53c0', nameKey: 'swatch.indigo' },
	{ hex: '#7a4b2a', nameKey: 'swatch.cocoa' },
];

/** Bright fills that hold DARK ink: lime 8:1 … lavender 5.4:1 against the plum ink */
const GO_SWATCHES: readonly LookSwatch[] = [
	{ hex: '#3ddc84', nameKey: 'swatch.lime' },
	{ hex: '#ffd400', nameKey: 'swatch.lemon' },
	{ hex: '#ff9f1c', nameKey: 'swatch.orange' },
	{ hex: '#4fc3f7', nameKey: 'swatch.sky' },
	{ hex: '#ff6ec0', nameKey: 'swatch.bubblegum' },
	{ hex: '#c084fc', nameKey: 'swatch.lilac' },
];

export const LOOK_SWATCHES: Record<keyof AgoraThemeSeeds, readonly LookSwatch[]> = {
	page: PAGE_SWATCHES,
	mine: INK_SWATCHES,
	peer: INK_SWATCHES,
	go: GO_SWATCHES,
};

/** Candy's own seeds — the builder opens on them, so "build my own" starts from the default look */
export const DEFAULT_SEEDS: AgoraThemeSeeds = {
	page: '#fff5fa',
	mine: '#d81b7a',
	peer: '#1668d8',
	go: '#3ddc84',
};

/** The order the seeds are offered in — paper first, then the two inks, then go */
export const SEED_ORDER: ReadonlyArray<keyof AgoraThemeSeeds> = ['page', 'mine', 'peer', 'go'];

/**
 * How many proposal hues the candy look carries — see `_theme-candy-game.scss`.
 * Twelve vivid fills, every one measured to hold white text at AA; raspberry
 * is not among them, because raspberry is MINE and a classmate's proposal
 * wearing it would say "yours".
 */
export const PROPOSAL_HUES = 12;

/**
 * The candy hue a numbered proposal wears — on the square, on the results
 * map, in its callout — so a proposal is the same colour everywhere it
 * appears. Keyed on the proposal's number (its place in the room's list)
 * rather than its rank, because a rank moves as the class rates and a
 * colour that moves with it stops identifying anything. Wraps past twelve.
 */
export function proposalHue(number: number): number {
	return ((Math.max(1, Math.floor(number)) - 1) % PROPOSAL_HUES) + 1;
}

export interface ClassLook {
	look: AgoraCustomTheme;
	/** The maker's name in this room, for the "by …" line */
	makerName: string;
	/** Whether the maker is the person looking at the list */
	mine: boolean;
}

/**
 * Every look the class has built, newest first. Read straight off the
 * participant docs everyone already listens to: a student's `builtTheme` IS
 * their entry on the list, so there is no second collection to keep in step.
 */
export function classLooks(
	participants: readonly AgoraParticipant[],
	myUserId: string | undefined,
): ClassLook[] {
	return participants
		.filter((participant) => participant.builtTheme && !participant.isAI)
		.map((participant) => ({
			look: participant.builtTheme as AgoraCustomTheme,
			makerName: participant.displayName ?? participant.anonName,
			mine: participant.userId === myUserId,
		}))
		.sort((a, b) => b.look.createdAt - a.look.createdAt);
}

/** Two looks are the same look if the same person built them at the same moment */
export function sameLook(a: AgoraCustomTheme, b: AgoraCustomTheme): boolean {
	return a.authorId === b.authorId && a.createdAt === b.createdAt;
}

/** Is this resolved look the given class look? */
export function isWearing(resolved: AgoraResolvedTheme, look: AgoraCustomTheme): boolean {
	return resolved.kind === 'custom' && sameLook(resolved.custom, look);
}

function myDoc(): { sessionId: string; userId: string } | null {
	const sessionId = getSessionState().session?.sessionId;
	const userId = getUserState().user?.uid;
	if (!sessionId || !userId) return null;

	return { sessionId, userId };
}

/**
 * Put a look on. Painted at once, then written: the doc is canonical and the
 * listener repaints from it, but a student who taps a swatch should see the
 * screen change under their finger, not a round trip later. Losing the write
 * costs a repaint on the next load, never a payout, so it is not a confirmed
 * write.
 *
 * `null` means "wear whatever the room wears".
 */
export async function wearLook(choice: AgoraThemeChoice | null): Promise<void> {
	const { session, myParticipant } = getSessionState();
	paintTheme(resolveAgoraTheme(session, { theme: choice }));
	m.redraw();

	const target = myDoc();
	if (!target || !myParticipant) return;
	try {
		await updateDoc(
			doc(
				db,
				Collections.agoraParticipants,
				createAgoraParticipantId(target.sessionId, target.userId),
			),
			{ theme: choice, lastActive: Date.now() },
		);
	} catch (error) {
		console.error('[Looks] Saving the chosen look failed:', error);
	}
}

/**
 * Build a look of my own, and wear it. One built look per student — building
 * again replaces it on the class list, but classmates already wearing the old
 * one keep their copy (see AgoraThemeChoice).
 */
export async function buildLook(
	name: string,
	seeds: AgoraThemeSeeds,
	font?: string,
): Promise<void> {
	const target = myDoc();
	if (!target) return;
	const look: AgoraCustomTheme = {
		name: name.trim(),
		authorId: target.userId,
		seeds,
		...(font ? { font } : {}),
		createdAt: Date.now(),
	};
	const choice: AgoraThemeChoice = { preset: 'custom', custom: look };
	paintTheme({ kind: 'custom', custom: look });
	m.redraw();

	try {
		await updateDoc(
			doc(
				db,
				Collections.agoraParticipants,
				createAgoraParticipantId(target.sessionId, target.userId),
			),
			{ builtTheme: look, theme: choice, lastActive: Date.now() },
		);
	} catch (error) {
		console.error('[Looks] Saving the built look failed:', error);
	}
}
