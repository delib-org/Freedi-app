import m from 'mithril';
import { t } from '../lib/i18n';
import { ensureUser, signInWithHandoff } from '../lib/user';
import { joinClass, joinSession } from '../lib/callables';
import { findSessionByCode } from '../lib/teacher';
import { ODYSSEY_THEME, rememberSessionTheme } from '../lib/theme';
import {
	AgoraDeviceMode,
	AgoraSessionStatus,
	AgoraSession,
	AGORA_SESSION,
} from '@freedi/shared-types';
import {
	classJoinErrorKey,
	classJoinReduce,
	INITIAL_CLASS_JOIN,
	type ClassJoinEvent,
	type ClassJoinState,
} from '../lib/flows/classJoin';
import { ClassJoinPanel } from '../components/ClassJoinPanel';

type JoinPhase = 'looking' | 'name' | 'team-size' | 'joining' | 'class-join' | 'error';

export function JoinSession(
	initialVnode: m.Vnode<{ code: string }>,
): m.Component<{ code: string }> {
	// Deep links (/join/12345) get the same digits-only normalisation as typing
	const code = initialVnode.attrs.code.replace(/\D/g, '');
	let phase: JoinPhase = 'looking';
	let errorKey = 'join.invalid_code';
	let session: AgoraSession | null = null;
	let teamMemberCount = 2;
	/** `named` rooms: the name this person goes by — asked at the door */
	let displayName = '';
	let classJoin: ClassJoinState = INITIAL_CLASS_JOIN;

	/** One entry point for the flow: reduce, then run whatever the step needs. */
	function dispatchClassJoin(event: ClassJoinEvent): void {
		const before = classJoin;
		classJoin = classJoinReduce(before, event);
		m.redraw();

		// The student holds only the game code they just typed — the server
		// resolves the class through the session it belongs to.
		if (event.kind === 'choose-returning' && classJoin.step === 'busy') {
			joinClass({ sessionCode: code, mode: 'listAliases' })
				.then((result) =>
					dispatchClassJoin({
						kind: 'aliases-loaded',
						className: result.className,
						aliases: result.aliases ?? [],
					}),
				)
				.catch((error: unknown) =>
					dispatchClassJoin({ kind: 'failed', errorKey: classJoinErrorKey(error) }),
				);
		}
		if (event.kind === 'submit' && classJoin.step === 'busy') {
			if (classJoin.returnTo === 'claim') {
				joinClass({ sessionCode: code, mode: 'claim', alias: pendingAlias })
					.then((result) =>
						dispatchClassJoin({
							kind: 'claimed',
							alias: result.alias ?? pendingAlias,
							pin: result.pin ?? '',
						}),
					)
					.catch((error: unknown) =>
						dispatchClassJoin({ kind: 'failed', errorKey: classJoinErrorKey(error) }),
					);
			} else if (classJoin.returnTo === 'pin-entry' && classJoin.memberId) {
				joinClass({
					sessionCode: code,
					mode: 'reclaim',
					memberId: classJoin.memberId,
					pin: pendingPin,
				})
					.then(() => dispatchClassJoin({ kind: 'reclaimed' }))
					.catch((error: unknown) =>
						dispatchClassJoin({ kind: 'failed', errorKey: classJoinErrorKey(error) }),
					);
			}
		}
		if (classJoin.step === 'done' && before.step !== 'done') {
			// Membership settled — retry the join that sent us here
			void performJoin();
		}
	}

	let pendingAlias = '';
	let pendingPin = '';

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

			// A named room asks who you are before anything else — the name is
			// what everyone will see on your cards. A class game already has an
			// alias for you and never asks.
			if (session.identity === 'named' && !session.classId) {
				phase = 'name';
				m.redraw();
			} else {
				await afterName();
			}
		} catch (error) {
			console.error('[Join] Lookup failed:', error);
			phase = 'error';
			errorKey = 'common.error';
			m.redraw();
		}
	}

	async function afterName(): Promise<void> {
		if (session?.deviceMode === AgoraDeviceMode.team) {
			phase = 'team-size';
			m.redraw();
		} else {
			await performJoin();
		}
	}

	async function performJoin(): Promise<void> {
		phase = 'joining';
		m.redraw();
		try {
			const trimmedName = displayName.trim();
			const result = await joinSession({
				code,
				teamMemberCount: session?.deviceMode === AgoraDeviceMode.team ? teamMemberCount : undefined,
				...(trimmedName ? { displayName: trimmedName } : {}),
			});
			m.route.set(`/play/${result.sessionId}`);
		} catch (error) {
			// A class game admits roster members only: this specific refusal is
			// not an error, it is the door to the one-time class-join step.
			if (/class-membership-required/.test(String(error))) {
				phase = 'class-join';
				classJoin = INITIAL_CLASS_JOIN;
				pendingAlias = '';
				pendingPin = '';
				m.redraw();

				return;
			}
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

					phase === 'name'
						? m('.card.stack', [
								m('h3.text-center', t('join.your_name')),
								m('p.text-center.home-explanation', t('join.your_name_hint')),
								m('input.join__name-input', {
									type: 'text',
									value: displayName,
									maxlength: 40,
									autofocus: true,
									placeholder: t('join.your_name_placeholder'),
									oninput: (event: InputEvent) => {
										displayName = (event.target as HTMLInputElement).value;
									},
									onkeydown: (event: KeyboardEvent) => {
										if (event.key === 'Enter' && displayName.trim()) void afterName();
									},
								}),
								m(
									'button.btn.btn--primary.btn--full.btn--lg',
									{ disabled: !displayName.trim(), onclick: () => void afterName() },
									t('join.continue'),
								),
							])
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

					phase === 'class-join'
						? m(ClassJoinPanel, {
								state: classJoin,
								alias: pendingAlias,
								pin: pendingPin,
								onAlias: (value: string) => {
									pendingAlias = value;
								},
								onPin: (value: string) => {
									pendingPin = value;
								},
								dispatch: dispatchClassJoin,
							})
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
