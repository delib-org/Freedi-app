import m from 'mithril';
import { Statement } from '@freedi/shared-types';
import { ensureUser, signInWithGoogle, getUserState } from '@/lib/user';
import {
	loadMainStatement,
	getMainStatement,
	getSubQuestions,
	subscribeMainStatement,
	subscribeSubQuestions,
} from '@/lib/store';
import { checkAdminStatus, isAdmin } from '@/lib/admin';
import { recordMyWorkspace } from '@/lib/myWorkspaces';
import { t, isRTL } from '@/lib/i18n';
import { WizColFooter } from '@/components/WizColFooter';
import { FacilitatorPanel } from '@/components/FacilitatorPanel';
import { SplashLoader } from '@/views/Splash';
import type { Unsubscribe } from '@/lib/firebase';

function getStatementBody(s: Statement): string | null {
	// `description` is the cloud-function-cached preview built from child
	// paragraph sub-statements (`statementType === paragraph`), capped at
	// ~200 chars. Using it here is intentional — it saves an extra Firestore
	// query on the hub. `brief` is the admin-authored tagline fallback.
	// The legacy embedded `paragraphs[]` array is no longer the source of truth.
	if (s.description) return s.description;
	if (s.brief) return s.brief;

	return null;
}

let loading = true;
let error: string | null = null;
let mainUnsub: Unsubscribe | null = null;
let subUnsub: Unsubscribe | null = null;

export const MainHub: m.Component = {
	async oninit() {
		loading = true;
		error = null;

		const mainId = m.route.param('mid');
		if (!mainId) {
			error = t('solutions.error.no_id');
			loading = false;
			m.redraw();

			return;
		}

		try {
			await ensureUser();
			await loadMainStatement(mainId);
			// Resolve admin status against the main statement so the facilitator
			// panel handle is visible to admins even on the hub (where no specific
			// question is in scope yet). Per-question status is re-resolved on
			// navigation into Solutions.
			const main = getMainStatement();
			if (main) {
				await checkAdminStatus(mainId, main.creatorId);
				// Once admin is confirmed, remember this workspace on this device so
				// it shows up on the Main page list. Non-admin visitors don't get
				// their visit persisted — the list is "workspaces I run", not
				// "workspaces I've seen".
				if (isAdmin()) {
					recordMyWorkspace({
						id: main.statementId,
						title: main.statement,
						color: main.color,
					});
				}
			}
			mainUnsub = subscribeMainStatement(mainId);
			subUnsub = subscribeSubQuestions(mainId);
		} catch (err) {
			console.error('[MainHub] Failed to load:', err);
			error = t('solutions.error.failed');
		} finally {
			loading = false;
			m.redraw();
		}
	},

	onremove() {
		if (mainUnsub) {
			mainUnsub();
			mainUnsub = null;
		}
		if (subUnsub) {
			subUnsub();
			subUnsub = null;
		}
	},

	view() {
		if (loading) {
			return m(SplashLoader);
		}

		if (error) {
			return m('.main-hub', m('.main-hub__empty', error));
		}

		const main = getMainStatement();
		if (!main) {
			return m('.main-hub', m('.main-hub__empty', t('solutions.error.not_found')));
		}

		const subs = getSubQuestions();
		const accentColor = main.color || 'var(--terra-500)';
		const logoSrc = isRTL() ? '/wizcol-logo-rtl.png' : '/wizcol-logo-ltr.png';
		const admin = isAdmin();
		const mainId = main.statementId;

		return m('.main-hub', { style: `--q-accent: ${accentColor}` }, [
			m('.main-hub__brand', [
				m('img.main-hub__logo', {
					src: logoSrc,
					alt: 'WizCol',
					width: 64,
					height: 64,
					loading: 'eager',
					decoding: 'async',
				}),
				renderAdminSignIn(main.statementId, main.creatorId),
			]),
			m('h1.main-hub__title', main.statement),
			(() => {
				const body = getStatementBody(main);

				return body ? m('.main-hub__description', body) : null;
			})(),
			m('.main-hub__scroll', [
				m('h2.main-hub__questions-heading', t('mainHub.questionsHeading')),
				subs.length === 0
					? m('.main-hub__empty', t('mainHub.empty'))
					: m(
							'.main-hub__question-list',
							subs.map((q: Statement) => renderQuestionCard(q, mainId, admin)),
						),
				m(WizColFooter),
			]),
			m(FacilitatorPanel),
		]);
	},
};

function renderQuestionCard(q: Statement, mainId: string, admin: boolean): m.Vnode {
	const cardClass = `.main-hub__question-card${admin ? '.main-hub__question-card--interactive' : ''}`;

	return m(
		cardClass,
		{
			key: q.statementId,
			role: admin ? 'button' : undefined,
			tabindex: admin ? '0' : undefined,
			'aria-disabled': admin ? undefined : 'true',
			onclick: admin
				? () => {
						m.route.set(`/m/${mainId}/q/${q.statementId}`);
					}
				: undefined,
			onkeydown: admin
				? (e: KeyboardEvent) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							m.route.set(`/m/${mainId}/q/${q.statementId}`);
						}
					}
				: undefined,
		},
		[
			m('.main-hub__question-card-body', [
				m('.main-hub__question-title', q.statement),
				(() => {
					const body = getStatementBody(q);

					return body ? m('.main-hub__question-description', body) : null;
				})(),
			]),
		],
	);
}

/** Discreet "Sign in as admin" link in the top-inline-end corner of the
 *  hub brand row. Mirrors `Solutions.renderAdminSignIn` but presented as a
 *  text link rather than a button — the hub is a participant-first surface
 *  and shouldn't grow an admin-shaped CTA. Hidden once the user has a
 *  non-anonymous session, at which point either the FacilitatorPanel handle
 *  takes over (admin) or nothing replaces the link (non-admin Google user). */
function renderAdminSignIn(mainId: string, creatorId: string): m.Children {
	const user = getUserState().user;
	if (!user || !user.isAnonymous) return null;

	return m(
		'button.main-hub__admin-signin',
		{
			type: 'button',
			onclick: async () => {
				try {
					await signInWithGoogle();
					await checkAdminStatus(mainId, creatorId);
					// Belated admin confirmation — record the workspace now so it
					// appears on the Main page after this hub recognises us.
					if (isAdmin()) {
						const main = getMainStatement();
						if (main) {
							recordMyWorkspace({
								id: main.statementId,
								title: main.statement,
								color: main.color,
							});
						}
					}
					m.redraw();
				} catch (err) {
					console.error('[MainHub] Admin sign-in failed:', err);
				}
			},
		},
		t('admin.signin'),
	);
}
