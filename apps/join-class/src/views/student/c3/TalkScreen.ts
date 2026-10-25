import m from 'mithril';
import type { ClassTable } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { Countdown, MS_PER_SECOND, SPEAK_MS, realMsLeft } from './Countdown';

export interface TalkScreenAttrs {
	table: ClassTable;
	/** The prompt: the challenge (Proposals). */
	prompt: string;
}

class TalkState {
	endsAt: number | undefined;
	totalMs = SPEAK_MS;
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
 * inverted StudentFrame: the prompt, "Table time" and the big Countdown. Table
 * talk has its own screens (tableTalkParts.ts), one per state.
 */
export const TalkScreen: m.ClassComponent<TalkScreenAttrs> = {
	oninit(vnode) {
		(vnode.state as { self?: TalkState }).self = new TalkState();
	},

	view(vnode) {
		const self = (vnode.state as { self?: TalkState }).self as TalkState;
		const { table, prompt } = vnode.attrs;
		const endsAt = table.speakerEndsAt;
		if (endsAt !== self.endsAt) {
			// The first look at a new minute tells how long it is (a proposals timer may be longer).
			self.endsAt = endsAt;
			self.totalMs =
				endsAt === undefined
					? SPEAK_MS
					: Math.max(SPEAK_MS, Math.ceil(realMsLeft(endsAt) / MS_PER_SECOND) * MS_PER_SECOND);
		}

		return m('.talk', [
			m('p.talk__prompt', { dir: 'auto' }, prompt),
			m('p.talk__speaker', t('turn.table_time')),
			m(Countdown, { endsAt, totalMs: self.totalMs }),
		]);
	},
};
