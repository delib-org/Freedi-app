import m from 'mithril';
import type {
	AgoraParticipant,
	AgoraStagePlanItem,
	AgoraTeacherMessage,
} from '@freedi/shared-types';
import { t } from '../../lib/i18n';
import { teacherStepLabel } from '../../lib/teacherSteps';
import { formatMessageTime } from '../ThreadChat';
import {
	languagePlaceKey,
	markLanguageSeen,
	pendingLanguageAlerts,
	pendingWallStrikes,
	readLanguageSeen,
	type LanguageAlert as PendingAlert,
} from '../../lib/flows/languageAlerts';

/**
 * The alert that tells the teacher, the moment it happens, that a student's
 * text was refused for language — on the board view and the class view
 * alike, above the panels, until the teacher says "got it".
 *
 * On the teacher's own device it names the student (real name per the
 * existing rules), quotes the refused words, says where they were written and
 * how many strikes the student has, and opens that student's thread. On a
 * wall it says only that something was refused: no name, no words.
 */
export interface LanguageAlertAttrs {
	sessionId: string;
	/** The teacher's phone: may show names and words. A wall may not. */
	privateDevice: boolean;
	threads: ReadonlyMap<string, readonly AgoraTeacherMessage[]>;
	participants: readonly AgoraParticipant[];
	plan: readonly AgoraStagePlanItem[];
	realNameOf: (uid: string) => string | undefined;
	onOpen: (studentUid: string, aboutStatementId?: string) => void;
}

/** More than this and the card lists the newest and counts the rest */
const MAX_SHOWN = 3;

export function LanguageAlert(): m.Component<LanguageAlertAttrs> {
	let seenFor = '';
	let seenAt = 0;

	function placeLine(alert: PendingAlert, plan: readonly AgoraStagePlanItem[]): string {
		const item = alert.itemId ? plan.find((entry) => entry.itemId === alert.itemId) : undefined;
		const where = t(languagePlaceKey(alert.place));
		const station = item ? item.title?.trim() || teacherStepLabel(item) : '';

		return [where, station, formatMessageTime(alert.createdAt)].filter(Boolean).join(' · ');
	}

	return {
		view(vnode) {
			const attrs = vnode.attrs;
			if (seenFor !== attrs.sessionId) {
				seenFor = attrs.sessionId;
				seenAt = readLanguageSeen(attrs.sessionId);
			}
			const dismiss = (at: number): void => {
				seenAt = markLanguageSeen(attrs.sessionId, at);
			};

			if (!attrs.privateDevice) {
				const wall = pendingWallStrikes(attrs.participants, seenAt);
				if (wall.count === 0) return null;

				return m(
					'section.language-alert.language-alert--wall',
					{ role: 'alert', 'aria-live': 'assertive' },
					[
						m('.language-alert__head', [
							m('span.language-alert__mark', { 'aria-hidden': 'true' }, '!'),
							m(
								'h2.language-alert__title',
								t('teacher.language_alert.wall_title', { n: wall.count }),
							),
						]),
						m('p.language-alert__hint', t('teacher.language_alert.wall_hint')),
						m('.language-alert__actions', [
							m(
								'button.btn.btn--secondary.btn--sm',
								{ type: 'button', onclick: () => dismiss(wall.latest) },
								t('teacher.language_alert.dismiss'),
							),
						]),
					],
				);
			}

			const pending = pendingLanguageAlerts(attrs.threads, seenAt);
			if (pending.length === 0) return null;
			const shown = pending.slice(0, MAX_SHOWN);
			const more = pending.length - shown.length;

			return m(
				'section.language-alert',
				{ role: 'alert', 'aria-live': 'assertive', 'data-testid': 'language-alert' },
				[
					m('.language-alert__head', [
						m('span.language-alert__mark', { 'aria-hidden': 'true' }, '!'),
						m('h2.language-alert__title', t('teacher.language_alert.title', { n: pending.length })),
					]),
					m(
						'ul.language-alert__list',
						shown.map((alert) => {
							const participant = attrs.participants.find(
								(entry) => entry.userId === alert.studentUid,
							);
							const real = attrs.realNameOf(alert.studentUid);
							const anon = participant?.anonName ?? '';
							const strikes = participant?.languageStrikes ?? 0;

							return m('li.language-alert__item', { key: alert.messageId }, [
								m('.language-alert__who', [
									m('span.language-alert__name', real ?? anon),
									real && anon ? m('span.language-alert__anon', anon) : null,
									strikes > 0
										? m(
												'span.language-alert__strikes',
												t('teacher.language_strikes', { n: String(strikes) }),
											)
										: null,
								]),
								m('p.language-alert__where', placeLine(alert, attrs.plan)),
								alert.text ? m('blockquote.language-alert__text', alert.text) : null,
								m(
									'button.btn.btn--secondary.btn--sm.language-alert__open',
									{
										type: 'button',
										onclick: () => attrs.onOpen(alert.studentUid, alert.aboutStatementId),
									},
									t('teacher.language_alert.open_thread'),
								),
							]);
						}),
					),
					more > 0
						? m('p.language-alert__more', t('teacher.language_alert.more', { n: more }))
						: null,
					m('.language-alert__actions', [
						m(
							'button.btn.btn--primary.btn--sm',
							{ type: 'button', onclick: () => dismiss(pending[0].createdAt) },
							t('teacher.language_alert.dismiss'),
						),
					]),
				],
			);
		},
	};
}
