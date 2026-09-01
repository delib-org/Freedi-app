import m from 'mithril';
import { t } from '../lib/i18n';
import { stalledBanner } from './StalledBanner';
import { type IconName } from './Icon';
import { HeroIcon, hasRender } from './HeroIcon';
import { Inbox } from './Inbox';

export type DelibPlace = 'mine' | 'rate' | 'help';
export type DelibStep = DelibPlace | 'done';

export interface DelibHudAttrs {
	/** Where the student is standing right now */
	step: DelibStep;
	/** Which lap of the cycle, and how many there are */
	round: number;
	rounds: number;
	/** Ratings given this lap and the lap's quota — drawn as pips, never a counter */
	rated?: number;
	ratingQuota?: number;
	/** Live round deadline, when the teacher set one */
	endsAt?: number;
	/** Standing on the class picture: the path dims, nothing on it is "here" */
	onResults?: boolean;
	/** Civic players only: the Odyssey uid whose email cadence the post box edits */
	digestUid?: string;
}

interface PlaceSpec {
	icon: IconName;
	titleKey: string;
}

/**
 * The three places of one lap. The icons are the same glyphs the splashes and
 * the step chips use — the HUD inherits the vocabulary rather than inventing a
 * second one, so this table and the one in views/Deliberation.ts move together.
 *
 * They are three OBJECTS rather than three actions now: my proposal, the
 * square, the handshake — instead of a wrench, a scale and a handshake. Two
 * reasons, and the second is the load-bearing one.
 *
 * A place is a thing you stand in, and naming it with the tool you use there
 * was always the weaker read: "my workshop" is where my proposal is, and the
 * square is the square. The rate stop even carried the class `--place-square`
 * while wearing a scale.
 *
 * And these three exist as renders. The crest is the most-looked-at icon in
 * the game and it wanted to be a rendered object; with a wrench and a scale in
 * the vocabulary it could not be, because sheet 2 does not exist yet and a
 * crest that flips register mid-lap is worse than either register alone. Three
 * objects from sheet 1 is the whole lap rendered, today.
 */
const PLACES: Record<DelibPlace, PlaceSpec> = {
	mine: { icon: 'proposal', titleKey: 'place.mine_title' },
	rate: { icon: 'square', titleKey: 'place.rate_title' },
	help: { icon: 'helped', titleKey: 'place.help_title' },
};

const ORDER: DelibPlace[] = ['mine', 'rate', 'help'];

/* Both are over HeroIcon's 24px render floor, and deliberately only just: the
 * crest tile is 42 and the stop disc is 32, so the object fills its holder the
 * way the design sim has it rather than floating in the middle of one. */
const CREST_PX = 30;
const STOP_PX = 24;

/** Below this the fuse stops being scenery and starts being a number */
const URGENT_MS = 2 * 60 * 1000;
/** The bar drains against the round length the teacher's timer was cut for */
const ROUND_MS = 8 * 60 * 1000;

/**
 * One HUD instead of four strips.
 *
 * The deliberation screens used to stack the journey strip, the cycle strip,
 * the countdown and the place banner before a single word of the actual work
 * — a quarter of a phone screen spent saying "you are here" four times over.
 * This is that answer given once, as a game HUD: the place you are standing
 * in wears its icon and its name, the lap you are on is pips, the ratings you
 * still owe are pips, and the clock is a bar that drains. Only the place name
 * survives as text.
 *
 * Nothing here is a control. The lap is walked by doing the work, so the path
 * is a read-out, exactly like the level track it looks like.
 */
export function DelibHud(): m.Component<DelibHudAttrs> {
	let ticker: ReturnType<typeof setInterval> | null = null;

	return {
		oncreate(vnode) {
			// Only a live deadline earns a repaint every second
			if (vnode.attrs.endsAt !== undefined && vnode.attrs.endsAt > Date.now()) {
				ticker = setInterval(() => m.redraw(), 1000);
			}
		},

		onremove() {
			if (ticker) clearInterval(ticker);
		},

		view(vnode) {
			const { step, round, rounds, rated, ratingQuota, endsAt, onResults, digestUid } = vnode.attrs;
			const activeIndex = ORDER.indexOf(step as DelibPlace);
			// After the laps close there is no "here" on the path — every place is
			// behind you, and the HUD says so instead of lighting a phantom step
			const done = step === 'done';
			const place = activeIndex === -1 ? undefined : PLACES[step as DelibPlace];

			const left = endsAt !== undefined ? Math.max(0, endsAt - Date.now()) : 0;
			const live = endsAt !== undefined && left > 0;
			const urgent = live && left <= URGENT_MS;
			const minutes = Math.floor(left / 60000);
			const seconds = Math.floor((left % 60000) / 1000);

			const title = onResults
				? t('delib.nav_results')
				: done
					? t('delib.cycle_done_title')
					: place
						? t(place.titleKey)
						: '';
			const crest: IconName = onResults ? 'chart' : done ? 'flag' : (place?.icon ?? 'square');

			return m(
				'header.delib-hud',
				{
					class: [
						activeIndex === -1 ? undefined : `delib-hud--${step}`,
						onResults ? 'delib-hud--results' : undefined,
					]
						.filter(Boolean)
						.join(' '),
				},
				[
					m('.delib-hud__top', [
						// The place as a crest, the way a game states the level you are
						// on: one big glyph, then its name, and nothing else
						// A rendered object supplies its own violet, so it must not be
						// given a violet tile to sit on as well — a purple glyph
						// embossed into a purple tile is unreadable at this size.
						// The drawing keeps the tile; it is a white silhouette and
						// needs the ground.
						m(
							'span.delib-hud__crest',
							{
								'aria-hidden': 'true',
								class: hasRender(crest, CREST_PX) ? 'delib-hud__crest--render' : undefined,
							},
							m(HeroIcon, { name: crest, size: CREST_PX }),
						),
						m('h1.delib-hud__title', title),
						// Laps as lanterns: the ones behind you burn, the one you are
						// on pulses. This is the whole "round 2 of 4" sentence.
						m(
							'.delib-hud__laps',
							{ 'aria-label': t('delib.cycle_round', { n: round, total: rounds }) },
							Array.from({ length: rounds }, (_unused, index) =>
								m('span.delib-hud__lap', {
									key: index,
									class:
										index + 1 < round
											? 'delib-hud__lap--done'
											: index + 1 === round
												? 'delib-hud__lap--current'
												: undefined,
								}),
							),
						),
						// The post box, at the far end of the crest row — the corner
						// opposite the place's name, which is where a mail icon is
						// looked for. It rides the HUD because the HUD is the one strip
						// present in every room of the deliberation.
						m(Inbox, { digestUid }),
					]),
					// The lap as a level track. The current step is lit and enlarged,
					// finished ones are checked, the road between them fills in.
					m(
						'.delib-hud__path',
						{ 'aria-hidden': onResults ? 'true' : undefined },
						ORDER.map((id, index) => {
							const state = done
								? 'done'
								: activeIndex === -1
									? 'todo'
									: index < activeIndex
										? 'done'
										: index === activeIndex
											? 'here'
											: 'todo';
							// The quota rides UNDER the step that owns it, so the count
							// of ratings I still owe never needs a sentence of its own
							const showPips =
								id === 'rate' && state === 'here' && ratingQuota !== undefined && ratingQuota > 0;

							return m(
								'.delib-hud__stop',
								{
									key: id,
									class: `delib-hud__stop--${state}`,
									'aria-current': state === 'here' ? 'step' : undefined,
								},
								[
									(() => {
										// A finished stop is a check — a state mark, not a
										// place — so it stays a drawing on every stop.
										const icon: IconName = state === 'done' ? 'check' : PLACES[id].icon;
										const rendered = hasRender(icon, STOP_PX);

										return m(
											'span.delib-hud__stop-icon',
											{
												'aria-hidden': 'true',
												class: rendered ? 'delib-hud__stop-icon--render' : undefined,
											},
											m(HeroIcon, { name: icon, size: STOP_PX }),
										);
									})(),
									m('span.sr-only', t(PLACES[id].titleKey)),
									showPips
										? m(
												'.delib-hud__quota',
												{
													'aria-label': t('delib.rate_progress', {
														n: rated ?? 0,
														total: ratingQuota,
													}),
												},
												Array.from({ length: ratingQuota }, (_unused, pip) =>
													m('span.delib-hud__quota-pip', {
														key: pip,
														class: pip < (rated ?? 0) ? 'delib-hud__quota-pip--done' : undefined,
													}),
												),
											)
										: null,
								],
							);
						}),
					),
					// The clock is scenery until it isn't: a bar that drains at the
					// HUD's edge, and digits only once the minute hand starts to matter
					live
						? m('.delib-hud__fuse', { class: urgent ? 'delib-hud__fuse--urgent' : undefined }, [
								m('.delib-hud__fuse-burn', {
									style: { width: `${Math.min(100, (left / ROUND_MS) * 100)}%` },
								}),
								urgent
									? m(
											'span.delib-hud__fuse-time',
											{ role: 'timer' },
											`${minutes}:${String(seconds).padStart(2, '0')}`,
										)
									: null,
							])
						: null,
					// A write still in the air after eight seconds — the shared
					// stalled-write line (see StalledBanner for why it exists).
					stalledBanner(),
				],
			);
		},
	};
}
