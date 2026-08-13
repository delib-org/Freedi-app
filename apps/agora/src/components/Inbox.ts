import m from 'mithril';
import { Icon } from './Icon';
import { t, tCount } from '../lib/i18n';
import { triggerLook } from '../lib/notificationCopy';
import {
	clearInbox,
	getInboxItems,
	inboxUnreadCount,
	markAllInboxRead,
	markInboxRead,
	type InboxItem,
} from '../lib/inbox';
import { requestFocus } from '../lib/helpedFocus';
import { formatMessageTime } from '../views/ThreadChat';

/**
 * The post box, as a button that lives in the HUD and the sheet it opens.
 *
 * The game's news used to exist only as toasts: six seconds, then gone
 * forever, with nothing anywhere that could answer "what did I miss?". The
 * badge here counts news not yet LOOKED AT — reading the list clears it — so
 * it never becomes a chore-counter competing with the tabs, which count work
 * still owed.
 */
export function Inbox(): m.Component {
	let open = false;

	function close(): void {
		if (!open) return;
		open = false;
		// Marked on the way OUT: while the sheet is open the unread marks are
		// exactly what tells a student which lines are the new ones
		markAllInboxRead();
	}

	function onKey(event: KeyboardEvent): void {
		if (event.key === 'Escape') close();
	}

	function row(item: InboxItem): m.Children {
		const look = triggerLook(item.trigger, '');

		return m(
			item.target ? 'button.inbox__row' : '.inbox__row.inbox__row--flat',
			{
				key: item.id,
				class: item.read ? undefined : 'inbox__row--unread',
				type: item.target ? 'button' : undefined,
				onclick: item.target
					? () => {
							markInboxRead(item.id);
							const target = item.target;
							close();
							// After the sheet is gone, so the screen it lands on is the
							// one the student actually sees move
							if (target) requestFocus(target);
						}
					: undefined,
			},
			[
				m('span.inbox__icon', { 'aria-hidden': 'true' }, m(Icon, { name: look.icon, size: 20 })),
				m('span.inbox__body', [
					m('span.inbox__line', look.line),
					item.detail ? m('span.inbox__detail', item.detail) : null,
				]),
				m('span.inbox__meta', [
					item.read ? null : m('span.inbox__dot', { 'aria-label': t('inbox.unread_mark') }),
					m('span.inbox__time', formatMessageTime(item.at)),
				]),
			],
		);
	}

	return {
		oncreate() {
			document.addEventListener('keydown', onKey);
		},

		onremove() {
			document.removeEventListener('keydown', onKey);
		},

		view() {
			const unread = inboxUnreadCount();
			const items = getInboxItems();

			return [
				m(
					'button.inbox-button',
					{
						type: 'button',
						'aria-expanded': String(open),
						'aria-label': unread > 0 ? tCount('inbox.unread', unread) : t('inbox.open'),
						onclick: () => {
							if (open) close();
							else open = true;
						},
					},
					[
						m(
							'span.inbox-button__icon',
							{ 'aria-hidden': 'true' },
							m(Icon, { name: 'mail', size: 22 }),
						),
						unread > 0
							? m('span.inbox-button__badge', { 'aria-hidden': 'true' }, String(unread))
							: null,
					],
				),
				open
					? [
							m('.inbox__scrim', { onclick: close, 'aria-hidden': 'true' }),
							m('.inbox', { role: 'dialog', 'aria-label': t('inbox.title') }, [
								m('.inbox__head', [
									m('span.inbox__title', t('inbox.title')),
									// Emptying it is the student's own business — a record of
									// what happened TO them that they cannot put down turns
									// into a list of chores
									items.length > 0
										? m(
												'button.inbox__clear',
												{
													type: 'button',
													onclick: () => {
														clearInbox();
													},
												},
												t('inbox.clear'),
											)
										: null,
									m(
										'button.inbox__close',
										{ type: 'button', 'aria-label': t('inbox.close'), onclick: close },
										'×',
									),
								]),
								items.length === 0
									? m('p.inbox__empty', t('inbox.empty'))
									: m('.inbox__list', items.map(row)),
							]),
						]
					: null,
			];
		},
	};
}
