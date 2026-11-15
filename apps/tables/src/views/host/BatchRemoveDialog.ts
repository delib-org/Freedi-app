import m from 'mithril';
import { TABLE_ASSIGNMENT_REMOVE_BATCH_MAX } from '@freedi/shared-types';
import type {
	TableAssignmentRosterEntry,
	TablesRemoveParticipantsFailure,
	TablesRemoveParticipantsResponse,
} from '@freedi/shared-types';
import { t, tPlural } from '@/lib/i18n';
import { Action } from '@/lib/action';
import { tablesApi } from '@/lib/tableAssignment/client';
import { inBatches } from '@/logic/participants';
import { Modal } from '@/components/Modal';

export interface BatchRemoveDialogAttrs {
	sessionId: string;
	people: readonly TableAssignmentRosterEntry[];
	/** Called once the server has answered, with the uids it removed. */
	onRemoved: (uids: readonly string[]) => void;
	onClose: () => void;
}

/** Removes the batches one after another and joins the answers. */
async function removeAll(
	sessionId: string,
	people: readonly TableAssignmentRosterEntry[],
): Promise<TablesRemoveParticipantsResponse> {
	const joined: TablesRemoveParticipantsResponse = { removed: [], failed: [] };
	for (const batch of inBatches(people, TABLE_ASSIGNMENT_REMOVE_BATCH_MAX)) {
		const answer = await tablesApi.removeParticipants({
			sessionId,
			uids: batch.map((person) => person.uid),
		});
		joined.removed.push(...answer.removed);
		joined.failed.push(...answer.failed);
	}

	return joined;
}

function failedNames(
	failed: readonly TablesRemoveParticipantsFailure[],
	people: readonly TableAssignmentRosterEntry[],
): string {
	const nameOf = new Map(people.map((person) => [person.uid, person.fullName]));

	return failed.map(({ uid }) => nameOf.get(uid) ?? uid).join(', ');
}

/**
 * One confirmation for the whole selection, then the result: how many were
 * removed and who could not be. Seated people at published tables are removed too.
 */
export const BatchRemoveDialog: m.ClosureComponent<BatchRemoveDialogAttrs> = () => {
	const remove = new Action('tables.host.removeParticipants', 'tableAssignment.error.generic');
	let result: TablesRemoveParticipantsResponse | undefined;

	async function confirm(attrs: BatchRemoveDialogAttrs): Promise<void> {
		const { sessionId, people } = attrs;
		const answer = await remove.run(() => removeAll(sessionId, people), {
			sessionId,
			count: people.length,
		});

		if (!answer) return;
		result = answer;
		attrs.onRemoved(answer.removed);
	}

	function resultView(
		answer: TablesRemoveParticipantsResponse,
		attrs: BatchRemoveDialogAttrs,
	): m.Children {
		return [
			m(
				'p.modal__text',
				{ role: 'status' },
				tPlural('tableAssignment.removeMany.done', answer.removed.length),
			),
			answer.failed.length > 0
				? m(
						'p.notice.notice--error',
						{ role: 'alert', dir: 'auto' },
						t('tableAssignment.removeMany.failed', {
							names: failedNames(answer.failed, attrs.people),
						}),
					)
				: null,
			m(
				'button.btn.btn--primary.btn--cta',
				{ type: 'button', onclick: attrs.onClose },
				t('tableAssignment.removeMany.close'),
			),
		];
	}

	function confirmView(attrs: BatchRemoveDialogAttrs): m.Children {
		return [
			m('p.modal__text', t('tableAssignment.removeMany.body')),
			remove.errorKey ? m('p.notice.notice--error', { role: 'alert' }, t(remove.errorKey)) : null,
			m(
				'button.btn.btn--primary.btn--cta',
				{ type: 'button', disabled: remove.busy, onclick: attrs.onClose },
				t('tableAssignment.remove.keep'),
			),
			m(
				'button.btn.btn--outline.btn--cta',
				{ type: 'button', disabled: remove.busy, onclick: () => void confirm(attrs) },
				t(remove.busy ? 'tableAssignment.saving' : 'tableAssignment.removeMany.confirm'),
			),
		];
	}

	return {
		view({ attrs }) {
			return m(
				Modal,
				{
					title: tPlural('tableAssignment.removeMany.title', attrs.people.length),
					onClose: attrs.onClose,
					locked: remove.busy,
				},
				result ? resultView(result, attrs) : confirmView(attrs),
			);
		},
	};
};
