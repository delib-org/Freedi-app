import m from 'mithril';
import type { ClassTable, ClassTableAction } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import {
	canFinishTalk,
	canPickNextSpeaker,
	passMinuteArmed,
	speakerChips,
	type FlowKind,
	type Mate,
	type SpeakerChip,
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
	/** Table talk, V2: everyone spoke. The words replace the countdown; `askLine` is the line under them. */
	over?: { askLine: string };
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
 * "ויתרתי על הדקה" on the speaker's phone, "לוותר בשם {{name}}" on the asker's
 * (UX 16.D): a paper-outline secondary in the footer, never filled, no confirm
 * (the asker can call a passed speaker again). Hidden for the first PASS_ARM_MS of a
 * minute so the tap that started it cannot land on it, and once the minute is over.
 */
export function passMinuteAction(
	table: ClassTable,
	uid: string,
	mates: readonly Mate[],
	busy: boolean,
	onAction: (action: ClassTableAction) => void,
): m.Children {
	const { speakerUid, speakerEndsAt } = table;
	if (!speakerUid || speakerEndsAt === undefined) return null;
	if (!passMinuteArmed(msLeft(speakerEndsAt), SPEAK_MS)) return null;
	const own = speakerUid === uid;
	if (!own && table.askerUid !== uid) return null;

	return m(
		'button.btn.btn--secondary.talk__pass',
		{
			type: 'button',
			'data-testid': own ? 'pass-speak' : 'pass-for',
			disabled: busy,
			onclick: () => onAction({ action: 'passSpeaking' }),
		},
		own ? t('turn.pass_speak') : t('turn.pass_for', { name: nameOf(mates, speakerUid) }),
	);
}

function chipGlyph(chip: SpeakerChip): m.Children {
	if (chip.passed) return m('span', { 'aria-hidden': 'true' }, '– ');

	return chip.spoken ? m('span', { 'aria-hidden': 'true' }, '✓ ') : null;
}

function chipClass(chip: SpeakerChip, reference: boolean): string {
	return [
		chip.speaking ? 'talk__chip--on' : '',
		chip.spoken ? 'talk__chip--spoken' : '',
		chip.passed ? 'talk__chip--passed' : '',
		reference ? 'talk__chip--ref' : '',
	]
		.filter(Boolean)
		.join(' ');
}

/**
 * The content of the screens-down talk screen (UX §3, 16.C), drawn inside the
 * inverted StudentFrame: the prompt, "Speaker: Dana · time left: 34 seconds",
 * the big Countdown, and the chips that choose the next speaker. At V2 (everyone
 * spoke or passed) the words "כולם דיברו" take the countdown's place and the
 * chips are a disabled reference. Proposals use the same screen without the
 * speaker order.
 */
export const TalkScreen: m.ClassComponent<TalkScreenAttrs> = {
	oninit(vnode) {
		(vnode.state as { self?: TalkState }).self = new TalkState();
	},

	view(vnode) {
		const self = (vnode.state as { self?: TalkState }).self as TalkState;
		const { kind, table, uid, mates, prompt, busy, onAction, over } = vnode.attrs;
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
		const canPick = !over && canPickNextSpeaker(table, uid, timeUp) && !busy;
		const seconds =
			endsAt === undefined ? null : Math.ceil(msLeft(endsAt, self.totalMs) / MS_PER_SECOND);

		return m('.talk', [
			m('p.talk__prompt', { dir: 'auto' }, prompt),
			over
				? m('.talk__over', { role: 'status', 'data-testid': 'all-spoke' }, [
						m('h1.talk__over-words', t('turn.all_spoke')),
						m('p.talk__over-ask', over.askLine),
					])
				: [
						withSpeakers
							? table.speakerUid
								? m('p.talk__speaker', [
										m(
											'span',
											{ 'aria-live': 'polite' },
											table.speakerUid === uid
												? t('turn.speak_mine')
												: t('turn.speaker', { name: nameOf(mates, table.speakerUid) }),
										),
										seconds !== null && seconds > 0
											? m(
													'span',
													{ 'aria-hidden': 'true' },
													` · ${t('turn.time_left', { seconds })}`,
												)
											: null,
									])
								: null
							: m('p.talk__speaker', t('turn.table_time')),
						m(Countdown, { endsAt, totalMs: self.totalMs }),
					],
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
											'data-state': chip.passed ? 'passed' : chip.spoken ? 'spoken' : 'wait',
											'aria-pressed': chip.speaking ? 'true' : 'false',
											'aria-label': chip.passed
												? t('turn.speaker_passed', { name: chip.name })
												: undefined,
											disabled: !canPick ? true : undefined,
											class: chipClass(chip, !!over),
											onclick: () => onAction({ action: 'nextSpeaker', uid: chip.uid }),
										},
										[chipGlyph(chip), chip.name],
									),
								),
							),
						),
						!over && table.askerUid !== null && table.askerUid !== uid && !canPick
							? m(
									'p.talk__hint',
									t('turn.asker_picks_next', { name: nameOf(mates, table.askerUid) }),
								)
							: null,
					]
				: null,
		]);
	},
};
