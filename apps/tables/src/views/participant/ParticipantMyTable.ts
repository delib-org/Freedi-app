import m from 'mithril';
import type { TableAssignment, TableAssignmentRosterEntry } from '@freedi/shared-types';
import { t, tPlural } from '@/lib/i18n';
import { LiveValue } from '@/lib/live';
import { subscribeRun, subscribeTablemates } from '@/lib/tableAssignment/data';
import { deriveDirectTables, tableByIndex } from '@/logic/directTables';
import { tableNumber } from '@/logic/format';
import { offersEntry } from '@/logic/enterDiscussion';
import { canEditPreferences } from '@/logic/nextAction';
import { isOneTopic } from '@/logic/steps';
import { chosenCountOf, chosenTopicId, isSplitSession } from '@/logic/topicPicker';
import { choiceOutcome, matesAtChosenTable, matesOfRunTable } from '@/logic/myTable';
import type { ChoiceOutcome } from '@/logic/myTable';
import { ParticipantFrame } from '@/components/ParticipantFrame';
import type { ParticipantContext } from '@/components/ParticipantFrame';
import { EnterDiscussion } from '@/components/EnterDiscussion';
import { EventNote } from '@/components/EventNote';
import { Redirect } from '@/components/Redirect';
import { StateBox } from '@/components/StateBox';
import { MyTableArt } from '@/components/TableArt';
import { CancelParticipation } from '@/views/participant/CancelDialog';
import { participantHomePath, participantScreenPath } from '@/paths';

interface Seat {
	number: number;
	/** Null in a one-topic event: the number is shown without a topic line. */
	topicTitle: string | null;
	outcome: ChoiceOutcome;
	/** Everyone at the table, the person included. */
	seatCount: number;
	mates: string[];
}

function pill(outcome: ChoiceOutcome): m.Vnode | null {
	if (outcome.kind === 'none') return null;
	if (outcome.kind === 'outside') {
		return m('span.pill.pill--warning.my-table__pill', t('tableAssignment.myTable.pill.outside'));
	}

	return m(
		'span.pill.pill--success.my-table__pill',
		t(`tableAssignment.myTable.pill.${outcome.rank}`),
	);
}

function matesCard(mates: readonly string[]): m.Vnode | null {
	if (mates.length === 0) return null;

	return m('section.my-table__mates', [
		m('h2.my-table__mates-title', t('tableAssignment.myTable.mates')),
		m(
			'ul.my-table__names',
			mates.map((name) => m('li', { dir: 'auto' }, name)),
		),
	]);
}

function seatScreen(
	seat: Seat,
	session: Pick<TableAssignment, 'settings'>,
	extra?: m.Children,
): m.Vnode {
	return m('.screen.my-table', [
		m(MyTableArt, {
			number: seat.number,
			seatCount: seat.seatCount,
			label: t('tableAssignment.myTable.aria', { number: seat.number }),
			tableWord: t('tableAssignment.table'),
			meWord: t('tableAssignment.myTable.me'),
		}),
		m('.my-table__summary', [
			seat.topicTitle === null
				? m('h1.visually-hidden', t('tableAssignment.myTable.aria', { number: seat.number }))
				: m('h1.screen__title.screen__title--page', { dir: 'auto' }, seat.topicTitle),
			pill(seat.outcome),
			seat.outcome.kind === 'outside'
				? m('p.my-table__note', t('tableAssignment.myTable.outsideNote'))
				: null,
		]),
		m(EventNote, { session }),
		matesCard(seat.mates),
		extra,
	]);
}

const MyTableBody: m.ClosureComponent<{ context: ParticipantContext }> = (initial) => {
	const sessionId = initial.attrs.context.session.tableAssignmentId;
	const roster = new LiveValue('tablemates', subscribeTablemates(sessionId));
	let run = new LiveValue('myRun', subscribeRun(''));
	let runId: string | undefined;
	let rosterStarted = false;

	/** Only the published run is ever read: a draft run is never subscribed to. */
	function follow(next: string | undefined): void {
		if (next === runId) return;
		run.stop();
		runId = next;
		run = new LiveValue('myRun', subscribeRun(next ?? ''));
		if (next) run.start();
	}

	/** Tablemates' names are a bonus: without them the person still knows where to sit. */
	function namesOnceReadable(): readonly TableAssignmentRosterEntry[] {
		if (!rosterStarted) {
			rosterStarted = true;
			roster.start();
		}

		return roster.data ?? [];
	}

	/** Table titles come from the topics: until they are read, say so instead of guessing. */
	function topicsNotReady(context: ParticipantContext, backHref: string): m.Children {
		const { topicsState } = context;

		if (topicsState === 'ready') return null;
		if (topicsState === 'loading') return m(StateBox, { kind: 'loading' });

		return m(StateBox, { kind: topicsState, onRetry: context.retryTopics, backHref });
	}

	function directSeat(context: ParticipantContext): m.Children {
		const { session, topics, me, uid } = context;

		if (!me) return null;

		const home = participantHomePath(sessionId);
		const waitingForTopics = topicsNotReady(context, home);

		if (waitingForTopics) return waitingForTopics;
		const choose = participantScreenPath(sessionId, 'preferences');
		const tables = deriveDirectTables(topics, null, session.settings.tableSize ?? 0);
		const mine = tableByIndex(tables, me.chosenTableIndex);

		if (!mine) {
			return m(StateBox, {
				kind: 'empty',
				messageKey: 'tableAssignment.myTable.chooseFirst',
				action: m(
					m.route.Link,
					{ href: choose, class: 'btn btn--primary' },
					t('tableAssignment.stage.act.direct.button'),
				),
				backHref: home,
			});
		}

		const mates = matesAtChosenTable(mine.index, uid, namesOnceReadable());

		return seatScreen(
			{
				number: mine.number,
				topicTitle: mine.topicTitle,
				outcome: { kind: 'none' },
				seatCount: mates.length + 1,
				mates,
			},
			session,
			[
				canEditPreferences(session.status)
					? m(
							m.route.Link,
							{ href: choose, class: 'btn btn--soft' },
							t('tableAssignment.myTable.chooseAnother'),
						)
					: null,
				m(CancelParticipation, { context }),
			],
		);
	}

	/** "Sit where you like" before closing: the topic and how many chose it; the number comes later. */
	function splitBeforeClose(context: ParticipantContext): m.Children {
		const { session, topics, me } = context;

		if (!me) return null;

		const home = participantHomePath(sessionId);
		const waitingForTopics = topicsNotReady(context, home);

		if (waitingForTopics) return waitingForTopics;

		const choose = participantScreenPath(sessionId, 'preferences');
		const mine = topics.find((topic) => topic.topicId === chosenTopicId(me));

		if (!mine) {
			return m(StateBox, {
				kind: 'empty',
				messageKey: 'tableAssignment.myTable.chooseFirstTopic',
				action: m(
					m.route.Link,
					{ href: choose, class: 'btn btn--primary' },
					t('tableAssignment.stage.act.topic.button'),
				),
				backHref: home,
			});
		}

		return m('.screen.my-table', [
			m('.my-table__summary', [
				m('h1.screen__title.screen__title--page', { dir: 'auto' }, mine.title),
				m('p.my-table__note', tPlural('tableAssignment.direct.count', chosenCountOf(mine))),
				m('p.my-table__note', t('tableAssignment.myTable.numberLater')),
			]),
			m(EventNote, { session }),
			canEditPreferences(session.status)
				? m(
						m.route.Link,
						{ href: choose, class: 'btn btn--soft' },
						t('tableAssignment.myTable.chooseAnotherTopic'),
					)
				: null,
			m(CancelParticipation, { context }),
		]);
	}

	function publishedSeat(context: ParticipantContext): m.Children {
		const { session, topics, me, uid } = context;
		const backHref = participantHomePath(sessionId);

		if (session.status !== 'published' || !session.publishedRunId) {
			return m(StateBox, {
				kind: 'empty',
				messageKey: 'tableAssignment.myTable.waiting',
				backHref,
			});
		}

		follow(session.publishedRunId);

		if (run.state === 'loading') return m(StateBox, { kind: 'loading' });
		if (run.state !== 'ready') {
			return m(StateBox, { kind: run.state, onRetry: () => run.retry(), backHref });
		}

		const published = run.data;

		// A run that is not the published one is a draft: never shown.
		if (!published || published.status !== 'published') {
			return m(StateBox, {
				kind: 'empty',
				messageKey: 'tableAssignment.myTable.waiting',
				backHref,
			});
		}

		const table = published.tables.find((candidate) => candidate.memberUids.includes(uid));

		// Registered after publishing and not seated yet: the link page tells them the host will seat them.
		if (!table || !me) return m(Redirect, { to: backHref });

		const waitingForTopics = topicsNotReady(context, backHref);

		if (waitingForTopics) return waitingForTopics;

		const split = isSplitSession(session);

		return seatScreen(
			{
				number: tableNumber(table.index),
				topicTitle: isOneTopic(session)
					? null
					: (topics.find((topic) => topic.topicId === table.topicId)?.title ??
						t('tableAssignment.topic.unknown')),
				// A split session asked for one topic, not a ranking: there is no choice to grade.
				outcome: split ? { kind: 'none' } : choiceOutcome(me.preferences, table.topicId),
				seatCount: table.memberUids.length,
				mates: matesOfRunTable(table.memberUids, uid, namesOnceReadable()),
			},
			session,
			offersEntry(session) ? m(EnterDiscussion, { sessionId }) : null,
		);
	}

	return {
		onremove() {
			run.stop();
			roster.stop();
		},
		view({ attrs }) {
			const { context } = attrs;

			const { session } = context;

			if (isSplitSession(session)) {
				return session.status === 'published' ? publishedSeat(context) : splitBeforeClose(context);
			}

			return session.mode === 'direct' ? directSeat(context) : publishedSeat(context);
		},
	};
};

/** `/sessions/:id/my-table`: where to sit. Not registered goes back to the link. */
export const ParticipantMyTable: m.Component<{ id: string }> = {
	view({ attrs }) {
		return m(ParticipantFrame, {
			sessionId: attrs.id,
			topics: true,
			barLabel: () => t('tableAssignment.myTable'),
			render: (context: ParticipantContext) =>
				context.me
					? m(MyTableBody, { context })
					: m(Redirect, { to: participantHomePath(attrs.id) }),
		});
	},
};
