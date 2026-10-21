import m from 'mithril';
import type { ClassTable, ClassTableAction } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import {
	canFinishTalk,
	canPickNextSpeaker,
	speakerChips,
	type FlowKind,
	type Mate,
} from '@/lib/classroom/c3Logic';
import { Countdown, MS_PER_SECOND, SPEAK_MS, msLeft, realMsLeft } from './Countdown';

export interface TalkScreenAttrs {
	kind: FlowKind;
	table: ClassTable;
	uid: string;
	mates: Mate[];
	/** The prompt: the picked question (Table talk) or the challenge (Proposals). */
	prompt: string;
	busy: boolean;
	onAction: (action: ClassTableAction) => void;
}

class TalkState {
	endsAt: number | undefined;
	totalMs = SPEAK_MS;
}

function nameOf(mates: readonly Mate[], uid: string | undefined): string {
	return mates.find((mate) => mate.uid === uid)?.name ?? t('turn.someone');
}

/** Is the current minute over (server clock)? */
export function isTimeUp(table: ClassTable): boolean {
	return table.speakerEndsAt !== undefined && msLeft(table.speakerEndsAt) <= 0;
}

/** The bottom control of the talk screen, or null when this device has none. */
export function talkFinishAction(
	kind: FlowKind,
	table: ClassTable,
	uid: string,
	mates: readonly Mate[],
	busy: boolean,
	onAction: (action: ClassTableAction) => void,
): m.Children {
	if (!canFinishTalk(kind, table, uid, mates, isTimeUp(table))) return null;

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
 * The content of the screens-down talk screen (UX §3), drawn inside the
 * inverted StudentFrame: the prompt, "Speaker: Dana · time left: 34 seconds",
 * the big Countdown, and the chips that choose the next speaker. Proposals use
 * the same screen without the speaker order.
 */
export const TalkScreen: m.ClassComponent<TalkScreenAttrs> = {
	oninit(vnode) {
		(vnode.state as { self?: TalkState }).self = new TalkState();
	},

	view(vnode) {
		const self = (vnode.state as { self?: TalkState }).self as TalkState;
		const { kind, table, uid, mates, prompt, busy, onAction } = vnode.attrs;
		const endsAt = table.speakerEndsAt;
		if (endsAt !== self.endsAt) {
			// The first look at a new minute tells how long it is (a proposals timer may be longer).
			self.endsAt = endsAt;
			self.totalMs =
				endsAt === undefined
					? SPEAK_MS
					: Math.max(SPEAK_MS, Math.ceil(realMsLeft(endsAt) / MS_PER_SECOND) * MS_PER_SECOND);
		}
		const timeUp = isTimeUp(table);
		const withSpeakers = kind === 'tableTalk';
		const canPick =
			canPickNextSpeaker(table, uid, timeUp) || (table.askerUid === uid && !table.speakerUid);
		const seconds =
			endsAt === undefined ? null : Math.ceil(msLeft(endsAt, self.totalMs) / MS_PER_SECOND);

		return m('.talk', [
			m('p.talk__prompt', { dir: 'auto' }, prompt),
			withSpeakers
				? m('p.talk__speaker', [
						m(
							'span',
							{ 'aria-live': 'polite' },
							table.speakerUid
								? t('turn.speaker', { name: nameOf(mates, table.speakerUid) })
								: t('turn.who_first'),
						),
						table.speakerUid && seconds !== null && seconds > 0
							? m('span', { 'aria-hidden': 'true' }, ` · ${t('turn.time_left', { seconds })}`)
							: null,
					])
				: m('p.talk__speaker', t('turn.table_time')),
			m(Countdown, { endsAt, totalMs: self.totalMs }),
			withSpeakers
				? [
						m(
							'ul.talk__chips',
							{ 'aria-label': t('turn.next_speaker') },
							speakerChips(table, mates).map((chip) =>
								m(
									'li',
									{ key: chip.uid },
									m(
										'button.talk__chip',
										{
											type: 'button',
											'data-testid': 'table-next-speaker',
											'aria-pressed': chip.speaking ? 'true' : 'false',
											disabled: !canPick || busy ? true : undefined,
											class: [
												chip.speaking ? 'talk__chip--on' : '',
												chip.spoken ? 'talk__chip--spoken' : '',
											]
												.filter(Boolean)
												.join(' '),
											onclick: () => onAction({ action: 'nextSpeaker', uid: chip.uid }),
										},
										[chip.spoken ? m('span', { 'aria-hidden': 'true' }, '✓ ') : null, chip.name],
									),
								),
							),
						),
						m('p.talk__hint', canPick ? t('turn.pick_next') : t('turn.asker_picks_next')),
					]
				: null,
		]);
	},
};
