import m from 'mithril';
import type { TableAssignment } from '@freedi/shared-types';
import { TABLES_BASE_URL, tablesSessionUrl } from '@freedi/table-assignment-client';
import { t, tPlural } from '@/lib/i18n';
import { LiveValue } from '@/lib/live';
import { subscribeCounter, subscribeRun } from '@/lib/tableAssignment/data';
import { deriveDirectTables, seatCountsFromParticipants } from '@/logic/directTables';
import { nameByUid } from '@/logic/participants';
import {
	columnsForWidth,
	largestPageSize,
	nextPage,
	pageCount,
	pageItems,
	previousPage,
} from '@/logic/roomPages';
import { HostFrame } from '@/components/HostFrame';
import type { HostContext } from '@/components/HostFrame';
import { QrCode } from '@/components/QrCode';
import { StateBox } from '@/components/StateBox';
import { tableViewsFromDirect, tableViewsFromRun } from '@/components/TableCards';
import type { TableView } from '@/components/TableCards';

interface RoomBodyAttrs {
	context: HostContext;
}

interface SeatsAttrs {
	tables: TableView[];
}

const QR_PX = 880;
const PAGE_MS = 12_000;

/** A page of tables at a time, moving on by itself: nothing is shrunk past reading or clipped. */
const RoomSeats: m.ClosureComponent<SeatsAttrs> = () => {
	let page = 0;
	let paused = false;
	let pageSize = largestPageSize(window.innerWidth);
	let timer: ReturnType<typeof setInterval> | null = null;
	let pages = 1;

	function resetPageSize(): void {
		pageSize = largestPageSize(window.innerWidth);
		m.redraw();
	}

	/** A card that overflows means the page holds too many: take one less and measure again. */
	function shrinkUntilItFits(dom: Element): void {
		const overflowing = Array.from(dom.querySelectorAll<HTMLElement>('.room-table')).some(
			(card) => card.scrollHeight > card.clientHeight + 1,
		);

		if (overflowing && pageSize > 1) {
			pageSize -= 1;
			m.redraw();
		}
	}

	function control(labelKey: string, onclick: () => void): m.Vnode {
		return m('button.btn.btn--outline', { type: 'button', onclick }, t(labelKey));
	}

	function card(table: TableView): m.Vnode {
		return m('article.room-table', { key: table.number }, [
			m('.room-table__head', [
				m('span.room-table__number', String(table.number)),
				m('h2.room-table__topic', { dir: 'auto' }, table.topicTitle),
			]),
			m(
				'ul.room-table__names',
				table.names.map((name, index) => m('li', { key: `${index}-${name}`, dir: 'auto' }, name)),
			),
		]);
	}

	return {
		oncreate({ dom }) {
			shrinkUntilItFits(dom);
			window.addEventListener('resize', resetPageSize);
			timer = setInterval(() => {
				if (paused || pages <= 1) return;
				page = nextPage(page, pages);
				m.redraw();
			}, PAGE_MS);
		},
		onupdate({ dom }) {
			shrinkUntilItFits(dom);
		},
		onremove() {
			window.removeEventListener('resize', resetPageSize);
			if (timer !== null) clearInterval(timer);
		},
		view({ attrs }) {
			pages = pageCount(attrs.tables.length, pageSize);
			page = Math.min(page, pages - 1);
			const columns = Math.min(columnsForWidth(window.innerWidth), pageSize);

			return m('.room-seats', [
				m(
					'.room-seats__grid',
					{ style: { '--room-columns': columns } },
					pageItems(attrs.tables, page, pageSize).map(card),
				),
				pages > 1
					? m('.room-seats__pager', [
							control('tableAssignment.roomScreen.previous', () => {
								page = previousPage(page, pages);
							}),
							m(
								'span.room-seats__page',
								t('tableAssignment.roomScreen.page', { page: page + 1, pages }),
							),
							control('tableAssignment.roomScreen.next', () => {
								page = nextPage(page, pages);
							}),
							control(
								paused ? 'tableAssignment.roomScreen.resume' : 'tableAssignment.roomScreen.pause',
								() => {
									paused = !paused;
								},
							),
						])
					: null,
			]);
		},
	};
};

const RoomBody: m.ClosureComponent<RoomBodyAttrs> = ({ attrs: first }) => {
	const sessionId = first.context.session.tableAssignmentId;
	const counter = new LiveValue('counter', subscribeCounter(sessionId));
	let runId: string | undefined;
	let run = new LiveValue('publishedRun', subscribeRun(''));

	function follow(next: string | undefined): void {
		if (next === runId) return;
		run.stop();
		runId = next;
		run = new LiveValue('publishedRun', subscribeRun(next ?? ''));
		if (next) run.start();
	}

	function join(context: HostContext): m.Vnode {
		const url = tablesSessionUrl(TABLES_BASE_URL, sessionId);

		return m('.room-join', [
			m('.room-join__text', [
				m('h1.room-join__title', { dir: 'auto' }, context.session.title),
				m('p.room-join__scan', t('tableAssignment.roomScreen.scan')),
				m('span.room-join__count', tPlural('tableAssignment.home.count', counter.data ?? 0)),
			]),
			m('.room-join__code', [
				m(QrCode, { url, widthPx: QR_PX, className: 'room-join__qr' }),
				m('span.room-join__url', { dir: 'ltr' }, url.replace(/^https?:\/\//, '')),
			]),
		]);
	}

	function waiting(titleKey: string): m.Vnode {
		return m('.room-wait', [m('p.room-wait__text', t(titleKey))]);
	}

	function publishedSeats(context: HostContext): m.Children {
		if (run.state === 'denied' || run.state === 'error') {
			return m(StateBox, { kind: run.state, onRetry: () => run.retry() });
		}
		if (!run.data) return m(StateBox, { kind: 'loading' });

		return m(RoomSeats, {
			tables: tableViewsFromRun(run.data, context.topics, nameByUid(context.participants)),
		});
	}

	function freeSeats(context: HostContext): m.Children {
		const { session, topics, participants } = context;
		const tables = deriveDirectTables(
			topics,
			seatCountsFromParticipants(participants),
			session.settings.tableSize ?? 0,
		);

		return m(RoomSeats, { tables: tableViewsFromDirect(tables, participants) });
	}

	return {
		oninit() {
			counter.start();
		},
		onremove() {
			counter.stop();
			run.stop();
		},
		view({ attrs }) {
			const { context } = attrs;
			const { session } = context;

			follow(session.publishedRunId);

			if (session.publishedRunId) return publishedSeats(context);
			if (showsSeats(session)) return freeSeats(context);
			if (session.status === 'draft') return waiting('tableAssignment.notOpen.title');

			return session.status === 'registrationOpen'
				? join(context)
				: waiting('tableAssignment.roomScreen.tablesSoon');
		},
	};
};

function showsSeats(session: TableAssignment): boolean {
	if (session.publishedRunId) return true;

	return (
		session.mode === 'direct' && session.status !== 'draft' && session.status !== 'registrationOpen'
	);
}

/** `/host/sessions/:id/screen`: before, the way in; after publishing, who sits where. */
export const RoomScreen: m.Component<{ id: string }> = {
	view({ attrs }) {
		return m(HostFrame, {
			sessionId: attrs.id,
			titleKey: 'tableAssignment.roomScreen',
			topics: true,
			participants: true,
			shellFor: (session) => ({
				title: undefined,
				backHref: undefined,
				room: true,
				largeLogo: true,
				barTitle: showsSeats(session) ? t('tableAssignment.roomScreen.seats') : undefined,
			}),
			render: (context: HostContext) => m(RoomBody, { context }),
		});
	},
};
