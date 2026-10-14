import m from 'mithril';
import { t } from '../../lib/i18n';
import { Icon } from '../../components/Icon';
import { TeacherPanel } from './TeacherPanel';
import { MoveClassVideos, type MoveClassVideosAttrs } from './MoveClassVideos';
import { teacherStepLabel } from '../../lib/teacherSteps';
import { jumpConsequences, moveClassRows, type MoveRow } from '../../lib/flows/moveClass';
import { villagePlace, type VillageCallPlace } from '../../lib/flows/villageRoute';
import { AgoraStage, type AgoraStagePlanItem } from '@freedi/shared-types';

/**
 * "Move the class": the lesson's stations in order, each a button.
 *
 * Two moves live here and the rows keep them apart. A station the class has
 * reached GATHERS everyone there — the village walks, the room's position
 * stays, nothing closes. A station ahead OPENS it — the same advance the
 * strip's NEXT makes, behind a confirm that names what closes and what is
 * skipped. Backwards is not a move: a past station is gathered at, never
 * reopened. The rules are `lib/flows/moveClass.ts`; this only draws them.
 */
export interface MoveClassSheetAttrs {
	plan: readonly AgoraStagePlanItem[];
	currentIndex: number;
	/** Where the teacher's class view stands; equals currentIndex on the board */
	viewingIndex: number;
	currentProgress?: { done: number; total: number };
	navigation: 'teacher' | 'free';
	savingNavigation: boolean;
	onNavigation: (mode: 'teacher' | 'free') => void;
	/** The lesson runs in the village: the call walks; flat, it selects the station */
	onWalkMe: () => void;
	onGather: (place: VillageCallPlace) => void;
	onAdvance: (toIndex: number) => void;
	calling: boolean;
	advancing: boolean;
	/** A quiet line under the rows — "everyone called to …" */
	status?: string;
	/**
	 * Who has reached the place the class was last sent to (or the room's
	 * station), from the phones' own reports. Live: the list fills as they
	 * arrive, and "call again" repeats the call for the rest.
	 */
	arrivals?: {
		label: string;
		arrived: number;
		total: number;
		/** Pseudonyms of those not there yet */
		waiting: string[];
		onRecall: () => void;
	};
	/** The lesson's YouTube videos — a group under the stations; absent when there are none */
	videos?: Omit<MoveClassVideosAttrs, 'onClose'>;
	onClose: () => void;
}

/** How many stragglers are named before the list folds into "+n" */
const NAMED_WAITING = 6;

export const MOVE_SHEET_ID = 'teacher-move';

export function MoveClassSheet(): m.Component<MoveClassSheetAttrs> {
	/** A forward row waiting for its confirm */
	let confirm: MoveRow | null = null;

	return {
		view({ attrs }) {
			const { plan, currentIndex, viewingIndex, currentProgress } = attrs;
			const labelOf = (index: number): string => {
				const item = plan[index];

				return item ? item.title?.trim() || teacherStepLabel(item) : '';
			};
			const rows = moveClassRows({
				plan,
				currentIndex,
				viewingIndex,
				currentProgress,
				allowForward: true,
			});

			const advance = (row: MoveRow): void => {
				const consequences = jumpConsequences(plan, currentIndex, row.index, currentProgress);
				const needsConfirm =
					row.kind === 'jump' ||
					consequences.ends ||
					(consequences.closes !== null && consequences.closes.unfinished > 0);
				if (needsConfirm) {
					confirm = row;

					return;
				}
				attrs.onAdvance(row.index);
				attrs.onClose();
			};

			const press = (row: MoveRow): void => {
				if (row.kind === 'walk-me') {
					attrs.onWalkMe();
					attrs.onClose();
				} else if (row.kind === 'gather') {
					attrs.onGather(row.current ? 'current' : villagePlace(plan[row.index]));
				} else {
					advance(row);
				}
			};

			const meta = (row: MoveRow): m.Children => {
				switch (row.kind) {
					case 'walk-me':
						return null;
					case 'gather':
						return row.current
							? [
									m('span.move-class__here', t('teacher.move.here')),
									row.total !== undefined
										? m(
												'span.move-class__count',
												t('teacher.move.wrote', { n: row.done ?? 0, total: row.total }),
											)
										: null,
								]
							: null;
					case 'next':
						return m('span.move-class__meta', t('teacher.move.next'));
					default: {
						const { skipped, ends } = jumpConsequences(plan, currentIndex, row.index);

						return m(
							'span.move-class__meta',
							ends ? t('teacher.move.ends') : t('teacher.move.jump', { n: skipped.length }),
						);
					}
				}
			};

			const mark = (row: MoveRow): m.Children => {
				if (row.kind === 'walk-me') return m(Icon, { name: 'arrow', size: 16 });
				if (row.current) return m(Icon, { name: 'flag', size: 16 });
				if (row.kind === 'gather') return m(Icon, { name: 'check', size: 14 });

				return m('span.move-class__ring', { 'aria-hidden': 'true' });
			};

			const rowButton = (row: MoveRow): m.Children => {
				const label = row.kind === 'walk-me' ? t('teacher.move.walk_me') : labelOf(row.index);
				const aria =
					row.kind === 'gather'
						? t('teacher.move.gather_aria', { station: label })
						: row.kind === 'walk-me'
							? label
							: t('teacher.move.confirm_ok', { station: label });

				return m(
					'li.move-class__item',
					{ key: `${row.kind}:${row.itemId}` },
					m(
						'button.move-class__row',
						{
							type: 'button',
							class: [`move-class__row--${row.kind}`, row.current ? 'move-class__row--current' : '']
								.join(' ')
								.trim(),
							'data-move': row.kind,
							'data-item': row.itemId,
							'aria-label': aria,
							'aria-current': row.current ? 'step' : undefined,
							disabled: attrs.calling || attrs.advancing,
							onclick: () => press(row),
						},
						[
							m('span.move-class__mark', mark(row)),
							m('span.move-class__label', label),
							m('span.move-class__trail', meta(row)),
						],
					),
				);
			};

			const confirmBlock = (row: MoveRow): m.Children => {
				const target = labelOf(row.index);
				const { closes, skipped, ends } = jumpConsequences(
					plan,
					currentIndex,
					row.index,
					currentProgress,
				);

				return m(
					'.move-class__confirm',
					{ role: 'group', 'aria-labelledby': 'move-confirm-title' },
					[
						m('h3#move-confirm-title', t('teacher.move.confirm_title', { station: target })),
						m('ul.move-class__consequences', [
							closes
								? m(
										'li',
										closes.unfinished > 0
											? t('teacher.move.confirm_unfinished', {
													n: closes.unfinished,
													station: labelOf(currentIndex),
												})
											: t('teacher.move.confirm_closes', { station: labelOf(currentIndex) }),
									)
								: null,
							skipped.length > 0
								? m(
										'li',
										t('teacher.move.confirm_skip', {
											items: skipped
												.map((id) => labelOf(plan.findIndex((p) => p.itemId === id)))
												.join(', '),
										}),
									)
								: null,
							ends ? m('li', t('teacher.move.confirm_ends')) : null,
						]),
						m('.teacher__mode-row', [
							m(
								'button.btn.btn--primary.move-class__ok',
								{
									type: 'button',
									disabled: attrs.advancing,
									onclick: () => {
										confirm = null;
										attrs.onAdvance(row.index);
										attrs.onClose();
									},
								},
								t('teacher.move.confirm_ok', { station: target }),
							),
							m(
								'button.btn.btn--secondary',
								{
									type: 'button',
									onclick: () => {
										confirm = null;
									},
								},
								t('teacher.move.not_yet'),
							),
						]),
					],
				);
			};

			const arrivalsBlock = (
				arrivals: NonNullable<MoveClassSheetAttrs['arrivals']>,
			): m.Children => {
				const all = arrivals.total > 0 && arrivals.arrived >= arrivals.total;
				const named = arrivals.waiting.slice(0, NAMED_WAITING);
				const more = arrivals.waiting.length - named.length;

				return m(
					'.move-class__arrivals',
					{
						role: 'status',
						'aria-live': 'polite',
						'data-arrived': String(arrivals.arrived),
						'data-total': String(arrivals.total),
						class: all ? 'move-class__arrivals--all' : undefined,
					},
					[
						m('.move-class__arrivals-row', [
							m(
								'span.move-class__arrivals-count',
								all
									? t('teacher.move.all_arrived', { station: arrivals.label })
									: t('teacher.move.arrived', {
											n: arrivals.arrived,
											total: arrivals.total,
											station: arrivals.label,
										}),
							),
							m(
								'span.move-class__arrivals-bar',
								{ 'aria-hidden': 'true' },
								m('span.move-class__arrivals-fill', {
									style: {
										width: `${arrivals.total > 0 ? Math.round((arrivals.arrived / arrivals.total) * 100) : 0}%`,
									},
								}),
							),
						]),
						!all && arrivals.waiting.length > 0
							? m('p.move-class__waiting', [
									t('teacher.move.waiting_for', {
										names: named.join(' · ') + (more > 0 ? ` +${more}` : ''),
									}),
								])
							: null,
						!all && arrivals.total > 0
							? m(
									'button.btn.btn--secondary.btn--sm.move-class__recall',
									{ type: 'button', disabled: attrs.calling, onclick: arrivals.onRecall },
									t('teacher.move.call_again'),
								)
							: null,
					],
				);
			};

			const navChoice = (mode: 'teacher' | 'free', label: string): m.Children =>
				m(
					'button.btn.village-nav__choice',
					{
						type: 'button',
						role: 'radio',
						'aria-checked': String(attrs.navigation === mode),
						'data-nav': mode,
						class: attrs.navigation === mode ? 'btn--primary' : 'btn--secondary',
						disabled: attrs.savingNavigation,
						onclick: () => attrs.onNavigation(mode),
					},
					label,
				);

			return m(
				TeacherPanel,
				{ id: MOVE_SHEET_ID, title: t('teacher.move.title'), onClose: attrs.onClose },
				m('.move-class', [
					m('p.home-explanation.home-explanation--start', t('teacher.move.lead')),
					m('.teacher__mode-row', { role: 'radiogroup', 'aria-label': t('village.nav_title') }, [
						navChoice('teacher', t('village.nav_teacher')),
						navChoice('free', t('village.nav_free')),
					]),
					confirm
						? confirmBlock(confirm)
						: [
								m('ol.move-class__list', rows.map(rowButton)),
								m('p.move-class__hint', t('teacher.move.past_hint')),
								plan.some(
									(item) => item.stage === AgoraStage.voting || item.stage === AgoraStage.results,
								)
									? m(
											'button.btn.btn--secondary.btn--full.move-class__council',
											{
												type: 'button',
												disabled: attrs.calling,
												onclick: () => attrs.onGather('council'),
											},
											t('village.call_council'),
										)
									: null,
								attrs.videos
									? m(MoveClassVideos, { ...attrs.videos, onClose: attrs.onClose })
									: null,
							],
					attrs.status ? m('p.lobby__status', { role: 'status' }, attrs.status) : null,
					attrs.arrivals && !confirm ? arrivalsBlock(attrs.arrivals) : null,
				]),
			);
		},
	};
}
