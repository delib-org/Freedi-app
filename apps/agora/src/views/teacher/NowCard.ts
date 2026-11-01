import m from 'mithril';
import { t } from '../../lib/i18n';
import { QRShare } from '../../components/QRShare';
import {
	classProgress,
	idleMs,
	progressCountKey,
	PROGRESS_STAGES,
	type ProgressFacts,
} from '../../lib/flows/classProgress';
import { nowSentence } from '../../lib/teacherSteps';
import { mainAppOrigin } from '../../lib/stationHandoff';
import {
	AgoraStage,
	stationAppUrl,
	stationVisitCounts,
	type AgoraParticipant,
	type AgoraStagePlanItem,
} from '@freedi/shared-types';

export interface NowCardAttrs {
	item: AgoraStagePlanItem;
	participants: readonly AgoraParticipant[];
	facts: ProgressFacts;
	/** The lobby shows the door: the QR and the code, large */
	joinUrl: string;
	code: string;
	onMessage: (studentUid: string) => void;
	now: number;
	/**
	 * The teacher's private device only: the name the teacher knows the
	 * student by, drawn first, with the class's pseudonym muted beside it.
	 * Absent on a wall, where the chip is the pseudonym alone.
	 */
	nameOf?: (studentUid: string) => string | undefined;
}

/** A chip says how long a student has been quiet only once it is worth saying */
const SHOW_IDLE_AFTER_MS = 2 * 60 * 1000;
/** …and turns amber once the silence is a signal */
const IDLE_WARN_MS = 5 * 60 * 1000;

/**
 * The first card on the board: what the students are doing, how many have
 * finished, and who has not — one sentence, one number, and the names that
 * are still working, each a door to a private word.
 *
 * It replaces a progress card that listed every student as "Bot 1 0/1" and a
 * three-paragraph quote of the students' instructions. A teacher glancing at
 * the projector between two questions wants "3 of 4 finished" and the name
 * of the fourth, nothing more.
 */
export function nowCard(attrs: NowCardAttrs): m.Children {
	const { item, participants, facts, joinUrl, code, onMessage, now, nameOf } = attrs;

	if (item.stage === AgoraStage.lobby) {
		return m('.card.teacher-now.teacher-now--lobby', [
			m('p.teacher-now__doing', t('teacher.now_lobby')),
			m('.teacher-now__join', [
				m('.teacher__qr', m(QRShare, { url: joinUrl, size: 280 })),
				m('.teacher-now__door', [
					m('p.teacher__section-title', t('teacher.session_code')),
					m('.teacher__code', code),
					participants.length === 0
						? m('p.teacher-now__empty', t('teacher.nobody_joined'))
						: m('p.teacher-now__count.teacher-now__count--joined', { 'aria-live': 'polite' }, [
								m('strong.teacher-now__n', String(participants.length)),
								m('span.teacher-now__of', t('teacher.participants')),
							]),
				]),
			]),
		]);
	}

	const tracked = PROGRESS_STAGES.has(item.stage);
	if (participants.length === 0) {
		return m('.card.teacher-now', [
			m('p.teacher-now__doing', nowSentence(item)),
			m('p.teacher-now__empty', t('teacher.no_students_in_lesson')),
		]);
	}

	if (!tracked) {
		// A scene stage is read at each student's own pace and reports nothing
		// back; the room is the count that matters
		return m('.card.teacher-now', [
			m('p.teacher-now__doing', nowSentence(item)),
			m('p.teacher-now__count', [
				m('strong.teacher-now__n', String(participants.length)),
				m('span.teacher-now__of', t('teacher.participants')),
			]),
		]);
	}

	const { entries, doneCount } = classProgress(item, participants, facts);
	const all = doneCount === entries.length;
	const linkedLine = item.stage === AgoraStage.linked ? linkedProgress(item, participants) : null;
	const pending = entries
		.filter((entry) => !entry.done)
		.map((entry) => ({ entry, idle: idleMs(entry.participant, now) }))
		.sort((a, b) => b.idle - a.idle);

	return m('.card.teacher-now', [
		m('p.teacher-now__doing', nowSentence(item)),
		linkedLine,
		m('p.teacher-now__count', { class: all ? 'teacher-now__count--all' : undefined }, [
			m('strong.teacher-now__n', String(doneCount)),
			m(
				'span.teacher-now__of',
				all
					? t(item.stage === AgoraStage.linked ? 'linked.all_back' : 'teacher.all_done')
					: // The per-stage sentence ("of 4 answered") minus the number it starts with
						t(progressCountKey(item), { n: doneCount, total: entries.length }).replace(
							/^\s*\d+\s*/,
							'',
						),
			),
		]),
		all
			? null
			: m(
					'ul.teacher-now__pending',
					{ 'aria-label': t('teacher.not_finished') },
					pending.map(({ entry, idle }) => {
						const real = nameOf?.(entry.participant.userId);

						return m(
							'li',
							{ key: entry.participant.participantId },
							m(
								'button.teacher-now__chip',
								{
									type: 'button',
									class: idle >= IDLE_WARN_MS ? 'teacher-now__chip--idle' : undefined,
									'aria-label': t('teacher.message_aria', {
										name: real ?? entry.participant.anonName,
									}),
									onclick: () => onMessage(entry.participant.userId),
								},
								[
									real
										? [
												m('span.teacher-now__alias', real),
												m('span.teacher-now__alias--muted', ` · ${entry.participant.anonName}`),
											]
										: m('span.teacher-now__alias', entry.participant.anonName),
									idle >= SHOW_IDLE_AFTER_MS
										? m(
												'span.teacher-now__idle',
												t('teacher.idle_short', { minutes: Math.round(idle / 60_000) }),
											)
										: null,
								],
							),
						);
					}),
				),
	]);
}

/**
 * A linked station's extra line: how many opened the task (the count line
 * below says how many came back), and the teacher's own way to the question
 * — the app's plain page, no handoff, opened as the question's admin.
 */
function linkedProgress(
	item: AgoraStagePlanItem,
	participants: readonly AgoraParticipant[],
): m.Children {
	const { opened } = stationVisitCounts(
		participants.map((participant) => participant.stationVisits?.[item.itemId]),
	);

	return m('p.linked-progress', [
		m('span', opened === 0 ? t('linked.nobody_yet') : t('linked.progress_opened', { n: opened })),
		item.link
			? m(
					'a.linked-progress__open',
					{
						href: stationAppUrl(item.link.app, mainAppOrigin(), item.link.statementId),
						target: '_blank',
						rel: 'noopener',
					},
					t('linked.teacher_open'),
				)
			: null,
	]);
}
