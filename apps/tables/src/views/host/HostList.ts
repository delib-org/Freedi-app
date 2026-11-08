import m from 'mithril';
import type { TableAssignment, TableAssignmentMode } from '@freedi/shared-types';
import { TABLE_ASSIGNMENT_TITLE_MAX_LENGTH } from '@freedi/shared-types';
import { getLang, t } from '@/lib/i18n';
import { Action } from '@/lib/action';
import { LiveValue } from '@/lib/live';
import { tablesApi } from '@/lib/tableAssignment/client';
import { subscribeHostSessions } from '@/lib/tableAssignment/data';
import { formatMoment } from '@/logic/format';
import { HostGate } from '@/components/HostGate';
import { Shell } from '@/components/Shell';
import { StateBox } from '@/components/StateBox';
import { StatusChip } from '@/components/StatusChip';
import { hostHomePath } from '@/paths';

const DEFAULT_MODE: TableAssignmentMode = 'ranked';

interface ListBodyAttrs {
	uid: string;
	title: string;
}

function sessionItem(session: TableAssignment): m.Vnode {
	return m('li.list__item', { key: session.tableAssignmentId }, [
		m(m.route.Link, { href: hostHomePath(session.tableAssignmentId), class: 'list__link' }, [
			m('span.list__title', session.title),
			m('span.list__meta', [
				t(`tableAssignment.mode.${session.mode}`),
				' · ',
				formatMoment(session.createdAt, getLang()),
			]),
		]),
		m(StatusChip, { status: session.status }),
	]);
}

const ListBody: m.ClosureComponent<ListBodyAttrs> = (initial) => {
	const sessions = new LiveValue('hostSessions', subscribeHostSessions(initial.attrs.uid));
	const create = new Action('tables.host.createSession', 'tableAssignment.error.generic');
	let title = '';
	let mode: TableAssignmentMode = DEFAULT_MODE;

	async function submit(event: Event): Promise<void> {
		event.preventDefault();

		const trimmed = title.trim();

		if (trimmed === '') return;

		const result = await create.run(() => tablesApi.createSession({ title: trimmed, mode }), {
			mode,
		});

		if (result) m.route.set(hostHomePath(result.session.tableAssignmentId));
	}

	function form(first: boolean): m.Vnode {
		return m('form.card.form', { onsubmit: (event: Event) => void submit(event) }, [
			m(
				'h2.card__title',
				t(first ? 'tableAssignment.list.createFirst' : 'tableAssignment.list.create'),
			),
			m('label.field', [
				m('span.field__label', t('tableAssignment.field.title')),
				m('input.field__input', {
					type: 'text',
					required: true,
					maxlength: TABLE_ASSIGNMENT_TITLE_MAX_LENGTH,
					value: title,
					oninput: (event: Event) => {
						title = (event.target as HTMLInputElement).value;
					},
				}),
			]),
			m('fieldset.choice', [
				m('legend.field__label', t('tableAssignment.field.mode')),
				(['ranked', 'direct'] as const).map((value) =>
					m('label.choice__option', { key: value }, [
						m('input', {
							type: 'radio',
							name: 'mode',
							value,
							checked: mode === value,
							onchange: () => {
								mode = value;
							},
						}),
						m('span', [
							m('strong', t(`tableAssignment.mode.${value}`)),
							m('small.choice__hint', t(`tableAssignment.mode.${value}.hint`)),
						]),
					]),
				),
			]),
			create.errorKey ? m('p.notice.notice--error', { role: 'alert' }, t(create.errorKey)) : null,
			m(
				'button.btn.btn--primary',
				{ type: 'submit', disabled: create.busy || title.trim() === '' },
				t(create.busy ? 'tableAssignment.saving' : 'tableAssignment.create'),
			),
		]);
	}

	return {
		oninit() {
			sessions.start();
		},
		onremove() {
			sessions.stop();
		},
		view({ attrs }) {
			if (sessions.state === 'loading') {
				return m(Shell, { title: attrs.title }, m(StateBox, { kind: 'loading' }));
			}
			if (sessions.state === 'denied' || sessions.state === 'error') {
				return m(
					Shell,
					{ title: attrs.title },
					m(StateBox, { kind: sessions.state, onRetry: () => sessions.retry() }),
				);
			}

			const list = sessions.data ?? [];

			return m(Shell, { title: attrs.title }, [
				list.length === 0
					? [m(StateBox, { kind: 'empty', messageKey: 'tableAssignment.list.empty' }), form(true)]
					: [m('ul.list', list.map(sessionItem)), form(false)],
			]);
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
