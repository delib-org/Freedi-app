import m from 'mithril';
import { LanguagePicker } from '../../../components/LanguagePicker';
import { TeacherNav } from '../../../components/TeacherNav';
import { t } from '../../../lib/i18n';
import { ensureLibraryAccess, getLibraryStore } from '../../../lib/scenarioLibrary/state';
import { ensureUser, getUserState, signInWithGoogle } from '../../../lib/user';

export interface LibraryShellAttrs {
	title: string;
	subtitle?: string;
	onBack: () => void;
	/** Rendered only once the server has said this account is an approved teacher */
	onApproved?: () => void;
}

/**
 * The library's door. Every library screen sits inside it: it asks the server
 * whether this account is an approved teacher and shows the screen only on a
 * yes. A teacher who is not approved sees one honest sentence and nothing of
 * the library — not a list, not a count, not a card.
 */
export function LibraryShell(): m.Component<LibraryShellAttrs> {
	let lastUid: string | null = null;

	function check(onApproved?: () => void): void {
		void ensureUser()
			.then(() => ensureLibraryAccess())
			.then(() => {
				if (getLibraryStore().access === 'approved') onApproved?.();
				m.redraw();
			});
	}

	function body(attrs: LibraryShellAttrs, children: m.Children): m.Children {
		const user = getUserState();
		const store = getLibraryStore();
		if (user.loading || store.access === 'unknown' || store.access === 'checking') {
			return m('.stack', m('.spinner', { role: 'status', 'aria-label': t('scenlib.checking') }));
		}
		if (!user.user || user.user.isAnonymous) {
			return m('.card.stack.scn-gate', [
				m('h2.scn-gate__title', t('scenlib.signin_title')),
				m('p', t('teacher.sign_in_required')),
				m(
					'button.btn.btn--primary',
					{
						type: 'button',
						onclick: () => {
							signInWithGoogle()
								.then(() => {
									check(attrs.onApproved);
								})
								.catch((error: unknown) => console.error('[Library] Sign-in failed:', error));
						},
					},
					t('home.sign_in'),
				),
			]);
		}
		if (store.access === 'denied') {
			return m('.card.stack.scn-gate', [
				m('h2.scn-gate__title', t('scenlib.denied_title')),
				m('p', t('scenlib.denied_text')),
				m('button.btn.btn--secondary', { type: 'button', onclick: attrs.onBack }, t('common.back')),
			]);
		}
		if (store.access === 'error') {
			return m('.card.stack.scn-gate', [
				m('p', { role: 'alert' }, t('scenlib.error')),
				m(
					'button.btn.btn--primary',
					{
						type: 'button',
						onclick: () => {
							void ensureLibraryAccess(true).then(() => {
								if (getLibraryStore().access === 'approved') attrs.onApproved?.();
								m.redraw();
							});
						},
					},
					t('scenlib.retry'),
				),
			]);
		}

		return children;
	}

	return {
		oninit({ attrs }) {
			lastUid = getUserState().user?.uid ?? null;
			check(attrs.onApproved);
		},
		onupdate({ attrs }) {
			// Auth settles in two beats (anonymous, then the teacher's own account):
			// ask again when the uid under the page changes.
			const uid = getUserState().user?.uid ?? null;
			if (uid !== lastUid) {
				lastUid = uid;
				check(attrs.onApproved);
			}
		},
		view({ attrs, children }) {
			return m('.shell.shell--wide', [
				m(TeacherNav, {
					title: attrs.title,
					subtitle: attrs.subtitle,
					onBack: attrs.onBack,
					trailing: m(LanguagePicker),
				}),
				m('.shell__content.scn', body(attrs, children)),
			]);
		},
	};
}
