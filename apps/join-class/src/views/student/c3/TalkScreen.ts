import m from 'mithril';
import type { ClassTable } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { getMainStatement } from '@/lib/store';
import { lessonSpeakMs, tableSpeakMs } from '@/lib/classroom/speakTime';
import type { TalkScreenState } from '@/lib/classroom/proposalsScreen';
import { Countdown } from './Countdown';
import { nextLineView } from './ProposalsNext';

export interface TalkScreenAttrs {
	table: ClassTable;
	screen: TalkScreenState;
	/** The name shown for the tablemate who holds the floor. */
	speakerName: string;
	/** The "what is next" line, already in words; null = nothing to say. */
	nextText: string | null;
	busy: boolean;
	/** "I want to speak": take a fresh minute. */
	onClaim: () => void;
	/** "I'm done": end my own minute early. */
	onFinish: () => void;
	/** "I want to pass": give up my turn (counts as spoken, IA 25.6). */
	onPass: () => void;
}

/** The state line of the screen, in words (also read out by the live region). */
export function talkStatusText(screen: TalkScreenState, speakerName: string): string {
	switch (screen.kind) {
		case 'done':
			return t('proposals.talk.all_spoke');
		case 'spoke':
			return t('proposals.talk.spoke');
		case 'mine':
			return t('turn.answer_mine');
		case 'speaking':
			return t('proposals.talk.speaking', { name: speakerName });
		default:
			return screen.roundOver
				? t('proposals.talk.next_round', {
						prev: screen.turn - 1,
						turn: screen.turn,
						max: screen.max,
					})
				: t('proposals.talk.who_first');
	}
}

/**
 * The content of the Proposals talk screen (screens down), drawn inside the
 * inverted StudentFrame (IA join-class-proposals-flow §4, T1-T6). One state line,
 * the one control that works now, and the "what is next" line. T4 and T6 carry
 * their one control in the pinned footer (proposalsParts.ts); here: a state with
 * a clock (T1, T2, T3), or only words (T4, T6).
 */
export const TalkScreen: m.ClassComponent<TalkScreenAttrs> = {
	view(vnode) {
		const { table, screen, speakerName, nextText, busy, onClaim, onFinish, onPass } = vnode.attrs;
		const main = getMainStatement();
		const status = talkStatusText(screen, speakerName);
		if (screen.kind === 'done') {
			return m('.talk', [
				m('p.tt__status.tt__status--done', { 'data-testid': 'proposals-done' }, status),
			]);
		}
		if (screen.kind === 'spoke') {
			return m('.talk', [
				m('p.tt__status', { 'data-testid': 'answered' }, status),
				nextLineView(nextText),
			]);
		}
		const speaking = screen.kind === 'mine' || screen.kind === 'speaking';

		return m('.talk', [
			m('.tt__clock', [
				m('p.tt__status', { 'data-testid': speaking ? 'speaking' : 'who-first' }, status),
				m(Countdown, {
					endsAt: speaking ? table.speakerEndsAt : undefined,
					totalMs: speaking ? tableSpeakMs(table, main) : lessonSpeakMs(main),
					quietEnd: true,
				}),
				screen.kind === 'mine'
					? speakerButton('table-finish', t('turn.finish'), busy, onFinish)
					: null,
				screen.kind === 'may'
					? speakerButton('table-speak', t('proposals.talk.claim'), busy, onClaim)
					: null,
				screen.kind === 'may' ? passButton(busy, onPass) : null,
				nextLineView(nextText),
			]),
		]);
	},
};

function passButton(busy: boolean, onclick: () => void): m.Children {
	return m(
		'button.btn.btn--text.tt__pass',
		{ type: 'button', 'data-testid': 'table-pass-answer', disabled: busy, onclick },
		t('proposals.pass'),
	);
}

function speakerButton(
	testId: string,
	label: string,
	busy: boolean,
	onclick: () => void,
): m.Children {
	return m(
		'button.btn.btn--secondary.tt__finish',
		{
			type: 'button',
			'data-testid': testId,
			disabled: busy,
			'aria-busy': busy ? 'true' : undefined,
			onclick,
		},
		label,
	);
}
