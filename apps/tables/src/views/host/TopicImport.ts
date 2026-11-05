import m from 'mithril';
import { logError } from '@freedi/shared-utils';
import { t } from '@/lib/i18n';
import { fetchSelectedOptions } from '@/lib/tableAssignment/data';
import { classifyErrorCode } from '@/logic/topicImportErrors';
import { draftFromStatement } from '@/logic/topics';
import type { TopicDraft } from '@/logic/topics';

/**
 * Import the selected options of a question as topics: paste the question's
 * statement id; statements with parentId == id and isSelected == true become
 * drafts (title, description, consensus). A read that is not permitted shows
 * the error state; nothing is thrown at the screen.
 */
export interface TopicImportAttrs {
	onImport: (drafts: TopicDraft[]) => void;
}

type ImportResult =
	| { kind: 'idle' }
	| { kind: 'busy' }
	| { kind: 'done'; count: number }
	| { kind: 'empty' }
	| { kind: 'error'; messageKey: string };

export const TopicImport: m.ClosureComponent<TopicImportAttrs> = () => {
	let statementId = '';
	let result: ImportResult = { kind: 'idle' };

	async function runImport(onImport: (drafts: TopicDraft[]) => void): Promise<void> {
		const id = statementId.trim();

		if (id === '') return;
		result = { kind: 'busy' };
		m.redraw();

		try {
			const statements = await fetchSelectedOptions(id);

			if (statements.length === 0) {
				result = { kind: 'empty' };
			} else {
				onImport(statements.map(draftFromStatement));
				result = { kind: 'done', count: statements.length };
			}
		} catch (error) {
			logError(error, { operation: 'tables.host.importTopics', statementId: id });
			result = { kind: 'error', messageKey: classifyErrorCode(error) };
		}
		m.redraw();
	}

	return {
		view({ attrs }) {
			return m(
				'form.card.form',
				{
					onsubmit: (event: Event) => {
						event.preventDefault();
						void runImport(attrs.onImport);
					},
				},
				[
					m('h2.card__title', t('tableAssignment.import.title')),
					m('p.card__hint', t('tableAssignment.import.hint')),
					m('label.field', [
						m('span.field__label', t('tableAssignment.import.statementId')),
						m('input.field__input', {
							type: 'text',
							dir: 'ltr',
							value: statementId,
							oninput: (event: Event) => {
								statementId = (event.target as HTMLInputElement).value;
							},
						}),
					]),
					m(
						'button.btn.btn--secondary',
						{ type: 'submit', disabled: result.kind === 'busy' || statementId.trim() === '' },
						t(
							result.kind === 'busy'
								? 'tableAssignment.import.reading'
								: 'tableAssignment.import.button',
						),
					),
					result.kind === 'done'
						? m(
								'p.notice.notice--ok',
								{ role: 'status' },
								t('tableAssignment.import.done', { count: result.count }),
							)
						: null,
					result.kind === 'empty'
						? m('p.notice', { role: 'status' }, t('tableAssignment.import.empty'))
						: null,
					result.kind === 'error'
						? m('p.notice.notice--error', { role: 'alert' }, t(result.messageKey))
						: null,
				],
			);
		},
	};
};
