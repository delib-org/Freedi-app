import m from 'mithril';
import { t } from '@/lib/i18n';
import { Action } from '@/lib/action';
import { tablesApi } from '@/lib/tableAssignment/client';
import { canEditTopics } from '@/logic/nextAction';
import { formatConsensus } from '@/logic/format';
import { draftFromTopic, draftToInput, emptyDraft, moveItem, newImports } from '@/logic/topics';
import type { TopicDraft } from '@/logic/topics';
import { HostFrame } from '@/components/HostFrame';
import type { HostContext } from '@/components/HostFrame';
import { StateBox } from '@/components/StateBox';
import { TopicEditor } from '@/views/host/TopicEditor';
import { TopicImport } from '@/views/host/TopicImport';

/** Which draft is open in the editor: an index in the list, 'new', or none. */
type Editing = number | 'new' | null;

interface TopicsBodyAttrs {
	context: HostContext;
}

function topicCard(
	draft: TopicDraft,
	index: number,
	total: number,
	editable: boolean,
	handlers: {
		onEdit: () => void;
		onDelete: () => void;
		onMove: (delta: -1 | 1) => void;
	},
): m.Vnode {
	return m('li.card.topic-card', { key: draft.topicId ?? `new-${index}-${draft.title}` }, [
		m('.topic-card__head', [
			m('span.topic-card__order', { 'aria-hidden': 'true' }, String(index + 1)),
			m('h3.topic-card__title', draft.title),
		]),
		draft.description ? m('p.topic-card__text', draft.description) : null,
		m('p.topic-card__meta', [
			draft.consensus !== undefined
				? m(
						'span.badge',
						t('tableAssignment.topic.consensus', { value: formatConsensus(draft.consensus) }),
					)
				: null,
			draft.maxTables
				? m('span.badge', t('tableAssignment.topic.maxTablesBadge', { count: draft.maxTables }))
				: null,
		]),
		editable
			? m('.topic-card__actions', [
					m(
						'button.btn.btn--ghost',
						{
							type: 'button',
							disabled: index === 0,
							onclick: () => handlers.onMove(-1),
							'aria-label': t('tableAssignment.topic.moveUp'),
						},
						'↑',
					),
					m(
						'button.btn.btn--ghost',
						{
							type: 'button',
							disabled: index === total - 1,
							onclick: () => handlers.onMove(1),
							'aria-label': t('tableAssignment.topic.moveDown'),
						},
						'↓',
					),
					m(
						'button.btn.btn--secondary',
						{ type: 'button', onclick: handlers.onEdit },
						t('tableAssignment.topic.edit'),
					),
					m(
						'button.btn.btn--danger',
						{ type: 'button', onclick: handlers.onDelete },
						t('tableAssignment.topic.delete'),
					),
				])
			: null,
	]);
}

const TopicsBody: m.ClosureComponent<TopicsBodyAttrs> = () => {
	const save = new Action('tables.host.saveTopics', 'tableAssignment.error.topicsLocked');
	let drafts: TopicDraft[] | null = null;
	let editing: Editing = null;
	let editorDraft: TopicDraft = emptyDraft();
	let dirty = false;

	function openEditor(target: Editing, draft: TopicDraft): void {
		editing = target;
		editorDraft = draft;
	}

	function commitEditor(): void {
		if (!drafts || editing === null) return;
		if (editing === 'new') drafts = [...drafts, editorDraft];
		else drafts = drafts.map((d, i) => (i === editing ? editorDraft : d));
		editing = null;
		dirty = true;
		save.clear();
	}

	async function saveAll(sessionId: string): Promise<void> {
		if (!drafts) return;

		const ok = await save.run(
			() => tablesApi.saveTopics({ sessionId, topics: (drafts ?? []).map(draftToInput) }),
			{ sessionId, count: drafts.length },
		);

		if (ok) {
			dirty = false;
			// Re-seed from the live list so new topics carry their server ids.
			drafts = null;
		}
	}

	return {
		view({ attrs }) {
			const { session, topics } = attrs.context;
			const editable = canEditTopics(session.status);

			// The live list seeds the working copy until the host starts editing.
			if (drafts === null || (!dirty && editing === null)) drafts = topics.map(draftFromTopic);

			const list = drafts;

			return [
				!editable ? m('p.notice', { role: 'status' }, t('tableAssignment.topics.locked')) : null,
				list.length === 0
					? m(StateBox, { kind: 'empty', messageKey: 'tableAssignment.topics.empty' })
					: m(
							'ol.stack',
							list.map((draft, index) =>
								topicCard(draft, index, list.length, editable, {
									onEdit: () => openEditor(index, { ...draft }),
									onDelete: () => {
										drafts = list.filter((_, i) => i !== index);
										dirty = true;
										editing = null;
									},
									onMove: (delta) => {
										drafts = moveItem(list, index, delta);
										dirty = true;
									},
								}),
							),
						),
				editable && editing !== null
					? m(TopicEditor, {
							draft: editorDraft,
							isNew: editing === 'new',
							onChange: (draft: TopicDraft) => {
								editorDraft = draft;
							},
							onSubmit: commitEditor,
							onCancel: () => {
								editing = null;
							},
						})
					: null,
				editable && editing === null
					? m(
							'button.btn.btn--secondary',
							{ type: 'button', onclick: () => openEditor('new', emptyDraft()) },
							t('tableAssignment.topic.add'),
						)
					: null,
				editable
					? m(TopicImport, {
							onImport: (imported: TopicDraft[]) => {
								const current = drafts ?? [];
								const fresh = newImports(current, imported);

								drafts = [...current, ...fresh];
								dirty = true;
							},
						})
					: null,
				editable
					? m('section.card.card--sticky', [
							dirty ? m('p.card__hint', t('tableAssignment.topics.unsaved')) : null,
							save.errorKey
								? m('p.notice.notice--error', { role: 'alert' }, t(save.errorKey))
								: null,
							save.succeeded && !dirty
								? m('p.notice.notice--ok', { role: 'status' }, t('tableAssignment.saved'))
								: null,
							m(
								'button.btn.btn--primary',
								{
									type: 'button',
									disabled: save.busy || !dirty,
									onclick: () => void saveAll(session.tableAssignmentId),
								},
								t(save.busy ? 'tableAssignment.saving' : 'tableAssignment.topics.save'),
							),
						])
					: null,
			];
		},
	};
};

/** `/host/sessions/:id/topics`: Topics. */
export const HostTopics: m.Component<{ id: string }> = {
	view({ attrs }) {
		return m(HostFrame, {
			sessionId: attrs.id,
			titleKey: 'tableAssignment.screen.topics',
			topics: true,
			render: (context: HostContext) => m(TopicsBody, { context }),
		});
	},
};
