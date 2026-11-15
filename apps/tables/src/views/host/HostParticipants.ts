import m from 'mithril';
import type { TableAssignmentRosterEntry } from '@freedi/shared-types';
import { t, tPlural } from '@/lib/i18n';
import { LiveValue } from '@/lib/live';
import { subscribeRuns } from '@/lib/tableAssignment/data';
import { publishedRunOf, unseatedSincePublished } from '@/logic/latecomers';
import {
	allSelected,
	rosterMatching,
	selectedPeople,
	summarizeParticipants,
	toggleAllShown,
	toggleSelected,
} from '@/logic/participants';
import { HostFrame } from '@/components/HostFrame';
import type { HostContext } from '@/components/HostFrame';
import { StateBox } from '@/components/StateBox';
import { BatchRemoveDialog } from '@/views/host/BatchRemoveDialog';
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
	let selected: ReadonlySet<string> = new Set();
	/** Who the open batch dialog is about, fixed when it opened: the list shrinks as they are removed. */
	let removingMany: readonly TableAssignmentRosterEntry[] | null = null;

	function row(
		person: TableAssignmentRosterEntry,
		canRemove: boolean,
		unseated: ReadonlySet<string>,
	): m.Vnode {
		return m('li.roster__item', { key: person.uid }, [
			canRemove
				? m('label.roster__check', [
						m('input', {
							type: 'checkbox',
							'aria-label': t('tableAssignment.removeMany.rowCheck', { name: person.fullName }),
							checked: selected.has(person.uid),
							onchange: () => {
								selected = toggleSelected(selected, person.uid);
							},
						}),
					])
				: null,
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

	/** The "select all shown" box, the count of ticked people and the one remove button. */
	function bulkBar(
		shown: readonly TableAssignmentRosterEntry[],
		picked: readonly TableAssignmentRosterEntry[],
	): m.Vnode {
		return m('.roster__bulk', [
			m('label.roster__select-all', [
				m('input', {
					type: 'checkbox',
					disabled: shown.length === 0,
					checked: allSelected(shown, selected),
					onchange: () => {
						selected = toggleAllShown(shown, selected);
					},
				}),
				m('span', t('tableAssignment.removeMany.selectAll')),
			]),
			picked.length > 0
				? [
						m(
							'span.roster__selected',
							{ role: 'status' },
							tPlural('tableAssignment.removeMany.selected', picked.length),
						),
						m(
							'button.btn.btn--outline',
							{
								type: 'button',
								onclick: () => {
									removingMany = picked;
								},
							},
							tPlural('tableAssignment.removeMany.button', picked.length),
						),
					]
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
			const shown = rosterMatching(participants, search);
			const picked = selectedPeople(participants, selected);

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
					canRemove ? bulkBar(shown, picked) : null,
					m(
						'ul.roster',
						shown.map((person) => row(person, canRemove, unseatedUids)),
					),
				]),
				removingMany
					? m(BatchRemoveDialog, {
							sessionId: session.tableAssignmentId,
							people: removingMany,
							onRemoved: (uids: readonly string[]) => {
								const gone = new Set(uids);
								selected = new Set([...selected].filter((uid) => !gone.has(uid)));
							},
							onClose: () => {
								removingMany = null;
							},
						})
					: null,
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
