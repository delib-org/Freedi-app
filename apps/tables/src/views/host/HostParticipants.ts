import m from 'mithril';
import type { TableAssignmentRosterEntry } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { LiveValue } from '@/lib/live';
import { subscribeRuns } from '@/lib/tableAssignment/data';
import { publishedRunOf, unseatedSincePublished } from '@/logic/latecomers';
import { rosterMatching, summarizeParticipants } from '@/logic/participants';
import { HostFrame } from '@/components/HostFrame';
import type { HostContext } from '@/components/HostFrame';
import { StateBox } from '@/components/StateBox';
import { RemoveParticipantDialog } from '@/views/host/RemoveParticipantDialog';

interface ParticipantsBodyAttrs {
	context: HostContext;
}

const ParticipantsBody: m.ClosureComponent<ParticipantsBodyAttrs> = (initial) => {
	const runs = new LiveValue(
		'runs',
		subscribeRuns(initial.attrs.context.session.tableAssignmentId),
	);
	let search = '';
	let removing: TableAssignmentRosterEntry | null = null;

	function row(
		person: TableAssignmentRosterEntry,
		canRemove: boolean,
		unseated: ReadonlySet<string>,
	): m.Vnode {
		return m('li.roster__item', { key: person.uid }, [
			m('span.roster__name', { dir: 'auto' }, person.fullName),
			unseated.has(person.uid)
				? m('span.pill.pill--warning.roster__tag', t('tableAssignment.participants.unseated'))
				: null,
			person.claimedByName
				? m('span.pill.pill--neutral.roster__tag', t('tableAssignment.participants.claimedByName'))
				: null,
			canRemove
				? m(
						'button.btn.btn--text',
						{
							type: 'button',
							'aria-label': t('tableAssignment.remove.ariaLabel', { name: person.fullName }),
							onclick: () => {
								removing = person;
							},
						},
						t('tableAssignment.remove'),
					)
				: null,
		]);
	}

	return {
		oninit() {
			runs.start();
		},
		onremove() {
			runs.stop();
		},
		view({ attrs }) {
			const { session, participants } = attrs.context;
			const summary = summarizeParticipants(participants);
			// People who registered after publishing and have no seat yet (the host seats them by computing again).
			const unseated = unseatedSincePublished(
				session.status === 'published'
					? publishedRunOf(runs.data ?? [], session.publishedRunId)
					: undefined,
				participants,
			);
			const unseatedUids = new Set(unseated.map((person) => person.uid));
			const canRemove = session.status !== 'ended';

			if (participants.length === 0) {
				return m(StateBox, { kind: 'empty', messageKey: 'tableAssignment.participants.empty' });
			}

			return [
				m('section.card', [
					m(
						'dl.counts',
						(
							[
								['registered', summary.registered],
								['withPreferences', summary.withPreferences],
								...(unseated.length > 0 ? ([['unseated', unseated.length]] as const) : []),
							] as const
						).map(([key, value]) =>
							m('div.counts__item', { key }, [
								m('dt', t(`tableAssignment.count.${key}`)),
								m('dd', String(value)),
							]),
						),
					),
					m('p.card__hint', t('tableAssignment.participants.privacy')),
				]),
				m('section.card', [
					m('label.field', [
						m('span.field__label', t('tableAssignment.participants.search')),
						m('input.field__input', {
							type: 'search',
							value: search,
							oninput: (event: Event) => {
								search = (event.target as HTMLInputElement).value;
							},
						}),
					]),
					m(
						'ul.roster',
						rosterMatching(participants, search).map((person) =>
							row(person, canRemove, unseatedUids),
						),
					),
				]),
				removing
					? m(RemoveParticipantDialog, {
							person: removing,
							onClose: () => {
								removing = null;
							},
						})
					: null,
			];
		},
	};
};

/** `/host/sessions/:id/participants`: names, search, and taking someone off the list. */
export const HostParticipants: m.Component<{ id: string }> = {
	view({ attrs }) {
		return m(HostFrame, {
			sessionId: attrs.id,
			titleKey: 'tableAssignment.screen.participants',
			participants: true,
			deletable: true,
			render: (context: HostContext) => m(ParticipantsBody, { context }),
		});
	},
};
