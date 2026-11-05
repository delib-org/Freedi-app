import m from 'mithril';
import { TABLES_BASE_URL, tablesSessionUrl } from '@freedi/table-assignment-client';
import { t } from '@/lib/i18n';
import { Action } from '@/lib/action';
import { tablesApi } from '@/lib/tableAssignment/client';
import { nextHostAction } from '@/logic/nextAction';
import type { NextAction } from '@/logic/nextAction';
import { HostFrame } from '@/components/HostFrame';
import type { HostContext } from '@/components/HostFrame';
import { ShareLink } from '@/components/ShareLink';
import { StatusChip } from '@/components/StatusChip';
import { hostScreenPath } from '@/paths';
import type { HostSubScreen } from '@/paths';

const SUB_SCREENS: ReadonlyArray<{ screen: HostSubScreen; key: string }> = [
	{ screen: 'topics', key: 'tableAssignment.screen.topics' },
	{ screen: 'settings', key: 'tableAssignment.screen.settings' },
	{ screen: 'participants', key: 'tableAssignment.screen.participants' },
	{ screen: 'preview', key: 'tableAssignment.screen.preview' },
	{ screen: 'assignment', key: 'tableAssignment.screen.assignment' },
];

interface HomeBodyAttrs {
	context: HostContext;
}

const HomeBody: m.ClosureComponent<HomeBodyAttrs> = () => {
	const statusAction = new Action('tables.host.setStatus', 'tableAssignment.error.statusRefused');

	async function applyStatus(
		sessionId: string,
		action: Extract<NextAction, { kind: 'status' }>,
	): Promise<void> {
		await statusAction.run(() => tablesApi.setStatus({ sessionId, status: action.status }), {
			sessionId,
			status: action.status,
		});
	}

	function nextActionCard(context: HostContext): m.Vnode {
		const { session, topics } = context;
		const action = nextHostAction({
			status: session.status,
			mode: session.mode,
			topicCount: topics.length,
		});
		const id = session.tableAssignmentId;

		return m('section.card.next-action', [
			m('h2.card__title', t('tableAssignment.home.next')),
			m('p', t(`tableAssignment.next.${action.key}`)),
			action.kind === 'go'
				? m(
						m.route.Link,
						{ href: hostScreenPath(id, action.screen), class: 'btn btn--primary' },
						t(`tableAssignment.next.${action.key}.button`),
					)
				: null,
			action.kind === 'status'
				? m(
						'button.btn.btn--primary',
						{
							type: 'button',
							disabled: statusAction.busy,
							onclick: () => void applyStatus(id, action),
						},
						t(
							statusAction.busy
								? 'tableAssignment.saving'
								: `tableAssignment.next.${action.key}.button`,
						),
					)
				: null,
			statusAction.errorKey
				? m('p.notice.notice--error', { role: 'alert' }, t(statusAction.errorKey))
				: null,
		]);
	}

	return {
		view({ attrs }) {
			const { session, topics, participants } = attrs.context;
			const id = session.tableAssignmentId;
			const url = tablesSessionUrl(TABLES_BASE_URL, id);

			return [
				m('section.card', [
					m('.card__row', [
						m(StatusChip, { status: session.status }),
						m('span.card__meta', t(`tableAssignment.mode.${session.mode}`)),
					]),
					m('dl.counts', [
						m('div.counts__item', [
							m('dt', t('tableAssignment.count.topics')),
							m('dd', String(topics.length)),
						]),
						m('div.counts__item', [
							m('dt', t('tableAssignment.count.registered')),
							m('dd', String(participants.length)),
						]),
					]),
				]),
				nextActionCard(attrs.context),
				m('section.card', [
					m('h2.card__title', t('tableAssignment.home.participantLink')),
					m('p.card__hint', t('tableAssignment.home.participantLinkHint')),
					m(ShareLink, { url }),
				]),
				m('nav.card', { 'aria-label': t('tableAssignment.home.sections') }, [
					m('h2.card__title', t('tableAssignment.home.sections')),
					m(
						'ul.list',
						SUB_SCREENS.map(({ screen, key }) =>
							m('li.list__item', { key: screen }, [
								m(m.route.Link, { href: hostScreenPath(id, screen), class: 'list__link' }, [
									m('span.list__title', t(key)),
								]),
							]),
						),
					),
				]),
			];
		},
	};
};

/** `/host/sessions/:id`: Host home. */
export const HostHome: m.Component<{ id: string }> = {
	view({ attrs }) {
		return m(HostFrame, {
			sessionId: attrs.id,
			titleKey: 'tableAssignment.screen.hostHome',
			topics: true,
			participants: true,
			isHome: true,
			render: (context: HostContext) => m(HomeBody, { context }),
		});
	},
};
