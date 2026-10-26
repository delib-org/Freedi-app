import m from 'mithril';
import type { ClassTable } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { serverNow } from '@/lib/classroom/serverClock';
import { getMainStatement } from '@/lib/store';
import { lessonSpeakMs, tableSpeakMs } from '@/lib/classroom/speakTime';
import { proposalsTalkState } from '@/lib/classroom/proposalsTurn';
import { Countdown } from './Countdown';

export interface TalkScreenAttrs {
	table: ClassTable;
	uid: string;
	/** The name shown for the tablemate who holds the floor. */
	speakerName: string;
	busy: boolean;
	/** "I want to answer": take a fresh minute. */
	onClaim: () => void;
	/** "I'm done": end my own minute early. */
	onFinish: () => void;
	/** "I want to pass": give up my turn (counts as spoken, IA 25.6). */
	onPass: () => void;
}

/** "סיימנו, לכתוב": every phone at Proposals talk has it; it only switches this phone's sub-step. */
export function talkFinishAction(busy: boolean, onGo: () => void): m.Children {
	return m(
		'button.btn.btn--primary',
		{
			type: 'button',
			'data-testid': 'table-to-write',
			disabled: busy,
			onclick: onGo,
		},
		t('turn.finish_talk'),
	);
}

/**
 * The content of the Proposals talk screen (screens down), drawn inside the
 * inverted StudentFrame (the question sits above, in the frame's big heading):
 * the same speaker mechanics as Table talk (IA 17.14), one turn each (IA 25.6).
 * First match wins: done ("everyone has spoken, wait for the teacher", calm),
 * someone speaking / my time, I already spoke this turn, or I may speak (an idle
 * clock of the lesson's speaking time, "I want to answer", "I want to pass").
 * Table talk has its own screens (tableTalkParts.ts).
 */
export const TalkScreen: m.ClassComponent<TalkScreenAttrs> = {
	view(vnode) {
		const { table, uid, speakerName, busy, onClaim, onFinish, onPass } = vnode.attrs;
		const main = getMainStatement();
		const state = proposalsTalkState(table, uid, main, serverNow());
		if (state.kind === 'done') {
			return m('.talk', [
				m(
					'p.tt__status.tt__status--done',
					{ 'data-testid': 'proposals-done' },
					t('turn.proposals_done'),
				),
			]);
		}
		if (state.kind === 'spoke') {
			return m('.talk', [m('p.tt__status', { 'data-testid': 'answered' }, t('turn.answered_me'))]);
		}
		const speaking = state.kind === 'mine' || state.kind === 'speaking';

		return m('.talk', [
			m('.tt__clock', [
				speaking
					? m(
							'p.tt__status',
							{ 'data-testid': 'speaking' },
							state.kind === 'mine'
								? t('turn.answer_mine')
								: t('turn.answering', { name: speakerName }),
						)
					: null,
				m(Countdown, {
					endsAt: speaking ? table.speakerEndsAt : undefined,
					totalMs: speaking ? tableSpeakMs(table, main) : lessonSpeakMs(main),
					quietEnd: true,
				}),
				state.kind === 'mine'
					? speakerButton('table-finish', t('turn.finish'), busy, onFinish)
					: null,
				speaking ? null : speakerButton('table-speak', t('turn.answer'), busy, onClaim),
				speaking ? null : passButton(busy, onPass),
			]),
		]);
	},
};

function passButton(busy: boolean, onclick: () => void): m.Children {
	return m(
		'button.btn.btn--text.tt__pass',
		{ type: 'button', 'data-testid': 'table-pass-answer', disabled: busy, onclick },
		t('turn.pass_answer'),
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
		{ type: 'button', 'data-testid': testId, disabled: busy, onclick },
		label,
	);
}
