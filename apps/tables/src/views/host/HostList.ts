import m from 'mithril';
import type { TableAssignment } from '@freedi/shared-types';
import { getLang, t } from '@/lib/i18n';
import { LiveValue } from '@/lib/live';
import { subscribeHostSessions } from '@/lib/tableAssignment/data';
import { formatMoment } from '@/logic/format';
import { HostGate } from '@/components/HostGate';
import { signOutHost } from '@/lib/hostAuth';
import { Shell } from '@/components/Shell';
import { StateBox } from '@/components/StateBox';
import { StatusChip } from '@/components/StatusChip';
import { hostHomePath, hostNewPath } from '@/paths';

interface ListBodyAttrs {
	uid: string;
	title: string;
}

function sessionItem(session: TableAssignment): m.Vnode {
	return m('li.list__item', { key: session.tableAssignmentId }, [
		m(m.route.Link, { href: hostHomePath(session.tableAssignmentId), class: 'list__link' }, [
			m('span.list__title', { dir: 'auto' }, session.title),
			m('span.list__meta', [
				t(`tableAssignment.mode.${session.mode}`),
				' · ',
				formatMoment(session.createdAt, getLang()),
			]),
		]),
		m(StatusChip, { status: session.status }),
	]);
}

/** Active first, ended after (the subscription already gives newest first). */
function activeFirst(sessions: readonly TableAssignment[]): TableAssignment[] {
	return [
		...sessions.filter((session) => session.status !== 'ended'),
		...sessions.filter((session) => session.status === 'ended'),
	];
}

const ListBody: m.ClosureComponent<ListBodyAttrs> = (initial) => {
	const sessions = new LiveValue('hostSessions', subscribeHostSessions(initial.attrs.uid));
	let search = '';

	function newButton(first: boolean): m.Children {
		return m(
			m.route.Link,
			{ href: hostNewPath(), class: 'btn btn--primary btn--cta' },
			t(first ? 'tableAssignment.list.createFirst' : 'tableAssignment.list.create'),
		);
	}

	function matching(list: readonly TableAssignment[]): TableAssignment[] {
		const needle = search.trim().toLowerCase();

		return activeFirst(list.filter((session) => session.title.toLowerCase().includes(needle)));
	}

	return {
		oninit() {
			sessions.start();
		},
		onremove() {
			sessions.stop();
		},
		view({ attrs }) {
			const shell = { title: attrs.title, onSignOut: signOutHost };

			if (sessions.state === 'loading') return m(Shell, shell, m(StateBox, { kind: 'loading' }));
			if (sessions.state === 'denied' || sessions.state === 'error') {
				return m(
					Shell,
					shell,
					m(StateBox, { kind: sessions.state, onRetry: () => sessions.retry() }),
				);
			}

			const list = sessions.data ?? [];

			return m(
				Shell,
				shell,
				list.length === 0
					? [
							m(StateBox, { kind: 'empty', messageKey: 'tableAssignment.list.empty' }),
							newButton(true),
						]
					: [
							newButton(false),
							m('label.field', [
								m('span.field__label', t('tableAssignment.list.search')),
								m('input.field__input', {
									type: 'search',
									value: search,
									oninput: (event: Event) => {
										search = (event.target as HTMLInputElement).value;
									},
								}),
							]),
							m('ul.list', matching(list).map(sessionItem)),
						],
			);
		},
	};
};

/** `/host`: My table assignments. */
export const HostList: m.Component = {
	view() {
		const title = t('tableAssignment.screen.hostList');

		return m(HostGate, {
			title,
			render: (uid: string) => m(ListBody, { uid, title }),
		});
	},
};
