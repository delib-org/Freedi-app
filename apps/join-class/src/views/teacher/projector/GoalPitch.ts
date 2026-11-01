import m from 'mithril';
import type { Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { projectorData } from '@/lib/classroom/projectorData';
import { GoalWatch, goalLayout } from '@/lib/classroom/goalBalls';
import type { GoalBall } from '@/lib/classroom/goalBalls';
import { isProjectorSoundOn, playWhistle, toggleProjectorSound } from '@/lib/projectorSound';

/**
 * The Proposals step's pitch on the projector (the Agora goal and balls,
 * ported): every proposal is a ball; the ones whose C_p has reached the gate
 * sit in the goal. When a proposal crosses the gate its ball flies in, the net
 * billows and a whistle blows (once per proposal; not for the ones already in
 * when the screen opens). The teacher turns the whistle on with one tap,
 * because browsers keep audio locked until then. Presentation only: the
 * rules live in lib/classroom/goalBalls.ts. (Trello syAIyWy3.)
 */

export interface GoalPitchAttrs {
	options: readonly Statement[];
	gate: number;
	/** Resets the "already in the goal" baseline when the lesson changes. */
	lessonKey: string;
}

/** How long a ball that just scored keeps its celebration class. */
const SCORING_MS = 1400;

let watch = new GoalWatch();
const scoringUntil = new Map<string, number>();
let netBulgeUntil = 0;

/** Entering the step starts from the current state: nothing already in the goal whistles. */
function resetPitch(): void {
	watch = new GoalWatch();
	scoringUntil.clear();
	netBulgeUntil = 0;
}

const BALL_STROKE_WIDTH = '1.6';

function noteCrossings(attrs: GoalPitchAttrs, balls: readonly GoalBall[]): void {
	const crossed = watch.update(
		attrs.lessonKey,
		projectorData.proposalsLoaded,
		balls.filter((ball) => ball.inGoal).map((ball) => ball.id),
	);
	if (crossed.length === 0) return;
	const until = Date.now() + SCORING_MS;
	for (const id of crossed) scoringUntil.set(id, until);
	netBulgeUntil = until;
	playWhistle();
	window.setTimeout(() => m.redraw(), SCORING_MS);
}

function scoring(id: string): boolean {
	return (scoringUntil.get(id) ?? 0) > Date.now();
}

function ballIcon(): m.Vnode {
	return m(
		'svg.goal-pitch__ball-icon',
		{
			viewBox: '0 0 24 24',
			stroke: 'currentColor',
			'stroke-width': BALL_STROKE_WIDTH,
			'stroke-linecap': 'round',
			'stroke-linejoin': 'round',
			'aria-hidden': 'true',
			focusable: 'false',
		},
		[
			m('circle', { cx: 12, cy: 12, r: 10.4, fill: 'var(--paper)' }),
			m('path', { d: 'M12 8.4l3.5 2.6-1.3 4.2H9.8L8.5 11z', fill: 'currentColor' }),
			m('path', {
				d: 'M12 8.4V1.9M15.5 11l6.2-2M14.2 15.2l3.8 5.2M9.8 15.2 6 20.4M8.5 11l-6.2-2',
				fill: 'none',
			}),
		],
	);
}

function ball(item: GoalBall): m.Vnode {
	return m(
		'.goal-pitch__ball',
		{
			key: item.id,
			class: [
				item.inGoal ? 'goal-pitch__ball--in' : '',
				scoring(item.id) ? 'goal-pitch__ball--scoring' : '',
			]
				.filter(Boolean)
				.join(' '),
			style: { '--x': String(item.x), '--y': String(item.y) },
		},
		ballIcon(),
	);
}

function soundButton(): m.Vnode {
	const on = isProjectorSoundOn();

	return m(
		'button.goal-pitch__sound',
		{
			type: 'button',
			'aria-pressed': String(on),
			'data-testid': 'projector-sound',
			onclick: () => {
				toggleProjectorSound();
			},
		},
		t(on ? 'projector.soundOn' : 'projector.soundOff'),
	);
}

export const GoalPitch: m.Component<GoalPitchAttrs> = {
	oninit() {
		resetPitch();
	},

	view({ attrs }) {
		const layout = goalLayout(attrs.options, attrs.gate);
		noteCrossings(attrs, layout.balls);
		const inGoal = layout.balls.filter((item) => item.inGoal).length;

		return m(
			'section.goal-pitch',
			{ 'aria-label': t('projector.goalLabel'), 'data-testid': 'projector-goal' },
			[
				m(
					'.goal-pitch__field',
					{ style: { '--size': String(layout.size) }, 'aria-hidden': 'true' },
					[
						m('.goal-pitch__goal', [
							m('.goal-pitch__net', {
								class: netBulgeUntil > Date.now() ? 'goal-pitch__net--bulge' : '',
							}),
							m('.goal-pitch__line'),
						]),
						layout.balls.map(ball),
					],
				),
				m('.goal-pitch__bar', [
					m(
						'p.goal-pitch__count',
						{ role: 'status', 'aria-live': 'polite', 'data-testid': 'projector-goal-count' },
						t(inGoal === 1 ? 'projector.goalCountOne' : 'projector.goalCount', { n: inGoal }),
					),
					soundButton(),
				]),
			],
		);
	},
};
