import m from 'mithril';
import { TABLES_BASE_URL, tablesSessionUrl } from '@freedi/table-assignment-client';
import { t, tPlural } from '@/lib/i18n';
import { Action } from '@/lib/action';
import { LiveValue } from '@/lib/live';
import { closeAndSplit, computeAction } from '@/lib/tableAssignment/closeAndSplit';
import { tablesApi } from '@/lib/tableAssignment/client';
import { subscribeCounter } from '@/lib/tableAssignment/data';
import { deriveDirectTables, seatCountsFromParticipants } from '@/logic/directTables';
import { CopyLink } from '@/components/CopyLink';
import type { HostContext } from '@/components/HostFrame';
import { QrCode } from '@/components/QrCode';
import { TableCards, tableViewsFromDirect } from '@/components/TableCards';
import { FixDetailsDialog } from '@/views/host/FixDetailsDialog';
import { hostScreenPath } from '@/paths';

export interface LiveBodyAttrs {
	context: HostContext;
}

const QR_PX = 416;

/** Registration open: the count, the way in, and the one button that ends it. */
export const LiveBody: m.ClosureComponent<LiveBodyAttrs> = ({ attrs: first }) => {
	const sessionId = first.context.session.tableAssignmentId;
	const counter = new LiveValue('counter', subscribeCounter(sessionId));
	const close = new Action('tables.host.closeRegistration', 'tableAssignment.error.statusRefused');
	const end = new Action('tables.host.endSession', 'tableAssignment.error.statusRefused');
	let fixing = false;

	function closeFreeMode(): void {
		void close.run(() => tablesApi.setStatus({ sessionId, status: 'registrationClosed' }), {
			sessionId,
		});
	}

	function endSession(): void {
		void end.run(() => tablesApi.setStatus({ sessionId, status: 'ended' }), { sessionId });
	}

	function countBlock(registered: number, tableSize: number): m.Vnode {
		const tables = Math.ceil(registered / Math.max(tableSize, 1));

		return m('.live__count', [
			m(
				m.route.Link,
				{ href: hostScreenPath(sessionId, 'participants'), class: 'live__number-link' },
				[
					m('span.live__number', counter.state === 'loading' ? '–' : String(registered)),
					m('span.live__number-label', tPlural('tableAssignment.live.registered', registered)),
				],
			),
			registered > 0
				? m('span.live__estimate', tPlural('tableAssignment.live.estimate', tables))
				: null,
		]);
	}

	function joinCard(url: string): m.Vnode {
		return m('section.card.live__join', [
			m(QrCode, { url, widthPx: QR_PX, className: 'live__qr' }),
			m('span.live__url', { dir: 'ltr' }, url.replace(/^https?:\/\//, '')),
			m('.live__share', [
				m(CopyLink, { url }),
				m(
					'a.btn.btn--soft',
					{ href: hostScreenPath(sessionId, 'screen'), target: '_blank', rel: 'noopener' },
					t('tableAssignment.roomScreen.show'),
				),
			]),
		]);
	}

	function actionBlock(context: HostContext): m.Children {
		const { session } = context;
		const isOpen = session.status === 'registrationOpen';

		if (!isOpen) {
			return [
				m(
					'button.btn.btn--primary.btn--cta',
					{ type: 'button', disabled: end.busy, onclick: endSession },
					t(end.busy ? 'tableAssignment.saving' : 'tableAssignment.control.ended'),
				),
				end.errorKey ? m('p.notice.notice--error', { role: 'alert' }, t(end.errorKey)) : null,
			];
		}

		const isMix = session.mode === 'ranked';

		return [
			m(
				'button.btn.btn--primary.btn--cta',
				{
					type: 'button',
					disabled: close.busy || computeAction.busy,
					onclick: isMix ? () => void closeAndSplit(sessionId, close) : closeFreeMode,
				},
				t(
					close.busy || computeAction.busy
						? 'tableAssignment.saving'
						: isMix
							? 'tableAssignment.live.close'
							: 'tableAssignment.control.registrationClosed',
				),
			),
			close.errorKey ? m('p.notice.notice--error', { role: 'alert' }, t(close.errorKey)) : null,
			isMix ? m('p.live__note', t('tableAssignment.live.closeNote')) : null,
		];
	}

	function freeTables(context: HostContext): m.Children {
		const { session, topics, participants } = context;
		const tableSize = session.settings.tableSize ?? 0;
		const tables = deriveDirectTables(topics, seatCountsFromParticipants(participants), tableSize);

		return m(TableCards, {
			tables: tableViewsFromDirect(tables, participants),
			capacity: tableSize,
		});
	}

	return {
		oninit() {
			counter.start();
			computeAction.clear();
		},
		onremove() {
			counter.stop();
		},
		view({ attrs }) {
			const { context } = attrs;
			const { session, topics } = context;
			const isOpen = session.status === 'registrationOpen';
			const url = tablesSessionUrl(TABLES_BASE_URL, sessionId);
			const registered = counter.data ?? 0;

			return m('.live', [
				m('h1.visually-hidden', { dir: 'auto' }, session.title),
				m('.live__head', [
					m(
						'span.pill.pill--status',
						{ class: isOpen ? 'pill--success' : 'pill--warning' },
						t(isOpen ? 'tableAssignment.live.status' : 'tableAssignment.status.registrationClosed'),
					),
					m(
						'button.btn.btn--text',
						{
							type: 'button',
							onclick: () => {
								fixing = true;
							},
						},
						t('tableAssignment.fixDetails'),
					),
				]),
				countBlock(registered, session.settings.tableSize ?? 1),
				isOpen ? joinCard(url) : null,
				actionBlock(context),
				session.mode === 'direct' ? freeTables(context) : null,
				fixing
					? m(FixDetailsDialog, {
							session,
							topics,
							onClose: () => {
								fixing = false;
							},
						})
					: null,
			]);
		},
	};
};
