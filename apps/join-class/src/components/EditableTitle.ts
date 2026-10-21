import m from 'mithril';
import { t } from '@/lib/i18n';
import { updateQuestionTitle } from '@/lib/store';

interface EditableTitleAttrs {
	statementId: string;
	value: string;
	canEdit: boolean;
	// Renamed from `tag` because Mithril uses `attrs.tag != null` to decide
	// whether the second argument to m() is attrs or a child vnode — passing
	// `tag` here makes the whole attrs object look like a vnode and silently
	// drops every other prop, leading to `<undefined class="undefined">`.
	as: string;
	className: string;
}

// Module-level edit state. Only one title is ever editing at a time across the
// app — both the hub H1 and the solutions H1 share this state, so opening one
// while another is open just moves the cursor. `editingId` doubles as the
// "is anyone editing" flag; when null, every title renders as static text.
let editingId: string | null = null;
let draft = '';
let saving = false;

function startEdit(statementId: string, current: string): void {
	editingId = statementId;
	draft = current;
	saving = false;
}

function cancelEdit(): void {
	editingId = null;
	draft = '';
	saving = false;
}

async function commit(statementId: string, original: string): Promise<void> {
	const trimmed = draft.trim();
	if (saving) return;
	// Empty input is treated as a cancel rather than a save — clearing the
	// title would leave the question unrenderable for participants.
	if (!trimmed || trimmed === original.trim()) {
		cancelEdit();

		return;
	}
	saving = true;
	m.redraw();
	try {
		await updateQuestionTitle(statementId, trimmed);
	} catch (err) {
		console.error('[EditableTitle] update failed:', err);
	} finally {
		cancelEdit();
		m.redraw();
	}
}

export const EditableTitle: m.Component<EditableTitleAttrs> = {
	view(vnode) {
		const { statementId, value, canEdit, as, className } = vnode.attrs;
		const isEditing = editingId === statementId;

		if (!canEdit) {
			return m(`${as}.${className}`, value);
		}

		if (isEditing) {
			return m('input.editable-title-input', {
				class: className,
				value: draft,
				disabled: saving,
				maxlength: 500,
				'aria-label': t('admin.edit_title'),
				oncreate: (vn: m.VnodeDOM) => {
					const el = vn.dom as HTMLInputElement;
					el.focus();
					el.select();
				},
				oninput: (e: Event) => {
					draft = (e.target as HTMLInputElement).value;
				},
				onkeydown: (e: KeyboardEvent) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						void commit(statementId, value);
					} else if (e.key === 'Escape') {
						e.preventDefault();
						cancelEdit();
						m.redraw();
					}
				},
				onblur: () => {
					// Treat blur as commit so a click outside saves the edit. If
					// nothing changed, `commit` falls through to `cancelEdit`.
					void commit(statementId, value);
				},
			});
		}

		return m(
			`${as}.${className}.${className}--editable`,
			{
				role: 'button',
				tabindex: '0',
				title: t('admin.edit_title'),
				'aria-label': t('admin.edit_title_aria', { name: value }),
				onclick: () => {
					startEdit(statementId, value);
				},
				onkeydown: (e: KeyboardEvent) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						startEdit(statementId, value);
					}
				},
			},
			value,
		);
	},
};
