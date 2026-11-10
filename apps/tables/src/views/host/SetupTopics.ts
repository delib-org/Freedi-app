import m from 'mithril';
import { TABLE_ASSIGNMENT_TITLE_MAX_LENGTH } from '@freedi/shared-types';
import { t, tPlural } from '@/lib/i18n';
import { MAX_TOPICS, topicsToAdd } from '@/logic/topicList';
import { emptyDraft, newImports } from '@/logic/topics';
import type { TopicDraft } from '@/logic/topics';
import { closeIcon } from '@/components/icons';
import { TopicImport } from '@/views/host/TopicImport';

export interface SetupTopicsAttrs {
	topics: TopicDraft[];
	onChange: (topics: TopicDraft[]) => void;
}

type Panel = 'none' | 'list' | 'import';

/** Rows keep their identity across edits, so typing never moves the cursor. */
const rowKeys = new WeakMap<TopicDraft, number>();
let nextRowKey = 0;

function rowKey(topic: TopicDraft): number {
	let key = rowKeys.get(topic);

	if (key === undefined) {
		nextRowKey += 1;
		key = nextRowKey;
		rowKeys.set(topic, key);
	}

	return key;
}

/** "What will they talk about": one by one, a pasted list, or imported from a discussion. */
export const SetupTopics: m.ClosureComponent<SetupTopicsAttrs> = () => {
	let panel: Panel = 'none';
	let pasteText = '';
	let focusRow: TopicDraft | null = null;

	function togglePanel(next: Panel): void {
		panel = panel === next ? 'none' : next;
	}

	function titlesOf(topics: readonly TopicDraft[]): string[] {
		return topics.map((topic) => topic.title).filter((title) => title.trim() !== '');
	}

	function addRow(attrs: SetupTopicsAttrs): void {
		const row = emptyDraft();

		focusRow = row;
		attrs.onChange([...attrs.topics, row]);
	}

	function addList(attrs: SetupTopicsAttrs): void {
		const filled = attrs.topics.filter((topic) => topic.title.trim() !== '');
		const added = topicsToAdd(titlesOf(filled), pasteText).map((title) => ({
			...emptyDraft(),
			title,
		}));

		attrs.onChange([...filled, ...added]);
		pasteText = '';
		panel = 'none';
	}

	function importTopics(attrs: SetupTopicsAttrs, imported: TopicDraft[]): void {
		const filled = attrs.topics.filter((topic) => topic.title.trim() !== '');

		attrs.onChange([...filled, ...newImports(filled, imported)].slice(0, MAX_TOPICS));
	}

	function row(attrs: SetupTopicsAttrs, topic: TopicDraft, index: number): m.Vnode {
		const number = index + 1;

		return m('.setup__topic', { key: rowKey(topic) }, [
			m('input.field__input.setup__topic-input', {
				type: 'text',
				dir: 'auto',
				value: topic.title,
				maxlength: TABLE_ASSIGNMENT_TITLE_MAX_LENGTH,
				placeholder: t('tableAssignment.setup.topic.placeholder'),
				'aria-label': t('tableAssignment.setup.topic.label', { number }),
				oncreate: ({ dom }: m.VnodeDOM) => {
					if (focusRow === topic) {
						(dom as HTMLInputElement).focus();
						focusRow = null;
					}
				},
				oninput: (event: Event) => {
					topic.title = (event.target as HTMLInputElement).value;
					attrs.onChange(attrs.topics);
				},
			}),
			m(
				'button.setup__topic-remove',
				{
					type: 'button',
					'aria-label': t('tableAssignment.setup.topic.remove', { number }),
					onclick: () => attrs.onChange(attrs.topics.filter((_, i) => i !== index)),
				},
				closeIcon(),
			),
		]);
	}

	function listPanel(attrs: SetupTopicsAttrs): m.Vnode {
		const count = topicsToAdd(titlesOf(attrs.topics), pasteText).length;

		return m('.setup__panel', [
			m('label.field__label', { for: 'setup-topic-list' }, t('tableAssignment.setup.list.label')),
			m('textarea.field__input.setup__paste', {
				id: 'setup-topic-list',
				rows: 3,
				dir: 'auto',
				value: pasteText,
				placeholder: t('tableAssignment.setup.list.placeholder'),
				oninput: (event: Event) => {
					pasteText = (event.target as HTMLTextAreaElement).value;
				},
			}),
			m('span.setup__panel-hint', t('tableAssignment.setup.list.hint')),
			m(
				'button.btn.btn--primary.setup__panel-button',
				{ type: 'button', disabled: count === 0, onclick: () => addList(attrs) },
				count === 0
					? t('tableAssignment.setup.list.addEmpty')
					: tPlural('tableAssignment.setup.list.add', count),
			),
		]);
	}

	return {
		view({ attrs }) {
			return m('section.setup__card', [
				m('h2.setup__heading', t('tableAssignment.setup.topics')),
				attrs.topics.map((topic, index) => row(attrs, topic, index)),
				m('.setup__topic-actions', [
					m(
						'button.btn.btn--soft',
						{
							type: 'button',
							disabled: attrs.topics.length >= MAX_TOPICS,
							onclick: () => addRow(attrs),
						},
						t('tableAssignment.setup.topic.add'),
					),
					m(
						'button.btn.btn--outline',
						{
							type: 'button',
							'aria-expanded': String(panel === 'list'),
							onclick: () => togglePanel('list'),
						},
						t('tableAssignment.setup.list'),
					),
					m(
						'button.btn.btn--outline',
						{
							type: 'button',
							'aria-expanded': String(panel === 'import'),
							onclick: () => togglePanel('import'),
						},
						t('tableAssignment.setup.import'),
					),
				]),
				panel === 'list' ? listPanel(attrs) : null,
				panel === 'import'
					? m(TopicImport, { onImport: (imported) => importTopics(attrs, imported) })
					: null,
			]);
		},
	};
};
