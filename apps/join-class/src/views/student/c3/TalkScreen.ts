import m from 'mithril';
import type { ClassTable, ClassTableAction } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { canFinishTalk, type FlowKind } from '@/lib/classroom/c3Logic';
import { Countdown, MS_PER_SECOND, SPEAK_MS, msLeft, realMsLeft } from './Countdown';

export interface TalkScreenAttrs {
	table: ClassTable;
	/** The prompt: the challenge (Proposals). */
	prompt: string;
}

class TalkState {
	endsAt: number | undefined;
	totalMs = SPEAK_MS;
}

/** Is the current minute over (server clock)? */
export function isTimeUp(table: ClassTable): boolean {
	return table.speakerEndsAt !== undefined && msLeft(table.speakerEndsAt) <= 0;
}

/** The bottom control of the Proposals talk screen, or null when this device has none. */
export function talkFinishAction(
	kind: FlowKind,
	table: ClassTable,
	uid: string,
	busy: boolean,
	onAction: (action: ClassTableAction) => void,
): m.Children {
	if (!canFinishTalk(kind, table, uid, isTimeUp(table))) return null;

	return m(
		'button.btn.btn--primary',
		{
			type: 'button',
			'data-testid': 'table-to-write',
			disabled: busy,
			onclick: () => onAction({ action: 'toWrite' }),
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
