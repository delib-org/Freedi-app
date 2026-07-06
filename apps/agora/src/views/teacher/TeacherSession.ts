import m from 'mithril';
import { t } from '../../lib/i18n';
import { ensureUser } from '../../lib/user';
import { listenToSession, stopListening, getSessionState } from '../../lib/session';
import { advanceStage } from '../../lib/callables';
import { EraMap } from '../../components/EraMap';
import { QRShare } from '../../components/QRShare';
import { AgoraStage } from '@freedi/shared-types';

/**
 * Teacher live panel — projector-friendly: join code + QR + the era map
 * filling with travelers, and the "open the time tunnel" control.
 */
export function TeacherSession(initialVnode: m.Vnode<{ id: string }>): m.Component<{ id: string }> {
	const sessionId = initialVnode.attrs.id;
	let advancing = false;

	void ensureUser().then((user) => {
		listenToSession(sessionId, user.uid);
	});

	function handleStart(): void {
		if (advancing) return;
		advancing = true;
		advanceStage({ sessionId, stage: AgoraStage.framing })
			.catch((error: unknown) => {
				console.error('[Teacher] Advance stage failed:', error);
			})
			.finally(() => {
				advancing = false;
				m.redraw();
			});
	}

	return {
		onremove() {
			stopListening();
		},

		view() {
			const { session, participants, loading, error } = getSessionState();

			if (loading || (!session && !error)) {
				return m(
					'.shell',
					m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
				);
			}

			if (error || !session) {
				return m(
					'.shell',
					m('.shell__content.text-center', { style: { justifyContent: 'center' } }, [
						m('p.join__error', t('common.error')),
						m(
							'button.btn.btn--secondary',
							{ onclick: () => m.route.set('/teach') },
							t('common.back'),
						),
					]),
				);
			}

			const joinUrl = `${window.location.origin}/join/${session.code}`;

			return m('.shell.shell--wide', [
				m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
					m(EraMap, { participants }),

					m('.card.teacher__code-panel', [
						m('p.teacher__section-title', t('teacher.session_code')),
						m('.teacher__code', session.code),
						m(QRShare, { url: joinUrl }),
						m('p.lobby__status', t('teacher.scan_to_join')),
						m('.text-center', [
							m('span.lobby__count', String(participants.length)),
							m('p.lobby__status', ` ${t('teacher.participants')}`),
						]),
						session.stage === AgoraStage.lobby
							? m(
									'button.btn.btn--primary.btn--lg',
									{
										disabled: participants.length === 0 || advancing,
										onclick: handleStart,
									},
									t('teacher.start_journey'),
								)
							: m('p.lobby__status', session.stage),
					]),
				]),
			]);
		},
	};
}
