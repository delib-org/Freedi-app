import m from 'mithril';
import '@/styles/teacher.scss';
import '@/styles/registration.scss';
import '@/styles/mulberry/index.scss';
import { classRegistrationOf } from '@freedi/shared-types';
import type { TableAssignment } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { getMainStatement } from '@/lib/store';
import { getUserState } from '@/lib/user';
import { lessonNameOf } from '@/lib/lessonLinks';
import { listMyRegistrations, syncRegistrationWatch } from '@/lib/classroom/registrationData';
import {
	TABLES_NEW_REGISTRATION_URL,
	connectableRegistrations,
} from '@/lib/classroom/registrationLogic';
import { WizColFooter } from '@/components/WizColFooter';
import { TeacherBackBar } from './TeacherBackBar';
import { NotYourLesson } from './NotYourLesson';
import { ConfirmDialog } from './ConfirmDialog';
import { releaseConsole, retainConsole, session } from './consoleSession';
import { consoleState, dismissFailure, isBusy } from './consoleState';
import { connectRegistration } from './registrationActions';
import { ConnectedRegistration } from './ConnectedRegistration';
import { RegistrationRow } from './RegistrationRow';

/**
 * `/t/:mid/registration` - "הרשמה מראש" (IA tables-class-bridge 4, 7). Not
 * connected: the registrations this Google account hosts, to pick one. Connected:
 * its status, who arrived, "לניהול ההרשמה", closing and removing. One screen, one
 * job: the connection of this lesson to one registration.
 */

/** Past this many rows the chooser offers a search by name (IA 8: "once the list passes one phone screen"). */
const SEARCH_FROM_ROWS = 6;

type LoadState = 'idle' | 'loading' | 'loaded' | 'failed';

interface PageState {
	load: LoadState;
	rows: TableAssignment[];
	search: string;
	held: boolean;
}

function loadRows(state: PageState): void {
	const uid = getUserState().user?.uid;
	if (!uid || state.load === 'loading') return;
	state.load = 'loading';
	listMyRegistrations(uid)
		.then((rows) => {
			state.rows = rows;
			state.load = 'loaded';
		})
		.catch(() => {
			state.load = 'failed';
		})
		.finally(() => m.redraw());
}

function failureLine(): m.Children {
	const failure = consoleState.failure;
	if (!failure) return null;

	return m('div.registration__failure', { role: 'alert' }, [
		m('span', failure.message ?? t('console.failed', { label: failure.label })),
		m('button.btn.btn--secondary', { type: 'button', onclick: failure.retry }, t('console.retry')),
		m(
			'button.btn.btn--tertiary',
			{ type: 'button', onclick: dismissFailure },
			t('console.dismiss'),
		),
	]);
}

function effectLines(): m.Vnode {
	return m('ul.registration__effects', { 'aria-label': t('console.register_ahead.effects') }, [
		m('li', t('console.register_ahead.effect.tables')),
		m('li', t('console.register_ahead.effect.side')),
	]);
}

function chooser(mid: string, state: PageState): m.Children {
	if (state.load === 'loading' || state.load === 'idle') {
		return m('.plan__skeleton', { 'aria-busy': 'true', 'aria-label': t('plan.loading') }, [
			m('.plan__skeleton-block.plan__skeleton-block--tall'),
		]);
	}
	if (state.load === 'failed') {
		return m('div.registration__empty', { role: 'alert' }, [
			m('p', t('console.register_ahead.load_failed')),
			m(
				'button.btn.btn--secondary',
				{
					type: 'button',
					onclick: () => {
						state.load = 'idle';
						loadRows(state);
					},
				},
				t('console.retry'),
			),
		]);
	}
	const all = connectableRegistrations(state.rows, mid);
	if (all.length === 0) {
		return m('div.registration__empty', { 'data-testid': 'registration-empty' }, [
			m('p', t('console.register_ahead.empty')),
			m(
				'a.btn.btn--primary',
				{ href: TABLES_NEW_REGISTRATION_URL, target: '_blank', rel: 'noopener' },
				t('console.register_ahead.new'),
			),
		]);
	}
	const needle = state.search.trim().toLocaleLowerCase();
	const shown = needle ? all.filter((row) => row.title.toLocaleLowerCase().includes(needle)) : all;

	return [
		all.length > SEARCH_FROM_ROWS
			? m('input.registration__search', {
					type: 'search',
					value: state.search,
					'aria-label': t('console.register_ahead.search'),
					placeholder: t('console.register_ahead.search'),
					oninput: (e: Event) => {
						state.search = (e.target as HTMLInputElement).value;
					},
				})
			: null,
		m(
			'ul.registration__list',
			{ 'data-testid': 'registration-list' },
			shown.map((row) =>
				m(RegistrationRow, {
					key: row.tableAssignmentId,
					row,
					busy: isBusy(`registration:connect:${row.tableAssignmentId}`),
					onConnect: () =>
						void connectRegistration(mid, row.tableAssignmentId).then((ok) => {
							if (ok) m.route.set(`/t/${mid}`);
						}),
				}),
			),
		),
		m(
			'a.registration__new',
			{ href: TABLES_NEW_REGISTRATION_URL, target: '_blank', rel: 'noopener' },
			t('console.register_ahead.new'),
		),
	];
}

export const RegistrationPage: m.Component = {
	oninit(vnode) {
		const state = vnode.state as unknown as PageState;
		state.load = 'idle';
		state.rows = [];
		state.search = '';
		state.held = true;
		const mid = m.route.param('mid');
		if (!mid) {
			m.route.set('/t');

			return;
		}
		retainConsole(mid);
	},

	onremove(vnode) {
		const state = vnode.state as unknown as PageState;
		syncRegistrationWatch(null);
		if (state.held) releaseConsole();
	},

	view(vnode) {
		const state = vnode.state as unknown as PageState;
		const mid = m.route.param('mid') ?? session.mainId;
		const main = getMainStatement();
		if (session.status === 'denied') return m(NotYourLesson);
		const ready = session.status === 'ready' && main !== null;
		const connected = ready ? classRegistrationOf(main) : undefined;
		syncRegistrationWatch(connected?.tableAssignmentId ?? null);
		if (ready && !connected && state.load === 'idle') loadRows(state);

		return m('.registration', [
			m(TeacherBackBar, { href: `/t/${mid}`, label: main ? lessonNameOf(main) : undefined }),
			m('header.registration__bar', [
				m('h1.registration__title', t('console.register_ahead')),
				m(
					'p.registration__lead',
					t(connected ? 'console.register_ahead.connected_lead' : 'console.register_ahead.choose'),
				),
			]),
			m(
				'main.registration__body',
				!ready
					? session.status === 'failed'
						? m('p.plan__load-error', { role: 'alert' }, t('plan.error.load'))
						: m('.plan__skeleton', { 'aria-busy': 'true', 'aria-label': t('plan.loading') }, [
								m('.plan__skeleton-block.plan__skeleton-block--tall'),
							])
					: [
							failureLine(),
							connected
								? m(ConnectedRegistration, { mid, main, registration: connected })
								: [effectLines(), chooser(mid, state)],
						],
			),
			m(WizColFooter),
			m(ConfirmDialog),
		]);
	},
};
