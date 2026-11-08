import m from 'mithril';
import { Icon } from '../Icon';
import { t } from '../../lib/i18n';
import { ensureLibraryAccess, getLibraryStore } from '../../lib/scenarioLibrary/state';
import { getUserState } from '../../lib/user';

export interface LibraryDoorAttrs {
	/** `tile`: the wide door on the teacher's home. `link`: the quiet row under a picker. */
	variant: 'tile' | 'link';
	/** The teacher has no scenario of their own yet, so the door says what to do with it */
	empty?: boolean;
}

/**
 * A way into the library that exists only for an approved teacher. It asks the
 * server once (the answer is cached for the session) and renders nothing until
 * the answer is yes — a teacher who is not approved never sees that a library
 * exists.
 */
export function LibraryDoor(): m.Component<LibraryDoorAttrs> {
	let asked = false;

	function ask(): void {
		const user = getUserState().user;
		if (!user || user.isAnonymous) return;
		asked = true;
		void ensureLibraryAccess().then(() => m.redraw());
	}

	return {
		oninit: ask,
		onupdate() {
			if (!asked) ask();
		},
		view({ attrs }) {
			if (getLibraryStore().access !== 'approved') return null;

			if (attrs.variant === 'link') {
				return m(m.route.Link, { href: '/teach/library', class: 'scn-door-link' }, [
					m(Icon, { name: 'search', size: 18 }),
					m('span', t('scenlib.startgame_link')),
				]);
			}

			return m(m.route.Link, { href: '/teach/library', class: 'scn-door' }, [
				m('span.scn-door__icon', m(Icon, { name: 'tunnel', size: 30 })),
				m('span.scn-door__text', [
					m('strong.scn-door__title', t('scenlib.title')),
					m('span.scn-door__sub', t(attrs.empty ? 'scenlib.door_empty' : 'scenlib.door_sub')),
				]),
				m('span.scn-door__arrow', m(Icon, { name: 'arrow', size: 20 })),
			]);
		},
	};
}
