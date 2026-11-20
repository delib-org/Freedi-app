import m from 'mithril';
import { t } from '@/lib/i18n';
import { consoleStepLabel } from '@/lib/classroom/consoleStepLabel';
import type { NextActionKind, NextActionSpec } from '@/lib/classroom/nextAction';
import { captureException } from '@/lib/sentry';
import {
	assignTables,
	changeLessonStatus,
	closeBallot,
	freezeBallot,
	goToStep,
	setVoteDisplay,
} from './consoleActions';
import { isBusy } from './consoleState';
import { confirmCloseVote } from './consoleConfirms';
import { openEndChoice } from './EndChoice';
import { planBack } from './consoleBack';
import { copySeating } from './registrationActions';

/**
 * The console's ONE primary button (design 2.1): its label and work come from
 * `nextActionFor` (lib/classroom/nextAction.ts). One element that stays in place, so it keeps the
 * keyboard focus when its label changes (open the vote, close the vote, next step).
 * Not available yet: `aria-disabled` (not `disabled`) so it stays focusable and
 * is read with its reason; a tap moves focus to the reason.
 */

export interface NextActionAttrs {
	mid: string;
	spec: NextActionSpec;
	challengeId: string | null;
	/** A connected lesson not yet published: why "bring the tables" cannot work yet. */
	copyBlockedKey?: string;
}

const REASON_ID = 'next-action-reason';
const TESTID: Partial<Record<NextActionKind, string>> = {
	goNext: 'console-forward',
	resume: 'console-resume',
	endLesson: 'console-end-primary',
	openVote: 'console-freeze-vote',
	closeVote: 'console-close-vote',
	split: 'console-assign-tables',
	copySeating: 'copy-seating',
};

/** The words on the button right now (the busy words while its write runs). */
export function nextActionLabel(attrs: NextActionAttrs): string {
	const { spec } = attrs;
	if (spec.busyKey && isBusy(spec.busyKey) && spec.busyLabelKey) return t(spec.busyLabelKey);
	if (spec.kind === 'goNext' && spec.nextStepKey) {
		return t(spec.labelKey, { name: consoleStepLabel(spec.nextStepKey) });
	}
	if (spec.kind === 'backToPlan') return t(spec.labelKey, { name: planBack(attrs.mid).label });

	return t(spec.labelKey);
}

function blockedKeyOf(attrs: NextActionAttrs): string | undefined {
	if (attrs.spec.kind === 'copySeating' && attrs.copyBlockedKey) return attrs.copyBlockedKey;

	return attrs.spec.blockedKey;
}

/** "Choose the question to solve": the prompt is on the board; bring it into view. */
function showQuestionPrompt(): void {
	const prompt = document.querySelector<HTMLElement>('.challenge-warning--console');
	if (!prompt) return;
	prompt.scrollIntoView({ block: 'center' });
	prompt.querySelector<HTMLElement>('select, button, textarea, input')?.focus();
}

function run(attrs: NextActionAttrs): void {
	const { spec, mid } = attrs;
	try {
		switch (spec.kind) {
			case 'pickQuestion':
				showQuestionPrompt();
				break;
			case 'goNext':
				if (spec.nextIndex !== undefined) void goToStep(mid, spec.nextIndex);
				break;
			case 'copySeating':
				void copySeating(mid, spec.replace === true);
				break;
			case 'split':
				void assignTables(mid, false);
				break;
			case 'openVote':
				void freezeBallot(mid);
				break;
			case 'closeVote':
				if (spec.confirm) confirmCloseVote(mid, spec.confirm.notVoted);
				else void closeBallot(mid);
				break;
			case 'showResults':
				if (attrs.challengeId) void setVoteDisplay(attrs.challengeId, 'liveResults', true);
				break;
			case 'endLesson':
				openEndChoice();
				break;
			case 'resume':
				void changeLessonStatus(mid, 'resume');
				break;
			case 'backToPlan':
				m.route.set(planBack(mid).href);
				break;
		}
	} catch (error) {
		captureException(error, { operation: 'NextAction.run', kind: spec.kind, mainId: mid });
	}
}

/** After pausing the room, and after resuming it, the button the teacher pressed is gone: the primary takes focus. */
function syncFocus(vnode: m.VnodeDOM<NextActionAttrs>): void {
	const el = vnode.dom.querySelector<HTMLElement>('.next-action__button');
	if (!el) return;
	const { kind } = vnode.attrs.spec;
	const before = el.dataset.kind;
	el.dataset.kind = kind;
	if (before !== undefined && before !== kind && (kind === 'resume' || before === 'resume')) {
		el.focus();
	}
}

export const NextAction: m.Component<NextActionAttrs> = {
	oncreate: syncFocus,
	onupdate: syncFocus,
	view({ attrs }) {
		const { spec } = attrs;
		const blockedKey = blockedKeyOf(attrs);
		// A pause or resume in flight also holds the button: a step opened meanwhile would race it.
		const busy =
			(spec.busyKey !== undefined && isBusy(spec.busyKey)) ||
			isBusy('status:pause') ||
			isBusy('status:resume');

		return m('div.next-action', [
			m(
				'button.btn.btn--primary.next-action__button',
				{
					type: 'button',
					'data-testid': TESTID[spec.kind] ?? 'console-next-action',
					'data-action-kind': spec.kind,
					// Never `disabled` while busy: a disabled button drops the keyboard focus to the
					// body. aria-disabled keeps it, and the press is ignored (the double-tap guard).
					'aria-busy': busy ? 'true' : undefined,
					'aria-disabled': busy || blockedKey ? 'true' : undefined,
					'aria-describedby': blockedKey ? REASON_ID : undefined,
					class: blockedKey
						? 'next-action__button--blocked'
						: busy
							? 'next-action__button--busy'
							: '',
					onclick: () => {
						if (busy) return;
						if (blockedKey) {
							document.getElementById(REASON_ID)?.focus();

							return;
						}
						run(attrs);
					},
				},
				nextActionLabel(attrs),
			),
			blockedKey
				? m('p.next-action__reason', { id: REASON_ID, tabindex: -1 }, t(blockedKey))
				: null,
		]);
	},
};
