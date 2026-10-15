import m from 'mithril';
import { Icon } from '../Icon';
import { t } from '../../lib/i18n';
import { ensureLibraryAccess, getLibraryStore } from '../../lib/scenarioLibrary/state';
import { getUserState } from '../../lib/user';

/** How many more times a failed first ask is repeated, and how long it waits */
const MAX_RETRIES = 2;
const RETRY_MS = 1500;

export interface LibraryEntryAttrs {
	/**
	 * `open`: the prominent way in, for a teacher the server has approved.
	 * `locked`: the quiet line that says how to get approved, for one it has
	 * not. Each renders only for its own answer, so the home can place both
	 * and the teacher sees exactly one.
	 */
	mode: 'open' | 'locked';
}

/**
 * The scenario library's place on the teacher's home. It asks the server once
 * (the answer is cached for the session) and shows nothing while it is still
 * asking — the library's access rules are the server's, never guessed here.
 */
export function LibraryEntry(): m.Component<LibraryEntryAttrs> {
	let asked = false;
	let retries = 0;
	let retryTimer: number | undefined;

	function ask(): void {
		const user = getUserState().user;
		if (!user || user.isAnonymous) return;
		asked = true;
		void ensureLibraryAccess().then(() => m.redraw());
	}

	/**
	 * A first ask can land before the callable carries the teacher's sign-in
	 * (auth settles in two beats) and come back as an error. Say nothing about
	 * the library in the meantime and ask again, a couple of times, rather than
	 * leave the teacher's home without its library until the next visit.
	 */
	function retryOnError(): void {
		if (getLibraryStore().access !== 'error' || retries >= MAX_RETRIES || retryTimer) return;
		retries += 1;
		retryTimer = window.setTimeout(() => {
			retryTimer = undefined;
			void ensureLibraryAccess(true).then(() => m.redraw());
		}, RETRY_MS);
	}

	return {
		oninit: ask,
		onremove() {
			window.clearTimeout(retryTimer);
		},
		onupdate() {
			if (!asked) ask();
			retryOnError();
		},
		view({ attrs }) {
			const access = getLibraryStore().access;

			if (attrs.mode === 'open') {
				if (access !== 'approved') return null;

				return m(m.route.Link, { href: '/teach/library', class: 'lib-entry' }, [
					m('span.lib-entry__tile', m(Icon, { name: 'search', size: 22 })),
					m('span.lib-entry__text', [
						m('strong.lib-entry__title', t('scenlib.nav')),
						m('span.lib-entry__sub', t('scenlib.home_hint')),
					]),
					m('span.lib-entry__arrow', m(Icon, { name: 'arrow', size: 20 })),
				]);
			}

			if (access !== 'denied') return null;

			return m('.lib-entry.lib-entry--locked', { 'aria-disabled': 'true' }, [
				m('span.lib-entry__tile', m(Icon, { name: 'lock', size: 22 })),
				m('span.lib-entry__text', [
					m('span.lib-entry__title', t('scenlib.nav')),
					m('span.lib-entry__sub', t('scenlib.locked_hint')),
				]),
			]);
		},
	};
}
