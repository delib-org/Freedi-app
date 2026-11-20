import m from 'mithril';
import type { LessonStatus, LessonStepKey, Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { nextActionFor } from '@/lib/classroom/nextAction';
import type { CopyOffer } from '@/lib/classroom/registrationLogic';
import type { ClassStatusInput } from '@/lib/classroom/classStatus';
import { consoleStepLabel } from '@/lib/classroom/consoleStepLabel';
import { ClassStatusLine } from './ClassStatusLine';
import { NextAction, nextActionLabel } from './NextAction';
import { StepMore } from './StepMore';
import { icon } from './ConsoleIcon';
import { changeLessonStatus } from './consoleActions';
import { isBusy } from './consoleState';
import { watchDockHeight } from './dockHeight';

/**
 * The action band (design 1): where the teacher presses. On a laptop it is pinned under the
 * step line; on a phone it is a dock fixed to the bottom edge, so the thumb always reaches
 * the one primary button, and the lesson pause sits beside it as an icon button (the top bar
 * scrolls away there).
 */

export interface ActionBandAttrs {
	mid: string;
	status: LessonStatus;
	stepKey: LessonStepKey;
	stepIndex: number;
	steps: readonly LessonStepKey[];
	challenge: Statement | null;
	ballotFrozen: boolean;
	ballotClosed: boolean;
	votedCount: number;
	presentCount: number;
	proposalCount: number;
	tableCount: number;
	studentCount: number;
	copyOffer: CopyOffer;
	resultsShown: boolean;
	/** The status line's numbers, read from the live console. */
	statusInput: ClassStatusInput;
	/** The "no device (x/y)" entry, drawn inside the status line at Proposals. */
	statusEntry?: m.Children;
	main: Statement | null;
	plenum: boolean;
	connected: boolean;
	registrationId?: string;
}

/** The dock's pause: icon only, with a real name. Hidden on a laptop, where the top bar keeps the labelled one. */
function dockPause(attrs: ActionBandAttrs): m.Children {
	if (attrs.status !== 'live' && attrs.status !== 'open') return null;
	const pausing = isBusy('status:pause') || isBusy('status:resume');

	return m(
		'button.btn.btn--secondary.action-band__pause',
		{
			type: 'button',
			'aria-label': t('console.pause'),
			'data-testid': 'console-pause-dock',
			disabled: pausing,
			'aria-busy': pausing ? 'true' : undefined,
			onclick: () => void changeLessonStatus(attrs.mid, 'pause'),
		},
		icon('pause'),
	);
}

interface BandState {
	stopWatching?: () => void;
}

export const ActionBand: m.Component<ActionBandAttrs> = {
	oncreate(vnode) {
		(vnode.state as BandState).stopWatching = watchDockHeight(vnode.dom as HTMLElement);
	},

	onremove(vnode) {
		(vnode.state as BandState).stopWatching?.();
	},

	view({ attrs }) {
		const { copyOffer } = attrs;
		const spec = nextActionFor({
			status: attrs.status,
			stepKey: attrs.stepKey,
			stepIndex: attrs.stepIndex,
			steps: attrs.steps,
			hasChallenge: attrs.challenge !== null,
			ballotFrozen: attrs.ballotFrozen,
			ballotClosed: attrs.ballotClosed,
			votedCount: attrs.votedCount,
			presentCount: attrs.presentCount,
			proposalCount: attrs.proposalCount,
			tableCount: attrs.tableCount,
			studentCount: attrs.studentCount,
			connected: attrs.connected,
			copyPending: copyOffer.kind === 'copy' || copyOffer.kind === 'not-ready',
			resultsShown: attrs.resultsShown,
		});

		const next = {
			mid: attrs.mid,
			spec,
			challengeId: attrs.challenge?.statementId ?? null,
			copyBlockedKey: copyOffer.kind === 'not-ready' ? copyOffer.reasonKey : undefined,
		};

		return m('section.action-band', { 'aria-label': t('console.next_action_label') }, [
			m(ClassStatusLine, {
				input: attrs.statusInput,
				words: {
					stepName: consoleStepLabel(attrs.stepKey),
					primaryLabel: nextActionLabel(next),
				},
				entry: attrs.statusEntry,
			}),
			m('div.action-band__controls', [
				m(NextAction, next),
				m(StepMore, {
					mid: attrs.mid,
					status: attrs.status,
					stepKey: attrs.stepKey,
					steps: attrs.steps,
					challenge: attrs.challenge,
					main: attrs.main,
					hasTables: attrs.tableCount > 0,
					plenum: attrs.plenum,
					connected: attrs.connected,
					registrationId: attrs.registrationId,
					copyOffer,
				}),
				dockPause(attrs),
			]),
		]);
	},
};
