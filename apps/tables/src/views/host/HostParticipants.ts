import m from 'mithril';
import { TABLES_BASE_URL, tablesSessionUrl } from '@freedi/table-assignment-client';
import { t } from '@/lib/i18n';
import { Action } from '@/lib/action';
import { tablesApi } from '@/lib/tableAssignment/client';
import { statusControls } from '@/logic/nextAction';
import { participantNames, summarizeParticipants } from '@/logic/participants';
import { HostFrame } from '@/components/HostFrame';
import type { HostContext } from '@/components/HostFrame';
import { ShareLink } from '@/components/ShareLink';
import { StateBox } from '@/components/StateBox';
import { StatusChip } from '@/components/StatusChip';

type ControlStatus = 'registrationOpen' | 'registrationClosed' | 'ended';

interface ParticipantsBodyAttrs {
	context: HostContext;
}

const ParticipantsBody: m.ClosureComponent<ParticipantsBodyAttrs> = () => {
	const statusAction = new Action('tables.host.setStatus', 'tableAssignment.error.statusRefused');
	let search = '';

	async function change(sessionId: string, status: ControlStatus): Promise<void> {
		await statusAction.run(() => tablesApi.setStatus({ sessionId, status }), { sessionId, status });
	}

	return {
		view({ attrs }) {
			const { session, participants } = attrs.context;
			const summary = summarizeParticipants(participants);
			const names = participantNames(participants).filter((name) =>
				name.toLowerCase().includes(search.trim().toLowerCase()),
			);
			const controls = statusControls(session.status);
			const id = session.tableAssignmentId;

			return [
				m('section.card', [
					m('.card__row', [m(StatusChip, { status: session.status })]),
					m(
						'dl.counts',
						[
							['registered', summary.registered],
							['withPreferences', summary.withPreferences],
							['withPosition', summary.withPosition],
							['notSpecified', summary.notSpecified],
						].map(([key, value]) =>
							m('div.counts__item', { key: String(key) }, [
								m('dt', t(`tableAssignment.count.${key}`)),
								m('dd', String(value)),
							]),
						),
					),
					m('p.card__hint', t('tableAssignment.participants.privacy')),
				]),
				controls.length > 0
					? m('section.card', [
							m('h2.card__title', t('tableAssignment.participants.controls')),
							m(
								'.form__actions',
								controls.map((status) =>
									m(
										'button.btn',
										{
											key: status,
											type: 'button',
											class: status === 'ended' ? 'btn--danger' : 'btn--primary',
											disabled: statusAction.busy,
											onclick: () => void change(id, status),
										},
										t(`tableAssignment.control.${status}`),
									),
								),
							),
							statusAction.errorKey
								? m('p.notice.notice--error', { role: 'alert' }, t(statusAction.errorKey))
								: null,
						])
					: null,
				m('section.card', [
					m('h2.card__title', t('tableAssignment.home.participantLink')),
					m(ShareLink, { url: tablesSessionUrl(TABLES_BASE_URL, id) }),
				]),
				m('section.card', [
					m('h2.card__title', t('tableAssignment.participants')),
					participants.length === 0
						? m(StateBox, { kind: 'empty', messageKey: 'tableAssignment.participants.empty' })
						: [
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
									'ul.names',
									names.map((name, index) =>
										m('li.names__item', { key: `${index}-${name}` }, name),
									),
								),
							],
				]),
			];
		},
	};
};

/** `/host/sessions/:id/participants`: Registered participants. */
export const HostParticipants: m.Component<{ id: string }> = {
	view({ attrs }) {
		return m(HostFrame, {
			sessionId: attrs.id,
			titleKey: 'tableAssignment.screen.participants',
			participants: true,
			render: (context: HostContext) => m(ParticipantsBody, { context }),
		});
	},
};
