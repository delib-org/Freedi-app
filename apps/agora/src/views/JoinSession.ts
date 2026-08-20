import m from 'mithril';
import { t } from '../lib/i18n';
import { ensureUser, signInWithHandoff } from '../lib/user';
import { joinSession } from '../lib/callables';
import { findSessionByCode } from '../lib/teacher';
import { ODYSSEY_THEME, rememberSessionTheme } from '../lib/theme';
import {
	AgoraDeviceMode,
	AgoraSessionStatus,
	AgoraSession,
	AGORA_SESSION,
} from '@freedi/shared-types';

type JoinPhase = 'looking' | 'team-size' | 'joining' | 'error';

export function JoinSession(
	initialVnode: m.Vnode<{ code: string }>,
): m.Component<{ code: string }> {
	// Deep links (/join/12345) get the same digits-only normalisation as typing
	const code = initialVnode.attrs.code.replace(/\D/g, '');
	let phase: JoinPhase = 'looking';
	let errorKey = 'join.invalid_code';
	let session: AgoraSession | null = null;
	let teamMemberCount = 2;

	/**
	 * A player arriving from an Odyssey island carries a token naming the uid
	 * they voyaged under. Spend it before anything else, so the join callable
	 * can find the stances that decide their camp.
	 *
	 * A token that has expired (they left the summary page open overnight) is
	 * not worth turning them away for: they still get in, just as a newcomer
	 * with no camp, which is exactly what an anonymous join has always been.
	 */
	async function establishIdentity(): Promise<void> {
		// The gate says which world this code belongs to, and it says so a whole
		// round trip before the session document could. Recording it here is what
		// lets the square be the right colour on its first frame.
		const theme = m.route.param('theme');
		if (theme === 'odyssey') {
			rememberSessionTheme(ODYSSEY_THEME);
			document.documentElement.dataset.sessionTheme = ODYSSEY_THEME;
		}

		const handoff = m.route.param('handoff');
		if (handoff) {
			try {
				await signInWithHandoff(handoff);

				return;
			} catch (error) {
				console.error('[Join] Handoff sign-in failed, joining as a newcomer:', error);
			}
		}

		await ensureUser();
	}

	async function lookupSession(): Promise<void> {
		try {
			await establishIdentity();
			const found = await findSessionByCode(code);

			if (!found) {
				phase = 'error';
				errorKey = 'join.invalid_code';
				m.redraw();

				return;
			}

			session = found;

			if (session.status === AgoraSessionStatus.ended) {
				phase = 'error';
				errorKey = 'join.session_ended';
				m.redraw();

				return;
			}

			if (session.deviceMode === AgoraDeviceMode.team) {
				phase = 'team-size';
				m.redraw();
			} else {
				await performJoin();
			}
		} catch (error) {
			console.error('[Join] Lookup failed:', error);
			phase = 'error';
			errorKey = 'common.error';
			m.redraw();
		}
	}

	async function performJoin(): Promise<void> {
		phase = 'joining';
		m.redraw();
		try {
			const result = await joinSession({
				code,
				teamMemberCount: session?.deviceMode === AgoraDeviceMode.team ? teamMemberCount : undefined,
			});
			m.route.set(`/play/${result.sessionId}`);
		} catch (error) {
			console.error('[Join] Join failed:', error);
			phase = 'error';
			errorKey = 'common.error';
			m.redraw();
		}
	}

	void lookupSession();

	return {
		view() {
			return m('.shell', [
				m('.shell__content', { style: { justifyContent: 'center', gap: 'var(--space-xl)' } }, [
					m('h2.text-center', t('join.title')),

					phase === 'looking' || phase === 'joining'
						? m('.stack', [m('.spinner'), m('p.text-center.lobby__status', t('join.joining'))])
						: null,

					phase === 'team-size' && session
						? m('.card.stack', [
								m('h3.text-center', t('join.team_question')),
								m('p.text-center.home-explanation', t('join.team_hint')),
								m(
									'.join__team-picker',
									Array.from({ length: AGORA_SESSION.TEAM_SIZE_MAX }, (_, index) => index + 1).map(
										(size) =>
											m(
												'button.join__team-option',
												{
													class:
														teamMemberCount === size ? 'join__team-option--selected' : undefined,
													onclick: () => {
														teamMemberCount = size;
													},
												},
												String(size),
											),
									),
								),
								m(
									'button.btn.btn--primary.btn--full.btn--lg',
									{ onclick: () => void performJoin() },
									t('join.join_now'),
								),
							])
						: null,

					phase === 'error'
						? m('.stack', [
								m('p.join__error', t(errorKey)),
								m(
									'button.btn.btn--secondary',
									{ onclick: () => m.route.set('/') },
									t('common.back'),
								),
							])
						: null,
				]),
			]);
		},
	};
}
