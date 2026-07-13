import m from 'mithril';
import { t } from '../lib/i18n';
import { ensureUser } from '../lib/user';
import { joinSession } from '../lib/callables';
import { db, collection, query, where, limit, getDocs } from '../lib/firebase';
import {
	Collections,
	AgoraDeviceMode,
	AgoraSessionStatus,
	AgoraSession,
	AgoraSessionSchema,
	AGORA_SESSION,
} from '@freedi/shared-types';
import { parse } from 'valibot';

type JoinPhase = 'looking' | 'team-size' | 'joining' | 'error';

export function JoinSession(
	initialVnode: m.Vnode<{ code: string }>,
): m.Component<{ code: string }> {
	const code = initialVnode.attrs.code.toUpperCase();
	let phase: JoinPhase = 'looking';
	let errorKey = 'join.invalid_code';
	let session: AgoraSession | null = null;
	let teamMemberCount = 2;

	async function lookupSession(): Promise<void> {
		try {
			await ensureUser();
			const snapshot = await getDocs(
				query(collection(db, Collections.agoraSessions), where('code', '==', code), limit(1)),
			);

			if (snapshot.empty) {
				phase = 'error';
				errorKey = 'join.invalid_code';
				m.redraw();

				return;
			}

			session = parse(AgoraSessionSchema, snapshot.docs[0].data());

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
