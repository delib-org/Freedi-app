import m from 'mithril';
import { speakerTimeOver } from '@freedi/shared-types';
import type { ClassTable } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { serverNow } from '@/lib/classroom/serverClock';
import { Countdown, SPEAK_MS } from './Countdown';

export interface TalkScreenAttrs {
	table: ClassTable;
	/** The prompt: the challenge (Proposals). */
	prompt: string;
	uid: string;
	/** The name shown for the tablemate who holds the floor. */
	speakerName: string;
	busy: boolean;
	/** "I want to answer": take a fresh minute. */
	onClaim: () => void;
	/** "I'm done": end my own minute early. */
	onFinish: () => void;
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
 * inverted StudentFrame: the prompt, then a fresh minute for whoever volunteers
 * (the same speaker mechanics as Table talk, IA 17.14). Nobody speaking: an idle
 * 1:00 and "I want to answer". Table talk has its own screens (tableTalkParts.ts).
 */
export const TalkScreen: m.ClassComponent<TalkScreenAttrs> = {
	view(vnode) {
		const { table, prompt, uid, speakerName, busy, onClaim, onFinish } = vnode.attrs;
		const speaking = !!table.speakerUid && !speakerTimeOver(table, serverNow());
		const mine = speaking && table.speakerUid === uid;

		return m('.talk', [
			m('p.talk__prompt', { dir: 'auto' }, prompt),
			m('.tt__clock', [
				speaking
					? m(
							'p.tt__status',
							{ 'data-testid': 'speaking' },
							mine ? t('turn.answer_mine') : t('turn.answering', { name: speakerName }),
						)
					: null,
				m(Countdown, {
					endsAt: speaking ? table.speakerEndsAt : undefined,
					totalMs: SPEAK_MS,
					quietEnd: true,
				}),
				mine ? speakerButton('table-finish', t('turn.finish'), busy, onFinish) : null,
				speaking ? null : speakerButton('table-speak', t('turn.answer'), busy, onClaim),
			]),
		]);
	},
};

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
