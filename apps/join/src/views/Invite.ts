import m from 'mithril';
import { auth } from '@/lib/firebase';
import { signInWithGoogle, signOut, waitForAuthReady, getUserState } from '@/lib/user';
import { acceptJoinDelegateInvite } from '@/lib/store';
import { t, isRTL } from '@/lib/i18n';
import { SplashLoader } from '@/views/Splash';

type InviteState =
	| 'loading'
	| 'needs-login'
	| 'wrong-account'
	| 'accepting'
	| 'success'
	| 'expired'
	| 'already-accepted'
	| 'revoked'
	| 'generic-error';

interface AcceptResult {
	questionId: string;
	permissions: {
		canManageOrganizerSolutions: boolean;
		canManageParticipantSolutions: boolean;
	};
}

let state: InviteState = 'loading';
let token = '';
let busy = false;
let errorCode = '';
let acceptedQuestionId = '';
let acceptedPermissions: AcceptResult['permissions'] | null = null;
let countdownTimer: ReturnType<typeof setInterval> | null = null;
let countdownSeconds = 0;
let referrerMetaInjected = false;

function ensureReferrerMeta(): void {
	if (referrerMetaInjected) return;
	if (typeof document === 'undefined') return;
	const existing = document.querySelector('meta[name="referrer"]');
	if (existing) {
		existing.setAttribute('content', 'no-referrer');
	} else {
		const meta = document.createElement('meta');
		meta.setAttribute('name', 'referrer');
		meta.setAttribute('content', 'no-referrer');
		document.head.appendChild(meta);
	}
	referrerMetaInjected = true;
}

function clearCountdown(): void {
	if (countdownTimer !== null) {
		clearInterval(countdownTimer);
		countdownTimer = null;
	}
}

function readToken(): string {
	const raw = m.route.param('token');
	if (typeof raw === 'string' && raw.length > 0) return raw;
	const search = new URLSearchParams(window.location.search);
	const fallback = search.get('token');

	return fallback ?? '';
}

async function attemptAccept(): Promise<void> {
	if (busy) return;
	busy = true;
	state = 'accepting';
	errorCode = '';
	m.redraw();

	try {
		const result = (await acceptJoinDelegateInvite(token)) as AcceptResult;
		acceptedQuestionId = result.questionId;
		acceptedPermissions = result.permissions;
		state = 'success';
		startSuccessCountdown();
	} catch (err: unknown) {
		mapError(err);
	} finally {
		busy = false;
		m.redraw();
	}
}

function mapError(err: unknown): void {
	const code = (err as { code?: string })?.code ?? '';
	errorCode = String(code);
	if (code === 'functions/already-exists') {
		state = 'already-accepted';
	} else if (code === 'functions/permission-denied') {
		// Two cases produce permission-denied: invite was revoked OR caller's
		// email doesn't match. The error message text contains "cancelled"
		// for the revoked case (see fn_acceptJoinDelegateInvite).
		const message = (err as { message?: string })?.message ?? '';
		if (message.toLowerCase().includes('cancelled')) {
			state = 'revoked';
		} else {
			state = 'wrong-account';
		}
	} else if (code === 'functions/failed-precondition') {
		const message = (err as { message?: string })?.message ?? '';
		if (message.toLowerCase().includes('expired')) {
			state = 'expired';
		} else {
			state = 'wrong-account';
		}
	} else if (code === 'functions/not-found') {
		state = 'generic-error';
	} else {
		state = 'generic-error';
	}
	console.error('[Invite] accept failed:', err);
}

function startSuccessCountdown(): void {
	clearCountdown();
	countdownSeconds = 3;
	countdownTimer = setInterval(() => {
		countdownSeconds -= 1;
		if (countdownSeconds <= 0) {
			clearCountdown();
			openQuestion();

			return;
		}
		m.redraw();
	}, 1000);
}

function openQuestion(): void {
	if (!acceptedQuestionId) return;
	clearCountdown();
	m.route.set('/q/:qid', { qid: acceptedQuestionId });
}

async function handleSwitchAccount(): Promise<void> {
	if (busy) return;
	busy = true;
	m.redraw();
	try {
		await signOut();
		await signInWithGoogle();
		// After re-signing, fall back through the state machine.
		await initFlow();
	} catch (err) {
		console.error('[Invite] switch account failed:', err);
		state = 'generic-error';
		errorCode = 'switch-account';
	} finally {
		busy = false;
		m.redraw();
	}
}

async function handleGoogleSignIn(): Promise<void> {
	if (busy) return;
	busy = true;
	m.redraw();
	try {
		await signInWithGoogle();
		await initFlow();
	} catch (err) {
		console.error('[Invite] sign-in failed:', err);
		state = 'generic-error';
		errorCode = 'sign-in';
	} finally {
		busy = false;
		m.redraw();
	}
}

async function initFlow(): Promise<void> {
	await waitForAuthReady();
	const user = getUserState().user;
	if (!user || user.isAnonymous || !user.email) {
		state = 'needs-login';
		m.redraw();

		return;
	}
	await attemptAccept();
}

export const Invite: m.Component = {
	async oninit() {
		ensureReferrerMeta();
		state = 'loading';
		busy = false;
		errorCode = '';
		acceptedQuestionId = '';
		acceptedPermissions = null;
		token = readToken();
		if (!token) {
			state = 'generic-error';
			errorCode = 'no-token';
			m.redraw();

			return;
		}
		await initFlow();
	},

	onremove() {
		clearCountdown();
	},

	view() {
		if (state === 'loading') {
			return m(SplashLoader);
		}

		const logoSrc = isRTL() ? '/wizcol-logo-rtl.png' : '/wizcol-logo-ltr.png';

		return m('.login', [
			m('.login__card.invite__card', { role: 'status', 'aria-live': 'polite' }, [
				m('img.login__logo', {
					src: logoSrc,
					alt: 'WizCol',
					width: 72,
					height: 72,
					loading: 'eager',
					decoding: 'async',
				}),
				renderBody(),
			]),
		]);
	},
};

function renderBody(): m.Vnode | Array<m.Vnode | null> {
	switch (state) {
		case 'needs-login':
			return renderNeedsLogin();
		case 'wrong-account':
			return renderWrongAccount();
		case 'accepting':
			return renderAccepting();
		case 'success':
			return renderSuccess();
		case 'expired':
			return renderExpired();
		case 'already-accepted':
			return renderAlreadyAccepted();
		case 'revoked':
			return renderRevoked();
		case 'generic-error':
		default:
			return renderGenericError();
	}
}

function renderNeedsLogin(): m.Vnode[] {
	return [
		m('h1.login__title.invite__title', t('invite.title')),
		m('p.invite__inviter', t('invite.inviter.unknown')),
		m('p.invite__notice', t('invite.emailBinding', { email: t('invite.cta.signIn') })),
		m('.login__actions', [
			m(
				'button.login__btn.login__btn--google',
				{
					type: 'button',
					disabled: busy,
					'aria-busy': busy ? 'true' : undefined,
					onclick: handleGoogleSignIn,
				},
				[
					m('span.login__btn-icon', { 'aria-hidden': 'true' }, 'G'),
					m('span', t('invite.cta.signIn')),
				],
			),
		]),
	];
}

function renderWrongAccount(): m.Vnode[] {
	const currentEmail = auth.currentUser?.email ?? '';

	return [
		m('h1.login__title.invite__title', t('invite.wrong.title')),
		m(
			'p.invite__inviter',
			t('invite.wrong.body', {
				currentEmail: currentEmail || '—',
				invitedEmail: t('invite.cta.signIn'),
			}),
		),
		m('.login__actions', [
			m(
				'button.login__btn.login__btn--google',
				{
					type: 'button',
					disabled: busy,
					'aria-busy': busy ? 'true' : undefined,
					onclick: handleSwitchAccount,
				},
				[
					m('span.login__btn-icon', { 'aria-hidden': 'true' }, 'G'),
					m('span', t('invite.wrong.switch')),
				],
			),
			m(
				'button.btn.btn--secondary',
				{
					type: 'button',
					disabled: busy,
					onclick: () => m.route.set('/'),
				},
				t('invite.wrong.cancel'),
			),
		]),
	];
}

function renderAccepting(): m.Vnode[] {
	return [
		m('h1.login__title.invite__title', t('invite.accepting')),
		m('.invite__spinner', { 'aria-hidden': 'true' }),
	];
}

function renderSuccess(): Array<m.Vnode | null> {
	const permsLine = formatPermsLine(acceptedPermissions);

	return [
		m('.invite__success-icon', { 'aria-hidden': 'true' }, '✓'),
		m('h1.login__title.invite__title', t('invite.success.title')),
		m('p.invite__inviter', t('invite.success.body')),
		permsLine ? m('p.invite__perms-summary', permsLine) : null,
		m(
			'p.invite__redirect-line',
			t('invite.success.redirect', { seconds: Math.max(0, countdownSeconds) }),
		),
		m('.login__actions', [
			m(
				'button.login__btn.login__btn--google',
				{ type: 'button', onclick: openQuestion },
				t('invite.success.open'),
			),
		]),
	];
}

function renderExpired(): m.Vnode[] {
	return [
		m('h1.login__title.invite__title', t('invite.expired.title')),
		m('p.invite__inviter', t('invite.expired.body', { date: '', inviterName: '' })),
		m('.login__actions', [
			m(
				'button.btn.btn--secondary',
				{ type: 'button', onclick: () => m.route.set('/') },
				t('invite.expired.contact.fallback'),
			),
		]),
	];
}

function renderAlreadyAccepted(): m.Vnode[] {
	return [
		m('h1.login__title.invite__title', t('invite.already.title')),
		m('p.invite__inviter', t('invite.already.body', { date: '' })),
		m('.login__actions', [
			m(
				'button.login__btn.login__btn--google',
				{ type: 'button', onclick: () => m.route.set('/') },
				t('invite.already.open'),
			),
		]),
	];
}

function renderRevoked(): m.Vnode[] {
	return [
		m('h1.login__title.invite__title', t('invite.revoked.title')),
		m('p.invite__inviter', t('invite.revoked.body', { date: '' })),
		m('.login__actions', [
			m(
				'button.btn.btn--secondary',
				{ type: 'button', onclick: () => m.route.set('/') },
				t('invite.revoked.home'),
			),
		]),
	];
}

function renderGenericError(): Array<m.Vnode | null> {
	return [
		m('h1.login__title.invite__title', t('invite.error.title')),
		m('p.invite__inviter', t('invite.error.body')),
		errorCode ? m('p.invite__expiry', t('invite.error.code', { code: errorCode })) : null,
		m('.login__actions', [
			m(
				'button.login__btn.login__btn--google',
				{
					type: 'button',
					disabled: busy,
					onclick: () => {
						void initFlow();
					},
				},
				t('invite.error.retry'),
			),
		]),
	];
}

function formatPermsLine(perms: AcceptResult['permissions'] | null): string | null {
	if (!perms) return null;
	if (perms.canManageOrganizerSolutions && perms.canManageParticipantSolutions) {
		return t('invite.perms.both');
	}
	if (perms.canManageOrganizerSolutions) return t('invite.perms.organizer');
	if (perms.canManageParticipantSolutions) return t('invite.perms.participant');

	return null;
}
