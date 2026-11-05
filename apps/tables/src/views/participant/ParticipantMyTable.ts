import m from 'mithril';
import { getLang, t } from '@/lib/i18n';
import { LiveValue } from '@/lib/live';
import { subscribeRun } from '@/lib/tableAssignment/data';
import { deriveDirectTables, tableByIndex } from '@/logic/directTables';
import { formatMoment, tableNumber } from '@/logic/format';
import { ParticipantFrame } from '@/components/ParticipantFrame';
import type { ParticipantContext } from '@/components/ParticipantFrame';
import { StateBox } from '@/components/StateBox';
import { participantHomePath, participantScreenPath } from '@/paths';

interface MyTableAttrs {
	context: ParticipantContext;
}

interface Seat {
	number: number;
	topicTitle: string;
	topicId: string;
	/** Ranked mode: when the published version was made. */
	publishedAt?: number;
}

function seatCard(seat: Seat, outsideChoices: boolean): m.Vnode {
	return m('section.card.my-table', [
		m('p.my-table__label', t('tableAssignment.myTable.numberLabel')),
		m('p.my-table__number', String(seat.number)),
		m('p.my-table__topic', t('tableAssignment.myTable.topic', { topic: seat.topicTitle })),
		seat.publishedAt !== undefined
			? m(
					'p.card__hint',
					t('tableAssignment.myTable.version', { date: formatMoment(seat.publishedAt, getLang()) }),
				)
			: null,
		outsideChoices
			? m('p.notice', { role: 'note' }, t('tableAssignment.myTable.outsideChoices'))
			: null,
	]);
}

const MyTableBody: m.ClosureComponent<MyTableAttrs> = () => {
	let runId: string | undefined;
	let run = new LiveValue('myRun', subscribeRun(''));

	/** Only the published run is ever read: a draft run is never subscribed to. */
	function follow(next: string | undefined): void {
		if (next === runId) return;
		run.stop();
		runId = next;
		run = new LiveValue('myRun', subscribeRun(next ?? ''));
		if (next) run.start();
	}

	return {
		onremove() {
			run.stop();
		},
		view({ attrs }) {
			const { session, topics, me, uid } = attrs.context;
			const id = session.tableAssignmentId;
			const home = participantHomePath(id);
			const back = { backHref: home, backLabel: t('tableAssignment.back.toHome') };

			if (!me) {
				return m(StateBox, {
					kind: 'empty',
					messageKey: 'tableAssignment.myTable.notRegistered',
					...back,
				});
			}

			if (session.mode === 'direct') {
				const tables = deriveDirectTables(topics, null, session.settings.tableSize ?? 0);
				const mine = tableByIndex(tables, me.chosenTableIndex);

				return mine
					? seatCard(
							{ number: mine.number, topicTitle: mine.topicTitle, topicId: mine.topicId },
							false,
						)
					: m(StateBox, {
							kind: 'empty',
							messageKey: 'tableAssignment.myTable.chooseFirst',
							action: m(
								m.route.Link,
								{ href: participantScreenPath(id, 'preferences'), class: 'btn btn--primary' },
								t('tableAssignment.stage.act.direct.button'),
							),
							...back,
						});
			}

			// Ranked mode: nothing to show until a version is published.
			if (session.status !== 'published' || !session.publishedRunId) {
				return m(StateBox, {
					kind: 'empty',
					messageKey: 'tableAssignment.myTable.waiting',
					...back,
				});
			}

			follow(session.publishedRunId);

			if (run.state === 'loading') return m(StateBox, { kind: 'loading' });
			if (run.state === 'denied' || run.state === 'error') {
				return m(StateBox, { kind: run.state, onRetry: () => run.retry(), ...back });
			}

			const published = run.data;

			// A run that is not the published one is a draft: never shown.
			if (!published || published.status !== 'published') {
				return m(StateBox, {
					kind: 'empty',
					messageKey: 'tableAssignment.myTable.waiting',
					...back,
				});
			}

			const table = published.tables.find((candidate) => candidate.memberUids.includes(uid));

			if (!table) {
				return m(StateBox, {
					kind: 'empty',
					messageKey: 'tableAssignment.myTable.notSeated',
					...back,
				});
			}

			const topic = topics.find((candidate) => candidate.topicId === table.topicId);
			const outside = me.preferences.length > 0 && !me.preferences.includes(table.topicId);

			return seatCard(
				{
					number: tableNumber(table.index),
					topicTitle: topic?.title ?? t('tableAssignment.topic.unknown'),
					topicId: table.topicId,
					publishedAt: published.publishedAt,
				},
				outside,
			);
		},
	};
};

/** `/sessions/:id/my-table`: My table. */
export const ParticipantMyTable: m.Component<{ id: string }> = {
	view({ attrs }) {
		return m(ParticipantFrame, {
			sessionId: attrs.id,
			titleKey: 'tableAssignment.screen.myTable',
			render: (context: ParticipantContext) => m(MyTableBody, { context }),
		});
	},
};
